// Randomised convergence / no-lost-update test: 3 devices, a seeded PRNG, random local operations, sync rounds that
// interleave with each other and with local edits, and injected transport failures.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decryptBlob } from '../src/main/sync/crypto'
import { aadOf, parseObject, parseObjectName } from '../src/main/sync/format'
import type { RevObject } from '../src/main/sync/format'
import { buildGraphs } from '../src/main/sync/graph'
import { cleanupDevices, makeDevice, MemoryRemote, settle, stateOf } from './sync-harness'
import type { Device } from './sync-harness'

afterEach(cleanupDevices)

// Deterministic note/tag ids and device ids, so a failing seed reproduces exactly.
let idCounter = 0
vi.mock('node:crypto', async (orig) => {
  const real = await orig<typeof import('node:crypto')>()
  const hex = (n: number, len: number) => (n.toString(16) + '0'.repeat(len)).slice(0, len)
  return {
    ...real,
    randomUUID: () => {
      const h = real.createHash('sha256').update(String(++idCounter)).digest('hex')
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
    },
    randomBytes: (n: number) => real.createHash('sha512').update(`rb${hex(++idCounter, 8)}`).digest().subarray(0, n)
  }
})

const SEEDS = Number(process.env['SYNC_PROPERTY_SEEDS'] ?? 50)
const FIRST_SEED = Number(process.env['SYNC_PROPERTY_FIRST_SEED'] ?? 1)
const OPS = 300

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One local edit. Every body string is introduced by exactly one edit (`body <seed>-<n>`), so `prevBody` (what the
 * device showed when the user acted) identifies the content this edit causally replaced.
 */
interface Edit {
  id: string
  rev: string
  prevBody: string | null
  /** null for a permanent delete. */
  body: string | null
  /** Titles are unique per introduction too, and checked the same way. */
  prevTitle: string | null
  title: string | null
}

/** How often each §8 situation occurred, summed over all seeds: the test must actually exercise every rule. */
const seen = { merges: 0, copies: 0, deleteVsChange: 0, deleteVsUnchanged: 0, unknownBase: 0, crissCross: 0, foldSteps: 0, encryptedSeeds: 0 }

