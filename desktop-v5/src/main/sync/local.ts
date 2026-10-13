// The device side of a sync round: notes <-> revision objects, sync_state, purged, and the listing cache.
// Every write is one transaction that re-checks the note's rev, so a save made during a round always wins (C4).
import type { SQLOutputValue } from 'node:sqlite'
import { tx } from '../store/db'
import { gcTags, linkMedia, setNoteTags } from '../store/notes'
import type { Store } from '../store/notes'
import { contentHash, DEVICE_NAME_MAX } from './format'
import type { NoteRev, RevObject, Tombstone } from './format'

type Row = Record<string, SQLOutputValue>
const CURSOR_KEY = 'sys.sync_cursor'

export interface Snapshot {
  /** notes.rev of every local note. */
  revs: Map<string, string>
  /** sync_state.base_rev, also kept for notes that are gone (the applied tombstone). */
  bases: Map<string, string>
}

export function createLocal(store: Store) {
  const { db } = store
  const one = (sql: string, ...p: (string | number | null)[]): Row | undefined => db.prepare(sql).get(...p) as Row | undefined

  function toObject(id: string, deviceName: string): NoteRev | null {
    const r = one('SELECT * FROM notes WHERE id = ?', id)
    if (!r) return null
    const base = one('SELECT base_rev FROM sync_state WHERE id = ?', id)
    const tags = (db.prepare('SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ?').all(id) as Row[])
      .map((t) => String(t.name))
      .sort()
    const media = (db.prepare('SELECT hash FROM note_media WHERE note_id = ? ORDER BY hash').all(id) as Row[]).map((m) => String(m.hash))
    const locked = !!r.locked
    return {
      v: 2,
      id,
      rev: String(r.rev),
      parents: typeof base?.base_rev === 'string' ? [base.base_rev] : [],
      device: store.deviceId,
      deviceName: deviceName.slice(0, DEVICE_NAME_MAX),
      deleted: false,
      title: String(r.title),
      body: locked ? '' : String(r.body),
      tags,
      pinned: !!r.pinned,
      archived: !!r.archived,
      trashedAt: r.deleted_at === null ? null : Number(r.deleted_at),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      locked,
      cipher: locked && r.cipher instanceof Uint8Array ? Buffer.from(r.cipher).toString('base64') : null,
      cipherFormat: locked && (r.cipher_format === 'v4' || r.cipher_format === 'v5') ? r.cipher_format : null,
      media,
      conflictOf: r.conflict_of === null ? null : String(r.conflict_of)
    }
  }

  const setBase = (id: string, rev: string, hash: string | null): void => {
    db.prepare('INSERT INTO sync_state(id, base_rev, base_hash) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET base_rev = excluded.base_rev, base_hash = excluded.base_hash')
      .run(id, rev, hash)
  }
  const localHash = (id: string): string | null => {
    const o = toObject(id, '')
    return o ? contentHash(o) : null
  }

  return {
    toObject,

    snapshot(): Snapshot {
      const revs = new Map((db.prepare('SELECT id, rev FROM notes').all() as Row[]).map((r) => [String(r.id), String(r.rev)]))
      const bases = new Map(
        (db.prepare('SELECT id, base_rev FROM sync_state WHERE base_rev IS NOT NULL').all() as Row[]).map((r) => [String(r.id), String(r.base_rev)])
      )
      return { revs, bases }
    },

    /** Notes whose rev differs from the agreed base, as objects to upload (built in one synchronous pass). */
    dirty(deviceName: string): NoteRev[] {
      const rows = db.prepare(
        'SELECT n.id FROM notes n LEFT JOIN sync_state s ON s.id = n.id WHERE s.base_rev IS NULL OR s.base_rev != n.rev ORDER BY n.id'
      ).all() as Row[]
      return rows.map((r) => toObject(String(r.id), deviceName)).filter((o): o is NoteRev => o !== null && !(o.locked && !o.cipher))
    },

    purged: (): { id: string; rev: string }[] =>
      (db.prepare('SELECT id, rev FROM purged ORDER BY id').all() as Row[]).map((r) => ({ id: String(r.id), rev: String(r.rev) })),

    /** After a create succeeded (created or exists). A note purged meanwhile gets its tombstone parent moved here. */
    markUploaded(o: NoteRev): void {
      tx(db, () => {
        if (one('SELECT 1 AS x FROM notes WHERE id = ?', o.id)) setBase(o.id, o.rev, contentHash(o))
        else db.prepare('INSERT OR REPLACE INTO purged(id, rev, purged_at) VALUES (?, ?, ?)').run(o.id, o.rev, Date.now())
      })
    },

    markTombstoneUploaded(t: Tombstone, parent: string): void {
      tx(db, () => {
        db.prepare('DELETE FROM purged WHERE id = ? AND rev = ?').run(t.id, parent)
        setBase(t.id, t.rev, contentHash(t))
      })
    },

    /** Recovery (§7): the remote head is the local rev. */
    adoptBase(id: string, rev: string): void {
      tx(db, () => {
        if (one('SELECT rev FROM notes WHERE id = ?', id)?.rev === rev) setBase(id, rev, localHash(id))
      })
    },

    /** Makes a note dirty again with a fresh rev (the remote lost its revision, or local content drifted from base). */
    restamp(id: string, expectRev: string): void {
      tx(db, () => {
        db.prepare('UPDATE notes SET rev = ? WHERE id = ? AND rev = ?').run(store.hlc.now(), id, expectRev)
      })
    },

    /**
     * Applies a head in one transaction (§7.5). Skips (returns false) when the note changed since the snapshot, has a
     * pending purge, or has local changes. Forgets a cached note key when the ciphertext is replaced.
     */
    apply(o: RevObject, expectRev: string | null): boolean {
      let lockKey = false
      const done = tx(db, () => {
        const cur = one('SELECT rev, locked, cipher FROM notes WHERE id = ?', o.id)
        if ((cur ? String(cur.rev) : null) !== expectRev) return false
        if (one('SELECT 1 AS x FROM purged WHERE id = ?', o.id)) return false
        if (cur) {
          const s = one('SELECT base_rev, base_hash FROM sync_state WHERE id = ?', o.id)
          if (s?.base_rev !== cur.rev) return false
          if (typeof s.base_hash === 'string' && s.base_hash !== localHash(o.id)) {
            // Content changed without a new rev: never overwrite it; upload it instead.
            db.prepare('UPDATE notes SET rev = ? WHERE id = ?').run(store.hlc.now(), o.id)
            return false
          }
          const oldCipher = cur.cipher instanceof Uint8Array ? Buffer.from(cur.cipher).toString('base64') : null
          lockKey = !!cur.locked && (o.deleted || oldCipher !== o.cipher)
        }
        if (o.deleted) {
          if (cur) {
            db.prepare('DELETE FROM notes WHERE id = ?').run(o.id)
            gcTags(db)
          }
          setBase(o.id, o.rev, contentHash(o))
          return true
        }
        const cols = {
          title: o.title, body: o.body, created_at: o.createdAt, updated_at: o.updatedAt, deleted_at: o.trashedAt,
          pinned: o.pinned ? 1 : 0, archived: o.archived ? 1 : 0, locked: o.locked ? 1 : 0,
          cipher: o.cipher === null ? null : Buffer.from(o.cipher, 'base64'), cipher_format: o.cipherFormat,
          conflict_of: o.conflictOf, rev: o.rev
        }
        const keys = Object.keys(cols)
        const vals = Object.values(cols)
        if (cur) db.prepare(`UPDATE notes SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...vals, o.id)
        else db.prepare(`INSERT INTO notes(id, ${keys.join(', ')}) VALUES (?${', ?'.repeat(keys.length)})`).run(o.id, ...vals)
        setNoteTags(db, o.id, o.tags)
        linkMedia(db, o.id, o.media)
        setBase(o.id, o.rev, localHash(o.id))
        return true
      })
      if (lockKey) store.locks.lock(o.id) // zero-fills the key and sends locks:changed if one was cached
      return done
    },

    knownNames: (): Set<string> => new Set((db.prepare('SELECT name FROM sync_names').all() as Row[]).map((r) => String(r.name))),
    cursor(): string | null {
      const v = store.settings.get(CURSOR_KEY)
      return typeof v === 'string' ? v : null
    },
    saveListing(names: Set<string>, cursor: string): void {
      tx(db, () => {
        db.exec('DELETE FROM sync_names')
        const ins = db.prepare('INSERT INTO sync_names(name) VALUES (?)')
        for (const n of names) ins.run(n)
        db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(CURSOR_KEY, JSON.stringify(cursor))
      })
    },

    /** disable(): forget the listing cache and cursor (sync_state stays, so re-joining the same remote is clean). */
    forgetListing(): void {
      tx(db, () => {
        db.exec('DELETE FROM sync_names')
        db.prepare('DELETE FROM settings WHERE key = ?').run(CURSOR_KEY)
      })
    },

    /** Joining a different remote: nothing local is known there, so every note uploads again under a fresh rev. */
    resetForNewRemote(): void {
      tx(db, () => {
        db.exec('DELETE FROM sync_state; DELETE FROM purged; DELETE FROM sync_names')
        db.prepare('DELETE FROM settings WHERE key = ?').run(CURSOR_KEY)
        const up = db.prepare('UPDATE notes SET rev = ? WHERE id = ?')
        for (const r of db.prepare('SELECT id FROM notes').all() as Row[]) up.run(store.hlc.now(), String(r.id))
      })
    },

    conflicts: (): number => Number(one('SELECT count(*) AS c FROM notes WHERE conflict_of IS NOT NULL AND deleted_at IS NULL')?.c ?? 0)
  }
}

export type Local = ReturnType<typeof createLocal>
