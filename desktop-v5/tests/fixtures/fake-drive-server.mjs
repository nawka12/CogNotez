// An in-memory Google Drive v3 subset plus a fake OAuth endpoint, for tests and e2e.
//   node tests/fixtures/fake-drive-server.mjs [port]     (default 11998, prints "listening <port>")
//   import { start } from './fake-drive-server.mjs'       (start(port) resolves { port, url, drive, oauth, state, close, ... })
//
// Drive (base = url):  GET/POST /drive/v3/files, GET/PATCH/DELETE /drive/v3/files/:id[?alt=media],
//   POST /upload/drive/v3/files?uploadType=multipart, GET /drive/v3/changes/startPageToken, GET /drive/v3/changes.
//   Queries understand: name = '..', '<id>' in parents, trashed = false, mimeType = '..', appProperties has { key='k' and value='v' }.
// OAuth (base = oauth): GET /auth (redirects to redirect_uri?code&state, checks PKCE on /token), POST /token, POST /revoke.
// Faults: fail(status, count, match?) answers the next `count` Drive requests whose "METHOD path" matches with that status.
//         expireAccessTokens() makes every issued access token answer 401; state.refreshInvalid = true makes refresh answer invalid_grant.
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const FOLDER = 'application/vnd.google-apps.folder'

/** Splits a Drive query on top-level `and` (outside quotes and braces) and evaluates each clause on a file. */
export function parseQuery(q) {
  const clauses = []
  let depth = 0
  let quote = false
  let cur = ''
  for (let i = 0; i < q.length; i++) {
    const c = q[i]
    if (quote) {
      cur += c
      if (c === '\\') cur += q[++i] ?? ''
      else if (c === "'") quote = false
      continue
    }
    if (c === "'") quote = true
    else if (c === '{') depth++
    else if (c === '}') depth--
    if (depth === 0 && !quote && /^\s+and\s+/.test(q.slice(i)) && /\s/.test(c)) {
      clauses.push(cur.trim())
      cur = ''
      i += /^\s+and\s+/.exec(q.slice(i))[0].length - 1
      continue
    }
    cur += c
  }
  if (cur.trim()) clauses.push(cur.trim())
  const str = "'((?:[^'\\\\]|\\\\.)*)'"
  const unq = (s) => s.replace(/\\(.)/g, '$1')
  return clauses.map((c) => {
    let m
    if ((m = new RegExp(`^name = ${str}$`).exec(c))) return (f) => f.name === unq(m[1])
    if ((m = new RegExp(`^${str} in parents$`).exec(c))) return (f) => f.parents.includes(unq(m[1]))
    if ((m = /^trashed = (true|false)$/.exec(c))) return (f) => f.trashed === (m[1] === 'true')
    if ((m = new RegExp(`^mimeType = ${str}$`).exec(c))) return (f) => f.mimeType === unq(m[1])
    if ((m = new RegExp(`^appProperties has \\{ key=${str} and value=${str} \\}$`).exec(c))) return (f) => f.appProperties[unq(m[1])] === unq(m[2])
    throw new Error(`fake drive: unsupported query clause: ${c}`)
  })
}

function parseMultipart(buf, contentType) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType)?.[1] ?? /boundary=([^;]+)/.exec(contentType)?.[1]
  if (!boundary) throw new Error('no multipart boundary')
  const delim = Buffer.from(`--${boundary}`)
  const parts = []
  let pos = buf.indexOf(delim)
  while (pos >= 0) {
    const start = pos + delim.length
    if (buf.subarray(start, start + 2).toString() === '--') break
    const next = buf.indexOf(delim, start)
    if (next < 0) break
    const part = buf.subarray(start + 2, next - 2) // skip the CRLF after the delimiter and before the next one
    const split = part.indexOf('\r\n\r\n')
    parts.push({ headers: part.subarray(0, split).toString(), body: part.subarray(split + 4) })
    pos = next
  }
  return parts
}

