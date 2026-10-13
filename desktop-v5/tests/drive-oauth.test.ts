import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createGoogleAuth, EXPIRED_MESSAGE, pkcePair } from '../src/main/sync/google-auth'
import type { GoogleAuthDeps } from '../src/main/sync/google-auth'
import { start } from './fixtures/fake-drive-server.mjs'
import type { FakeDrive } from './fixtures/fake-drive-server.mjs'

let fake: FakeDrive
beforeAll(async () => {
  fake = await start(0)
})
afterAll(() => fake.close())

function rig(over: Partial<GoogleAuthDeps> = {}, clientFile?: string) {
  const secrets = new Map<string, string>()
  const settings = new Map<string, unknown>()
  const opened: string[] = []
  const deps: GoogleAuthDeps = {
    secrets: {
      get: (n) => secrets.get(n) ?? null,
      set: (n, v) => void secrets.set(n, v),
      delete: (n) => void secrets.delete(n),
      has: (n) => secrets.has(n)
    },
    settings: { get: (k) => settings.get(k), set: (k, v) => void settings.set(k, v) },
    // Stands in for the browser: follows the fake consent page's redirect back to the loopback server.
    openUrl: async (url) => {
      opened.push(url)
      await fetch(url)
    },
    pickClientFile: async () => (clientFile ? 'client.json' : null),
    readFile: () => clientFile ?? '',
    builtIn: { clientId: 'built-in-id', clientSecret: 'built-in-secret' },
    oauthBase: fake.oauth,
    ...over
  }
  return { auth: createGoogleAuth(deps), secrets, settings, opened }
}

describe('PKCE', () => {
  it('makes a valid S256 pair', () => {
    const { verifier, challenge } = pkcePair()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'))
    expect(pkcePair().verifier).not.toBe(verifier)
  })
})

describe('connect', () => {
  it('signs in through the loopback redirect and stores the tokens', async () => {
    const { auth, secrets, opened } = rig()
    expect(auth.status()).toEqual({ connected: false, email: null, clientConfigured: true })
    const r = await auth.connect()
    expect(r.email).toBe('tester@example.test')
    expect(auth.status()).toEqual({ connected: true, email: 'tester@example.test', clientConfigured: true })
    const saved = JSON.parse(secrets.get('google_oauth_tokens')!) as Record<string, unknown>
    expect(saved).toMatchObject({ refresh_token: 'rt-fake', email: 'tester@example.test' })
    const u = new URL(opened[0]!)
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.file openid email')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(new URL(u.searchParams.get('redirect_uri')!).hostname).toBe('127.0.0.1')
    expect(fake.state.tokenRequests.at(-1)).toMatchObject({ grant_type: 'authorization_code', client_id: 'built-in-id', client_secret: 'built-in-secret' })
  })

  it('rejects a callback with the wrong state and keeps waiting for the right one', async () => {
    let wrongStatus = 0
    let wrongPath = 0
    const { auth } = rig({
      openUrl: async (url) => {
        const redirect = new URL(url).searchParams.get('redirect_uri')!
        wrongStatus = (await fetch(`${redirect}/?code=evil&state=wrong`)).status
        wrongPath = (await fetch(`${redirect}/favicon.ico`)).status
        await fetch(url)
      }
    })
    expect((await auth.connect()).email).toBe('tester@example.test')
    expect(wrongStatus).toBe(400)
    expect(wrongPath).toBe(404)
  })

  it('times out after the configured time and frees the port', async () => {
    let redirect = ''
    const { auth, secrets } = rig({
      timeoutMs: 60,
      openUrl: async (url) => void (redirect = new URL(url).searchParams.get('redirect_uri')!)
    })
    await expect(auth.connect()).rejects.toThrow(/timed out/)
    expect(secrets.has('google_oauth_tokens')).toBe(false)
    await expect(fetch(redirect)).rejects.toThrow()
  })

  it('reports a cancelled consent screen', async () => {
    const { auth } = rig({
      openUrl: async (url) => {
        const p = new URL(url).searchParams
        await fetch(`${p.get('redirect_uri')}/?error=access_denied&state=${p.get('state')}`)
      }
    })
    await expect(auth.connect()).rejects.toThrow('Google sign-in was cancelled.')
  })

  it('gives up on a token endpoint that never answers', async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_, rej) => init.signal?.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch
    const { auth, secrets } = rig({ fetch: hang, requestTimeoutMs: 80 })
    secrets.set('google_oauth_tokens', JSON.stringify({ refresh_token: 'rt-fake', access_token: 'a', expires_at: 1, email: 'x@y' }))
    const started = Date.now()
    await expect(auth.getAccessToken()).rejects.toThrow('Google sign-in stopped responding. Try again in a moment.')
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('refuses to start without a client', async () => {
    const { auth } = rig({ builtIn: { clientId: '', clientSecret: '' } })
    expect(auth.status().clientConfigured).toBe(false)
    await expect(auth.connect()).rejects.toThrow(/Import a client file/)
  })
})

