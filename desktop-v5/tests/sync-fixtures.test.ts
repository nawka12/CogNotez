// Cross-implementation vectors (docs/v5/sync-v2.md §11). Every vector is re-derived from the code and compared with
// the checked-in JSON in docs/v5/sync-v2-fixtures/. Each merge case also states its expected outcome by hand, so a
// regenerated fixture can't silently encode a bug. Regenerate: UPDATE_SYNC_FIXTURES=1 npx vitest run tests/sync-fixtures
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decryptBlob, deriveKek, encryptBlob, mediaKey, newEnc, parseMeta, serializeMeta, unwrapDek } from '../src/main/sync/crypto'
import type { Meta } from '../src/main/sync/crypto'
import {
  aadOf, copyId, mediaName, mergeRev, objectName, parseMediaName, parseObject, parseObjectName, serialize, sha256hex, sortedJson
} from '../src/main/sync/format'
import type { NoteRev, RevObject } from '../src/main/sync/format'
import { buildGraphs } from '../src/main/sync/graph'
import { foldHeads, mergePair } from '../src/main/sync/merge'
import { DEV_A, DEV_B, NOTE, note, rev, tomb } from './sync-objects'

const DIR = join(__dirname, '../../docs/v5/sync-v2-fixtures')
const UPDATE = process.env['UPDATE_SYNC_FIXTURES'] === '1'

function matches(file: string, value: unknown): void {
  const text = `${JSON.stringify(value, null, 2)}\n`
  const path = join(DIR, file)
  if (UPDATE) writeFileSync(path, text)
  expect(existsSync(path), `${file} is missing; run with UPDATE_SYNC_FIXTURES=1`).toBe(true)
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(text))
}

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex')
const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64')
/** Deterministic "random" bytes: each call returns the next buffer given. */
const fixed = (...bufs: string[]) => {
  const q = bufs.map((h) => Buffer.from(h, 'hex'))
  return (n: number): Buffer => {
    const b = q.shift()
    if (!b || b.length !== n) throw new Error(`fixture rand: wanted ${n} bytes`)
    return b
  }
}

// ---- crypto.json -----------------------------------------------------------------------------

describe('crypto.json', () => {
  it('KEK derivation, DEK unwrap, object and media encryption', async () => {
    const SALT = '000102030405060708090a0b0c0d0e0f'
    const WRAP_IV = 'a0a1a2a3a4a5a6a7a8a9aaab'
    const DEK = '1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100'
    const OBJ_IV = 'b0b1b2b3b4b5b6b7b8b9babb'
    const MEDIA_IV = 'c0c1c2c3c4c5c6c7c8c9cacb'
    const passphrase = 'correct horse battery staple'

    const kek = async (p: string, iter: number) => hex(await deriveKek(p, Buffer.from(SALT, 'hex'), iter))
    const kdf = [
      { passphrase, salt: SALT, iter: 100_000, iterUsed: 100_000, kek: await kek(passphrase, 100_000) },
      // Non-ASCII passphrases are UTF-8 encoded; an iteration count below the clamp is raised to 100 000.
      { passphrase: 'pässwörd 🔑 ключ', salt: SALT, iter: 1, iterUsed: 100_000, kek: await kek('pässwörd 🔑 ключ', 1) }
    ]
    expect(kdf[0].kek).toBe(await kek(passphrase, 99_999)) // clamp

    const { enc, dek } = await newEnc(passphrase, fixed(SALT, WRAP_IV, DEK), 100_000)
    expect(hex(dek)).toBe(DEK)
    const meta: Meta = { format: 2, created: 1791860000000, createdBy: DEV_A, enc }
    expect(parseMeta(serializeMeta(meta))).toEqual(meta)
    expect(hex(await unwrapDek(passphrase, enc))).toBe(DEK)
    await expect(unwrapDek('wrong horse battery staple', enc)).rejects.toThrow('wrong passphrase')

    const o = note(rev(2, DEV_B), [rev(1)], { title: 'Grüße', body: 'line 1\nline 2 "quoted" \\ tab\t✓', tags: ['a', 'b/c'] })
    const objName = objectName(o.id, o.rev, o.parents, true)
    const plain = serialize(o)
    const objBlob = encryptBlob(dek, aadOf(objName), plain, fixed(OBJ_IV))
    expect(decryptBlob(dek, aadOf(objName), objBlob)).toEqual(Buffer.from(plain))
    expect(() => decryptBlob(dek, aadOf(objName.replace(o.rev, rev(3))), objBlob)).toThrow() // AAD binds the name

    const mediaBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
    const sha = sha256hex(mediaBytes)
    const key = mediaKey(dek, sha)
    const encMediaName = mediaName(key, true)
    const mediaBlob = encryptBlob(dek, aadOf(encMediaName), mediaBytes, fixed(MEDIA_IV))

    matches('crypto.json', {
      kdf,
      meta: { passphrase, wrongPassphrase: 'wrong horse battery staple', json: sortedJson(meta), dek: DEK, wrapAad: 'cognotez-sync-v2-dek' },
      object: { dek: DEK, name: objName, aad: aadOf(objName), iv: OBJ_IV, plaintext: Buffer.from(plain).toString('utf8'), blob: b64(objBlob) },
      media: { dek: DEK, plaintext: hex(mediaBytes), sha256: sha, hmacInput: `media:${sha}`, name: encMediaName, aad: aadOf(encMediaName), iv: MEDIA_IV, blob: b64(mediaBlob), plaintextName: mediaName(sha, false) }
    })
  })
})

