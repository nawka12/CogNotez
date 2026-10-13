// API keys, OAuth tokens and the sync DEK. Stored as base64 of safeStorage ciphertext in a 0600 file.
// The renderer can only set / has / delete; `get` exists here for main-process features only.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { SafeStorage } from 'electron'
import { SECRET_NAMES } from '../shared/api'
import type { SecretName, SecretsStatus } from '../shared/api'

export type Cipher = Pick<SafeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'> & {
  getSelectedStorageBackend?: SafeStorage['getSelectedStorageBackend']
}

type Blob = Partial<Record<SecretName, string>>

export function createSecrets(file: string, cipher: Cipher, platform: NodeJS.Platform = process.platform) {
  const read = (): Blob => {
    if (!existsSync(file)) return {}
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('secrets file is corrupt')
    const out: Blob = {}
    for (const n of SECRET_NAMES) if (typeof (parsed as Blob)[n] === 'string') out[n] = (parsed as Blob)[n]
    return out
  }
  const write = (b: Blob): void => {
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(b), { mode: 0o600 })
    chmodSync(tmp, 0o600)
    renameSync(tmp, file)
  }

  return {
    set(name: SecretName, value: string): void {
      if (!cipher.isEncryptionAvailable()) throw new Error('secure storage is unavailable')
      write({ ...read(), [name]: cipher.encryptString(value).toString('base64') })
    },
    has: (name: SecretName): boolean => read()[name] !== undefined,
    delete(name: SecretName): void {
      const b = read()
      delete b[name]
      write(b)
    },
    /** Main-only. Never wire this to IPC. */
    get(name: SecretName): string | null {
      const enc = read()[name]
      return enc === undefined ? null : cipher.decryptString(Buffer.from(enc, 'base64'))
    },
    status(): SecretsStatus {
      const available = cipher.isEncryptionAvailable()
      if (platform === 'linux') {
        const backend = cipher.getSelectedStorageBackend?.() ?? 'unknown'
        return { backend, secure: available && backend !== 'basic_text' }
      }
      return { backend: platform === 'darwin' ? 'keychain' : 'dpapi', secure: available }
    }
  }
}

export type Secrets = ReturnType<typeof createSecrets>
