import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createImporter } from '../src/main/import'
import { clampIter, decryptSyncEnvelope, isEncryptedEnvelope, SYNC_ITER_RANGE } from '../src/main/import/v4sync'
import { createMedia } from '../src/main/media'
import { memStore } from './helpers'

// Made with desktop/src/js/encryption.js `encryptData` (v4, run read-only in node), passphrase below, 210000 iterations.
// The plain file has the shape of exportDataForSync().data plus _syncMeta (no `settings`, no wrapper).
const PASS = 'correct horse battery'
const fx = (n: string): string => join(__dirname, 'fixtures', n)
const ENC = JSON.parse(readFileSync(fx('v4-sync-encrypted.json'), 'utf8')) as Record<string, unknown>

let dir: string
let imp: ReturnType<typeof createImporter>
let store: ReturnType<typeof memStore>
let dialogs: number
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cog-sync-'))
  store = memStore()
  imp = createImporter({
    store, v4Dir: join(dir, 'v4'), readLocalStorage: async () => null,
    secrets: { has: () => false, set: () => undefined },
    media: createMedia(join(dir, 'media'), store.db)
  })
  dialogs = 0
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})
const pick = (path: string | null) => async () => (dialogs++, path)

describe('v4 Drive sync file', () => {
  it('imports a plaintext sync file and is idempotent', async () => {
    const r = await imp.fromFile(pick(fx('v4-sync-plain.json')))
    expect(r?.stats).toMatchObject({ notes: 2, skippedExisting: 0 })
    expect(store.notes.get('1758187139402')).toMatchObject({ title: 'Drive note', pinned: true, tags: ['Drive'] })
    expect((await imp.fromFile(pick(fx('v4-sync-plain.json'))))?.stats).toMatchObject({ notes: 0, skippedExisting: 2 })
  })

  it('unwraps the {data} wrapper too', async () => {
    const p = join(dir, 'wrapped.json')
    writeFileSync(p, JSON.stringify({ data: JSON.parse(readFileSync(fx('v4-sync-plain.json'), 'utf8')), checksum: 'x' }))
    expect((await imp.fromFile(pick(p)))?.stats.notes).toBe(2)
  })

  it('recognises the v4 envelope and decrypts the vector', async () => {
    expect(isEncryptedEnvelope(ENC)).toBe(true)
    expect(ENC['iter']).toBe(210000)
    const plain = (await decryptSyncEnvelope(ENC, PASS)) as { notes: Record<string, unknown>; _syncMeta: { syncVersion: number } }
    expect(Object.keys(plain.notes)).toHaveLength(2)
    expect(plain._syncMeta.syncVersion).toBe(3)
    await expect(decryptSyncEnvelope(ENC, 'nope nope nope')).rejects.toThrow('wrong passphrase')
    await expect(decryptSyncEnvelope({ ...ENC, tag: 'AAAA' }, PASS)).rejects.toThrow('wrong passphrase')
  })

  it('asks for a passphrase, re-uses the picked file without a dialog, and imports', async () => {
    const path = fx('v4-sync-encrypted.json')
    await expect(imp.fromFile(pick(path))).rejects.toThrow(/^needs passphrase$/)
    await expect(imp.fromFile(pick('/never'), 'wrong wrong wrong')).rejects.toThrow(/^wrong passphrase$/)
    expect(dialogs).toBe(1)
    const r = await imp.fromFile(pick('/never'), PASS)
    expect(dialogs).toBe(1)
    expect(r?.stats.notes).toBe(2)
    expect(store.notes.get('drivenote2xx').body).toBe('Other note')
    // the remembered path is spent: a further passphrase opens the dialog again (cancelled here)
    expect(await imp.fromFile(pick(null), PASS)).toBeNull()
    expect(dialogs).toBe(2)
    // idempotent
    await expect(imp.fromFile(pick(path))).rejects.toThrow('needs passphrase')
    expect((await imp.fromFile(pick(null), PASS))?.stats).toMatchObject({ notes: 0, skippedExisting: 2 })
  })

  it('forgets the picked path after 10 minutes', async () => {
    vi.useFakeTimers()
    await expect(imp.fromFile(pick(fx('v4-sync-encrypted.json')))).rejects.toThrow('needs passphrase')
    vi.advanceTimersByTime(10 * 60_000 + 1)
    expect(await imp.fromFile(pick(null), PASS)).toBeNull() // had to ask again
    expect(dialogs).toBe(2)
  })

  it('does not remember a plaintext file, and rejects non-backups without leaking', async () => {
    const bad = join(dir, 'x.json')
    writeFileSync(bad, '{"hello": 1}')
    await expect(imp.fromFile(pick(bad))).rejects.toThrow(/not a CogNotez 4 backup/)
    writeFileSync(bad, 'not json')
    await expect(imp.fromFile(pick(bad))).rejects.toThrow(/not a CogNotez 4 backup/)
    expect(await imp.fromFile(pick(null))).toBeNull()
    expect(await imp.fromFile(pick(null), PASS)).toBeNull()
    expect(dialogs).toBe(4)
  })

  it('clamps the iteration count from the file', () => {
    expect(SYNC_ITER_RANGE).toEqual([100_000, 2_000_000])
    expect([clampIter(undefined), clampIter(0), clampIter(1), clampIter(1e12), clampIter(-5), clampIter('x'), clampIter(300_000)]).toEqual([
      210_000, 210_000, 100_000, 2_000_000, 100_000, 210_000, 300_000
    ])
  })
})
