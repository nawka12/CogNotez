// The Transport contract (docs/v5/sync-v2.md §10), shared by every transport's tests. `make()` must return a new
// instance (a "device") over the same remote each time it is called. Names are spec-valid and unique per test, so a
// remote shared across tests is fine.
import { describe, expect, it } from 'vitest'
import { mergeRev } from '../src/main/sync/format'
import type { Transport } from '../src/main/sync/transport'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const R1 = '1791860000001-0000-devaaaaaaaa'
const R2 = '1791860000002-0000-devbbbbbbbb'
const M = mergeRev([R1, R2])
/** A root revision of note `id` (ids are [A-Za-z0-9_-]{8,64}). */
const obj = (id: string, ext = 'json'): string => `objects/n.${id}.${R1}.0.${ext}`
const media = (byte: string): string => `media/m.${byte.repeat(32)}`

export interface ConformanceOptions {
  /** list(cursor) after a full listing is incremental (full: false) and reports removals. */
  incremental?: boolean
  /** Concurrent creates of one name yield exactly one 'created' (folder, memory). Drive may duplicate (§10). */
  atomicCreate?: boolean
}

export function runConformance(name: string, make: () => Transport | Promise<Transport>, opts: ConformanceOptions = {}): void {
  const ready = async (): Promise<Transport> => {
    const t = await make()
    await t.ensureRoot()
    return t
  }

  describe(`transport conformance: ${name}`, () => {
    it('ensureRoot is idempotent; an empty root lists nothing and reads null', async () => {
      const t = await make()
      await t.ensureRoot()
      await t.ensureRoot()
      await (await make()).ensureRoot()
      const r = await t.list(null)
      expect(r).toMatchObject({ full: true, added: [], removed: [] })
      expect(typeof r.cursor).toBe('string')
      expect(await t.read('meta.json')).toBeNull()
      expect(await t.read(obj('missing-note'))).toBeNull()
      expect(await t.read(media('00'))).toBeNull()
    })

    it('create is create-only: a second create says exists and keeps the original bytes', async () => {
      const [a, b] = [await ready(), await ready()]
      expect(await a.create('meta.json', enc('{"format":2}'))).toBe('created')
      expect(await a.create('meta.json', enc('other'))).toBe('exists')
      expect(await b.create('meta.json', enc('other again'))).toBe('exists')
      expect(await b.read('meta.json')).toEqual(enc('{"format":2}'))
    })

    it('a second instance sees the first one’s writes, in reads and in a full listing', async () => {
      const [a, b] = [await ready(), await ready()]
      await a.create(obj('shared-note'), enc('{"x":1}'))
      expect(await b.read(obj('shared-note'))).toEqual(enc('{"x":1}'))
      const r = await b.list(null)
      expect(r.full).toBe(true)
      expect(r.added).toContainEqual({ name: obj('shared-note'), size: 7 })
    })

    it('binary bytes round-trip exactly, including every byte value', async () => {
      const t = await ready()
      const bytes = Uint8Array.from({ length: 512 }, (_, i) => i % 256)
      expect(await t.create(`${media('ab')}.bin`, bytes)).toBe('created')
      expect(await (await ready()).read(`${media('ab')}.bin`)).toEqual(bytes)
      expect((await t.list(null)).added).toContainEqual({ name: `${media('ab')}.bin`, size: 512 })
    })

    it('names with "+" and "~" (merge revisions) work', async () => {
      const t = await ready()
      const name = `objects/n.merge-note.${M}.${R1}+${R2}.bin`
      expect(await t.create(name, enc('m'))).toBe('created')
      expect(await t.create(name, enc('n'))).toBe('exists')
      expect(await t.read(name)).toEqual(enc('m'))
      expect((await t.list(null)).added.map((e) => e.name)).toContain(name)
    })

    it('list(cursor) reports what changed since the cursor, removals included', async () => {
      const t = await ready()
      await t.create(obj('inc-old'), enc('old'))
      const first = await t.list(null)
      await t.create(obj('inc-new'), enc('new'))
      await t.remove(obj('inc-old'))
      const second = await t.list(first.cursor)
      const names = second.added.map((e) => e.name)
      expect(names).toContain(obj('inc-new'))
      expect(names).not.toContain(obj('inc-old'))
      if (opts.incremental) {
        expect(second.full).toBe(false)
        expect(names).toEqual([obj('inc-new')])
        expect(second.removed).toContain(obj('inc-old'))
        const third = await t.list(second.cursor)
        expect(third).toMatchObject({ full: false, added: [], removed: [] })
      } else {
        // A transport without an incremental mode answers every cursor with a complete listing.
        expect(second.full).toBe(true)
        expect(second.removed).toEqual([])
      }
    })

    it('remove deletes, and removing a missing file is not an error', async () => {
      const t = await ready()
      await t.create(obj('rm-note'), enc('x'))
      await t.remove(obj('rm-note'))
      expect(await t.read(obj('rm-note'))).toBeNull()
      await t.remove(obj('rm-note'))
      await t.remove(obj('never-existed'))
    })

    if (opts.atomicCreate) {
      it('concurrent creates of one name: exactly one wins and its bytes stay', async () => {
        const ts = await Promise.all([1, 2, 3, 4, 5].map(() => ready()))
        const results = await Promise.all(ts.map((t, i) => t.create(obj('race-note'), enc(`writer ${i}`))))
        expect(results.filter((r) => r === 'created')).toHaveLength(1)
        expect(await ts[0].read(obj('race-note'))).toEqual(enc(`writer ${results.indexOf('created')}`))
      })
    }
  })
}
