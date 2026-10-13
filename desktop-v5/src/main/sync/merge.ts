// Deterministic merge (docs/v5/sync-v2.md §8). Every output is a function of remote objects only, so every device
// that sees the same heads writes the same files.
import { LIMITS } from '../guards'
import { canonical, COPY_SUFFIX, copyId, mergeRev } from './format'
import type { NoteRev, RevObject } from './format'
import type { NoteGraph } from './graph'

export interface MergeStep {
  merged: RevObject
  /** The losing content of a body conflict, as a new note. */
  copy: NoteRev | null
}

const contentEq = (a: NoteRev, b: NoteRev): boolean =>
  a.body === b.body && a.locked === b.locked && a.cipher === b.cipher && a.cipherFormat === b.cipherFormat

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])].sort()

/** Sorted by UTF-16 code units, case-insensitive duplicates dropped (first wins), at most 50 (the local limit). */
function normTags(tags: Iterable<string>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of [...new Set(tags)].sort()) {
    if (seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  return out.slice(0, LIMITS.tags)
}

/** Conflicted copy of the losing side (§8): one root revision whose rev is the loser's rev. */
export function conflictCopy(noteId: string, loser: NoteRev): NoteRev {
  return {
    v: 2,
    id: copyId(noteId, loser.rev),
    rev: loser.rev,
    parents: [],
    device: loser.device,
    deviceName: loser.deviceName,
    deleted: false,
    title: loser.title.slice(0, LIMITS.title - COPY_SUFFIX.length) + COPY_SUFFIX,
    body: loser.body,
    tags: [...loser.tags],
    pinned: false,
    archived: false,
    trashedAt: null,
    createdAt: loser.updatedAt,
    updatedAt: loser.updatedAt,
    locked: loser.locked,
    cipher: loser.cipher,
    cipherFormat: loser.cipherFormat,
    media: [...loser.media],
    conflictOf: noteId
  }
}

/** merge(x, y) with base = their LCA object, or null when the base is unknown. Argument order does not matter. */
export function mergePair(x: RevObject, y: RevObject, base: RevObject | null): MergeStep {
  const [a, b] = x.rev < y.rev ? [x, y] : [y, x] // b has the greater rev
  const head = {
    v: 2 as const,
    id: b.id,
    rev: mergeRev([a.rev, b.rev]),
    parents: [a.rev, b.rev].sort(),
    device: 'merge',
    deviceName: 'merge'
  }
  const baseKey = base ? canonical(base) : null
  const changed = (s: RevObject): boolean => baseKey === null || canonical(s) !== baseKey

  // Tombstones: a change beats a delete; a delete beats an unchanged side; with an unknown base a note always wins.
  if (a.deleted || b.deleted) {
    if (a.deleted && b.deleted) return { merged: { ...head, deleted: true }, copy: null }
    const note = (a.deleted ? b : a) as NoteRev
    if (base === null || base.deleted || changed(note)) return { merged: { ...note, ...head }, copy: null }
    return { merged: { ...head, deleted: true }, copy: null }
  }

  const bs = base && !base.deleted ? base : null // a tombstone base tells nothing about fields
  const pick = <K extends 'title' | 'pinned' | 'archived' | 'trashedAt' | 'conflictOf'>(k: K): NoteRev[K] => {
    if (a[k] === b[k]) return a[k]
    if (bs && a[k] !== bs[k] && b[k] === bs[k]) return a[k]
    return b[k] // only b changed, both changed, or the base is unknown
  }

  const tags = bs
    ? [...a.tags.filter((t) => !bs.tags.includes(t)), ...b.tags.filter((t) => !bs.tags.includes(t)), ...bs.tags.filter((t) => a.tags.includes(t) && b.tags.includes(t))]
    : [...a.tags, ...b.tags]

  let content: NoteRev
  let media: string[]
  let copy: NoteRev | null = null
  if (contentEq(a, b)) {
    content = b
    media = union(a.media, b.media)
  } else if (bs && contentEq(b, bs)) {
    content = a
    media = a.media
  } else if (bs && contentEq(a, bs)) {
    content = b
    media = b.media
  } else {
    content = b
    media = b.media
    copy = conflictCopy(b.id, a)
  }

  const merged: NoteRev = {
    ...head,
    deleted: false,
    title: pick('title'),
    body: content.body,
    tags: normTags(tags),
    pinned: pick('pinned'),
    archived: pick('archived'),
    trashedAt: pick('trashedAt'),
    createdAt: Math.min(a.createdAt, b.createdAt),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    locked: content.locked,
    cipher: content.cipher,
    cipherFormat: content.cipherFormat,
    media: [...media],
    conflictOf: pick('conflictOf')
  }
  return { merged, copy }
}

/** null = unreadable or invalid. */
export type Loader = (rev: string) => Promise<RevObject | null>

/**
 * The base for merging `x` and `y` (§8): their single lowest common ancestor, or for a criss-cross the virtual merge of
 * all candidates (folded in ascending rev order with these same rules, recursively; never written, copies dropped).
 * Unreadable candidates are left out; none readable = unknown base (null).
 * ponytail: recursive like git's merge-recursive; pathological criss-cross chains cost more, fine at note-graph sizes.
 */
export async function resolveBase(g: NoteGraph, x: string, y: string, load: Loader): Promise<RevObject | null> {
  const added: string[] = []
  const virtual = new Map<string, RevObject>()
  const get = async (rev: string): Promise<RevObject | null> => virtual.get(rev) ?? (await load(rev))
  const resolve = async (p: string, q: string): Promise<RevObject | null> => {
    let acc: RevObject | null = null
    for (const c of g.lcaCandidates(p, q).reverse()) {
      const o = await get(c)
      if (!o) continue
      if (!acc) {
        acc = o
        continue
      }
      const v: RevObject = mergePair(acc, o, await resolve(acc.rev, c)).merged
      if (!g.parents.has(v.rev)) {
        g.add(v.rev, v.parents)
        added.push(v.rev)
      }
      virtual.set(v.rev, v)
      acc = v
    }
    return acc
  }
  try {
    return await resolve(x, y)
  } finally {
    for (const r of added) g.parents.delete(r)
  }
}

/**
 * Folds the heads pairwise in ascending rev order (§8). Each step is written as its own two-parent merge revision,
 * preceded by its conflicted copy, so a round that stops halfway never hides a losing edit behind a merge.
 * Returns null when a head cannot be read (the note is retried next round). The graph gains the merge nodes.
 */
export async function foldHeads(g: NoteGraph, load: Loader): Promise<{ writes: RevObject[]; head: RevObject } | null> {
  const heads = g.heads()
  const made = new Map<string, RevObject>()
  const get = async (rev: string): Promise<RevObject | null> => made.get(rev) ?? (await load(rev))
  let acc = heads[0] ? await get(heads[0]) : null
  if (!acc) return null
  const writes: RevObject[] = []
  for (const rev of heads.slice(1)) {
    const next = await get(rev)
    if (!next) return null
    const base = await resolveBase(g, acc.rev, rev, get)
    const step = mergePair(acc, next, base)
    if (step.copy) writes.push(step.copy)
    writes.push(step.merged)
    g.add(step.merged.rev, step.merged.parents)
    made.set(step.merged.rev, step.merged)
    acc = step.merged
  }
  return { writes, head: acc }
}