// ---- names.json ------------------------------------------------------------------------------

describe('names.json', () => {
  it('valid and invalid names, merge revs and conflicted copy ids', () => {
    const R1 = rev(1)
    const R2 = rev(2, DEV_B)
    const M = mergeRev([R1, R2])
    const M2 = mergeRev([M, rev(1, DEV_B)])
    const carry = mergeRev([mergeRev([rev(0, DEV_B, 5), `1791860000000-zzzz-${DEV_A}`]), rev(0, DEV_B, 5)])
    const objects = [
      objectName(NOTE, R1, [], false), objectName(NOTE, R2, [R1], false), objectName(NOTE, M, [R1, R2], false),
      objectName(NOTE, M2, [M, rev(1, DEV_B)], true), objectName('x'.repeat(64), R1, [], true), objectName('Ab_-0123', R2, [M], false),
      objectName(NOTE, `9000000000000-0000-${DEV_A}~0123abcd`, [`8999999999999-0001-${DEV_B}`], false) // a merge prefix may carry past
    ]
    const media = [mediaName('ab'.repeat(32), false), mediaName('0f'.repeat(32), true)]
    const invalid: Record<string, string> = {
      [objects[1].replace('objects/', 'media/')]: 'wrong folder',
      [objects[1].replace('.json', '.txt')]: 'unknown extension',
      [`${objects[1]}.tmp`]: 'trailing suffix',
      [objects[1].replace('objects/', 'objects/.syncthing.')]: 'sync-tool temp file',
      [`objects/n.short.${R2}.${R1}.json`]: 'note id under 8 characters',
      [`objects/n.${'x'.repeat(65)}.${R1}.0.json`]: 'note id over 64 characters',
      [`objects/n.${NOTE}.${R2.toUpperCase()}.${R1}.json`]: 'upper-case rev',
      [`objects/n.${NOTE}.${R2}.${R1}+${R1}.json`]: 'duplicate parents',
      [`objects/n.${NOTE}.${M}.${R2}+${R1}.json`]: 'parents not sorted',
      [`objects/n.${NOTE}.${M}.${R1}+${R2}+${rev(3)}.json`]: 'three parents',
      [`objects/n.${NOTE}.${R1}.${R1}.json`]: 'own parent',
      [`objects/n.${NOTE}.${R1.replace(DEV_A, 'dev')}.0.json`]: 'device id under 8 characters',
      [`objects/n.${NOTE}.${R1.replace(DEV_A, 'z'.repeat(33))}.0.json`]: 'device id over 32 characters',
      [`objects/n.${NOTE}.${R1}~12345678~abcdef01.0.json`]: 'nested merge rev',
      [`objects/n.${NOTE}.9000000000000-0000-${DEV_A}.0.json`]: 'edit rev ms not below 9000000000000',
      [`objects/n.${NOTE}.${R1}~1234567.0.json`]: 'merge hash not 8 hex',
      [`objects/n.${NOTE}.${R1}.0.sync-conflict-20261013.json`]: 'Syncthing conflict file',
      [`objects/n.${NOTE} (conflicted copy).${R1}.0.json`]: 'Dropbox conflict file',
      [`objects/../n.${NOTE}.${R1}.0.json`]: 'path traversal',
      [`media/m.${'AB'.repeat(32)}`]: 'upper-case media hash',
      [`media/m.${'ab'.repeat(31)}`]: 'media hash too short',
      [`media/m.${'ab'.repeat(32)}.json`]: 'media with .json',
      [`objects/m.${'ab'.repeat(32)}`]: 'media in objects/',
      'meta.json': 'not an object or media name (meta.json is read by name only)',
      '': 'empty'
    }
    for (const [n, why] of Object.entries(invalid)) expect(parseObjectName(n) ?? parseMediaName(n), why).toBeNull()
    expect(carry.startsWith(`1791860000001-0000-${DEV_A}~`)).toBe(true)

    const mergeRevs = [[R1, R2], [R2, R1], [M, rev(1, DEV_B)], [rev(0, DEV_B, 5), `1791860000000-zzzz-${DEV_A}`],
      [mergeRev([rev(0, DEV_B, 5), `1791860000000-zzzz-${DEV_A}`]), rev(0, DEV_B, 5)], [rev(1, DEV_A), rev(1, `${DEV_A}0`)],
      [mergeRev([rev(1, DEV_A), rev(1, `${DEV_A}0`)]), rev(1, `${DEV_A}0`)],
      [mergeRev([`8999999999999-0001-${DEV_B}`, `8999999999999-zzzz-${DEV_A}`]), `8999999999999-0001-${DEV_B}`]]
    matches('names.json', {
      valid: {
        objects: objects.map((name) => {
          const p = parseObjectName(name)!
          return { name, id: p.id, rev: p.rev, parents: p.parents, encrypted: p.encrypted }
        }),
        media: media.map((name) => ({ name, ...parseMediaName(name)! }))
      },
      invalid: Object.entries(invalid).map(([name, why]) => ({ name, why })),
      mergeRevs: mergeRevs.map((parents) => ({ parents, hashInput: [...parents].sort().join('+'), rev: mergeRev(parents) })),
      copyIds: [R1, M].map((losingRev) => ({ noteId: NOTE, losingRev, input: `${NOTE}:${losingRev}`, id: copyId(NOTE, losingRev) }))
    })
  })
})

