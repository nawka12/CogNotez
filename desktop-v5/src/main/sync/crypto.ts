// Sync v2 meta.json, key wrapping and file encryption (docs/v5/sync-v2.md §4, §5). Pure and Electron-free.
// Randomness is injectable so the fixtures in docs/v5/sync-v2-fixtures can use fixed salts and IVs.
import { createCipheriv, createDecipheriv, createHmac, pbkdf2, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { DEVICE_RE, sortedJson } from './format'

const pbkdf2Async = promisify(pbkdf2)

export type Rand = (n: number) => Buffer
export const WRAP_AAD = 'cognotez-sync-v2-dek'
export const ITER = 600_000
export const ITER_MIN = 100_000
export const ITER_MAX = 2_000_000
export const PASSPHRASE_MIN = 8
export const WRONG_PASSPHRASE = 'wrong passphrase'

export interface EncInfo {
  kdf: 'pbkdf2-sha256'
  iter: number
  salt: string
  wrap: { iv: string; ct: string; tag: string }
}

export interface Meta {
  format: 2
  created: number
  createdBy: string
  enc: EncInfo | null
}

export class MetaError extends Error {}

const b64len = (v: unknown, n: number): string => {
  if (typeof v !== 'string' || Buffer.from(v, 'base64').length !== n) throw new MetaError('meta.json is malformed')
  return v
}

export function parseMeta(bytes: Uint8Array): Meta {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(Buffer.from(bytes).toString('utf8')) as Record<string, unknown>
  } catch {
    throw new MetaError('meta.json is not valid JSON')
  }
  if (typeof o !== 'object' || o === null) throw new MetaError('meta.json is malformed')
  if (typeof o.format === 'number' && o.format > 2) throw new MetaError('This sync location was created by a newer CogNotez. Update this app to sync with it.')
  if (o.format !== 2) throw new MetaError('This sync location uses an older sync format that CogNotez 5 cannot read.')
  if (!Number.isSafeInteger(o.created) || typeof o.createdBy !== 'string' || !DEVICE_RE.test(o.createdBy)) throw new MetaError('meta.json is malformed')
  let enc: EncInfo | null = null
  if (o.enc !== null) {
    const e = o.enc as Record<string, unknown>
    const w = (e?.wrap ?? null) as Record<string, unknown> | null
    if (typeof e !== 'object' || e === null || e.kdf !== 'pbkdf2-sha256' || typeof e.iter !== 'number' || !w) throw new MetaError('meta.json is malformed')
    enc = {
      kdf: 'pbkdf2-sha256',
      iter: e.iter,
      salt: b64len(e.salt, 16),
      wrap: { iv: b64len(w.iv, 12), ct: b64len(w.ct, 32), tag: b64len(w.tag, 16) }
    }
  }
  return { format: 2, created: o.created as number, createdBy: o.createdBy, enc }
}

export const serializeMeta = (m: Meta): Uint8Array => Buffer.from(sortedJson(m), 'utf8')

/** KEK = PBKDF2-SHA256(passphrase, salt, clamp(iter, 100k, 2M), 32). Always the async KDF. */
export function deriveKek(passphrase: string, salt: Uint8Array, iter: number): Promise<Buffer> {
  const n = Number.isFinite(iter) ? Math.min(ITER_MAX, Math.max(ITER_MIN, Math.floor(iter))) : ITER
  return pbkdf2Async(Buffer.from(passphrase, 'utf8'), salt, n, 32, 'sha256')
}

function gcmSeal(key: Uint8Array, iv: Uint8Array, plain: Uint8Array, aad: string): { ct: Buffer; tag: Buffer } {
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([c.update(plain), c.final()])
  return { ct, tag: c.getAuthTag() }
}

function gcmOpen(key: Uint8Array, iv: Uint8Array, ct: Uint8Array, tag: Uint8Array, aad: string): Buffer {
  const d = createDecipheriv('aes-256-gcm', key, iv)
  d.setAAD(Buffer.from(aad, 'utf8'))
  d.setAuthTag(tag)
  return Buffer.concat([d.update(ct), d.final()])
}

/** A fresh DEK wrapped under a passphrase. The caller owns `dek`. */
export async function newEnc(passphrase: string, rand: Rand = randomBytes, iter = ITER): Promise<{ enc: EncInfo; dek: Buffer }> {
  const salt = rand(16)
  const iv = rand(12)
  const dek = rand(32)
  const kek = await deriveKek(passphrase, salt, iter)
  try {
    const { ct, tag } = gcmSeal(kek, iv, dek, WRAP_AAD)
    const enc: EncInfo = {
      kdf: 'pbkdf2-sha256', iter, salt: salt.toString('base64'),
      wrap: { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: tag.toString('base64') }
    }
    return { enc, dek }
  } finally {
    kek.fill(0)
  }
}

/** Throws Error('wrong passphrase') when the wrap does not open. */
export async function unwrapDek(passphrase: string, enc: EncInfo): Promise<Buffer> {
  const kek = await deriveKek(passphrase, Buffer.from(enc.salt, 'base64'), enc.iter)
  try {
    const b = (s: string): Buffer => Buffer.from(s, 'base64')
    const dek = gcmOpen(kek, b(enc.wrap.iv), b(enc.wrap.ct), b(enc.wrap.tag), WRAP_AAD)
    if (dek.length !== 32) throw new Error(WRONG_PASSPHRASE)
    return dek
  } catch {
    throw new Error(WRONG_PASSPHRASE)
  } finally {
    kek.fill(0)
  }
}

/** iv(12) ‖ ciphertext ‖ tag(16), AES-256-GCM with AAD = the file path without `.bin`. */
export function encryptBlob(dek: Uint8Array, aad: string, plain: Uint8Array, rand: Rand = randomBytes): Uint8Array {
  const iv = rand(12)
  const { ct, tag } = gcmSeal(dek, iv, plain, aad)
  return Buffer.concat([iv, ct, tag])
}

/** Throws when the data was tampered with, moved to another name, or sealed with another key. */
export function decryptBlob(dek: Uint8Array, aad: string, data: Uint8Array): Buffer {
  if (data.length < 28) throw new Error('encrypted file is truncated')
  const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  return gcmOpen(dek, b.subarray(0, 12), b.subarray(12, b.length - 16), b.subarray(b.length - 16), aad)
}

/** Encrypted media key: hex(HMAC-SHA256(DEK, "media:" + sha256hex)). */
export const mediaKey = (dek: Uint8Array, sha: string): string => createHmac('sha256', dek).update(`media:${sha}`, 'utf8').digest('hex')
