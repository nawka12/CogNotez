import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createImporter, listV4MediaDir } from '../src/main/import'
import { importV4, inspectBlob, normalizeBlob } from '../src/main/import/v4'
import type { V4Input, V4MediaFile } from '../src/main/import/v4'
import { createMedia } from '../src/main/media'
import type { Media } from '../src/main/media'
import { memStore, tickingClock } from './helpers'

// A made-up v4 database, built from the shapes documented in src/main/import/v4.ts (no real user data).
const PNG_A = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
const PNG_B = Buffer.concat([PNG_A, Buffer.from('padding-to-change-the-hash')])
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const ENV = JSON.stringify({ v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter: 210000, salt: 'c2FsdA==', iv: 'aXY=', ct: 'Y3Q=', tag: 'dGFn' })

const file = (id: string, name: string, bytes: Uint8Array | null): V4MediaFile => ({ id, name, read: () => bytes })

function fixture() {
  return {
    notes: {
      '1758187139402': {
        id: '1758187139402', title: 'Weekly plan', pinned: true, is_archived: false,
        content: 'Intro ![a.png](cognotez-media://mg5w30vvs3emcw8uz3)\n<img src="cognotez-media://gone0000000001" alt="x">\nSee also cognotez-media://mg5w30vvs3emcw8uz3.png.',
        tags: ['tagwork0000001'], created_at: '2025-09-18T10:00:00.000Z', updated_at: '2025-09-19T11:30:00.000Z'
      },
      short: { id: 'short', title: 'Archived one', content: 'old', is_archived: true, created_at: '2024-01-02T00:00:00.000Z', tags: [] },
      lock1xxxxxxxx: {
        id: 'lock1xxxxxxxx', title: 'Secret plans', content: 'PLAINTEXT-MUST-NOT-LEAK', preview: 'PREVIEW-MUST-NOT-LEAK',
        password_protected: true, password_hash: '{"hashBase64":"x"}', encrypted_content: ENV,
        created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-02T00:00:00.000Z', tags: ['tagwork0000002']
      },
      lock2xxxxxxxx: {
        id: 'lock2xxxxxxxx', title: 'Leaky', content: 'leaked body text', password_protected: true, encrypted_content: null,
        created_at: '2025-02-01T00:00:00.000Z', updated_at: '2025-02-02T00:00:00.000Z', tags: []
      },
      bad1: 'not an object',
      bad2: null,
      bad3: [1, 2],
      nolongtags000: { id: 'nolongtags000', title: 'Tagged', content: 'x', tags: ['tagbad000000001', 'tagdeep000000001'], created_at: '2025-03-01T00:00:00.000Z', updated_at: '2025-03-01T00:00:00.000Z' },
      withatt000000: { id: 'withatt000000', title: 'Has attachment', content: 'no inline media', tags: [], created_at: '2025-04-01T00:00:00.000Z', updated_at: '2025-04-01T00:00:00.000Z' }
    },
    tags: {
      tagwork0000001: { id: 'tagwork0000001', name: 'Work' },
      tagwork0000002: { id: 'tagwork0000002', name: 'work' },
      tagbad000000001: { id: 'tagbad000000001', name: '/bad/' },
      tagdeep000000001: { id: 'tagdeep000000001', name: 'Ideas/Q4' }
    },
    note_tags: {
      '1758187139402_tagwork0000002': { note_id: '1758187139402', tag_id: 'tagwork0000002' },
      '1758187139402_tagdeep000000001': { note_id: '1758187139402', tag_id: 'tagdeep000000001' }
    },
    ai_conversations: {
      c1: { id: 'c1', note_id: '1758187139402', user_message: 'Summarise', ai_response: 'Short summary', context: 'FULL-NOTE-CONTEXT', action_type: 'summarize', created_at: '2025-09-19T12:00:00.000Z' },
      c2: { id: 'c2', note_id: null, user_message: 'Hi', ai_response: 'Hello', created_at: '2025-09-20T12:00:00.000Z', model: 'm/x' },
      c3: { id: 'c3', note_id: 'no-such-note', user_message: 'a', ai_response: 'b', created_at: '2025-09-20T12:00:00.000Z' },
      c4: 'garbage'
    },
    settings: {
      theme: { value: 'dark', updated_at: 'x' },
      ollama_endpoint: { value: 'http://localhost:11434' },
      openrouter_api_key: { value: 'sk-or-v1-secret' },
      sync_token: { value: 'tok' },
      my_Passphrase_hint: { value: 'p' },
      custom_templates: { value: [{ id: 't1', name: 'Daily', content: '# Daily' }] },
      note_attachments: { value: { withatt000000: [{ id: 'attach0000001', name: 'doc.pdf', type: 'application/pdf' }, { id: 'attach_missing', name: 'x.pdf' }] } }
    },
    encryption: { enabled: true, passphrase: 'SYNC-PASSPHRASE', saltBase64: 'c2FsdA==', iterations: 210000 },
    sync: { enabled: true, provider: 'google-drive' }
  }
}

