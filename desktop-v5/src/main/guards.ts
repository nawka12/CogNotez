// Electron-free validators and policy helpers. Every guard returns the cleaned value or throws;
// throwing is the single error convention (the renderer sees a rejected promise).
import { SECRET_NAMES } from '../shared/api'
import type { ListFilter, NoteInput, NotePatch, SecretName } from '../shared/api'

export const LIMITS = {
  title: 1_000,
  body: 5_000_000,
  tag: 100,
  tags: 50,
  query: 500,
  settingKey: 128,
  settingValueBytes: 64 * 1024,
  secret: 16 * 1024,
  password: 1024
} as const

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/
const SETTING_KEY_RE = /^[a-z0-9_.]+$/
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/

function fail(msg: string): never {
  throw new Error(`invalid argument: ${msg}`)
}

function plainObject(v: unknown, name: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${name} must be an object`)
  const o = v as Record<string, unknown>
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${name}.${k} is not allowed`)
  return o
}

function string(v: unknown, name: string, max: number): string {
  if (typeof v !== 'string') fail(`${name} must be a string`)
  if (v.length > max) fail(`${name} is too long (max ${max})`)
  return v
}

export function id(v: unknown): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) fail('id has an invalid format')
  return v
}

export function tagName(v: unknown): string {
  const t = string(v, 'tag', LIMITS.tag).trim()
  if (!t || CONTROL_RE.test(t) || t.startsWith('/') || t.endsWith('/') || t.includes('//')) fail('tag name is malformed')
  return t
}

/** Validates, trims and de-duplicates (case-insensitively, first spelling wins). */
export function tagList(v: unknown): string[] {
  if (!Array.isArray(v)) fail('tags must be an array')
  if (v.length > LIMITS.tags) fail(`too many tags (max ${LIMITS.tags})`)
  const seen = new Map<string, string>()
  for (const t of v) {
    const name = tagName(t)
    if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name)
  }
  return [...seen.values()]
}

function optionalFields(o: Record<string, unknown>): NoteInput {
  const out: NoteInput = {}
  if (o.title !== undefined) out.title = string(o.title, 'title', LIMITS.title)
  if (o.body !== undefined) out.body = string(o.body, 'body', LIMITS.body)
  if (o.tags !== undefined) out.tags = tagList(o.tags)
  return out
}

export function noteInput(v: unknown): NoteInput {
  if (v === undefined) return {}
  return optionalFields(plainObject(v, 'input', ['title', 'body', 'tags']))
}

export function notePatch(v: unknown): NotePatch {
  const o = plainObject(v, 'patch', ['id', 'title', 'body', 'tags', 'pinned', 'conflictOf'])
  const patch: NotePatch = { id: id(o.id), ...optionalFields(o) }
  if (o.pinned !== undefined) {
    if (typeof o.pinned !== 'boolean') fail('pinned must be a boolean')
    patch.pinned = o.pinned
  }
  if (o.conflictOf !== undefined) {
    // "Keep both" on a sync conflicted copy; setting a conflict link is sync's job alone.
    if (o.conflictOf !== null) fail('conflictOf can only be set to null')
    patch.conflictOf = null
  }
  return patch
}

export function listFilter(v: unknown): ListFilter {
  const o = plainObject(v, 'filter', ['kind', 'tag'])
  switch (o.kind) {
    case 'all':
    case 'pinned':
    case 'trash':
      if (o.tag !== undefined) fail('filter.tag is only valid for kind "tag"')
      return { kind: o.kind }
    case 'tag':
      return { kind: 'tag', tag: tagName(o.tag) }
    default:
      return fail('filter.kind is unknown')
  }
}

export function query(v: unknown): string {
  return string(v, 'query', LIMITS.query)
}

/** Keys under `sys.` belong to main (e.g. the HLC device id); the renderer may not touch them. */
export function settingKey(v: unknown): string {
  const k = string(v, 'key', LIMITS.settingKey)
  if (!SETTING_KEY_RE.test(k)) fail('key must match /^[a-z0-9_.]+$/')
  if (k.startsWith('sys.')) fail('key is reserved')
  return k
}

/** Returns the JSON text to store. */
export function settingValueJson(v: unknown): string {
  let json: string | undefined
  try {
    json = JSON.stringify(v)
  } catch {
    fail('value is not JSON-serialisable')
  }
  if (json === undefined) fail('value is not JSON-serialisable')
  if (Buffer.byteLength(json) > LIMITS.settingValueBytes) fail('value is too large (max 64 KB)')
  return json
}

/** Only shape and size; the 8-character minimum for NEW passwords is enforced where it is set. */
export function password(v: unknown): string {
  if (typeof v !== 'string' || v.length < 1 || v.length > LIMITS.password) fail(`password must be 1 to ${LIMITS.password} characters`)
  return v
}

export function secretName(v: unknown): SecretName {
  if (typeof v !== 'string' || !(SECRET_NAMES as readonly string[]).includes(v)) fail('unknown secret name')
  return v as SecretName
}

export function secretValue(v: unknown): string {
  const s = string(v, 'value', LIMITS.secret)
  if (!s) fail('value must not be empty')
  return s
}

// ---- policy -------------------------------------------------------------------------------

export interface FrameLike {
  url: string
  parent: unknown
}

/**
 * `target` is the app's own URL: the Vite dev server URL in dev, the index.html file URL in prod.
 * Dev compares origins; prod requires the exact file (file:// origins are opaque).
 */
export function isAppUrl(url: string, target: string): boolean {
  let u: URL
  let t: URL
  try {
    u = new URL(url)
    t = new URL(target)
  } catch {
    return false
  }
  if (t.protocol === 'file:') return u.protocol === 'file:' && u.pathname === t.pathname
  return u.origin === t.origin
}

/** IPC sender check: only the top-level frame of our own page may call. */
export function isAppSender(frame: FrameLike | null | undefined, target: string): boolean {
  return !!frame && frame.parent === null && isAppUrl(frame.url, target)
}

export function buildCsp(devUrl?: string): string {
  let connect = "'self'"
  if (devUrl) {
    const u = new URL(devUrl)
    connect += ` ${u.origin} ws://${u.host}`
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // styles only: CodeMirror injects <style> tags at runtime
    "img-src 'self' data: cognotez-media:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "form-action 'none'"
  ].join('; ')
}
