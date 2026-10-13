// Engine progress (onProgress) is purely observational: phases in order, counts bounded, results unchanged.
import { afterEach, describe, expect, it } from 'vitest'
import { syncRound } from '../src/main/sync/engine'
import { MemoryRemote } from '../src/main/sync/memory'
import { cleanupDevices, makeDevice, settle, stateOf } from './sync-harness'
import type { Device } from './sync-harness'

afterEach(cleanupDevices)

type Ev = [string, number, number]
const run = async (d: Device, events?: Ev[]) =>
  syncRound({ store: d.store, media: d.media, transport: d.transport, remote: d.remoteId, dek: d.dek, deviceName: d.name, onProgress: events && ((p, done, total) => events.push([p, done, total])) })

/** a and b hold note X; both edit it, a also creates 3 notes and deletes one, b has an unsynced note. */
async function world() {
  const remote = new MemoryRemote()
  const a = await makeDevice('alpha', remote)
  const b = await makeDevice('bravo', remote)
  const x = a.store.notes.create({ title: 'X', body: 'one\ntwo\nthree' })
  await settle([a, b], remote)
  a.store.notes.save({ id: x.id, body: 'A\ntwo\nthree' })
  b.store.notes.save({ id: x.id, body: 'one\ntwo\nB' })
  for (const t of ['n1', 'n2', 'n3']) a.store.notes.create({ title: t, body: t })
  b.store.notes.create({ title: 'b-only', body: 'b' })
  await run(a)
  return { remote, a, b }
}

describe('sync progress', () => {
  it('reports every phase in order, never past the total, and finishes each known total', async () => {
    const { b } = await world()
    const ev: Ev[] = []
    await run(b, ev)
    const order = ['upload', 'list', 'merge', 'apply']
    const phases = [...new Set(ev.map((e) => e[0]))]
    expect(phases).toEqual(order)
    expect(ev.map((e) => order.indexOf(e[0]))).toEqual([...ev.map((e) => order.indexOf(e[0]))].sort())
    for (const [, done, total] of ev) if (total > 0) expect(done).toBeLessThanOrEqual(total)
    for (const p of ['upload', 'merge', 'apply']) {
      const mine = ev.filter((e) => e[0] === p)
      expect(mine[0]![1]).toBe(0)
      expect(mine.at(-1)![1]).toBe(mine.at(-1)![2])
      expect(mine.at(-1)![2]).toBeGreaterThan(0)
      expect(mine.map((e) => e[1])).toEqual([...mine.map((e) => e[1])].sort((x, y) => x - y)) // done never goes back
    }
    expect(ev.filter((e) => e[0] === 'upload').at(-1)).toEqual(['upload', 2, 2]) // X and b-only
    expect(ev.filter((e) => e[0] === 'merge').at(-1)).toEqual(['merge', 1, 1])
    const listed = ev.filter((e) => e[0] === 'list')
    expect(listed[0]).toEqual(['list', 0, 0])
    expect(listed.at(-1)![1]).toBeGreaterThan(0)
  })

  it('does not change what is uploaded, merged or applied', async () => {
    const plain = await world()
    const watched = await world()
    const r1 = await run(plain.b)
    const r2 = await run(watched.b, [])
    expect([r2.written, r2.changed.length, r2.warnings]).toEqual([r1.written, r1.changed.length, r1.warnings])
    expect(plain.remote.files.size).toBe(watched.remote.files.size)
    const view = (d: Device) => stateOf(d).map((n) => [n.title, n.body, n.conflict_of === null]).sort()
    expect(view(watched.b)).toEqual(view(plain.b))
  })

  it('stays quiet when there is nothing to do', async () => {
    const remote = new MemoryRemote()
    const a = await makeDevice('alpha', remote)
    const ev: Ev[] = []
    await run(a, ev)
    expect(new Set(ev.map((e) => e[0]))).toEqual(new Set(['list'])) // no upload, merge or apply events
  })
})
