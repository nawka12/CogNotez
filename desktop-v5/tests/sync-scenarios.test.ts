// Multi-device scenarios over a shared in-memory remote. Each one pins a v4 data-loss case (audit §2, §3.2).
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GONE, NEEDS_PASSPHRASE, openRemote, SyncError, syncRound } from '../src/main/sync/engine'
import { createLocal } from '../src/main/sync/local'
import { revMs } from '../src/main/sync/format'
import { humanError } from '../src/main/sync/service'
import { unwrapDek } from '../src/main/sync/crypto'
import { MemoryRemote, memoryTransport } from '../src/main/sync/memory'
import { cleanupDevices, makeDevice, settle, stateOf } from './sync-harness'
import type { Device } from './sync-harness'

afterEach(cleanupDevices)

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex')

async function pair(passphrase?: string) {
  const remote = new MemoryRemote()
  const a = await makeDevice('alpha', remote, { passphrase })
  const b = await makeDevice('bravo', remote, { passphrase })
  return { remote, a, b }
}

/** A note created on `a` and synced to `b`. */
async function shared(a: Device, b: Device, remote: MemoryRemote, input = { title: 'Shared', body: 'base body', tags: ['t1'] }) {
  const n = a.store.notes.create(input)
  await settle([a, b], remote)
  expect(b.store.notes.get(n.id).body).toBe(input.body)
  return n.id
}

const bodies = (d: Device): string[] => stateOf(d).map((n) => String(n.body)).sort()
const copies = (d: Device) => stateOf(d).filter((n) => n.conflict_of !== null)
const remoteText = (r: MemoryRemote): string => [...r.files.values()].map((b) => Buffer.from(b).toString('latin1')).join('\n')

