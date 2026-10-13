import { describe, expect, it } from 'vitest'
import { Hlc, parseRev } from '../src/main/hlc'
import { openDb } from '../src/main/store/db'
import { createStore } from '../src/main/store/notes'

const FORMAT = /^\d{13}-[0-9a-z]{4}-dev$/

describe('Hlc', () => {
  it('formats revs as ms(13)-counter(base36,4)-device', () => {
    const h = new Hlc('dev', () => 1_700_000_000_000)
    expect(h.now()).toBe('1700000000000-0000-dev')
    expect(h.now()).toBe('1700000000000-0001-dev') // same ms -> counter
    expect(parseRev('1700000000000-00zz-a-b')).toEqual({ ms: 1_700_000_000_000, counter: 35 * 36 + 35, deviceId: 'a-b' })
    expect(parseRev('nope')).toBeNull()
  })

  it('is strictly monotonic with a frozen clock', () => {
    const h = new Hlc('dev', () => 5_000_000_000_000)
    const revs = Array.from({ length: 2000 }, () => h.now())
    for (let i = 1; i < revs.length; i++) expect(revs[i]! > revs[i - 1]!).toBe(true)
    expect(revs.every((r) => FORMAT.test(r))).toBe(true)
  })

  it('stays monotonic when the wall clock goes backwards', () => {
    let t = 1_700_000_005_000
    const h = new Hlc('dev', () => t)
    const a = h.now()
    t = 1_700_000_000_000 // clock jumps back 5s
    const b = h.now()
    const c = h.now()
    t = 1_700_000_010_000 // and recovers
    const d = h.now()
    expect([a, b, c, d].every((r, i, all) => i === 0 || r > all[i - 1]!)).toBe(true)
    expect(parseRev(b)?.ms).toBe(1_700_000_005_000) // physical part never regresses
  })

  it('receive() merges a remote rev and returns something newer than both', () => {
    let t = 1_700_000_000_000
    const h = new Hlc('dev', () => t)
    const local = h.now()
    const remote = '1700000009000-0003-other'
    const merged = h.receive(remote)
    expect(merged > remote).toBe(true)
    expect(merged > local).toBe(true)
    expect(h.now() > merged).toBe(true)
    // an older remote rev doesn't move us backwards
    const after = h.receive('1600000000000-0000-other')
    expect(after > merged).toBe(true)
    // wall clock ahead of everything wins and resets the counter
    t = 1_700_000_100_000
    expect(h.receive(remote)).toBe('1700000100000-0000-dev')
    expect(() => h.receive('garbage')).toThrow()
  })

  it('rolls into the next ms instead of overflowing the 4-char counter', () => {
    const h = new Hlc('dev', () => 1_700_000_000_000)
    let prev = h.now()
    let ok = true
    for (let i = 0; i < 36 ** 4 + 5; i++) {
      const r = h.now()
      ok &&= r > prev && FORMAT.test(r)
      prev = r
    }
    expect(ok).toBe(true)
    expect(parseRev(prev)?.ms).toBeGreaterThan(1_700_000_000_000) // spilled into the next ms
  })

  it('store revs stay monotonic across a restart with an earlier clock', () => {
    const db = openDb(':memory:')
    const s1 = createStore(db, () => 1_700_000_005_000)
    const n = s1.notes.create({})
    const rev = () => (db.prepare('SELECT rev FROM notes WHERE id = ?').get(n.id) as { rev: string }).rev
    const r1 = rev()
    const s2 = createStore(db, () => 1_700_000_000_000) // clock is 5s behind
    s2.notes.save({ id: n.id, title: 'x' })
    expect(rev() > r1).toBe(true)
    expect(FORMAT.test(rev().replace(/-[a-z0-9]{8,32}$/, '-dev'))).toBe(true)
  })
})
