// The sync service around the engine: setup, key handling and status (Electron-free; folder transport on a temp dir).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMedia } from '../src/main/media'
import { openDb } from '../src/main/store/db'
import { createStore } from '../src/main/store/notes'
import { createFolderTransport } from '../src/main/sync/folder'
import { createSyncService } from '../src/main/sync/service'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function service(folder: string) {
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
    onStatus: () => undefined, onNotesChanged: () => undefined
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
})