describe('sync scenarios', () => {
  it('1. an edit made during a sync round survives (C4)', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    b.store.notes.save({ id, body: 'edited on B' })
    await b.sync()

    // A's round: the upload step is done; the user types before the remote head is applied.
    a.hooks.before = (op) => {
      if (op === 'list') a.store.notes.save({ id, body: 'typed on A during sync' })
    }
    const r = await a.sync()
    a.hooks.before = undefined
    expect(r.changed).not.toContain(id)
    expect(a.store.notes.get(id).body).toBe('typed on A during sync')

    await settle([a, b], remote)
    for (const d of [a, b]) expect(bodies(d)).toEqual(['edited on B', 'typed on A during sync'])
    expect(stateOf(a)).toEqual(stateOf(b))
  })

  it('2. a download failure mid-round overwrites nothing (C2)', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    b.store.notes.save({ id, body: 'B version' })
    await b.sync()
    const before = new Map([...remote.files].map(([k, v]) => [k, Buffer.from(v).toString('base64')]))
    const local = stateOf(a)

    a.hooks.before = (op, name) => {
      if (op === 'read' && name.startsWith('objects/')) throw new Error('HTTP 503')
    }
    await expect(a.sync()).rejects.toThrow('HTTP 503')
    a.hooks.before = undefined

    expect(stateOf(a)).toEqual(local)
    for (const [k, v] of before) expect(Buffer.from(remote.files.get(k)!).toString('base64')).toBe(v)
    expect(remote.files.size).toBe(before.size)
    // And the next round recovers normally.
    await a.sync()
    expect(a.store.notes.get(id).body).toBe('B version')
  })

  it('3. concurrent offline body edits give the same conflicted copy on both devices (C3)', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    a.store.notes.save({ id, body: 'offline on A' })
    b.store.notes.save({ id, body: 'offline on B' })
    // B uploads; A uploads, merges and applies the merge in the same round; B picks it up in one more.
    await b.sync()
    await a.sync()
    await b.sync()
    expect(stateOf(a)).toEqual(stateOf(b))
    expect(await settle([a, b], remote)).toBe(1)

    const ca = copies(a)
    const cb = copies(b)
    expect(ca).toHaveLength(1)
    expect(ca).toEqual(cb)
    expect(ca[0].conflict_of).toBe(id)
    expect(String(ca[0].title)).toBe('Shared (conflicted copy)')
    expect(bodies(a)).toEqual(['offline on A', 'offline on B'])
    expect(stateOf(a)).toEqual(stateOf(b))
    expect(a.store.notes.get(String(ca[0].id)).conflictOf).toBe(id)
  })

  it('4. a remote title edit and a local tag edit merge without a copy', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    a.store.notes.save({ id, title: 'New title' })
    b.store.notes.save({ id, tags: ['t1', 'added'] })
    await settle([a, b], remote)
    for (const d of [a, b]) {
      const n = d.store.notes.get(id)
      expect(n.title).toBe('New title')
      expect(n.tags).toEqual(['added', 't1'])
      expect(copies(d)).toHaveLength(0)
    }
    expect(stateOf(a)).toEqual(stateOf(b))
  })

  it('5a. delete on A while B edits: the edit wins and the note comes back', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    a.store.notes.trash(id)
    a.store.notes.deleteForever(id)
    b.store.notes.save({ id, body: 'B kept writing' })
    await settle([a, b], remote)
    for (const d of [a, b]) {
      expect(d.store.notes.get(id).body).toBe('B kept writing')
      expect(copies(d)).toHaveLength(0)
    }
    expect(stateOf(a)).toEqual(stateOf(b))
  })

  it('5c. delete on A while B saves the same content again: the delete wins (an unchanged side)', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    a.store.notes.trash(id)
    await settle([a, b], remote)
    a.store.notes.deleteForever(id)
    b.store.notes.save({ id, body: 'base body' }) // a new rev, same canonical content
    await settle([a, b], remote)
    for (const d of [a, b]) expect(() => d.store.notes.get(id)).toThrow('note not found')
  })

  it('5d. concurrent metadata-only edits (pin on A, trash on B) merge without a copy', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    a.store.notes.save({ id, pinned: true })
    b.store.notes.trash(id)
    await settle([a, b], remote)
    for (const d of [a, b]) {
      expect(d.store.notes.get(id)).toMatchObject({ pinned: true, body: 'base body' })
      expect(d.store.notes.get(id).deletedAt).not.toBeNull()
      expect(copies(d)).toHaveLength(0)
    }
    expect(stateOf(a)).toEqual(stateOf(b))
  })

  it('5b. delete on A with no other edit: deleted everywhere', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    a.store.notes.trash(id)
    await settle([a, b], remote)
    a.store.notes.deleteForever(id)
    await settle([a, b], remote)
    for (const d of [a, b]) expect(() => d.store.notes.get(id)).toThrow('note not found')
    // And it stays deleted on later rounds.
    await settle([a, b], remote)
    expect(() => b.store.notes.get(id)).toThrow('note not found')
  })

  it('6. trash and restore sync', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote)
    a.store.notes.trash(id)
    await settle([a, b], remote)
    expect(b.store.notes.get(id).deletedAt).not.toBeNull()
    expect(b.store.notes.list({ kind: 'trash' }).map((n) => n.id)).toEqual([id])
    b.store.notes.restore(id)
    await settle([a, b], remote)
    expect(a.store.notes.get(id).deletedAt).toBeNull()
  })

  it('7. a locked note syncs as ciphertext; a remote re-key locks the local copy', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote, { title: 'Diary', body: 'zebracorn secret', tags: [] })
    await a.store.locks.setPassword(id, 'first password')
    await settle([a, b], remote)
    // The pre-lock plaintext revision stays in remote history (no GC yet); text written after locking never appears.
    await a.store.locks.unlock(id, 'first password')
    a.store.notes.save({ id, body: 'quokkaflux after lock' })
    await settle([a, b], remote)
    expect(remoteText(remote)).not.toContain('quokkaflux')

    const nb = b.store.notes.get(id)
    expect(nb.locked).toBe(true)
    expect(nb.body).toBe('')
    expect((await b.store.locks.unlock(id, 'first password')).body).toBe('quokkaflux after lock')

    await a.store.locks.setPassword(id, 'second password')
    await settle([a, b], remote)
    expect(b.lockEvents).toContainEqual([id])
    expect(b.store.notes.get(id).unlocked).toBe(false)
    await expect(b.store.locks.unlock(id, 'first password')).rejects.toThrow('wrong password')
    expect((await b.store.locks.unlock(id, 'second password')).body).toBe('quokkaflux after lock')
  })

  it('7b. a conflicted copy of a locked note can still be unlocked, and kept', async () => {
    const { remote, a, b } = await pair()
    const id = await shared(a, b, remote, { title: 'Vault', body: 'v0', tags: [] })
    await a.store.locks.setPassword(id, 'shared password')
    await settle([a, b], remote)
    await a.store.locks.unlock(id, 'shared password')
    await b.store.locks.unlock(id, 'shared password')
    a.store.notes.save({ id, body: 'secret from A' })
    b.store.notes.save({ id, body: 'secret from B' })
    await settle([a, b], remote)
    const [copy] = copies(a)
    const texts = [(await a.store.locks.unlock(id, 'shared password')).body, (await a.store.locks.unlock(String(copy.id), 'shared password')).body]
    expect(texts.sort()).toEqual(['secret from A', 'secret from B'])
    // "Keep both" re-seals the copy under its own id, so it still opens after the link is gone.
    a.store.notes.save({ id: String(copy.id), conflictOf: null })
    a.store.locks.lock(String(copy.id))
    expect(a.store.notes.get(String(copy.id)).conflictOf).toBeNull()
    expect((await a.store.locks.unlock(String(copy.id), 'shared password')).body).toMatch(/^secret from/)
    await settle([a, b], remote)
    expect(copies(b)).toHaveLength(0)
    expect((await b.store.locks.unlock(String(copy.id), 'shared password')).body).toMatch(/^secret from/)
  })

  it('8. media referenced by a note syncs, and is never deleted (C5)', async () => {
    const { remote, a, b } = await pair()
    const { hash, url } = a.media.importBytes(PNG, 'image/png')
    const n = a.store.notes.create({ title: 'Pic', body: `look ![](${url})` })
    await settle([a, b], remote)
    expect(remote.files.has(`media/m.${hash}`)).toBe(true)
    expect(existsSync(join(b.media.dir, hash))).toBe(true)
    expect(b.store.db.prepare('SELECT mime FROM media WHERE hash = ?').get(hash)).toEqual({ mime: 'image/png' })
    expect(b.store.db.prepare('SELECT hash FROM note_media WHERE note_id = ?').all(n.id)).toEqual([{ hash }])

    a.store.notes.save({ id: n.id, body: 'no picture any more' })
    a.store.notes.trash(n.id)
    a.store.notes.deleteForever(n.id)
    await settle([a, b], remote)
    expect(() => b.store.notes.get(n.id)).toThrow()
    expect(remote.files.has(`media/m.${hash}`)).toBe(true)
    expect(existsSync(join(a.media.dir, hash))).toBe(true)
    expect(existsSync(join(b.media.dir, hash))).toBe(true)
  })

  it('9. an encrypted remote: no key means no plaintext upload; after unlock it syncs', async () => {
    const remote = new MemoryRemote()
    const a = await makeDevice('alpha', remote, { passphrase: 'correct horse' })
    const n = a.store.notes.create({ title: 'Wombatique title', body: 'narwhalesque body', tags: ['ocelotic'] })
    const { url } = a.media.importBytes(PNG, 'image/png')
    a.store.notes.save({ id: n.id, body: `narwhalesque body ![](${url})` })
    await a.sync()

    const b = await makeDevice('bravo', remote) // joins without the passphrase
    b.store.notes.create({ title: 'B local', body: 'axolotlish plaintext' })
    expect(b.dek).toBeNull()
    await expect(b.sync()).rejects.toThrow(NEEDS_PASSPHRASE)
    for (const name of remote.files.keys()) expect(name === 'meta.json' || name.endsWith('.bin')).toBe(true)

    const meta = JSON.parse(Buffer.from(remote.files.get('meta.json')!).toString()) as { enc: Parameters<typeof unwrapDek>[1] }
    await expect(unwrapDek('wrong horse', meta.enc)).rejects.toThrow('wrong passphrase')
    b.dek = await unwrapDek('correct horse', meta.enc)
    await settle([a, b], remote)
    expect(b.store.notes.get(n.id).title).toBe('Wombatique title')
    expect(a.store.notes.list({ kind: 'all' }).map((x) => x.title)).toContain('B local')
    const text = remoteText(remote)
    for (const word of ['Wombatique', 'narwhalesque', 'ocelotic', 'axolotlish', 'PNG']) expect(text).not.toContain(word)
    for (const name of remote.files.keys()) expect(name === 'meta.json' || name.endsWith('.bin')).toBe(true)
  })

  it('10. meta.json vanishing after a sync is an error, never a re-bootstrap', async () => {
    const { remote, a, b } = await pair()
    await shared(a, b, remote)
    remote.files.delete('meta.json')
    a.store.notes.create({ title: 'after' })
    await expect(a.sync()).rejects.toThrow(GONE)
    await expect(openRemote(a.transport, { known: a.remoteId, deviceId: a.store.deviceId })).rejects.toThrow(GONE)
    expect(remote.files.has('meta.json')).toBe(false)
    // A replaced remote (different meta) is refused the same way.
    remote.files.set('meta.json', Buffer.from(JSON.stringify({ format: 2, created: 1, createdBy: 'someoneelse', enc: null })))
    await expect(b.sync()).rejects.toThrow(GONE)
  })

  it('11. two devices merging the same divergence write identical files; a third round writes nothing', async () => {
    const remote = new MemoryRemote()
    const [a, b, c, d] = await Promise.all(['alpha', 'bravo', 'charlie', 'delta'].map((n, i) => makeDevice(n, remote, { start: Date.UTC(2026, 9, 13) + i })))
    const id = await shared(a, b, remote)
    await settle([a, b, c, d], remote)
    a.store.notes.save({ id, body: 'A side', title: 'A title' })
    b.store.notes.save({ id, body: 'B side', tags: ['t1', 'b'] })
    // Both upload, but neither gets to merge (their rounds fail right after the upload).
    for (const x of [a, b]) {
      x.hooks.before = (op) => {
        if (op === 'list') throw new Error('offline')
      }
      await expect(x.sync()).rejects.toThrow('offline')
      x.hooks.before = undefined
    }
    // C and D see the same two heads and merge at the same time.
    const attempts: Record<string, { name: string; result: string }[]> = { charlie: [], delta: [] }
    let waiting: (() => void) | null = null
    for (const x of [c, d]) {
      let first = true
      x.hooks.before = async (op) => {
        if (op !== 'create' || !first) return
        first = false
        if (waiting) {
          waiting()
          return
        }
        await new Promise<void>((resolve) => (waiting = resolve))
      }
      x.hooks.created = (name, result) => attempts[x.name].push({ name, result })
    }
    await Promise.all([c.sync(), d.sync()])
    const names = (k: string) => attempts[k].map((x) => x.name)
    expect(names('charlie')).toEqual(names('delta'))
    expect(names('charlie').length).toBe(2) // the conflicted copy, then the merge
    expect(attempts.charlie.map((x) => x.result).concat(attempts.delta.map((x) => x.result)).sort()).toEqual(['created', 'created', 'exists', 'exists'])
    expect(stateOf(c)).toEqual(stateOf(d))

    await settle([a, b, c, d], remote)
    const writes = remote.writes
    for (const x of [a, b, c, d]) await x.sync()
    expect(remote.writes).toBe(writes)
    for (const x of [b, c, d]) expect(stateOf(x)).toEqual(stateOf(a))
  })

  it('12. a bootstrap race resolves to the single winner meta', async () => {
    const remote = new MemoryRemote()
    let release: (() => void) | null = null
    const gate = async (op: string, name: string) => {
      if (op !== 'create' || name !== 'meta.json') return
      if (release) return release()
      await new Promise<void>((r) => (release = r))
    }
    const [x, y] = [memoryTransport(remote, { before: gate }), memoryTransport(remote, { before: gate })]
    const [rx, ry] = await Promise.all([
      openRemote(x, { known: null, deviceId: 'devicexxxx', passphrase: 'passphrase x' }),
      openRemote(y, { known: null, deviceId: 'deviceyyyy', passphrase: 'passphrase y' })
    ])
    expect([rx.created, ry.created].sort()).toEqual([false, true])
    expect(rx.meta).toEqual(ry.meta)
    const loser = rx.created ? ry : rx
    expect(loser.dek).toBeNull() // must unlock with the winner's passphrase
    expect([...remote.files.keys()]).toEqual(['meta.json'])
  })

  it('13. both devices join a fresh remote holding the same notes: unknown base, identical content needs no copy', async () => {
    const { remote, a, b } = await pair()
    const same = await shared(a, b, remote)
    const differs = a.store.notes.create({ title: 'Diverges', body: 'v1' }).id
    await settle([a, b], remote)
    a.store.notes.save({ id: differs, body: 'A only' }) // never uploaded to the old remote

    const fresh = new MemoryRemote()
    const join = async (d: Device) => {
      const t = memoryTransport(fresh)
      const { meta } = await openRemote(t, { known: null, deviceId: d.store.deviceId })
      createLocal(d.store).resetForNewRemote()
      const remoteId = { created: meta.created, createdBy: meta.createdBy }
      return () => syncRound({ store: d.store, media: d.media, transport: t, remote: remoteId, dek: null, deviceName: d.name })
    }
    const [sa, sb] = [await join(a), await join(b)]
    for (let i = 0; i < 4; i++) {
      await sa()
      await sb()
    }
    expect(stateOf(a)).toEqual(stateOf(b))
    expect(a.store.notes.get(same).body).toBe('base body')
    const c = copies(a)
    expect(c.map((n) => n.conflict_of)).toEqual([differs]) // two root revisions of one note, different bodies
    expect(bodies(a).filter((x) => x === 'A only' || x === 'v1').sort()).toEqual(['A only', 'v1'])
  })

  it('14. a duplicate-name race on a non-atomic remote: every device applies the file readers see', async () => {
    const remote = new MemoryRemote()
    remote.atomicCreate = false // Drive: check-then-upload, so two creators can both get 'created'
    const a = await makeDevice('alpha', remote)
    const b = await makeDevice('bravo', remote, { start: Date.UTC(2026, 9, 13) + 1 })
    const d = await makeDevice('delta', remote, { start: Date.UTC(2026, 9, 13) + 2 })
    const id = await shared(a, b, remote)
    await settle([a, b, d], remote)
    const old = new Set(remote.files.keys())
    a.store.notes.save({ id, body: 'A body' })
    b.store.notes.save({ id, pinned: true })
    for (const x of [a, b]) {
      x.hooks.before = (op) => {
        if (op === 'list') throw new Error('offline')
      }
      await expect(x.sync()).rejects.toThrow('offline')
      x.hooks.before = undefined
    }

    // C joins while the old revisions aren't listed yet, so it merges A's and B's heads with an unknown base (a copy,
    // different content); D sees the base and merges without one. D's file lands first; C's create is a duplicate.
    const c = await makeDevice('charlie', remote, { start: Date.UTC(2026, 9, 13) + 3 })
    const list = c.transport.list.bind(c.transport)
    c.transport.list = async (cursor) => {
      const r = await list(cursor)
      return { ...r, added: r.added.filter((e) => !old.has(e.name)) }
    }
    // And Drive search lag: C's first read of a file it just created finds nothing.
    const mine = new Set<string>()
    const lagged = new Set<string>()
    c.hooks.created = (name) => void mine.add(name)
    const read = c.transport.read.bind(c.transport)
    c.transport.read = async (name) => (mine.has(name) && !lagged.has(name) && lagged.add(name) ? null : read(name))
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    c.hooks.before = async (op) => {
      if (op === 'create') await gate
    }
    const cRound = c.sync()
    await d.sync()
    release()
    await cRound
    c.hooks.before = undefined
    c.transport.list = list

    expect(remote.duplicates).toBeGreaterThan(0)
    expect(lagged.size).toBeGreaterThan(0)
    expect(() => c.store.notes.get(id)).toThrow('note not found') // the read-back found nothing: skipped, not guessed
    await c.sync()
    expect(c.store.notes.get(id)).toMatchObject({ body: 'A body', pinned: true }) // D's file, not C's own merge
    expect(stateOf(c).find((n) => n.id === id)).toEqual(stateOf(d).find((n) => n.id === id))

    await settle([a, b, c, d], remote)
    for (const x of [b, c, d]) expect(stateOf(x)).toEqual(stateOf(a))
    expect(bodies(a)).toContain('A body')
  })

  it('15. a device whose clock is years ahead: other clocks stay near their wall clock, and nothing is lost', async () => {
    const remote = new MemoryRemote()
    const a = await makeDevice('alpha', remote)
    const x = await makeDevice('future', remote, { start: Date.UTC(2036, 0, 1) })
    const id = await shared(a, x, remote)
    x.store.notes.save({ id, body: 'from the future' })
    a.store.notes.save({ id, body: 'from now' })
    await settle([a, x], remote)
    expect(bodies(a)).toEqual(['from now', 'from the future'])
    expect(stateOf(a)).toEqual(stateOf(x))
    // A's new revs sort below X's, which is fine; A's clock was not dragged ten years ahead.
    const n = a.store.notes.create({ title: 'after' })
    const rev = (d: Device, nid: string): string => (d.store.db.prepare('SELECT rev FROM notes WHERE id = ?').get(nid) as { rev: string }).rev
    expect(revMs(rev(a, n.id))).toBeLessThan(Date.UTC(2026, 9, 15))
    a.store.notes.save({ id, body: 'edited after the merge' })
    await settle([a, x], remote)
    expect(x.store.notes.get(id).body).toBe('edited after the merge') // a later edit still wins, whatever its rev
    expect(stateOf(a)).toEqual(stateOf(x))
  })

  it('humanError passes transport messages through and prefixes unexpected ones', () => {
    expect(humanError(new SyncError('Google sign-in expired. Reconnect in Settings.'))).toBe('Google sign-in expired. Reconnect in Settings.')
    expect(humanError(Object.assign(new Error('x'), { code: 'ENOSPC' }))).toBe('The sync location is out of space.')
    expect(humanError(new Error('boom'))).toBe('Sync failed: boom')
  })
})
