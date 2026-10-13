// Google sign-in for Drive sync: loopback redirect + PKCE (S256) + random state, tokens kept in the secret store.
// Electron-free: the browser, the file dialog and the clock are injected so the whole flow can be tested.
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { GoogleStatus } from '../../shared/api'
import type { Secrets } from '../secrets'
import { SyncError } from './transport'

export const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email'
export const EXPIRED_MESSAGE = 'Google sign-in expired. Reconnect in Settings.'
const NOT_CONNECTED = 'Google account is not connected. Connect it in Settings.'
const REFRESH_MARGIN_MS = 60_000
const CONNECT_TIMEOUT_MS = 5 * 60_000

export interface OAuthClient {
  clientId: string
  clientSecret: string
}

export interface GoogleAuthDeps {
  secrets: Pick<Secrets, 'get' | 'set' | 'delete' | 'has'>
  settings: { get(key: string): unknown; set(key: string, value: unknown): void }
  /** Opens the consent URL in the system browser. */
  openUrl(url: string): Promise<void>
  /** Shows a file dialog and returns the picked path, or null on cancel. */
  pickClientFile(): Promise<string | null>
  readFile(path: string): string
  /** The client baked in at build time; both fields may be empty. */
  builtIn?: OAuthClient
  /** Dev-only override: `<base>/auth`, `<base>/token`, `<base>/revoke`. */
  oauthBase?: string
  fetch?: typeof fetch
  now?: () => number
  timeoutMs?: number
}

interface StoredTokens {
  refresh_token: string
  access_token: string
  expires_at: number
  email: string
}

const b64url = (b: Buffer): string => b.toString('base64url')

