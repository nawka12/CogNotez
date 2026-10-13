// Sync v2 file names and revision objects (docs/v5/sync-v2.md §2, §3, §5, §8). Pure and Electron-free.
import { createHash } from 'node:crypto'
import { LIMITS } from '../guards'

export const DEVICE_RE = /^[a-z0-9]{8,32}$/
export const NOTE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/
// An edit rev's ms is below 9e12 (hlc.MAX_MS); a merge rev's prefix may carry one past it, so it gets all 13 digits.
const EDIT = '[0-8]\\d{12}-[0-9a-z]{4}-[a-z0-9]{8,32}'
const REV = `(?:${EDIT}|\\d{13}-[0-9a-z]{4}-[a-z0-9]{8,32}~[0-9a-f]{8})`
/** An edit rev (HLC) or a merge rev. */
export const REV_RE = new RegExp(`^${REV}$`)
const EDIT_RE = new RegExp(`^${EDIT}$`)
const OBJECT_RE = new RegExp(`^objects/n\\.([A-Za-z0-9_-]{8,64})\\.(${REV})\\.(0|${REV}(?:\\+${REV})?)\\.(json|bin)$`)
const MEDIA_RE = /^media\/m\.([0-9a-f]{64})(\.bin)?$/
const HASH_RE = /^[0-9a-f]{64}$/

export const META_NAME = 'meta.json'
export const MAX_OBJECT_BYTES = 8 * 1024 * 1024
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024
/** Writers never name more than two parents (merges are binary), which keeps names under 255 bytes. */
export const MAX_PARENTS = 2
export const DEVICE_NAME_MAX = 100
export const MAX_MEDIA_REFS = 1000
export const COPY_SUFFIX = ' (conflicted copy)'

export const sha256hex = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

// ---- names ----------------------------------------------------------------------------------

export interface ObjectName {
  name: string
  id: string
  rev: string
  /** Sorted ascending; empty for a root revision. */
  parents: string[]
  encrypted: boolean
}

export function objectName(id: string, rev: string, parents: readonly string[], encrypted: boolean): string {
  const ps = [...parents].sort()
  const name = `objects/n.${id}.${rev}.${ps.length ? ps.join('+') : '0'}.${encrypted ? 'bin' : 'json'}`
  if (!parseObjectName(name)) throw new Error(`cannot build a valid object name for ${id} ${rev}`)
  return name
}

export function parseObjectName(name: string): ObjectName | null {
  const m = OBJECT_RE.exec(name)
  if (!m) return null
  const parents = m[3] === '0' ? [] : m[3].split('+')
  // Sorted, distinct, and never the rev itself.
  if (parents.length === 2 && !(parents[0] < parents[1])) return null
  if (parents.includes(m[2])) return null
  return { name, id: m[1], rev: m[2], parents, encrypted: m[4] === 'bin' }
}

/** `key` is the sha256 (plaintext remote) or the HMAC name (encrypted remote), both 64 hex. */
export const mediaName = (key: string, encrypted: boolean): string => `media/m.${key}${encrypted ? '.bin' : ''}`

export function parseMediaName(name: string): { key: string; encrypted: boolean } | null {
  const m = MEDIA_RE.exec(name)
  return m ? { key: m[1], encrypted: m[2] === '.bin' } : null
}

/** AAD for an encrypted file: its path without `.bin` (§5). */
export const aadOf = (name: string): string => name.replace(/\.bin$/, '')

// ---- revs -----------------------------------------------------------------------------------

const COUNTER_MAX = 36 ** 4 - 1

/** The next HLC value after an edit rev: same device part, counter + 1 (carrying into ms). */
function bump(edit: string): string {
  const [ms, counter, device] = edit.split('-')
  let m = Number(ms)
  let c = parseInt(counter, 36) + 1
  if (c > COUNTER_MAX) {
    m++
    c = 0
  }
  return `${String(m).padStart(13, '0')}-${c.toString(36).padStart(4, '0')}-${device}`
}

/**
 * Merge rev (§2): `<greatest parent>~<first 8 hex of sha256(sorted parents joined by "+")>`. When the greatest parent
 * is itself a merge rev `E~h`, the prefix is bump(E) instead, so revs never nest and keep a fixed maximum length.
 * Either way the result sorts after every parent.
 */
export function mergeRev(parents: readonly string[]): string {
  const ps = [...parents].sort()
  const top = ps[ps.length - 1]
  if (!top) throw new Error('a merge needs parents')
  const prefix = EDIT_RE.test(top) ? top : bump(top.slice(0, top.indexOf('~')))
  return `${prefix}~${sha256hex(ps.join('+')).slice(0, 8)}`
}

/** Conflicted copy id (§8): `c` + first 31 hex of sha256(noteId + ":" + losingRev). */
export const copyId = (noteId: string, losingRev: string): string => `c${sha256hex(`${noteId}:${losingRev}`).slice(0, 31)}`

/** The 13-digit millisecond field of a rev. */
export const revMs = (rev: string): number => Number(rev.slice(0, 13))

// ---- objects --------------------------------------------------------------------------------

interface Head {
  v: 2
  id: string
  rev: string
  parents: string[]
  device: string
  deviceName: string
}

export interface Tombstone extends Head {
  deleted: true
}

