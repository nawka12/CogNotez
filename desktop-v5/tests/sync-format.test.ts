import { describe, expect, it } from 'vitest'
import {
  canonical, contentHash, copyId, mediaName, mergeRev, objectName, parseMediaName, parseObject, parseObjectName, REV_RE, serialize
} from '../src/main/sync/format'
import { Hlc } from '../src/main/hlc'
import type { NoteRev } from '../src/main/sync/format'
import { DEV_A, DEV_B, NOTE, note, rev, tomb } from './sync-objects'

const R1 = rev(1)
const R2 = rev(2, DEV_B)
const M = mergeRev([R1, R2])

describe('sync names', () => {
  it('round-trips object and media names', () => {
    for (const [r, parents] of [[R1, []], [R2, [R1]], [M, [R1, R2]], [mergeRev([M, R1]), [R1, M]]] as const) {
      for (const enc of [false, true]) {
        const name = objectName(NOTE, r, parents, enc)
        expect(parseObjectName(name)).toEqual({ name, id: NOTE, rev: r, parents: [...parents].sort(), encrypted: enc })
      }
    }
    expect(objectName(NOTE, R1, [], false)).toBe(`objects/n.${NOTE}.${R1}.0.json`)
    expect(objectName(NOTE, M, [R2, R1], true)).toBe(`objects/n.${NOTE}.${M}.${R1}+${R2}.bin`)
    const h = 'ab'.repeat(32)
    expect(parseMediaName(mediaName(h, false))).toEqual({ key: h, encrypted: false })
    expect(parseMediaName(mediaName(h, true))).toEqual({ key: h, encrypted: true })
  })

  it('rejects malformed names', () => {
    const ok = `objects/n.${NOTE}.${R2}.${R1}.json`
    expect(parseObjectName(ok)).not.toBeNull()
    for (const bad of [
      ok.replace('objects/', 'media/'), ok.replace('.json', '.txt'), ok + '.tmp', `.syncthing.${ok}`, ok.replace('n.', 'note.'),
      `objects/n.short.${R2}.${R1}.json`, // id too short
      `objects/n.${NOTE}.${R2.toUpperCase()}.${R1}.json`,
      `objects/n.${NOTE}.${R2}.${R1}+${R1}.json`, // duplicate parents
      `objects/n.${NOTE}.${R2}.${R2}+${R1}.json`, // unsorted
      `objects/n.${NOTE}.${M}.${R1}+${R2}+${rev(3)}.json`, // three parents
      `objects/n.${NOTE}.${R1}.${R1}.json`, // own parent
      `objects/n.${NOTE}.${R1.replace(DEV_A, 'dev')}.0.json`, // device id too short
      `objects/n.${NOTE}.${R1}~12345678~abcdef01.0.json`, // nested merge rev
      `objects/n.${NOTE}.${R1}.0.sync-conflict-20261013.json`,
      `objects/n.${NOTE} (conflicted copy).${R1}.0.json`,
      `objects/../n.${NOTE}.${R1}.0.json`, '', 'meta.json'
    ]) expect(parseObjectName(bad), bad).toBeNull()
    for (const bad of ['media/m.' + 'AB'.repeat(32), 'media/m.' + 'ab'.repeat(31), 'media/m.' + 'ab'.repeat(32) + '.json', 'objects/m.' + 'ab'.repeat(32)]) {
      expect(parseMediaName(bad), bad).toBeNull()
    }
  })

  it('a merge rev sorts after all of its parents, never nests, and is a function of the parent set', () => {
    // Device ids that are prefixes of each other ("~" is 0x7E, above every id character), counters near the carry,
    // and parents that are themselves merges, chained a few levels deep.
    const devs = [DEV_A, `${DEV_A}0`, `${DEV_A}zz`, DEV_B, 'z'.repeat(32), '00000000']
    let x = 12345
    const rnd = (n: number): number => (x = (Math.imul(x, 1103515245) + 12345) >>> 0) % n
    const pool = [R1, R2]
    for (let i = 0; i < 400; i++) {
      const fresh = rev(rnd(3), devs[rnd(devs.length)], [0, 1, 1294, 1295, 36 ** 4 - 2, 36 ** 4 - 1][rnd(6)])
      const ps = [...new Set([pool[rnd(pool.length)], rnd(2) ? fresh : pool[rnd(pool.length)]])]
      if (ps.length < 2) continue
      const m = mergeRev(ps)
      expect(REV_RE.test(m), m).toBe(true)
      expect(m.split('~')).toHaveLength(2)
      for (const p of ps) expect(m > p, `${m} > ${p}`).toBe(true)
      expect(mergeRev([...ps].reverse())).toBe(m)
      // Every device's next local rev after reading the merge rev sorts after it (HLC receive parses ms-counter).
      expect(new Hlc('devcccccccc', () => 0).receive(m) > m).toBe(true)
      pool.push(m, fresh)
    }
    expect(M.startsWith(`${R2}~`)).toBe(true)
    expect(mergeRev([R1, R2, rev(3)]).slice(-8)).not.toBe(M.slice(-8)) // the hash covers the whole parent set
  })

  it('a merge over a merge prefixes the HLC successor of its edit part, carrying zzzz into the next ms', () => {
    const top = `1791860000000-zzzz-${DEV_A}`
    const low = rev(0, DEV_B, 5) // 1791860000000-0005-devbbbbbbbb, below top
    const m1 = mergeRev([low, top])
    expect(m1.startsWith(`${top}~`)).toBe(true)
    const m2 = mergeRev([m1, low])
    expect(m2.startsWith(`1791860000001-0000-${DEV_A}~`)).toBe(true) // the carry path of bump()
    expect(m2 > m1).toBe(true)
    expect(mergeRev([mergeRev([R1, R2]), R1]).startsWith(`${rev(2, DEV_B, 1)}~`)).toBe(true) // the plain counter + 1
    expect(copyId(NOTE, R1)).toMatch(/^c[0-9a-f]{31}$/)
  })

  it('edit revs stay below 9e12 ms; a merge rev prefix may carry to it and is still valid', () => {
    const atMax = `8999999999999-zzzz-${DEV_A}`
    const low = `8999999999999-0001-${DEV_B}`
    expect(REV_RE.test(atMax)).toBe(true)
    expect(REV_RE.test(`9000000000000-0000-${DEV_A}`)).toBe(false)
    expect(parseObjectName(`objects/n.${NOTE}.9000000000000-0000-${DEV_A}.0.json`)).toBeNull()
    const m = mergeRev([mergeRev([low, atMax]), low]) // bump(atMax) carries into 9000000000000
    expect(m.startsWith(`9000000000000-0000-${DEV_A}~`)).toBe(true)
    expect(parseObjectName(objectName(NOTE, m, [mergeRev([low, atMax]), low], false))).not.toBeNull()
  })

  it('keeps names under 255 bytes at the maximum sizes', () => {
    const long = (ms: number, c: number) => `${1791860000000 + ms}-${c.toString(36).padStart(4, '0')}-${'z'.repeat(32)}`
    const a = mergeRev([long(1, 0), long(2, 0)])
    const b = mergeRev([long(3, 0), a])
    const name = objectName('x'.repeat(64), mergeRev([a, b]), [a, b], false)
    expect(name.length - 'objects/'.length).toBeLessThanOrEqual(255)
  })
})