/** RFC 7636: a 43-char verifier and its S256 challenge. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32))
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
}

function emailFromIdToken(idToken: unknown): string {
  if (typeof idToken !== 'string') return ''
  try {
    // Straight from the token endpoint over TLS, so the signature is not checked.
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as { email?: unknown }
    return typeof payload.email === 'string' ? payload.email : ''
  } catch {
    return ''
  }
}

const PAGE = (msg: string): string =>
  `<!doctype html><meta charset="utf-8"><title>CogNotez</title><body style="font:16px system-ui;max-width:28rem;margin:20vh auto;padding:0 1rem"><h2>CogNotez</h2><p>${msg}</p>`

export function createGoogleAuth(deps: GoogleAuthDeps) {
  const doFetch = deps.fetch ?? fetch
  const now = deps.now ?? Date.now
  const base = deps.oauthBase?.replace(/\/+$/, '')
  const authUrl = base ? `${base}/auth` : 'https://accounts.google.com/o/oauth2/v2/auth'
  const tokenUrl = base ? `${base}/token` : 'https://oauth2.googleapis.com/token'
  const revokeUrl = base ? `${base}/revoke` : 'https://oauth2.googleapis.com/revoke'

  /** An imported client wins over the built-in one. */
  function client(): OAuthClient | null {
    const id = deps.settings.get('sys.google_client_id')
    if (typeof id === 'string' && id) return { clientId: id, clientSecret: deps.secrets.get('google_client_secret') ?? '' }
    return deps.builtIn?.clientId ? deps.builtIn : null
  }

  const readTokens = (): StoredTokens | null => {
    const raw = deps.secrets.get('google_oauth_tokens')
    if (!raw) return null
    try {
      const t = JSON.parse(raw) as Partial<StoredTokens>
      if (typeof t.refresh_token !== 'string' || typeof t.access_token !== 'string' || typeof t.expires_at !== 'number') return null
      return { refresh_token: t.refresh_token, access_token: t.access_token, expires_at: t.expires_at, email: typeof t.email === 'string' ? t.email : '' }
    } catch {
      return null
    }
  }

  async function tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
    const c = client()
    if (!c) throw new SyncError('No Google OAuth client is set up. Import a client file in Settings.')
    const body = new URLSearchParams({ ...params, client_id: c.clientId })
    if (c.clientSecret) body.set('client_secret', c.clientSecret)
    let res: Response
    try {
      res = await doFetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
    } catch {
      throw new SyncError('Could not reach Google. Check your internet connection.')
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      if (json['error'] === 'invalid_grant') throw new SyncError(EXPIRED_MESSAGE)
      const detail = typeof json['error_description'] === 'string' ? json['error_description'] : typeof json['error'] === 'string' ? json['error'] : `HTTP ${res.status}`
      throw new SyncError(`Google sign-in failed: ${detail}`)
    }
    return json
  }

  let inflightConnect: Promise<{ email: string }> | null = null

  async function runConnect(): Promise<{ email: string }> {
    const c = client()
    if (!c) throw new SyncError('No Google OAuth client is set up. Import a client file in Settings.')
    const { verifier, challenge } = pkcePair()
    const state = b64url(randomBytes(24))
    let server: Server | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let redirectUri = ''
    try {
      const code = await new Promise<string>((resolve, reject) => {
        server = createServer((req, res) => {
          const u = new URL(req.url ?? '/', 'http://127.0.0.1')
          const reply = (status: number, msg: string): void => {
            res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            res.end(PAGE(msg))
          }
          if (u.pathname !== '/') return reply(404, 'Not found.')
          if (u.searchParams.get('state') !== state) return reply(400, 'This sign-in link does not match the request CogNotez made. Close this tab and try again.')
          const err = u.searchParams.get('error')
          const got = u.searchParams.get('code')
          if (err) {
            reply(200, 'Sign-in was cancelled. You can close this tab.')
            return reject(new Error(err === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in failed: ${err}`))
          }
          if (!got) return reply(400, 'No sign-in code received.')
          reply(200, 'You are connected. You can close this tab and go back to CogNotez.')
          resolve(got)
        })
        server.on('error', reject)
        timer = setTimeout(() => reject(new Error('Google sign-in timed out. Try again.')), deps.timeoutMs ?? CONNECT_TIMEOUT_MS)
        server.listen(0, '127.0.0.1', () => {
          const port = (server!.address() as { port: number }).port
          const url = new URL(authUrl)
          url.search = new URLSearchParams({
            client_id: c.clientId,
            redirect_uri: `http://127.0.0.1:${port}`,
            response_type: 'code',
            scope: SCOPES,
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            access_type: 'offline',
            prompt: 'consent'
          }).toString()
          redirectUri = `http://127.0.0.1:${port}`
          deps.openUrl(url.toString()).catch(reject)
        })
      })
      const j = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri })
      const refresh = j['refresh_token']
      const access = j['access_token']
      if (typeof refresh !== 'string' || typeof access !== 'string') throw new SyncError('Google did not return a refresh token. Remove CogNotez from your Google account permissions and try again.')
      const email = emailFromIdToken(j['id_token'])
      const tokens: StoredTokens = {
        refresh_token: refresh,
        access_token: access,
        expires_at: now() + (typeof j['expires_in'] === 'number' ? j['expires_in'] : 3600) * 1000,
        email
      }
      deps.secrets.set('google_oauth_tokens', JSON.stringify(tokens))
      return { email }
    } finally {
      clearTimeout(timer)
      server?.close()
      server?.closeAllConnections()
    }
  }
  let refreshing: Promise<string> | null = null

  return {
    /** Opens the browser and resolves with the account once the user approved. One flow at a time. */
    connect(): Promise<{ email: string }> {
      inflightConnect ??= runConnect().finally(() => (inflightConnect = null))
      return inflightConnect
    },

    /** A valid access token; refreshes when it expires within 60 s (or when `force` is set after a 401). */
    async getAccessToken(force = false): Promise<string> {
      const tokens = readTokens()
      if (!tokens) throw new SyncError(NOT_CONNECTED)
      if (!force && tokens.expires_at - now() > REFRESH_MARGIN_MS) return tokens.access_token
      refreshing ??= (async () => {
        const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
        const access = j['access_token']
        if (typeof access !== 'string') throw new SyncError('Google sign-in failed: no access token returned.')
        const next: StoredTokens = {
          ...tokens,
          access_token: access,
          expires_at: now() + (typeof j['expires_in'] === 'number' ? j['expires_in'] : 3600) * 1000,
          refresh_token: typeof j['refresh_token'] === 'string' ? j['refresh_token'] : tokens.refresh_token
        }
        deps.secrets.set('google_oauth_tokens', JSON.stringify(next))
        return access
      })().finally(() => (refreshing = null))
      return refreshing
    },

    /** Best-effort revoke, then forget the tokens. */
    async disconnect(): Promise<void> {
      const tokens = readTokens()
      deps.secrets.delete('google_oauth_tokens')
      if (!tokens) return
      try {
        await doFetch(revokeUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokens.refresh_token }),
          signal: AbortSignal.timeout(5000)
        })
      } catch {
        /* offline: the local tokens are gone either way */
      }
    },

    status(): GoogleStatus {
      const tokens = readTokens()
      return { connected: tokens !== null, email: tokens ? tokens.email || null : null, clientConfigured: client() !== null }
    },

    email: (): string | null => readTokens()?.email || null,

    /** Reads an "installed app" client JSON (the file CogNotez 4 used). False when the dialog is cancelled. */
    async importClient(): Promise<boolean> {
      const path = await deps.pickClientFile()
      if (!path) return false
      let parsed: unknown
      try {
        parsed = JSON.parse(deps.readFile(path))
      } catch {
        throw new SyncError('That file is not valid JSON.')
      }
      const inst = (parsed as { installed?: unknown } | null)?.installed as
        | { client_id?: unknown; client_secret?: unknown; redirect_uris?: unknown }
        | undefined
      if (!inst || typeof inst !== 'object') throw new SyncError('This is not a Desktop-app OAuth client file (it has no "installed" section).')
      const uris = Array.isArray(inst.redirect_uris) ? inst.redirect_uris : []
      if (typeof inst.client_id !== 'string' || !inst.client_id) throw new SyncError('The client file has no client_id.')
      if (!uris.some((u) => typeof u === 'string' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u))) {
        throw new SyncError('The client file must allow the redirect http://localhost (use a Desktop-app client).')
      }
      deps.settings.set('sys.google_client_id', inst.client_id)
      if (typeof inst.client_secret === 'string' && inst.client_secret) deps.secrets.set('google_client_secret', inst.client_secret)
      else deps.secrets.delete('google_client_secret')
      return true
    }
  }
}

export type GoogleAuth = ReturnType<typeof createGoogleAuth>