export function start(port = 11998) {
  let seq = 0
  let counter = 0
  const files = new Map() // id -> { id, name, mimeType, parents, appProperties, createdTime, trashed, bytes }
  const changes = [] // { seq, fileId, removed }
  const accessTokens = new Set()
  const codes = new Map() // code -> { challenge, redirect }
  const state = {
    email: 'tester@example.test',
    expiresIn: 3600,
    refreshInvalid: false,
    requests: [], // "METHOD path" of every Drive request
    tokenRequests: [], // the form of every /token request
    revoked: [],
    uploads: 0
  }
  const faults = []
  const nextId = () => `f${++counter}${randomBytes(3).toString('hex')}`
  const nextTime = () => new Date(Date.UTC(2026, 0, 1) + ++counter * 1000).toISOString() // strictly increasing

  const meta = (f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    parents: f.parents,
    appProperties: f.appProperties,
    createdTime: f.createdTime,
    trashed: f.trashed,
    ...(f.bytes ? { size: String(f.bytes.length) } : {})
  })
  const touch = (f, removed = false) => changes.push({ seq: ++seq, fileId: f.id, removed })
  const add = (name, mimeType, parents, appProperties, bytes) => {
    const f = { id: nextId(), name, mimeType, parents: parents.map((p) => (p === 'root' ? 'root' : p)), appProperties, createdTime: nextTime(), trashed: false, bytes }
    files.set(f.id, f)
    touch(f)
    return f
  }

  const issue = () => {
    const t = `at-${randomBytes(6).toString('hex')}`
    accessTokens.add(t)
    return t
  }

  const send = (res, status, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body)
    res.writeHead(status, { 'content-type': isBuf ? 'application/octet-stream' : 'application/json', ...headers })
    res.end(isBuf ? body : JSON.stringify(body))
  }
  const gErr = (res, status, message, reason = 'error') => send(res, status, { error: { code: status, message, errors: [{ reason }] } })

  async function body(req) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    return Buffer.concat(chunks)
  }

  function oauth(req, res, u, raw) {
    const path = u.pathname.replace(/^\/oauth/, '')
    if (path === '/auth') {
      const p = u.searchParams
      const redirect = p.get('redirect_uri')
      if (!redirect || p.get('code_challenge_method') !== 'S256' || !p.get('code_challenge') || !p.get('state') || p.get('response_type') !== 'code') {
        return send(res, 400, { error: 'invalid_request' })
      }
      const code = `code-${randomBytes(6).toString('hex')}`
      codes.set(code, { challenge: p.get('code_challenge'), redirect })
      const to = new URL(redirect)
      to.searchParams.set('code', code)
      to.searchParams.set('state', p.get('state'))
      return send(res, 302, {}, { location: to.toString() })
    }
    if (path === '/revoke') {
      state.revoked.push(new URLSearchParams(raw.toString()).get('token'))
      return send(res, 200, {})
    }
    if (path === '/token') {
      const f = Object.fromEntries(new URLSearchParams(raw.toString()))
      state.tokenRequests.push(f)
      if (f.grant_type === 'authorization_code') {
        const c = codes.get(f.code)
        codes.delete(f.code)
        const challenge = createHash('sha256').update(f.code_verifier ?? '').digest('base64url')
        if (!c || c.challenge !== challenge || c.redirect !== f.redirect_uri) return send(res, 400, { error: 'invalid_grant', error_description: 'bad code or verifier' })
        const claims = Buffer.from(JSON.stringify({ email: state.email, sub: '1' })).toString('base64url')
        return send(res, 200, {
          access_token: issue(),
          refresh_token: 'rt-fake',
          expires_in: state.expiresIn,
          id_token: `x.${claims}.y`,
          token_type: 'Bearer'
        })
      }
      if (f.grant_type === 'refresh_token') {
        if (state.refreshInvalid || f.refresh_token !== 'rt-fake') return send(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
        return send(res, 200, { access_token: issue(), expires_in: state.expiresIn, token_type: 'Bearer' })
      }
      return send(res, 400, { error: 'unsupported_grant_type' })
    }
    return send(res, 404, { error: 'not found' })
  }

  async function drive(req, res, u, raw) {
    const key = `${req.method} ${u.pathname}`
    state.requests.push(key)
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
    if (!bearer || !accessTokens.has(bearer)) return gErr(res, 401, 'Invalid Credentials', 'authError')
    const fi = faults.findIndex((f) => f.count > 0 && (!f.match || f.match.test(key)))
    if (fi >= 0) {
      faults[fi].count--
      return gErr(res, faults[fi].status, `injected ${faults[fi].status}`, faults[fi].reason ?? 'backendError')
    }
    const p = u.searchParams
    const m = req.method

    if (u.pathname === '/drive/v3/changes/startPageToken' && m === 'GET') return send(res, 200, { startPageToken: String(seq) })

    if (u.pathname === '/drive/v3/changes' && m === 'GET') {
      const after = Number(p.get('pageToken'))
      if (!Number.isInteger(after)) return gErr(res, 400, 'Invalid pageToken', 'badRequest')
      const size = Math.min(Number(p.get('pageSize') ?? 100), 1000)
      const pending = changes.filter((c) => c.seq > after)
      const page = pending.slice(0, size)
      const out = page.map((c) => {
        const f = files.get(c.fileId)
        return c.removed || !f ? { fileId: c.fileId, removed: true } : { fileId: c.fileId, removed: false, file: meta(f) }
      })
      const more = pending.length > size
      return send(res, 200, more ? { changes: out, nextPageToken: String(page.at(-1).seq) } : { changes: out, newStartPageToken: String(seq) })
    }

    if (u.pathname === '/drive/v3/files' && m === 'GET') {
      const preds = parseQuery(p.get('q') ?? '')
      let list = [...files.values()].filter((f) => preds.every((fn) => fn(f)))
      if (p.get('orderBy') === 'createdTime') list.sort((a, b) => a.createdTime.localeCompare(b.createdTime))
      const size = Math.min(Number(p.get('pageSize') ?? 100), 1000)
      const offset = Number(p.get('pageToken') || 0)
      const page = list.slice(offset, offset + size).map(meta)
      return send(res, 200, offset + size < list.length ? { files: page, nextPageToken: String(offset + size) } : { files: page })
    }

    if (u.pathname === '/drive/v3/files' && m === 'POST') {
      const j = JSON.parse(raw.toString())
      return send(res, 200, meta(add(j.name, j.mimeType ?? 'application/octet-stream', j.parents ?? ['root'], j.appProperties ?? {})))
    }

    if (u.pathname === '/upload/drive/v3/files' && m === 'POST') {
      if (p.get('uploadType') !== 'multipart') return gErr(res, 400, 'only multipart is supported', 'badRequest')
      const [metaPart, media] = parseMultipart(raw, req.headers['content-type'] ?? '')
      const j = JSON.parse(metaPart.body.toString())
      state.uploads++
      return send(res, 200, meta(add(j.name, 'application/octet-stream', j.parents ?? ['root'], j.appProperties ?? {}, Buffer.from(media.body))))
    }

    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname)
    if (one) {
      const f = files.get(one[1])
      if (!f) return gErr(res, 404, 'File not found', 'notFound')
      if (m === 'GET') return p.get('alt') === 'media' ? send(res, 200, f.bytes ?? Buffer.alloc(0)) : send(res, 200, meta(f))
      if (m === 'PATCH') {
        Object.assign(f, JSON.parse(raw.toString()))
        touch(f)
        return send(res, 200, meta(f))
      }
      if (m === 'DELETE') {
        files.delete(f.id)
        touch(f, true)
        return send(res, 204, {})
      }
    }
    return gErr(res, 404, `fake drive: no route for ${key}`, 'notFound')
  }

  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x')
      const raw = await body(req)
      if (u.pathname.startsWith('/oauth/')) return oauth(req, res, u, raw)
      return await drive(req, res, u, raw)
    } catch (e) {
      send(res, 500, { error: { code: 500, message: String(e) } })
    }
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port
      resolve({
        port: actual,
        url: `http://127.0.0.1:${actual}`,
        oauth: `http://127.0.0.1:${actual}/oauth`,
        state,
        /** All files, for assertions. */
        files: () => [...files.values()].map((f) => ({ ...meta(f), bytes: f.bytes })),
        fail: (status, count = 1, match, reason) => faults.push({ status, count, match, reason }),
        expireAccessTokens: () => accessTokens.clear(),
        /** A valid access token, without going through OAuth. */
        token: issue,
        /** Puts a file in the tree the way another device would. */
        seed: (name, parents, bytes, appProperties = { cognotez: 'sync-v2' }) => add(name, bytes ? 'application/octet-stream' : FOLDER, parents, appProperties, bytes && Buffer.from(bytes)).id,
        close: () =>
          new Promise((r) => {
            server.closeAllConnections()
            server.close(() => r())
          })
      })
    })
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const s = await start(Number(process.argv[2] ?? 11998))
  process.stdout.write(`listening ${s.port}\n`)
}
