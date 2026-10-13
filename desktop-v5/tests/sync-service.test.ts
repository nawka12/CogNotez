// The sync service around the engine: setup, key handling and status (Electron-free; folder transport on a temp dir).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SyncStatus } from '../src/shared/api'
import { createMedia } from '../src/main/media'
import { openDb } from '../src/main/store/db'
import { createStore } from '../src/main/store/notes'
import { createFolderTransport } from '../src/main/sync/folder'
import { createSyncService } from '../src/main/sync/service'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function service(folder: string, hooks: { statuses?: SyncStatus[]; lines?: string[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cognotez-svc-'))
  dirs.push(dir)
  const db = openDb(':memory:')
  const store = createStore(db)
  const noKeychain = () => {
    throw new Error('secure storage is unavailable')
  }
  const sync = createSyncService({
    store, media: createMedia(dir, db), secrets: { get: noKeychain, set: noKeychain, delete: noKeychain },
    transports: { folder: createFolderTransport }, pickFolder: async () => folder, hostname: () => 'host',
    onStatus: (st) => void hooks.statuses?.push(st), onNotesChanged: () => undefined, info: (m) => void hooks.lines?.push(m)
  })
  return { store, sync }
}

describe('sync service', () => {
  it('without an OS keychain the key stays in memory: setup with a passphrase syncs right away', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'cognotez-svc-folder-'))
    dirs.push(folder)
    const a = service(folder)
    a.store.notes.create({ title: 'kept in memory' })
    const s = await a.sync.setup({ transport: 'folder', passphrase: 'correct horse battery' })
    expect(s).toMatchObject({ encrypted: true, needsPassphrase: false, target: folder })
    const after = await a.sync.now()
    expect(after).toMatchObject({ state: 'idle', lastError: null })
    a.sync.stop()

    const b = service(folder)
    expect(await b.sync.setup({ transport: 'folder' })).toMatchObject({ encrypted: true, needsPassphrase: true })
    await expect(b.sync.unlock('wrong horse battery')).rejects.toThrow('wrong passphrase')
    await b.sync.unlock('correct horse battery')
    expect((await b.sync.now()).lastError).toBeNull()
    expect(b.store.notes.list({ kind: 'all' }).map((n) => n.title)).toEqual(['kept in memory'])
    b.sync.stop()
  })

  it('reports progress while syncing, throttles the events, and logs the phases without note text', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'cognotez-svc-folder-'))
    dirs.push(folder)
    const statuses: SyncStatus[] = []
    const lines: string[] = []
    const a = service(folder, { statuses, lines })
    for (let i = 0; i < 60; i++) a.store.notes.create({ title: `secret title ${i}`, body: `secret body ${i}` })
    await a.sync.setup({ transport: 'folder' })
    await a.sync.now()
    a.sync.stop()
    const busy = statuses.filter((s) => s.state === 'syncing')
    expect(busy.every((s) => s.progress && s.progress.startedAt > 0)).toBe(true)
    expect(statuses.filter((s) => s.state !== 'syncing').every((s) => s.progress === null)).toBe(true)
    const up = busy.filter((s) => s.progress!.phase === 'upload' && s.progress!.total === 60)
    expect(up[0]!.progress).toMatchObject({ done: 0, total: 60 }) // first update of the phase
    expect(up.at(-1)!.progress).toMatchObject({ done: 60, total: 60 }) // last one
    expect(up.length).toBeLessThan(10) // 61 updates were made inside a few hundred ms
    expect(lines[0]).toBe('round started (folder)')
    expect(lines).toContain('uploading 60 changes')
    expect(lines).toContain('uploaded 25 of 60')
    expect(lines).toContain('uploaded 50 of 60')
    expect(lines.some((l) => /^round done in \d+\.\d s \(wrote 60 files, changed 0 notes\)$/.test(l))).toBe(true)
    expect(lines.join('\n')).not.toMatch(/secret/)
  })
})

describe('switching an existing plaintext location to encryption', () => {
  it('is refused in place, and works after turning sync off and emptying the location', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const folder = mkdtempSync(join(tmpdir(), 'cognotez-svc-folder-'))
    dirs.push(folder)
    const a = service(folder)
    a.store.notes.create({ title: 'zebracorn title', body: 'zebracorn body' })
    await a.sync.setup({ transport: 'folder' })
    expect((await a.sync.now()).lastError).toBeNull()

    // Asking for encryption on the existing plaintext location: refused, with the way out in the message.
    await expect(a.sync.setup({ transport: 'folder', passphrase: 'correct horse battery' })).rejects.toThrow(/pick an empty folder/)

    // The documented way: turn sync off, empty the location, set up again with a passphrase.
    await a.sync.disable()
    for (const n of readdirSync(folder)) rmSync(join(folder, n), { recursive: true, force: true })
    expect(await a.sync.setup({ transport: 'folder', passphrase: 'correct horse battery' })).toMatchObject({ encrypted: true, needsPassphrase: false })
    expect((await a.sync.now()).lastError).toBeNull()
    const objects = readdirSync(join(folder, 'objects'))
    expect(objects.length).toBe(1)
    expect(objects.every((n) => n.endsWith('.bin'))).toBe(true)
    for (const n of objects) expect(readFileSync(join(folder, 'objects', n)).includes('zebracorn')).toBe(false)
    a.sync.stop()
  })
})