async function run(seed: number): Promise<void> {
  idCounter = seed * 1_000_000
  const rng = mulberry32(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]
  const remote = new MemoryRemote()
  const devs: Device[] = []
  // Every fourth seed runs against an encrypted remote (one KDF per seed; the others reuse the unwrapped key).
  const encrypted = seed % 4 === 0
  for (const name of ['alpha', 'bravo', 'charlie']) {
    const d = await makeDevice(name, remote, { start: Date.UTC(2026, 9, 13) + Math.floor(rng() * 5000), passphrase: encrypted && !devs.length ? 'property passphrase' : undefined })
    if (devs.length) d.dek = devs[0].dek
    devs.push(d)
  }
  if (encrypted) seen.encryptedSeeds++

  let failRate = 0.04
  const tick = (): Promise<void> => new Promise((r) => setImmediate(r))
  for (const d of devs) {
    d.hooks.before = async () => {
      for (let i = Math.floor(rng() * 4); i > 0; i--) await tick()
      if (rng() < failRate) throw new Error('injected transport failure')
    }
  }

  const edits: Edit[] = []
  const row = (d: Device, id: string) => d.store.db.prepare('SELECT rev, body, title FROM notes WHERE id = ?').get(id) as { rev: string; body: string; title: string } | undefined
  /** Runs a local operation and records it with the body it replaced. */
  const edit = (d: Device, id: string, fn: () => void): void => {
    const prev = row(d, id)
    fn()
    const r = row(d, id)
    edits.push({ id, rev: r?.rev ?? '', prevBody: prev?.body ?? null, body: r ? r.body : null, prevTitle: prev?.title ?? null, title: r ? r.title : null })
  }
  const notesOf = (d: Device) => d.store.db.prepare('SELECT id, deleted_at, pinned FROM notes').all() as { id: string; deleted_at: number | null; pinned: number }[]
  const rounds = new Map<Device, Promise<unknown>>()
  let n = 0

  for (let i = 0; i < OPS; i++) {
    const d = pick(devs)
    const notes = notesOf(d)
    const live = notes.filter((x) => x.deleted_at === null)
    const trashed = notes.filter((x) => x.deleted_at !== null)
    const op = rng()
    n++
    if (op < 0.12 || !notes.length) {
      const { id } = d.store.notes.create({ title: `title ${seed}-${n}`, body: `body ${seed}-${n}`, tags: rng() < 0.5 ? ['x'] : [] })
      edits.push({ id, rev: row(d, id)!.rev, prevBody: null, body: `body ${seed}-${n}`, prevTitle: null, title: `title ${seed}-${n}` })
    } else if (op < 0.3 && live.length) {
      const { id } = pick(live)
      edit(d, id, () => d.store.notes.save({ id, body: `body ${seed}-${n}` }))
    } else if (op < 0.4 && live.length) {
      const { id } = pick(live)
      edit(d, id, () => d.store.notes.save({ id, title: `title ${seed}-${n}` }))
    } else if (op < 0.5 && live.length) {
      const { id } = pick(live)
      const tags = d.store.notes.get(id).tags
      const t = pick(['x', 'y', 'z', 'deep/tag'])
      edit(d, id, () => d.store.notes.save({ id, tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] }))
    } else if (op < 0.55 && live.length) {
      const x = pick(live)
      edit(d, x.id, () => d.store.notes.save({ id: x.id, pinned: !x.pinned }))
    } else if (op < 0.62 && live.length) {
      const { id } = pick(live)
      edit(d, id, () => d.store.notes.trash(id))
    } else if (op < 0.67 && trashed.length) {
      const { id } = pick(trashed)
      edit(d, id, () => d.store.notes.restore(id))
    } else if (op < 0.71 && trashed.length) {
      const { id } = pick(trashed)
      edit(d, id, () => d.store.notes.deleteForever(id))
    } else if (!rounds.has(d)) {
      rounds.set(d, d.sync().catch(() => undefined).finally(() => rounds.delete(d)))
    }
    for (let k = Math.floor(rng() * 6); k > 0; k--) await tick()
  }
  await Promise.all(rounds.values())

  // Quiesce: no failures, sync everyone until nothing changes.
  failRate = 0
  await settle(devs, remote, 20)

  // (a) Convergence.
  const final = stateOf(devs[0])
  for (const d of devs.slice(1)) expect(stateOf(d), `seed ${seed}: ${d.name} diverged`).toEqual(final)

  // (c) Quiescence: another full pass writes nothing at all.
  let creates = 0
  for (const d of devs) d.hooks.before = (op) => void (op === 'create' && creates++)
  for (const d of devs) await d.sync()
  expect(creates, `seed ${seed}: writes after quiescence`).toBe(0)

  // (b) No lost update: every body that was uploaded is either in the final state (in its note or a conflicted
  // copy), or some device showed it and the user replaced it (an edit whose prevBody is that body), which puts the
  // replaced content in that edit's causal past.
  const uploaded = new Set<string>()
  const parents = new Map<string, string[]>()
  const dek = devs[0].dek
  const objects = new Map<string, RevObject>()
  for (const [name, bytes] of remote.files) {
    const p = parseObjectName(name)
    if (!p) continue
    expect(p.encrypted, `seed ${seed}: ${name}`).toBe(encrypted)
    if (encrypted) expect(Buffer.from(bytes).toString('latin1')).not.toMatch(/body \d|title \d/)
    objects.set(`${p.id} ${p.rev}`, parseObject(dek ? decryptBlob(dek, aadOf(name), bytes) : bytes, p))
    uploaded.add(`${p.id} ${p.rev}`)
    parents.set(p.rev, [...(parents.get(p.rev) ?? []), ...p.parents])
  }
  const isAncestor = (anc: string, rev: string): boolean => {
    const seen = new Set<string>()
    const stack = [...(parents.get(rev) ?? [])]
    while (stack.length) {
      const r = stack.pop()!
      if (r === anc) return true
      if (!seen.has(r)) stack.push(...(parents.get((seen.add(r), r)) ?? []))
    }
    return false
  }
  const replaced = new Set(edits.filter((x) => x.prevBody !== null && x.body !== x.prevBody).map((x) => x.prevBody))
  const bare = (t: string | null): string | null => t?.replaceAll(' (conflicted copy)', '') ?? null
  for (const e of edits) [e.title, e.prevTitle] = [bare(e.title), bare(e.prevTitle)]
  const replacedTitles = new Set(edits.filter((x) => x.prevTitle !== null && x.title !== x.prevTitle).map((x) => x.prevTitle))
  const finalBodies = new Set(final.map((x) => String(x.body)))
  const finalTitles = new Set(final.map((x) => bare(String(x.title))))
  let checked = 0
  for (const e of edits) {
    if (e.body === null || e.title === null || !uploaded.has(`${e.id} ${e.rev}`)) continue
    checked++
    // Titles are scalars (§8): a concurrent title change to the same note may win; an unchanged side never may.
    // Title W beat e legitimately only if e's author never saw W: no uploaded revision carrying W is in e's past.
    const carriers = (w: string) => edits.filter((x) => x.id === e.id && x.title === w && uploaded.has(`${x.id} ${x.rev}`))
    const others = new Set(edits.filter((x) => x.id === e.id && x.title !== null && x.title !== e.title).map((x) => x.title!))
    const lostToConcurrent = [...others].some((w) => carriers(w).length > 0 && carriers(w).every((x) => !isAncestor(x.rev, e.rev)))
    const ok = finalBodies.has(e.body) || replaced.has(e.body)
    if ((!ok || !(finalTitles.has(e.title) || replacedTitles.has(e.title) || lostToConcurrent)) && process.env['SYNC_PROPERTY_DEBUG']) {
      for (const [name, bytes] of remote.files) {
        const p = parseObjectName(name)
        if (!p) continue
        const o = parseObject(bytes, p)
        if (o.id === e.id || (!o.deleted && o.conflictOf === e.id) || (!o.deleted && e.id.startsWith('c') && o.rev === e.rev)) console.error(o.id.slice(0, 8), o.rev, '<-', o.parents.join(' + ') || '0', o.device, o.deleted ? 'TOMBSTONE' : JSON.stringify([o.title, o.body, o.tags, o.trashedAt]))
      }
      console.error('edits', edits.filter((x) => x.id === e.id))
    }
    expect(finalTitles.has(e.title) || replacedTitles.has(e.title) || lostToConcurrent, `seed ${seed}: lost title ${e.id} ${e.rev} "${e.title}"`).toBe(true)
    expect(ok, `seed ${seed}: lost update ${e.id} ${e.rev} "${e.body}"`).toBe(true)
  }
  expect(checked).toBeGreaterThan(10)

  // Which merge rules this seed exercised (read back from the merge revisions on the remote).
  const graphs = buildGraphs([...remote.files.keys()].map(parseObjectName).filter((p) => p !== null))
  for (const o of objects.values()) {
    if (o.device !== 'merge' || o.parents.length !== 2) continue
    seen.merges++
    const [x, y] = o.parents.map((r) => objects.get(`${o.id} ${r}`))
    if (o.parents.some((r) => graphs.get(o.id)!.parents.get(r)?.length === 2)) seen.foldSteps++
    const candidates = graphs.get(o.id)!.lcaCandidates(o.parents[0], o.parents[1])
    if (candidates.length === 0) seen.unknownBase++
    if (candidates.length > 1) seen.crissCross++
    if (x && y && x.deleted !== y.deleted) seen[o.deleted ? 'deleteVsUnchanged' : 'deleteVsChange']++
  }
  for (const o of objects.values()) if (!o.deleted && o.conflictOf !== null && o.parents.length === 0) seen.copies++
}

describe('sync property', () => {
  it(`converges with no lost update over ${SEEDS} seeds`, { timeout: 600_000 }, async () => {
    const t0 = Date.now()
    for (let seed = FIRST_SEED; seed < FIRST_SEED + SEEDS; seed++) {
      try {
        await run(seed)
      } catch (e) {
        console.error(`sync property test failed with seed ${seed} (rerun: SYNC_PROPERTY_FIRST_SEED=${seed} SYNC_PROPERTY_SEEDS=1)`)
        throw e
      } finally {
        cleanupDevices()
      }
    }
    console.warn(`sync property: seeds ${FIRST_SEED}..${FIRST_SEED + SEEDS - 1}, ${OPS} ops each, ${Date.now() - t0} ms`, seen)
    if (SEEDS >= 50) for (const [k, n] of Object.entries(seen)) if (k !== 'unknownBase') expect(n, `no seed exercised ${k}`).toBeGreaterThan(0)
  })
})