describe('access tokens', () => {
  it('returns the stored token until 60 s before expiry, then refreshes', async () => {
    let clock = 1_000_000
    fake.state.expiresIn = 3600
    const { auth } = rig({ now: () => clock })
    await auth.connect()
    const first = await auth.getAccessToken()
    const before = fake.state.tokenRequests.length
    expect(await auth.getAccessToken()).toBe(first)
    expect(fake.state.tokenRequests).toHaveLength(before)

    clock += (3600 - 59) * 1000 // 59 s left
    const second = await auth.getAccessToken()
    expect(second).not.toBe(first)
    expect(fake.state.tokenRequests.at(-1)).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'rt-fake' })
    expect(await auth.getAccessToken()).toBe(second) // stored, not refreshed again
  })

  it('refreshes on demand and shares one refresh between concurrent callers', async () => {
    const { auth } = rig()
    await auth.connect()
    const before = fake.state.tokenRequests.length
    const [a, b] = await Promise.all([auth.getAccessToken(true), auth.getAccessToken(true)])
    expect(a).toBe(b)
    expect(fake.state.tokenRequests).toHaveLength(before + 1)
  })

  it('turns invalid_grant into the human message', async () => {
    const { auth } = rig()
    await auth.connect()
    fake.state.refreshInvalid = true
    try {
      await expect(auth.getAccessToken(true)).rejects.toThrow(EXPIRED_MESSAGE)
      expect(EXPIRED_MESSAGE).toBe('Google sign-in expired. Reconnect in Settings.')
    } finally {
      fake.state.refreshInvalid = false
    }
  })

  it('says so when no account is connected', async () => {
    await expect(rig().auth.getAccessToken()).rejects.toThrow(/not connected/)
  })

  it('disconnect revokes (best effort) and forgets the tokens', async () => {
    const { auth, secrets } = rig()
    await auth.connect()
    await auth.disconnect()
    expect(secrets.has('google_oauth_tokens')).toBe(false)
    expect(fake.state.revoked.at(-1)).toBe('rt-fake')
    expect(auth.status().connected).toBe(false)
    const offline = rig({ fetch: (async () => { throw new TypeError('offline') }) as unknown as typeof fetch })
    offline.secrets.set('google_oauth_tokens', JSON.stringify({ refresh_token: 'r', access_token: 'a', expires_at: 1, email: 'x@y' }))
    await offline.auth.disconnect()
    expect(offline.secrets.has('google_oauth_tokens')).toBe(false)
  })
})

describe('importClient', () => {
  const file = (installed: unknown): string => JSON.stringify({ installed })
  const good = { client_id: 'imp-id.apps.googleusercontent.com', client_secret: 'imp-secret', redirect_uris: ['http://localhost'] }

  it('stores the id as a setting and the secret in the secret store', async () => {
    const { auth, settings, secrets } = rig({ builtIn: { clientId: '', clientSecret: '' } }, file(good))
    expect(await auth.importClient()).toBe(true)
    expect(settings.get('sys.google_client_id')).toBe(good.client_id)
    expect(secrets.get('google_client_secret')).toBe('imp-secret')
    expect(auth.status().clientConfigured).toBe(true)
  })
  it('returns false when the dialog is cancelled', async () => {
    expect(await rig().auth.importClient()).toBe(false)
  })
  it('rejects a web client, a file without a localhost redirect, and junk', async () => {
    await expect(rig({}, JSON.stringify({ web: good })).auth.importClient()).rejects.toThrow(/Desktop-app/)
    await expect(rig({}, file({ ...good, redirect_uris: ['https://example.com/cb'] })).auth.importClient()).rejects.toThrow(/http:\/\/localhost/)
    await expect(rig({}, 'nope').auth.importClient()).rejects.toThrow(/not valid JSON/)
  })
  it('prefers an imported client over the built-in one', async () => {
    const { auth } = rig({}, file(good))
    await auth.importClient()
    await auth.connect()
    expect(fake.state.tokenRequests.at(-1)).toMatchObject({ client_id: good.client_id, client_secret: 'imp-secret' })
  })
})
