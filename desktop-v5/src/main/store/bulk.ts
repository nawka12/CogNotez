// Bulk insert for importers: explicit ids, timestamps and revs, all in one transaction.
// Rows go through the normal tables, so the FTS triggers fire. Everything is INSERT OR IGNORE by
// primary key, which makes a second run of the same import a no-op.
import { randomUUID } from 'node:crypto'
import type { SQLOutputValue } from 'node:sqlite'
import { tagList } from '../guards'
import type { Hlc } from '../hlc'
import { tx } from './db'
import type { Db } from './db'

export interface BulkNote {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  archived: boolean
  /** Set for locked notes; `body` must then be ''. */
  cipher: Uint8Array | null
  cipherFormat: string | null
  tags: string[]
  /** Media hashes this note uses; each must be in the batch's `media` or already stored. */
  media: string[]
}

export interface BulkMedia {
  hash: string
  mime: string
  bytes: number
  createdAt: number
}

export interface BulkMessage {
  id: string
  noteId: string | null
  threadId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  model: string | null
  createdAt: number
}

export interface BulkBatch {
  notes: BulkNote[]
  media: BulkMedia[]
  messages: BulkMessage[]
}

export interface BulkResult {
  insertedIds: string[]
  skippedExisting: number
  /** Distinct tags linked to newly inserted notes. */
  tags: number
  insertedMessageIds: string[]
}

export function createBulk(db: Db, hlc: Hlc) {
  return {
    /** Notes that already exist are left alone, along with their tags and media links. */
    insert(batch: BulkBatch): BulkResult {
      return tx(db, () => {
        const insMedia = db.prepare('INSERT OR IGNORE INTO media(hash, mime, bytes, created_at) VALUES (?, ?, ?, ?)')
        for (const m of batch.media) insMedia.run(m.hash, m.mime, m.bytes, m.createdAt)

        const insNote = db.prepare(
          `INSERT OR IGNORE INTO notes(id, title, body, created_at, updated_at, pinned, archived, locked, cipher, cipher_format, rev)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        const findTag = db.prepare('SELECT id FROM tags WHERE name = ?') // NOCASE column
        const insTag = db.prepare('INSERT INTO tags(id, name) VALUES (?, ?)')
        const insNoteTag = db.prepare('INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES (?, ?)')
        const insNoteMedia = db.prepare('INSERT OR IGNORE INTO note_media(note_id, hash) VALUES (?, ?)')

        const result: BulkResult = { insertedIds: [], skippedExisting: 0, tags: 0, insertedMessageIds: [] }
        const tagsUsed = new Set<string>()
        for (const n of batch.notes) {
          const locked = n.cipher !== null
          if (locked && n.body !== '') throw new Error('a locked note must have an empty body')
          const r = insNote.run(
            n.id, n.title, n.body, n.createdAt, n.updatedAt, n.pinned ? 1 : 0, n.archived ? 1 : 0,
            locked ? 1 : 0, n.cipher, n.cipherFormat, hlc.now()
          )
          if (!r.changes) {
            result.skippedExisting++
            continue
          }
          result.insertedIds.push(n.id)
          for (const name of tagList(n.tags)) {
            const found = findTag.get(name) as Record<string, SQLOutputValue> | undefined
            const tagId = found ? String(found.id) : randomUUID()
            if (!found) insTag.run(tagId, name)
            insNoteTag.run(n.id, tagId)
            tagsUsed.add(name.toLowerCase())
          }
          for (const h of n.media) insNoteMedia.run(n.id, h)
        }
        result.tags = tagsUsed.size

        const insMsg = db.prepare(
          'INSERT OR IGNORE INTO ai_messages(id, note_id, thread_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        for (const m of batch.messages) {
          if (insMsg.run(m.id, m.noteId, m.threadId, m.role, m.content, m.model, m.createdAt).changes) {
            result.insertedMessageIds.push(m.id)
          }
        }
        return result
      })
    },

    /** Main-process-only settings writes (keys like `import.v4`); values are stored as JSON. */
    putSettings(values: Record<string, unknown>): void {
      tx(db, () => {
        const put = db.prepare(
          'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )
        for (const [k, v] of Object.entries(values)) put.run(k, JSON.stringify(v))
      })
    }
  }
}