export interface NoteRev extends Head {
  deleted: false
  title: string
  body: string
  tags: string[]
  pinned: boolean
  archived: boolean
  trashedAt: number | null
  createdAt: number
  updatedAt: number
  locked: boolean
  /** base64 of the locked-note envelope bytes. */
  cipher: string | null
  cipherFormat: 'v4' | 'v5' | null
  media: string[]
  conflictOf: string | null
}

export type RevObject = Tombstone | NoteRev

/** JSON with object keys sorted (recursively) and no whitespace: the file format and the hashing format. */
export function sortedJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(sortedJson).join(',')}]`
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${sortedJson(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

export const serialize = (o: RevObject): Uint8Array => Buffer.from(sortedJson(o), 'utf8')

/** Canonical content (§6): the object minus rev, parents, device, deviceName and updatedAt. */
export function canonical(o: RevObject): string {
  const c: Record<string, unknown> = { ...o }
  for (const k of ['rev', 'parents', 'device', 'deviceName', 'updatedAt']) delete c[k]
  return sortedJson(c)
}

export const contentHash = (o: RevObject): string => sha256hex(canonical(o))

// ---- validation -----------------------------------------------------------------------------

class Invalid extends Error {}
const bad = (msg: string): never => {
  throw new Invalid(msg)
}
const str = (v: unknown, name: string, max: number): string =>
  typeof v === 'string' && v.length <= max ? v : bad(`${name} must be a string of at most ${max}`)
const bool = (v: unknown, name: string): boolean => (typeof v === 'boolean' ? v : bad(`${name} must be a boolean`))
const time = (v: unknown, name: string): number => (Number.isSafeInteger(v) && (v as number) >= 0 ? (v as number) : bad(`${name} must be a timestamp`))
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/

/** The local tag rules (guards.tagName), except that tags must already be trimmed. */
function tags(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > LIMITS.tags) return bad('tags must be an array of at most 50')
  const seen = new Set<string>()
  for (const t of v) {
    const s = str(t, 'tag', LIMITS.tag)
    if (!s || s !== s.trim() || CONTROL_RE.test(s) || s.startsWith('/') || s.endsWith('/') || s.includes('//')) bad('tag is malformed')
    if (seen.has(s.toLowerCase())) bad('duplicate tag')
    seen.add(s.toLowerCase())
  }
  return v as string[]
}

/**
 * Parses and validates a revision object against its file name (§5). Throws on anything wrong; the caller skips the
 * object with a warning and never deletes it. Unknown fields are ignored (and dropped).
 */
export function parseObject(bytes: Uint8Array, name: ObjectName): RevObject {
  if (bytes.length > MAX_OBJECT_BYTES) bad('object is over 8 MB')
  let o: Record<string, unknown>
  try {
    o = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>
  } catch {
    return bad('not JSON')
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) bad('not an object')
  if (o.v !== 2) bad('unsupported object version')
  if (o.id !== name.id || o.rev !== name.rev) bad('id/rev do not match the file name')
  if (!Array.isArray(o.parents) || o.parents.join('+') !== name.parents.join('+')) bad('parents do not match the file name')
  const device = str(o.device, 'device', 32)
  if (device !== 'merge' && !DEVICE_RE.test(device)) bad('device is malformed')
  const head: Head = { v: 2, id: name.id, rev: name.rev, parents: [...name.parents], device, deviceName: str(o.deviceName, 'deviceName', DEVICE_NAME_MAX) }
  if (bool(o.deleted, 'deleted')) return { ...head, deleted: true }

  const locked = bool(o.locked, 'locked')
  const cipher = o.cipher === null ? null : str(o.cipher, 'cipher', MAX_OBJECT_BYTES)
  const cipherFormat = o.cipherFormat === null ? null : o.cipherFormat === 'v4' || o.cipherFormat === 'v5' ? o.cipherFormat : bad('cipherFormat is unknown')
  const body = str(o.body, 'body', LIMITS.body)
  if (locked !== (cipher !== null) || locked !== (cipherFormat !== null)) bad('locked, cipher and cipherFormat disagree')
  if (locked && body !== '') bad('a locked note must have an empty body')
  if (cipher !== null && !/^[A-Za-z0-9+/]*={0,2}$/.test(cipher)) bad('cipher is not base64')
  if (!Array.isArray(o.media) || o.media.length > MAX_MEDIA_REFS) bad('media must be an array')
  const media = o.media as unknown[]
  if (!media.every((h) => typeof h === 'string' && HASH_RE.test(h))) bad('media must be sha256 hex')
  const conflictOf = o.conflictOf === null ? null : str(o.conflictOf, 'conflictOf', 64)
  if (conflictOf !== null && !NOTE_ID_RE.test(conflictOf)) bad('conflictOf is malformed')
  return {
    ...head,
    deleted: false,
    title: str(o.title, 'title', LIMITS.title),
    body,
    tags: [...tags(o.tags)],
    pinned: bool(o.pinned, 'pinned'),
    archived: bool(o.archived, 'archived'),
    trashedAt: o.trashedAt === null ? null : time(o.trashedAt, 'trashedAt'),
    createdAt: time(o.createdAt, 'createdAt'),
    updatedAt: time(o.updatedAt, 'updatedAt'),
    locked,
    cipher,
    cipherFormat,
    media: [...new Set(media as string[])].sort(),
    conflictOf
  }
}