// ---- merge-*.json ----------------------------------------------------------------------------

const DEV_C = 'devcccccccc'
/** A graph file: a valid object, or raw text that fails validation (an unreadable object). */
type Entry = { object: RevObject } | { name: string; raw: string }
interface Case {
  name: string
  rule: string
  graph: Entry[]
  check: (head: RevObject, writes: RevObject[]) => void
}

const R0 = rev(1)
const base = note(R0, [])
const A = (fields: Partial<NoteRev>, parents = [R0], ms = 2) => note(rev(ms, DEV_A), parents, fields)
const B = (fields: Partial<NoteRev>, parents = [R0], ms = 3) => note(rev(ms, DEV_B), parents, fields)
const live = (o: RevObject): NoteRev => {
  if (o.deleted) throw new Error('expected a note, got a tombstone')
  return o
}
const noCopy = (writes: RevObject[]): void => expect(writes.filter((w) => !w.deleted && w.conflictOf)).toEqual([])
const copies = (writes: RevObject[]): NoteRev[] => writes.filter((w): w is NoteRev => !w.deleted && w.conflictOf !== null && w.parents.length === 0)

const GROUPS: Record<string, Case[]> = {
  scalars: [
    {
      name: 'title changed on the lower-rev side only', rule: '§8 scalar: take the side that changed it',
      graph: [{ object: base }, { object: A({ title: 'From A' }) }, { object: B({ pinned: true }) }],
      check: (h, w) => {
        expect(live(h)).toMatchObject({ title: 'From A', pinned: true, body: 'Body', device: 'merge', deviceName: 'merge' })
        noCopy(w)
      }
    },
    {
      name: 'title changed on both sides', rule: '§8 scalar: both changed, values differ: take b (greater rev)',
      graph: [{ object: base }, { object: A({ title: 'A title' }) }, { object: B({ title: 'B title' }) }],
      check: (h, w) => {
        expect(live(h).title).toBe('B title')
        noCopy(w)
      }
    },
    {
      name: 'trashed on one side, archived on the other', rule: '§8 scalar: trashedAt and archived merge independently',
      graph: [{ object: base }, { object: A({ trashedAt: 1791860000500 }) }, { object: B({ archived: true }) }],
      check: (h) => expect(live(h)).toMatchObject({ trashedAt: 1791860000500, archived: true })
    },
    {
      name: '"Keep both" on a conflicted copy while the other side edits it', rule: '§8 scalar: conflictOf',
      graph: [
        { object: note(R0, [], { conflictOf: 'note-orig-0001' }) }, { object: A({ conflictOf: null }, [R0]) },
        { object: B({ conflictOf: 'note-orig-0001', title: 'renamed' }) }
      ],
      check: (h) => expect(live(h)).toMatchObject({ conflictOf: null, title: 'renamed' })
    },
    {
      name: 'createdAt is the minimum, updatedAt the maximum', rule: '§8 createdAt/updatedAt',
      graph: [{ object: base }, { object: A({ createdAt: 1791850000000, updatedAt: 1791860009000 }) }, { object: B({ pinned: true, updatedAt: 1791860001000 }) }],
      check: (h) => expect(live(h)).toMatchObject({ createdAt: 1791850000000, updatedAt: 1791860009000 })
    }
  ],
  tags: [
    {
      name: 'one side adds, the other removes', rule: '§8 tags: (added on either side) ∪ (base tags kept by both)',
      graph: [{ object: note(R0, [], { tags: ['a', 'keep'] }) }, { object: A({ tags: ['a', 'keep', 'x'] }) }, { object: B({ tags: ['keep'] }) }],
      check: (h) => expect(live(h).tags).toEqual(['keep', 'x'])
    },
    {
      name: 'both add the same tag in different case', rule: '§8 tags: sorted, case-insensitive duplicates dropped (first wins)',
      graph: [{ object: base }, { object: A({ tags: ['a', 'Work'] }) }, { object: B({ tags: ['a', 'work', 'Zeta', 'b/c'] }) }],
      check: (h) => expect(live(h).tags).toEqual(['Work', 'Zeta', 'a', 'b/c'])
    },
    {
      name: 'unknown base: the union', rule: '§8 tags: unknown base',
      graph: [{ object: A({ tags: ['a', 'only-a'] }, []) }, { object: B({ tags: ['b'] }, []) }],
      check: (h) => expect(live(h).tags).toEqual(['a', 'b', 'only-a'])
    }
  ],
  content: [
    {
      name: 'body changed on one side, title on the other', rule: '§8 content: only one side changed: take it; no copy',
      graph: [{ object: base }, { object: A({ body: 'A body', media: ['aa'.repeat(32)] }) }, { object: B({ title: 'B title' }) }],
      check: (h, w) => {
        expect(live(h)).toMatchObject({ body: 'A body', title: 'B title', media: ['aa'.repeat(32)] })
        noCopy(w)
      }
    },
    {
      name: 'both changed the body', rule: '§8 content: conflict: b keeps its content, a goes to a conflicted copy (copy written first)',
      graph: [{ object: base }, { object: A({ body: 'A body', tags: ['a', 'from-a'], media: ['aa'.repeat(32)], pinned: true }) }, { object: B({ body: 'B body' }) }],
      check: (h, w) => {
        expect(live(h)).toMatchObject({ body: 'B body', tags: ['a', 'from-a'], media: [], pinned: true })
        const [c] = copies(w)
        expect(w[0]).toBe(c)
        expect(c).toMatchObject({
          id: copyId(NOTE, rev(2, DEV_A)), rev: rev(2, DEV_A), parents: [], device: DEV_A, title: 'Title (conflicted copy)', body: 'A body',
          tags: ['a', 'from-a'], media: ['aa'.repeat(32)], pinned: false, conflictOf: NOTE, createdAt: c.updatedAt
        })
      }
    },
    {
      name: 'both made the same body change', rule: '§8 content: equal on both sides: keep it; media is the union',
      graph: [{ object: base }, { object: A({ body: 'same', media: ['aa'.repeat(32)] }) }, { object: B({ body: 'same', media: ['bb'.repeat(32)] }) }],
      check: (h, w) => {
        expect(live(h)).toMatchObject({ body: 'same', media: ['aa'.repeat(32), 'bb'.repeat(32)] })
        noCopy(w)
      }
    },
    {
      name: 'a locked note re-sealed on both sides', rule: '§8 content: body, locked, cipher and cipherFormat move together',
      graph: [
        { object: note(R0, [], { locked: true, body: '', cipher: 'AAAA', cipherFormat: 'v5' }) },
        { object: A({ locked: true, body: '', cipher: 'AAAB', cipherFormat: 'v5' }) }, { object: B({ locked: true, body: '', cipher: 'AAAC', cipherFormat: 'v5' }) }
      ],
      check: (h, w) => {
        expect(live(h)).toMatchObject({ locked: true, cipher: 'AAAC', body: '' })
        expect(copies(w)[0]).toMatchObject({ locked: true, cipher: 'AAAB', cipherFormat: 'v5', body: '' })
      }
    },
    {
      name: 'the loser title is cut so the copy title fits 1000', rule: '§8 conflicted copy title',
      graph: [{ object: base }, { object: A({ body: 'A body', title: 't'.repeat(1000) }) }, { object: B({ body: 'B body' }) }],
      check: (_h, w) => expect(copies(w)[0].title).toBe(`${'t'.repeat(982)} (conflicted copy)`)
    }
  ],
  tombstones: [
    {
      name: 'deleted on one side, edited on the other', rule: '§8 tombstones: the change wins',
      graph: [{ object: base }, { object: tomb(rev(2, DEV_A), [R0]) }, { object: B({ body: 'kept writing' }) }],
      check: (h, w) => {
        expect(live(h)).toMatchObject({ body: 'kept writing', deleted: false, device: 'merge' })
        noCopy(w)
      }
    },
    {
      name: 'deleted on one side, unchanged on the other', rule: '§8 tombstones: a tombstone beats an unchanged side (updatedAt is not content)',
      graph: [{ object: base }, { object: tomb(rev(2, DEV_A), [R0]) }, { object: B({ updatedAt: 1791860099999 }) }],
      check: (h) => expect(h).toMatchObject({ deleted: true, device: 'merge' })
    },
    {
      name: 'deleted on both sides', rule: '§8 tombstones: both deleted',
      graph: [{ object: base }, { object: tomb(rev(2, DEV_A), [R0]) }, { object: tomb(rev(3, DEV_B), [R0]) }],
      check: (h) => expect(h.deleted).toBe(true)
    },
    {
      name: 'tombstone against a note with no common ancestor', rule: '§8 tombstones: with an unknown base, any non-tombstone wins',
      graph: [{ object: tomb(rev(5, DEV_A), [rev(4, DEV_A)]) }, { object: B({}, []) }],
      check: (h) => expect(live(h).body).toBe('Body')
    }
  ],
  base: [
    {
      name: 'two root revisions with different bodies', rule: '§8 base: no common ancestor = unknown base: differing content conflicts',
      graph: [{ object: A({ body: 'A body' }, []) }, { object: B({ body: 'B body', title: 'B title' }, []) }],
      check: (h, w) => {
        expect(live(h)).toMatchObject({ body: 'B body', title: 'B title' })
        expect(copies(w).map((c) => c.body)).toEqual(['A body'])
      }
    },
    {
      name: 'the only common ancestor is unreadable', rule: '§8 base: unreadable candidates are left out; none left = unknown base',
      graph: [{ name: objectName(NOTE, R0, [], false), raw: '{"v":2,"broken":true' }, { object: A({ body: 'A body' }) }, { object: B({ pinned: true }) }],
      check: (h, w) => {
        // With the base readable, A's body would simply win; unknown, it is kept as a conflicted copy instead.
        expect(live(h)).toMatchObject({ body: 'Body', pinned: true })
        expect(copies(w).map((c) => c.body)).toEqual(['A body'])
      }
    },
    (() => {
      // X1 (A: title T1) and Y1 (B: pinned) both from R0; Y2 (B: body) on Y1. P = merge(X1, Y1), then P2 (A: title T3)
      // on P; Q = merge(X1, Y2). Heads P2 and Q have two base candidates, X1 and Y1 (criss-cross). Their virtual
      // merge has title T1, so only A changed the title: T3 wins. Base Y1 alone ("greatest rev") would see both
      // sides change the title and pick Q's T1, losing A's edit.
      const X1 = A({ title: 'T1' })
      const Y1 = B({ pinned: true })
      const Y2 = B({ pinned: true, body: 'B body' }, [Y1.rev], 6)
      const P = live(mergePair(X1, Y1, base).merged)
      const P2: NoteRev = { ...P, rev: rev(4, DEV_A), parents: [P.rev], device: DEV_A, deviceName: DEV_A, title: 'T3' }
      const Q = live(mergePair(X1, Y2, base).merged)
      return {
        name: 'criss-cross: two base candidates', rule: '§8 base: several candidates: their virtual merge is the base',
        graph: [{ object: base }, { object: X1 }, { object: Y1 }, { object: Y2 }, { object: P }, { object: P2 }, { object: Q }],
        check: (h: RevObject, w: RevObject[]) => {
          expect(Q.rev > P2.rev).toBe(true)
          expect(live(h)).toMatchObject({ title: 'T3', body: 'B body', pinned: true })
          noCopy(w)
        }
      }
    })(),
    (() => {
      const C = note(rev(4, DEV_C), [R0], { body: 'C body' })
      return {
        name: 'three heads fold in ascending rev order', rule: '§8 base: fold pairwise; one merge revision per step, each copy before its merge',
        graph: [{ object: base }, { object: A({ body: 'A body' }) }, { object: B({ body: 'B body' }) }, { object: C }],
        check: (h: RevObject, w: RevObject[]) => {
          expect(w.map((x) => (x.deleted || !x.conflictOf ? 'merge' : 'copy'))).toEqual(['copy', 'merge', 'copy', 'merge'])
          expect(w[3].parents).toEqual([w[1].rev, C.rev].sort())
          expect(live(h).body).toBe('C body')
          expect(copies(w).map((c) => c.body).sort()).toEqual(['A body', 'B body'])
        }
      }
    })(),
    (() => {
      // An existing merge M = merge(A1, B1) and a late head C1 whose rev sorts below M: the new merge rev prefixes
      // the HLC successor of B1 (counter + 1) instead of nesting M~h.
      const A1 = A({ title: 'A title' })
      const B1 = B({ pinned: true })
      const M = mergePair(A1, B1, base).merged
      const C1 = note(rev(3, DEV_A), [R0], { tags: ['a', 'c'] })
      return {
        name: 'a merge over a merge rev never nests', rule: '§2 merge rev prefix',
        graph: [{ object: base }, { object: A1 }, { object: B1 }, { object: M }, { object: C1 }],
        check: (h: RevObject) => {
          expect(C1.rev < M.rev).toBe(true)
          expect(h.rev.startsWith(`${rev(3, DEV_B, 1)}~`)).toBe(true)
          expect(live(h)).toMatchObject({ title: 'A title', pinned: true, tags: ['a', 'c'] })
        }
      }
    })()
  ]
}

