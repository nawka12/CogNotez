// Notes, tags, search and settings. Pure SQLite + Node: no Electron imports.
import { randomUUID } from 'node:crypto'
import type { SQLInputValue, SQLOutputValue } from 'node:sqlite'
import type { ListFilter, Note, NoteInput, NotePatch, NoteSummary, Tag } from '../../shared/api'
import { createKeyCache } from '../crypto/keycache'
import { createLocks } from '../crypto/locks'
import { openV5, sealV5 } from '../crypto/notecrypto'
import { settingValueJson, tagList } from '../guards'
import { Hlc, parseRev } from '../hlc'
import { createBulk } from './bulk'
import { tx } from './db'
import type { Db } from './db'

type Row = Record<string, SQLOutputValue>
const SEP = '\u001f'
const DEVICE_KEY = 'sys.device_id'

// ---- helpers ------------------------------------------------------------------------------

/** First ~160 chars of a body with markdown marks removed. */
export function snippetOf(text: string, max = 160): string {
  return text
    .slice(0, max * 3)
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}(#{1,6}|>|[-*+]|\d+\.)[ \t]+(\[[ xX]\][ \t]+)?/gm, '')
    .replace(/[*~`]+/g, '')
    .replace(/(^|\W)_+|_+(?=\W|$)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

const likeEscape = (s: string): string => s.replace(/[\\%_]/g, '\\$&')

/** Local midnight for YYYY-MM-DD, or null when it is not a real calendar date. */
function dayStart(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date.getTime() : null
}

interface Where {
  sql: string[]
  params: SQLInputValue[]
}

/** Matches the tag itself and any child `tag/...`. */
function tagCond(w: Where, tag: string): void {
  w.sql.push(
    `EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
       WHERE nt.note_id = n.id AND (t.name = ? OR t.name LIKE ? ESCAPE '\\'))`
  )
  w.params.push(tag, `${likeEscape(tag)}/%`)
}

export interface SearchQuery {
  tags: string[]
  pinned: boolean
  trash: boolean
  before?: number
  after?: number
  words: string[]
}

/** Syntax: tag:x  tag:"two words"  is:pinned  in:trash  before:YYYY-MM-DD  after:YYYY-MM-DD; the rest are words. */
export function parseSearch(q: string): SearchQuery {
  const out: SearchQuery = { tags: [], pinned: false, trash: false, words: [] }
  for (const m of q.matchAll(/(\w+):"([^"]*)"|(\w+):(\S+)|\S+/g)) {
    const key = (m[1] ?? m[3])?.toLowerCase()
    const val = (m[2] ?? m[4] ?? '').trim()
    const day = key === 'before' || key === 'after' ? dayStart(val) : null
    if (key === 'tag' && val && !val.includes('//') && !val.startsWith('/') && !val.endsWith('/')) out.tags.push(val)
    else if (key === 'is' && val.toLowerCase() === 'pinned') out.pinned = true
    else if (key === 'in' && val.toLowerCase() === 'trash') out.trash = true
    else if (key === 'before' && day !== null) out.before = day
    else if (key === 'after' && day !== null) out.after = day
    else out.words.push(m[0])
  }
  return out
}

/** Each word becomes a quoted prefix term; `"` is escaped by doubling. Words with no letters/digits are dropped. */
export function ftsMatch(words: string[]): string {
  return words
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .map((w) => `"${w.replaceAll('"', '""')}"*`)
    .join(' ')
}

// ---- store --------------------------------------------------------------------------------

const SUMMARY_COLS = `n.id, n.title, substr(n.body, 1, 480) AS head, n.updated_at, n.pinned, n.locked,
  (SELECT group_concat(t.name, char(31)) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = n.id) AS tag_names`

const tagsOf = (r: Row): string[] =>
  r.tag_names ? String(r.tag_names).split(SEP).sort((a, b) => a.localeCompare(b)) : []

const notFound = (): never => {
  throw new Error('note not found')
}

export interface StoreOptions {
  /** Called with the ids of notes whose keys were dropped (idle timeout, lock-screen, quit). */
  onLocksChanged?: (ids: string[]) => void
}

export function createStore(db: Db, wall: () => number = Date.now, opts: StoreOptions = {}) {
  const keys = createKeyCache((ids) => opts.onLocksChanged?.(ids))
  const getSetting = (key: string): unknown => {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Row | undefined
    return r ? JSON.parse(String(r.value)) : null
  }
  const putSetting = (key: string, json: string): void => {
    db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, json)
  }

  const stored = getSetting(DEVICE_KEY)
  const deviceId = typeof stored === 'string' ? stored : randomUUID()
  if (stored !== deviceId) putSetting(DEVICE_KEY, JSON.stringify(deviceId))
  const hlc = new Hlc(deviceId, wall)
  // Stay monotonic across restarts even if the wall clock moved backwards in between.
  const top = (db.prepare('SELECT max(rev) AS r FROM notes').get() as Row).r
  if (typeof top === 'string' && parseRev(top)) hlc.receive(top)

  const summary = (r: Row, snip?: string): NoteSummary => ({
    id: String(r.id),
    title: String(r.title),
    snippet: r.locked ? '' : snippetOf(snip ?? String(r.head)),
    updatedAt: Number(r.updated_at),
    pinned: !!r.pinned,
    locked: !!r.locked,
    tags: tagsOf(r)
  })

  function get(id: string): Note {
    const r = db
      .prepare(
        `SELECT n.id, n.title, n.body, n.created_at, n.updated_at, n.deleted_at, n.pinned, n.locked, n.cipher, n.cipher_format,
           (SELECT group_concat(t.name, char(31)) FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
             WHERE nt.note_id = n.id) AS tag_names
         FROM notes n WHERE n.id = ?`
      )
      .get(id) as Row | undefined
    if (!r) return notFound()
    const note: Note = {
      id: String(r.id),
      title: String(r.title),
      body: String(r.body),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
      deletedAt: r.deleted_at === null ? null : Number(r.deleted_at),
      pinned: !!r.pinned,
      locked: !!r.locked,
      tags: tagsOf(r)
    }
    if (note.locked) {
      // Plaintext only while main holds the key; otherwise the body stays ''.
      const k = keys.get(note.id)
      note.unlocked = false
      if (k && r.cipher_format === 'v5' && r.cipher instanceof Uint8Array) {
        try {
          note.body = openV5(r.cipher, note.id, k.key)
          note.unlocked = true
        } catch {
          keys.lock([note.id]) // the stored cipher no longer matches the key (e.g. a restored backup)
        }
      }
    }
    return note
  }

  function setTags(noteId: string, names: string[]): void {
    db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId)
    for (const name of tagList(names)) {
      const found = db.prepare('SELECT id FROM tags WHERE name = ?').get(name) as Row | undefined // NOCASE column
      const tagId = found ? String(found.id) : randomUUID()
      if (!found) db.prepare('INSERT INTO tags(id, name) VALUES (?, ?)').run(tagId, name)
      db.prepare('INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES (?, ?)').run(noteId, tagId)
    }
    gcTags()
  }

  const gcTags = (): void => {
    db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)')
  }

  function touch(id: string, extra: string, ...params: SQLInputValue[]): void {
    const r = db.prepare(`UPDATE notes SET updated_at = ?, rev = ?${extra} WHERE id = ?`).run(wall(), hlc.now(), ...params, id)
    if (!r.changes) notFound()
  }

  const notes = {
    list(filter: ListFilter): NoteSummary[] {
      const w: Where = { sql: [], params: [] }
      if (filter.kind === 'trash') w.sql.push('n.deleted_at IS NOT NULL')
      else w.sql.push('n.deleted_at IS NULL')
      if (filter.kind === 'pinned') w.sql.push('n.pinned = 1')
      if (filter.kind === 'tag') tagCond(w, filter.tag)
      const rows = db
        .prepare(`SELECT ${SUMMARY_COLS} FROM notes n WHERE ${w.sql.join(' AND ')} ORDER BY n.pinned DESC, n.updated_at DESC`)
        .all(...w.params) as Row[]
      return rows.map((r) => summary(r))
    },

    get,

    create(input: NoteInput = {}): Note {
      return tx(db, () => {
        const id = randomUUID()
        const t = wall()
        db.prepare('INSERT INTO notes(id, title, body, created_at, updated_at, rev) VALUES (?, ?, ?, ?, ?, ?)').run(
          id, input.title ?? '', input.body ?? '', t, t, hlc.now()
        )
        if (input.tags) setTags(id, input.tags)
        return get(id)
      })
    },

    /** Updates only the given fields, bumps updated_at and rev, atomically. */
    save(p: NotePatch): Note {
      return tx(db, () => {
        const cur = db.prepare('SELECT locked FROM notes WHERE id = ?').get(p.id) as Row | undefined
        if (!cur) return notFound()
        if (cur.locked) keys.get(p.id) // any save counts as activity
        const sets: string[] = []
        const params: SQLInputValue[] = []
        const set = (col: string, v: SQLInputValue): void => {
          sets.push(`, ${col} = ?`)
          params.push(v)
        }
        if (p.title !== undefined) set('title', p.title)
        if (p.body !== undefined && cur.locked) {
          // Locked notes keep body = '' and store the text encrypted with the cached key.
          const k = keys.get(p.id)
          if (!k) throw new Error('note is locked')
          set('cipher', sealV5(p.id, p.body, k.key, k.salt, k.iter))
        } else if (p.body !== undefined) set('body', p.body)
        if (p.pinned !== undefined) set('pinned', p.pinned ? 1 : 0)
        touch(p.id, sets.join(''), ...params)
        if (p.tags !== undefined) setTags(p.id, p.tags)
        return get(p.id)
      })
    },

    trash(id: string): void {
      tx(db, () => touch(id, ', deleted_at = ?', wall()))
    },

    restore(id: string): void {
      tx(db, () => touch(id, ', deleted_at = NULL'))
    },

    deleteForever(id: string): void {
      tx(db, () => {
        const r = db.prepare('SELECT deleted_at FROM notes WHERE id = ?').get(id) as Row | undefined
        if (!r) return notFound()
        if (r.deleted_at === null) throw new Error('note is not in the trash')
        db.prepare('DELETE FROM notes WHERE id = ?').run(id) // cascades note_tags, note_media, ai_messages
        gcTags()
      })
      keys.forget(id)
    }
  }

  const tags = {
    /** Counts exclude trashed notes; tags that only trashed notes use are hidden. */
    list(): Tag[] {
      const rows = db
        .prepare(
          `SELECT t.name, count(*) AS c FROM tags t
             JOIN note_tags nt ON nt.tag_id = t.id
             JOIN notes n ON n.id = nt.note_id AND n.deleted_at IS NULL
           GROUP BY t.id ORDER BY t.name`
        )
        .all() as Row[]
      return rows.map((r) => ({ name: String(r.name), count: Number(r.c) }))
    }
  }

  function search(q: string): NoteSummary[] {
    const s = parseSearch(q)
    const w: Where = { sql: [s.trash ? 'n.deleted_at IS NOT NULL' : 'n.deleted_at IS NULL'], params: [] }
    if (s.pinned) w.sql.push('n.pinned = 1')
    for (const t of s.tags) tagCond(w, t)
    if (s.before !== undefined) {
      w.sql.push('n.updated_at < ?')
      w.params.push(s.before)
    }
    if (s.after !== undefined) {
      w.sql.push('n.updated_at >= ?')
      w.params.push(s.after)
    }

    const match = ftsMatch(s.words)
    if (!match) {
      const rows = db
        .prepare(`SELECT ${SUMMARY_COLS} FROM notes n WHERE ${w.sql.join(' AND ')} ORDER BY n.pinned DESC, n.updated_at DESC`)
        .all(...w.params) as Row[]
      return rows.map((r) => summary(r))
    }
    const rows = db
      .prepare(
        `SELECT ${SUMMARY_COLS}, snippet(notes_fts, 1, '', '', '…', 16) AS snip
         FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
         WHERE notes_fts MATCH ? AND ${w.sql.join(' AND ')}
         ORDER BY notes_fts.rank, n.updated_at DESC`
      )
      .all(match, ...w.params) as Row[]
    return rows.map((r) => summary(r, String(r.snip)))
  }

  const settings = {
    get: getSetting,
    set(key: string, value: unknown): void {
      putSetting(key, settingValueJson(value))
    }
  }

  const locks = {
    ...createLocks({ db, hlc, keys, get, setting: getSetting }),
    lockAll: () => keys.lockAll()
  }

  return { db, deviceId, hlc, notes, tags, search, settings, bulk: createBulk(db, hlc), locks }
}

export type Store = ReturnType<typeof createStore>