describe('sync objects', () => {
  const valid = note(R2, [R1], { tags: ['a', 'b/c'], media: ['ab'.repeat(32)] })
  const parse = (o: unknown, name = objectName(NOTE, R2, [R1], false)) => parseObject(Buffer.from(JSON.stringify(o)), parseObjectName(name)!)

  it('round-trips valid notes and tombstones', () => {
    expect(parseObject(serialize(valid), parseObjectName(objectName(NOTE, R2, [R1], false))!)).toEqual(valid)
    const t = tomb(R2, [R1])
    expect(parse(t)).toEqual(t)
    const locked = note(R2, [R1], { locked: true, body: '', cipher: Buffer.from('{"v":5}').toString('base64'), cipherFormat: 'v5' })
    expect(parse(locked)).toEqual(locked)
  })

  it('rejects objects that do not match their name or the field rules', () => {
    const cases: Record<string, Partial<NoteRev> | Record<string, unknown>> = {
      wrongId: { id: 'other-note-id' },
      wrongRev: { rev: R1 },
      wrongParents: { parents: [] },
      version: { v: 3 },
      device: { device: 'BAD' },
      lockedBody: { locked: true, body: 'plain', cipher: 'AAAA', cipherFormat: 'v5' },
      cipherNoLock: { cipher: 'AAAA' },
      format: { locked: true, body: '', cipher: 'AAAA', cipherFormat: 'v9' },
      tagSlash: { tags: ['/x'] },
      tagDup: { tags: ['A', 'a'] },
      tagUntrimmed: { tags: [' a'] },
      tooManyTags: { tags: Array.from({ length: 51 }, (_, i) => `t${i}`) },
      title: { title: 'x'.repeat(1001) },
      media: { media: ['nothex'] },
      conflictOf: { conflictOf: 'bad id!' },
      createdAt: { createdAt: -1 },
      pinned: { pinned: 'yes' }
    }
    for (const [k, patch] of Object.entries(cases)) expect(() => parse({ ...valid, ...patch }), k).toThrow()
    expect(() => parseObject(Buffer.from('not json'), parseObjectName(objectName(NOTE, R2, [R1], false))!)).toThrow()
  })

  it('canonical content is stable, sorted, and ignores rev/parents/device/deviceName/updatedAt', () => {
    const a = note(R2, [R1])
    const b = { ...note(rev(9, DEV_B), []), id: NOTE, updatedAt: 1 }
    expect(canonical(a)).toBe(canonical(b))
    expect(contentHash(a)).toBe(contentHash(b))
    expect(canonical(a)).toBe(
      '{"archived":false,"body":"Body","cipher":null,"cipherFormat":null,"conflictOf":null,"createdAt":1791860000000,"deleted":false,"id":"note-0000-aaaa","locked":false,"media":[],"pinned":false,"tags":["a"],"title":"Title","trashedAt":null,"v":2}'
    )
    expect(contentHash({ ...a, title: 'Other' })).not.toBe(contentHash(a))
  })
})
