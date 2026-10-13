// The shared Transport contract against the memory and folder transports.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createFolderTransport } from '../src/main/sync/folder'
import { MemoryRemote, memoryTransport } from '../src/main/sync/memory'
import { runConformance } from './sync-transport-conformance'

const remote = new MemoryRemote()
runConformance('memory', () => memoryTransport(remote), { incremental: true, atomicCreate: true })

const dir = mkdtempSync(join(tmpdir(), 'cognotez-folder-conf-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
runConformance('folder', () => createFolderTransport(join(dir, 'sync')), { atomicCreate: true })

describe('folder transport', () => {
  it('an unreachable root is an error, never "the file is absent"', async () => {
    const t = createFolderTransport(join(dir, 'unmounted'))
    await expect(t.read('meta.json')).rejects.toThrow('The sync folder is not reachable')
  })

  it('ignores temp files and sync-tool leftovers in listings, and refuses unsafe names', async () => {
    const root = join(dir, 'foreign')
    const t = createFolderTransport(root)
    await t.ensureRoot()
    for (const f of ['.cognotez-tmp-x', '.syncthing.n.x.tmp', 'n.x.sync-conflict-1.json', 'n.x (conflicted copy).json']) writeFileSync(join(root, 'objects', f), 'x')
    expect((await t.list(null)).added).toEqual([])
    await expect(t.create('objects/../../escape', new Uint8Array(1))).rejects.toThrow('invalid sync file name')
  })
})