const files = (): V4MediaFile[] => [
  file('mg5w30vvs3emcw8uz3', 'mg5w30vvs3emcw8uz3.png', PNG_A),
  file('unref000000001', 'unref000000001.png', PNG_B),
  file('attach0000001', 'attach0000001.pdf', Buffer.from('%PDF-1.4 fake'))
]

describe('v4 importer', () => {
  let dir: string
  let media: Media
  let store: ReturnType<typeof memStore>
  let keys: string[]
  const secrets = { has: (): boolean => false, set: (_n: string, v: string): void => void keys.push(v) }
  const input = (over: Partial<V4Input> = {}): V4Input => ({ kind: 'localStorage', blob: fixture(), extras: { theme: 'dark', openrouter_api_key: 'sk-or-v1-secret' }, files: files(), ...over })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cog-import-'))
    store = memStore(tickingClock())
    media = createMedia(join(dir, 'media'), store.db)
    keys = []
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const run = (i: V4Input = input()) => importV4(store, secrets, media, i, tickingClock())
  const row = (id: string) => store.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as Record<string, unknown>

  it('maps fields: ids, timestamps, pinned, archived, title and body', () => {
    const r = run()
    const n = store.notes.get('1758187139402')
    expect(n).toMatchObject({ title: 'Weekly plan', pinned: true, createdAt: Date.parse('2025-09-18T10:00:00.000Z'), updatedAt: Date.parse('2025-09-19T11:30:00.000Z') })
    expect(row('1758187139402').archived).toBe(0)
    expect(String(row('1758187139402').rev)).toMatch(/^\d{13}-/)
    // invalid id format -> deterministic replacement; created_at fills the missing updated_at
    const hashed = r.ids.find((id) => id.startsWith('v4-'))!
    expect(hashed).toMatch(/^v4-[0-9a-f]{32}$/)
    expect(row(hashed)).toMatchObject({ archived: 1, created_at: Date.parse('2024-01-02T00:00:00.000Z'), updated_at: Date.parse('2024-01-02T00:00:00.000Z') })
    expect(r.stats.notes).toBe(6)
  })

  it('unions note.tags[] and note_tags, de-duplicates case-insensitively and drops invalid names', () => {
    const r = run()
    expect(store.notes.get('1758187139402').tags).toEqual(['Ideas/Q4', 'Work'])
    expect(store.notes.get('nolongtags000').tags).toEqual(['Ideas/Q4'])
    expect(r.stats.warnings.some((w) => /dropped 1 invalid tag/.test(w))).toBe(true)
    expect(store.tags.list().map((t) => t.name).sort()).toEqual(['Ideas/Q4', 'Work', 'imported/was-locked'].sort())
  })

  it('imports a locked note with its ciphertext and never its plaintext', () => {
    const r = run()
    const n = row('lock1xxxxxxxx')
    expect(n).toMatchObject({ locked: 1, body: '', cipher_format: 'v4', title: 'Secret plans' })
    expect(Buffer.from(n.cipher as Uint8Array).toString('utf8')).toBe(ENV)
    expect(JSON.stringify(store.db.prepare('SELECT * FROM notes').all().map((x) => String((x as { body: string }).body)))).not.toContain('MUST-NOT-LEAK')
    expect(store.search('PLAINTEXT').length).toBe(0)
    expect(r.stats.locked).toBe(1)
  })

  it('imports a locked note that has no ciphertext but plaintext as unlocked, tagged', () => {
    const r = run()
    expect(store.notes.get('lock2xxxxxxxx')).toMatchObject({ body: 'leaked body text', locked: false, tags: ['imported/was-locked'] })
    expect(r.stats.lockedWithoutCipher).toBe(1)
  })

  it('rewrites media references to content hashes, links notes, and counts missing files', () => {
    const r = run()
    const h = sha(PNG_A)
    const n = store.notes.get('1758187139402')
    expect(n.body).toContain(`![a.png](cognotez-media://${h})`)
    expect(n.body).toContain(`See also cognotez-media://${h}.`)
    expect(n.body).toContain('cognotez-media://gone0000000001') // missing: untouched
    expect(n.body).not.toContain('mg5w30vvs3emcw8uz3')
    expect(r.stats.media).toBe(3)
    expect(r.stats.mediaMissing).toBe(2) // inline ref + attachment
    expect(r.stats.warnings.filter((w) => /missing/.test(w))).toHaveLength(2)
    const mr = store.db.prepare('SELECT mime, bytes FROM media WHERE hash = ?').get(h) as { mime: string; bytes: number }
    expect(mr).toEqual({ mime: 'image/png', bytes: PNG_A.length })
    expect(media.serve(`cognotez-media://${h}`).status).toBe(200)
    expect(store.db.prepare('SELECT hash FROM note_media WHERE note_id = ?').all('1758187139402')).toEqual([{ hash: h }])
    // attachment (pdf) linked through settings.note_attachments, unreferenced png stored without a link
    expect(store.db.prepare('SELECT m.mime FROM note_media nm JOIN media m ON m.hash = nm.hash WHERE nm.note_id = ?').all('withatt000000')).toEqual([{ mime: 'application/pdf' }])
    expect(store.db.prepare('SELECT 1 FROM media WHERE hash = ?').get(sha(PNG_B))).toBeTruthy()
    expect(store.db.prepare('SELECT 1 FROM note_media WHERE hash = ?').get(sha(PNG_B))).toBeUndefined()
  })

  it('maps conversations to ai_messages, drops context, skips notes that do not exist', () => {
    const r = run()
    expect(r.stats.conversations).toBe(2)
    const msgs = store.db.prepare('SELECT note_id, thread_id, role, content, model, created_at FROM ai_messages ORDER BY thread_id, role').all() as Record<string, unknown>[]
    expect(msgs).toHaveLength(4)
    expect(msgs).toContainEqual({ note_id: '1758187139402', thread_id: 'v4-1758187139402', role: 'user', content: 'Summarise', model: null, created_at: Date.parse('2025-09-19T12:00:00.000Z') })
    expect(msgs).toContainEqual({ note_id: null, thread_id: 'v4-global', role: 'assistant', content: 'Hello', model: 'm/x', created_at: Date.parse('2025-09-20T12:00:00.000Z') + 1 })
    expect(JSON.stringify(msgs)).not.toContain('FULL-NOTE-CONTEXT')
  })

  it('keeps only non-secret settings, templates and the OpenRouter key goes to secrets', () => {
    const r = run()
    const s = store.settings.get('import.v4_settings') as Record<string, unknown>
    expect(s).toEqual({ theme: 'dark', ollama_endpoint: 'http://localhost:11434' })
    expect(JSON.stringify(store.db.prepare('SELECT value FROM settings').all())).not.toMatch(/sk-or-v1|SYNC-PASSPHRASE|tok"/)
    expect(store.settings.get('import.v4_templates')).toEqual([{ id: 't1', name: 'Daily', content: '# Daily' }])
    expect(keys).toEqual(['sk-or-v1-secret'])
    expect(r.openrouterKeyImported).toBe(true)
    expect(store.settings.get('import.v4_media_map')).toMatchObject({ mg5w30vvs3emcw8uz3: sha(PNG_A) })
  })

  it('records import.v4 and re-running is idempotent', () => {
    const first = run()
    const rec = store.settings.get('import.v4') as { at: number; source: string; stats: { notes: number } }
    expect(rec).toMatchObject({ source: 'localStorage', stats: { notes: 6 } })
    // the user edits a tag in v5 after the import; a re-run must not undo it
    store.notes.save({ id: '1758187139402', tags: ['mine'] })
    const second = run()
    expect(second.stats).toMatchObject({ notes: 0, skippedExisting: 6, tags: 0, conversations: 0 })
    expect(second.ids).toEqual([])
    expect(store.notes.get('1758187139402').tags).toEqual(['mine'])
    expect((store.db.prepare('SELECT count(*) AS c FROM notes').get() as { c: number }).c).toBe(first.ids.length)
    expect((store.db.prepare('SELECT count(*) AS c FROM ai_messages').get() as { c: number }).c).toBe(4)
    expect(store.settings.get('import.v4')).toEqual(rec) // first run's record is kept
  })

  it('skips malformed notes with warnings that never quote note text', () => {
    const r = run()
    expect(r.stats.warnings.filter((w) => /^note #\d+ skipped/.test(w))).toHaveLength(3)
    expect(JSON.stringify(r.stats.warnings)).not.toMatch(/Weekly|Secret plans|leaked body/)
    expect(() => run(input({ blob: '{"notes": 5}' }))).toThrow(/not a CogNotez 4 database/)
    expect(() => run(input({ blob: 'nope' }))).toThrow()
  })

  it('clamps over-long titles and bodies', () => {
    const blob = { notes: { longnote1234: { id: 'longnote1234', title: 'T'.repeat(2000), content: 'b'.repeat(5_000_100) } } }
    const r = run(input({ blob, files: [] }))
    const n = store.notes.get('longnote1234')
    expect(n.title).toHaveLength(1000)
    expect(n.body).toHaveLength(5_000_000)
    expect(r.stats.warnings.filter((w) => /truncated/.test(w))).toHaveLength(2)
  })

  it('makes imported notes findable with full-text search, but not locked bodies', () => {
    run()
    expect(store.search('summary').length).toBe(0) // conversations are not notes
    expect(store.search('Intro').map((h) => h.id)).toEqual(['1758187139402'])
    expect(store.search('leaked').map((h) => h.id)).toEqual(['lock2xxxxxxxx'])
    expect(store.search('tag:work').map((h) => h.id).sort()).toEqual(['1758187139402', 'lock1xxxxxxxx'])
    expect(store.search('Secret').map((h) => h.locked)).toEqual([true]) // title only; body is empty
  })

  it('rolls back everything if the write fails', () => {
    const blob = fixture()
    store.db.exec('DROP TABLE ai_messages') // makes the last step of the transaction fail
    expect(() => run(input({ blob }))).toThrow()
    expect((store.db.prepare('SELECT count(*) AS c FROM notes').get() as { c: number }).c).toBe(0)
  })

  it('accepts the Drive sync wrapper and reports note counts for detect', () => {
    const wrapped = { data: fixture(), checksum: 'x' }
    expect(normalizeBlob(JSON.stringify(wrapped))).toBeTruthy()
    expect(inspectBlob(wrapped)).toEqual({ notes: 6, newestUpdatedAt: Date.parse('2025-09-19T11:30:00.000Z') })
  })
})

describe('createImporter', () => {
  it('prefers localStorage, falls back to the json mirror, and detect lists both', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cog-v4dir-'))
    try {
      mkdirSync(join(dir, 'media'))
      writeFileSync(join(dir, 'media', 'mg5w30vvs3emcw8uz3.png'), PNG_A)
      writeFileSync(join(dir, 'cognotez_data.json'), JSON.stringify({ notes: { jsononly12345: { id: 'jsononly12345', title: 'From json', content: 'j' } } }))
      const store = memStore()
      const media = createMedia(join(dir, 'v5media'), store.db)
      const secrets = { has: () => false, set: () => undefined }
      let ls: { raw: string; extras: Record<string, string>; idb: V4MediaFile[] } | null = { raw: JSON.stringify(fixture()), extras: {}, idb: [] }
      const imp = createImporter({ store, secrets, media, v4Dir: dir, readLocalStorage: async () => ls })

      const d = await imp.detect()
      expect(d.sources.map((s) => [s.kind, s.notes])).toEqual([['localStorage', 6], ['json', 1]])
      expect(d.alreadyImported).toBeNull()

      expect((await imp.run('json')).stats.notes).toBe(1)
      ls = null
      expect((await imp.run('auto')).stats).toMatchObject({ notes: 0, skippedExisting: 1 }) // falls back to json
      await expect(imp.run('localStorage')).rejects.toThrow(/localStorage/)
      ls = { raw: JSON.stringify(fixture()), extras: {}, idb: [] }
      const r = await imp.run('auto')
      expect(r.stats.notes).toBe(6)
      expect(store.notes.get('1758187139402').body).toContain(sha(PNG_A)) // media dir files are picked up
      expect((await imp.detect()).alreadyImported?.stats.notes).toBe(6) // latest run that imported something
      expect(listV4MediaDir(join(dir, 'media'))).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
