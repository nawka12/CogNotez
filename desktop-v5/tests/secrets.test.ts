import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSecrets } from '../src/main/secrets'
import type { Cipher } from '../src/main/secrets'

// Fake safeStorage: reversible, and visibly not plaintext.
const fake = (available = true, backend = 'gnome_libsecret'): Cipher => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...Buffer.from(s)].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString(),
  getSelectedStorageBackend: () => backend as ReturnType<NonNullable<Cipher['getSelectedStorageBackend']>>
})

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cognotez-sec-'))
  file = join(dir, 'secrets.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('secrets', () => {
  it('stores ciphertext (not plaintext) in a 0600 file and round-trips via main-only get', () => {
    const s = createSecrets(file, fake())
    expect(s.has('openrouter_api_key')).toBe(false)
    s.set('openrouter_api_key', 'sk-secret')
    expect(s.has('openrouter_api_key')).toBe(true)
    expect(s.get('openrouter_api_key')).toBe('sk-secret')
    expect(readFileSync(file, 'utf8')).not.toContain('sk-secret')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    s.delete('openrouter_api_key')
    expect(s.has('openrouter_api_key')).toBe(false)
    expect(s.get('openrouter_api_key')).toBeNull()
  })

  it('refuses to store when encryption is unavailable', () => {
    expect(() => createSecrets(file, fake(false)).set('sync_dek', 'x')).toThrow(/unavailable/)
  })

  it('reports security status per platform/backend', () => {
    expect(createSecrets(file, fake(true, 'gnome_libsecret'), 'linux').status()).toEqual({ backend: 'gnome_libsecret', secure: true })
    expect(createSecrets(file, fake(true, 'basic_text'), 'linux').status()).toEqual({ backend: 'basic_text', secure: false })
    expect(createSecrets(file, fake(false), 'linux').status().secure).toBe(false)
    expect(createSecrets(file, fake(true), 'darwin').status()).toEqual({ backend: 'keychain', secure: true })
    expect(createSecrets(file, fake(true), 'win32').status()).toEqual({ backend: 'dpapi', secure: true })
  })

  it('exposes no renderer-visible getter shape beyond the main-only one', () => {
    expect(Object.keys(createSecrets(file, fake())).sort()).toEqual(['delete', 'get', 'has', 'set', 'status'])
  })
})