const fileOf = (e: Entry) => ('raw' in e ? { name: e.name, raw: e.raw } : { name: objectName(e.object.id, e.object.rev, e.object.parents, false), object: e.object })

describe('merge-*.json', () => {
  for (const [group, cases] of Object.entries(GROUPS)) {
    it(`merge-${group}.json`, async () => {
      const out = []
      for (const c of cases) {
        const files = c.graph.map(fileOf)
        const byName = new Map(files.map((f) => [f.name, f]))
        const g = buildGraphs(files.map((f) => parseObjectName(f.name)!)).get(NOTE)!
        const r = await foldHeads(g, async (rev) => {
          const f = byName.get(g.names.get(rev) ?? '')
          if (!f) return null
          try {
            return parseObject(Buffer.from('raw' in f ? f.raw! : sortedJson(f.object)), parseObjectName(f.name)!)
          } catch {
            return null
          }
        })
        expect(r, c.name).not.toBeNull()
        c.check(r!.head, r!.writes)
        out.push({
          name: c.name, rule: c.rule, graph: files,
          expected: { writes: r!.writes.map((w) => ({ name: objectName(w.id, w.rev, w.parents, false), object: w })), head: r!.head.rev }
        })
      }
      matches(`merge-${group}.json`, out)
    })
  }
})
