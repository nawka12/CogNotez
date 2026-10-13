// Locked-note crypto. Electron-free (tests run in plain Node).
//
// v4 (read only), desktop/src/js/encryption.js: the stored cipher is the UTF-8 bytes of the JSON string
//   { v:1, alg:'AES-256-GCM', kdf:'PBKDF2-SHA256', iter, salt, iv, ct, tag }   (all binary fields base64)
//   key = PBKDF2-SHA256(password UTF-8, salt, iter, 32); AES-256-GCM, 12-byte IV, 16-byte tag, NO AAD;
//   plaintext = UTF-8 JSON {content}. A missing `iter` means 210000.
// v5 (read/write): { v:5, kdf:'pbkdf2-sha256', iter:600000, salt, iv, ct, tag }, AAD = UTF-8 of the note id,
//   plaintext = UTF-8 JSON {body}. Fresh 16-byte salt per note (and per password change), fresh 12-byte IV per encrypt.
import { createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2Async = promisify(pbkdf2)

export const V5_ITER = 600_000
const V4_DEFAULT_ITER = 210_000
const V4_ITER_RANGE = [10_000, 2_000_000] as const
const V5_ITER_RANGE = [100_000, 2_000_000] as const

export const WRONG_PASSWORD = 'wrong password'
/** Every failure while opening reads the same, so nothing says which step failed. */
const wrong = (): never => {
  throw new Error(WRONG_PASSWORD)
}

export interface Envelope {
  iter: number
  salt: Buffer
  iv: Buffer
  ct: Buffer
  tag: Buffer
}

export interface Opened {
  text: string
  /** Derived with the envelope's own salt/iter. The caller owns it and must zero it when done. */
  key: Buffer
  salt: Buffer
  iter: number
}

const clamp = (n: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, Math.floor(n)))

const b64 = (v: unknown): Buffer => {
  if (typeof v !== 'string') return wrong()
  return Buffer.from(v, 'base64')
}

/** The envelope comes from a file, so nothing in it is trusted: shapes, sizes and `iter` are all checked. */
export function parseEnvelope(cipher: Uint8Array, format: string | null): Envelope {
  try {
    const o = JSON.parse(Buffer.from(cipher).toString('utf8')) as Record<string, unknown>
    if (typeof o !== 'object' || o === null) return wrong()
    let iter: number
    if (format === 'v4') {
      if (o.v !== 1 || o.alg !== 'AES-256-GCM') return wrong()
      const n = o.iter === undefined || o.iter === 0 ? V4_DEFAULT_ITER : Number(o.iter)
      iter = Number.isFinite(n) ? clamp(n, V4_ITER_RANGE) : V4_DEFAULT_ITER
    } else if (format === 'v5') {
      if (o.v !== 5 || o.kdf !== 'pbkdf2-sha256') return wrong()
      const n = Number(o.iter)
      iter = Number.isFinite(n) ? clamp(n, V5_ITER_RANGE) : V5_ITER
    } else return wrong()
    const env = { iter, salt: b64(o.salt), iv: b64(o.iv), ct: b64(o.ct), tag: b64(o.tag) }
    if (env.iv.length !== 12 || env.tag.length !== 16 || env.salt.length < 8) return wrong()
    return env
  } catch {
    return wrong()
  }
}

/** Always the async KDF: the UI must not freeze while 600k rounds run. */
export function deriveKey(password: string, salt: Uint8Array, iter: number): Promise<Buffer> {
  return pbkdf2Async(password, salt, iter, 32, 'sha256')
}

function gcmOpen(env: Envelope, key: Buffer, aad: Buffer | null): string {
  try {
    const d = createDecipheriv('aes-256-gcm', key, env.iv)
    if (aad) d.setAAD(aad)
    d.setAuthTag(env.tag)
    return Buffer.concat([d.update(env.ct), d.final()]).toString('utf8')
  } catch {
    return wrong()
  }
}

/** Decrypts with a password. Throws Error('wrong password') for anything that does not open. */
export async function openWithPassword(cipher: Uint8Array, format: string | null, id: string, password: string): Promise<Opened> {
  const env = parseEnvelope(cipher, format)
  const key = await deriveKey(password, env.salt, env.iter)
  try {
    const text = gcmOpen(env, key, format === 'v5' ? Buffer.from(id, 'utf8') : null)
    const json = JSON.parse(text) as Record<string, unknown>
    const field = format === 'v5' ? json.body : json.content
    if (typeof field !== 'string') return wrong()
    return { text: field, key, salt: env.salt, iter: env.iter }
  } catch {
    key.fill(0)
    return wrong()
  }
}

/** Decrypts a v5 cipher with an already derived key. */
export function openV5(cipher: Uint8Array, id: string, key: Buffer): string {
  const env = parseEnvelope(cipher, 'v5')
  const json = JSON.parse(gcmOpen(env, key, Buffer.from(id, 'utf8'))) as Record<string, unknown>
  return typeof json.body === 'string' ? json.body : wrong()
}

/** Encrypts a body as a v5 envelope (fresh IV every call). `salt`/`iter` must be the ones `key` was derived with. */
export function sealV5(id: string, body: string, key: Buffer, salt: Uint8Array, iter: number): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(id, 'utf8'))
  const ct = Buffer.concat([c.update(JSON.stringify({ body }), 'utf8'), c.final()])
  const env = {
    v: 5, kdf: 'pbkdf2-sha256', iter,
    salt: Buffer.from(salt).toString('base64'), iv: iv.toString('base64'),
    ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64')
  }
  return Buffer.from(JSON.stringify(env), 'utf8')
}

export const newSalt = (): Buffer => randomBytes(16)
