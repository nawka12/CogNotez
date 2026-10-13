// Lock / unlock operations. Electron-free. Passwords and keys exist only inside these functions and the key cache.
import type { SQLOutputValue } from 'node:sqlite'
import type { Note } from '../../shared/api'
import type { Hlc } from '../hlc'
import { tx } from '../store/db'
import type { Db } from '../store/db'
import { deriveKey, newSalt, openV5, openWithPassword, sealV5, V5_ITER } from './notecrypto'
import type { KeyCache } from './keycache'

type Row = Record<string, SQLOutputValue>

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 1024

const MEDIA_RE = /cognotez-media:\/\/([A-Za-z0-9_-]+(?:\.(?:png|jpe?g|gif|webp|avif|svg|bmp|mp4|m4v|webm|mov|mp3|ogg|wav|m4a|pdf))?)/gi
const HASH_RE = /^[0-9a-f]{64}$/

interface Deps {
  db: Db
  hlc: Hlc
  keys: KeyCache
  get(id: string): Note
  setting(key: string): unknown
}

export function createLocks({ db, hlc, keys, get, setting }: Deps) {
  const load = (id: string): Row => {
    const r = db.prepare('SELECT body, locked, cipher, cipher_format, conflict_of FROM notes WHERE id = ?').get(id) as Row | undefined
    if (!r) throw new Error('note not found')
    return r
  }
  const cipherOf = (r: Row): Uint8Array => {
    if (!(r.cipher instanceof Uint8Array)) throw new Error('note has no ciphertext')
    return r.cipher
  }
  /** AAD candidates: a sync conflicted copy may still carry its original note's AAD. */
  const aadIds = (id: string, r: Row): string[] => (typeof r.conflict_of === 'string' ? [id, r.conflict_of] : [id])
  /** Plaintext of a locked v5 note using the cached key; throws 'note is locked' without one. */
  const plainOf = (id: string, r: Row): string => {
    const k = keys.get(id)
    if (!k || r.cipher_format !== 'v5') throw new Error('note is locked')
    return openV5(cipherOf(r), aadIds(id, r), k.key)
  }
  const checkNew = (pw: string): void => {
    if (typeof pw !== 'string' || pw.length < PASSWORD_MIN || pw.length > PASSWORD_MAX) {
      throw new Error(`password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters`)
    }
  }

  /** v4 bodies point at v4 media ids; the importer left `import.v4_media_map` (id -> sha256) for this moment. */
  function mapMedia(body: string): { body: string; hashes: Set<string> } {
    const raw = setting('import.v4_media_map')
    const map = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const find = (k: string): string | undefined => {
      const h = Object.hasOwn(map, k) ? map[k] : undefined
      return typeof h === 'string' && HASH_RE.test(h) ? h : undefined
    }
    const hashes = new Set<string>()
    const out = body.replace(MEDIA_RE, (m, ref: string) => {
      if (HASH_RE.test(ref)) return m
      const h = find(ref) ?? find(ref.replace(/\.[A-Za-z0-9]+$/, ''))
      if (!h) return m
      hashes.add(h)
      return `cognotez-media://${h}`
    })
    return { body: out, hashes }
  }

  return {
    /**
     * Decrypts and keeps the key in memory. A v4 note is converted to v5 right away (same password, new salt),
     * so v4's ciphertext format is never written back.
     */
    async unlock(id: string, password: string): Promise<Note> {
      const r = load(id)
      if (!r.locked) throw new Error('note is not locked')
      const cipher = cipherOf(r)
      const opened = await openWithPassword(cipher, r.cipher_format === null ? null : String(r.cipher_format), aadIds(id, r), password)
      if (r.cipher_format === 'v5') {
        keys.set(id, opened.key, opened.salt, opened.iter)
        return get(id)
      }
      opened.key.fill(0)
      const { body, hashes } = mapMedia(opened.text)
      const salt = newSalt()
      const key = await deriveKey(password, salt, V5_ITER)
      try {
        tx(db, () => {
          const cur = load(id)
          if (!cur.locked || cur.cipher_format !== 'v4' || !Buffer.from(cipherOf(cur)).equals(cipher)) throw new Error('note changed')
          db.prepare("UPDATE notes SET cipher = ?, cipher_format = 'v5', rev = ? WHERE id = ?").run(sealV5(id, body, key, salt, V5_ITER), hlc.now(), id)
          const link = db.prepare('INSERT OR IGNORE INTO note_media(note_id, hash) SELECT ?, hash FROM media WHERE hash = ?')
          for (const h of hashes) link.run(id, h)
        })
      } catch (e) {
        key.fill(0)
        throw e
      }
      keys.set(id, key, salt, V5_ITER)
      return get(id)
    },

    lock(id: string): void {
      keys.lock([id])
    },

    /** Locks a plain note, or changes the password of an unlocked one (new salt either way). */
    async setPassword(id: string, password: string): Promise<void> {
      checkNew(password)
      const first = load(id)
      if (first.locked && !keys.has(id)) throw new Error('note is locked')
      const salt = newSalt()
      const key = await deriveKey(password, salt, V5_ITER)
      let wasPlain = false
      try {
        tx(db, () => {
          const r = load(id) // re-read: the body may have been saved while the KDF ran
          wasPlain = !r.locked
          const plain = r.locked ? plainOf(id, r) : String(r.body)
          db.prepare("UPDATE notes SET locked = 1, body = '', cipher = ?, cipher_format = 'v5', rev = ? WHERE id = ?")
            .run(sealV5(id, plain, key, salt, V5_ITER), hlc.now(), id)
          // FTS5 'delete' only marks old terms; merging every segment is what actually drops the old words.
          if (wasPlain) db.exec("INSERT INTO notes_fts(notes_fts) VALUES('optimize')")
        })
      } catch (e) {
        key.fill(0)
        throw e
      }
      keys.set(id, key, salt, V5_ITER)
      // Push the rewritten pages into the main file and empty the WAL, so no plaintext copy lingers there.
      if (wasPlain) db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    },

    /** Permanent. The note must be unlocked. */
    removeLock(id: string): Note {
      tx(db, () => {
        const r = load(id)
        if (!r.locked) throw new Error('note is not locked')
        const plain = plainOf(id, r)
        db.prepare("UPDATE notes SET locked = 0, body = ?, cipher = NULL, cipher_format = NULL, rev = ? WHERE id = ?").run(plain, hlc.now(), id)
      })
      keys.forget(id)
      return get(id)
    }
  }
}

export type Locks = ReturnType<typeof createLocks>
