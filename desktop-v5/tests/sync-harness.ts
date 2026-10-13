// Simulated devices for sync tests: each has its own in-memory store, HLC, media dir and transport hooks,
// all talking to one shared MemoryRemote.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMedia } from '../src/main/media'
import { openDb } from '../src/main/store/db'
import { createStore } from '../src/main/store/notes'
import { unwrapDek } from '../src/main/sync/crypto'
import { openRemote, syncRound } from '../src/main/sync/engine'
import type { RemoteId, RoundResult } from '../src/main/sync/engine'
import { MemoryRemote, memoryTransport } from '../src/main/sync/memory'
import type { Hooks } from '../src/main/sync/memory'

const dirs: string[] = []
export function cleanupDevices(): void {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
}

/** A clock that advances `step` ms per call, starting at `start`. */
export function clock(start: number, step = 7) {
  let t = start
  return () => (t += step)
}

export type Device = Awaited<ReturnType<typeof makeDevice>>

export async function makeDevice(name: string, remote: MemoryRemote, opts: { passphrase?: string; start?: number } = {}) {
  const db = openDb(':memory:')
  const lockEvents: string[][] = []
  const store = createStore(db, clock(opts.start ?? Date.UTC(2026, 9, 13)), { onLocksChanged: (ids) => lockEvents.push(ids) })
  const dir = mkdtempSync(join(tmpdir(), `cognotez-sync-${name}-`))
  dirs.push(dir)
  const media = createMedia(dir, db)
  const hooks: Hooks = {}
  const transport = memoryTransport(remote, hooks)
  const opened = await openRemote(transport, { known: null, deviceId: store.deviceId, passphrase: opts.passphrase })
  let dek = opened.dek
  if (!dek && opened.meta.enc && opts.passphrase) dek = await unwrapDek(opts.passphrase, opened.meta.enc)
  const remoteId: RemoteId = { created: opened.meta.created, createdBy: opened.meta.createdBy }
  const dev = {
    name, store, media, transport, hooks, lockEvents, remoteId,
    get dek() {
      return dek
    },
    set dek(k: Buffer | null) {
      dek = k
    },
    sync: (): Promise<RoundResult> => syncRound({ store, media, transport, remote: remoteId, dek, deviceName: name })
  }
  return dev
}

/** Syncs every device in turn until a full pass changes nothing locally and writes nothing remotely. */
export async function settle(devs: Device[], remote: MemoryRemote, maxPasses = 12): Promise<number> {
  for (let pass = 1; pass <= maxPasses; pass++) {
    const before = remote.writes
    let changed = 0
    for (const d of devs) changed += (await d.sync()).changed.length
    if (remote.writes === before && changed === 0) return pass
  }
  throw new Error('devices did not settle')
}

type NoteRow = {
  id: string
  title: string
  body: string
  deleted_at: number | null
  pinned: number
  archived: number
  locked: number
  cipher: NodeJS.NonSharedUint8Array | null
  conflict_of: string | null
  created_at: number
  updated_at: number
  rev: string
}

/** Every note on a device (rev included), comparable across devices. */
export function stateOf(d: Device) {
  const rows = d.store.db.prepare('SELECT id, title, body, deleted_at, pinned, archived, locked, cipher, conflict_of, created_at, updated_at, rev FROM notes ORDER BY id').all() as NoteRow[]
  return rows.map((r) => ({
    ...r,
    cipher: r.cipher ? Buffer.from(r.cipher).toString('base64') : null,
    tags: (d.store.db.prepare('SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id WHERE nt.note_id = ? ORDER BY t.name').all(r.id) as { name: string }[]).map((t) => t.name)
  }))
}

export { MemoryRemote }
