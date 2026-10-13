// CogNotez 4 Google Drive sync file (`cognotez_sync_backup.json`, desktop/src/js/google-drive-sync.js + encryption.js).
//
// Plain: the flat database export (`exportDataForSync().data`: notes, tags, note_tags, ai_conversations, metadata)
//   plus `_syncMeta`. That is the backup blob format, so it goes through the normal import.
// Encrypted: the same JSON (JSON.stringify, UTF-8) sealed in the envelope
//   { v:1, alg:'AES-256-GCM', kdf:'PBKDF2-SHA256', iter, salt, iv, ct, tag } (binary fields base64)
//   key = PBKDF2-SHA256(passphrase, salt, iter, 32 bytes); 12-byte IV, 16-byte tag, no AAD.
// The envelope is untrusted: `iter` is clamped so a tampered file cannot freeze the app.
import { createDecipheriv } from 'node:crypto'
import { deriveKey } from '../crypto/notecrypto'

export const NEEDS_PASSPHRASE = 'needs passphrase'
export const WRONG_PASSPHRASE = 'wrong passphrase'
const V4_DEFAULT_ITER = 210_000
export const SYNC_ITER_RANGE = [100_000, 2_000_000] as const

export const clampIter = (n: unknown): number => {
  const v = n === undefined || n === 0 ? V4_DEFAULT_ITER : Number(n)
  return Number.isFinite(v) ? Math.min(SYNC_ITER_RANGE[1], Math.max(SYNC_ITER_RANGE[0], Math.floor(v))) : V4_DEFAULT_ITER
}

type Obj = Record<string, unknown>

/** v4's own `isEncrypted` test. */
export const isEncryptedEnvelope = (o: unknown): o is Obj =>
  typeof o === 'object' && o !== null && (o as Obj).v === 1 && (o as Obj).alg === 'AES-256-GCM' && !!(o as Obj).ct && !!(o as Obj).tag

const b64 = (v: unknown): Buffer => Buffer.from(typeof v === 'string' ? v : '', 'base64')

/** Returns the decrypted database blob (parsed JSON). Any failure to open reads as 'wrong passphrase'. */
export async function decryptSyncEnvelope(env: Obj, passphrase: string): Promise<unknown> {
  const iv = b64(env.iv)
  const tag = b64(env.tag)
  const salt = b64(env.salt)
  if (iv.length !== 12 || tag.length !== 16 || salt.length < 8) throw new Error(WRONG_PASSPHRASE)
  const key = await deriveKey(passphrase, salt, clampIter(env.iter))
  try {
    const d = createDecipheriv('aes-256-gcm', key, iv)
    d.setAuthTag(tag)
    return JSON.parse(Buffer.concat([d.update(b64(env.ct)), d.final()]).toString('utf8')) as unknown
  } catch {
    throw new Error(WRONG_PASSPHRASE)
  } finally {
    key.fill(0)
  }
}
