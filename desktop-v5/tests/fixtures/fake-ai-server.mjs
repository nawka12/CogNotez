// A fake model server for tests and e2e: OpenAI-style /v1, Ollama /api and SearXNG /search in one process.
//   node tests/fixtures/fake-ai-server.mjs [port]      (default 11999, prints "listening <port>")
//   import { start } from './fake-ai-server.mjs'        (start(port) resolves { port, state, close })
//
// Triggers (found anywhere in the user's question, i.e. the last user message minus any <search_results> block, whose URLs
// carry the random port and could contain "401"): SLOW streams for 30 s (to test abort); 401 answers HTTP 401.
// Ollama model name "missing" answers 404 "model not found".
// Replies:
//   edit tasks (system says "Return only the resulting text"): the <text> with its FIRST WORD UPPERCASED + " (edited)";
//     `continue` answers " ...and then it kept going."
//   tags: ["fake","test"]
//   anything else (chat, summarize, keyPoints): "Echo: <last user message>" (the text after </search_results> when present),
//     plus " [N sources]" when search results were in the prompt.
// Streams ~5 chunks, 50 ms apart. GET /__state shows what the server saw: { lastAuth, lastOllama: { model, num_ctx, ... }, lastBody, count }.
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The user's own words: the text after </search_results> when research results were prepended. */
const questionOf = (last) => (last.includes('</search_results>') ? last.split('</search_results>').pop().trim() : last)

function replyFor(messages) {
  const system = messages.find((m) => m.role === 'system')?.content ?? ''
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  if (system.includes('Return only the resulting text')) {
    if (system.includes('Continue the text naturally')) return ' ...and then it kept going.'
    const text = /<text>\n([\s\S]*?)\n<\/text>/.exec(last)?.[1] ?? last
    return text.replace(/^(\s*)(\S+)/, (_, ws, w) => ws + w.toUpperCase()) + ' (edited)'
  }
  if (system.includes('JSON array')) return '["fake","test"]'
  const sources = (last.match(/^\[\d+\] /gm) ?? []).length
  return `Echo: ${questionOf(last)}` + (last.includes('<search_results>') ? ` [${sources} sources]` : '')
}

function chunksOf(text, n = 5) {
  const chars = Array.from(text)
  const size = Math.max(1, Math.ceil(chars.length / n))
  const out = []
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''))
  return out
}

async function readJson(req) {
  let raw = ''
  for await (const c of req) raw += c
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/** A loopback port that was just free and has no listener: connecting is refused (unlike port 1, which fetch rejects as a "bad port"). */
export function deadPort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

export function start(port = 11999) {
  const state = { count: 0, lastAuth: null, lastBody: null, lastOllama: null }
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(JSON.stringify(body))
  }

  /** Streams `parts` (or, for SLOW, ticks for 30 s) in `format`: 'sse' or 'ndjson'. */
  async function stream(req, res, format, parts, slow) {
    res.writeHead(200, { 'content-type': format === 'sse' ? 'text/event-stream' : 'application/x-ndjson' })
    let closed = false
    res.on('close', () => (closed = true))
    const write = (content) =>
      res.write(
        format === 'sse'
          ? `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
          : JSON.stringify({ message: { role: 'assistant', content }, done: false }) + '\n'
      )
    if (format === 'sse') res.write(`data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}\n\n`)
    if (slow) {
      for (let i = 0; i < 60 && !closed; i++) {
        write(`tick${i} `)
        await sleep(500)
      }
    } else {
      for (const p of parts) {
        if (closed) return
        write(p)
        await sleep(50)
      }
    }
    if (closed) return
    res.end(format === 'sse' ? 'data: [DONE]\n\n' : JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n')
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    state.count++
    if (url.pathname === '/__state') return json(res, 200, state)
    if (url.pathname === '/v1/models' && req.method === 'GET') {
      state.lastAuth = req.headers.authorization ?? null
      return json(res, 200, { data: [{ id: 'fake-large' }, { id: 'fake' }] })
    }
    if (url.pathname === '/api/tags' && req.method === 'GET') {
      state.lastAuth = req.headers.authorization ?? null
      return json(res, 200, { models: [{ name: 'fake-small:latest' }, { name: 'fake:latest' }] })
    }
    if (url.pathname === '/search') {
      const origin = `http://${req.headers['x-forwarded-host'] ?? req.headers.host}` // tests proxy fake hostnames here
      return json(res, 200, {
        query: url.searchParams.get('q'),
        results: [
          { title: 'Fake result one', url: `${origin}/page/1`, content: 'Snippet one.' },
          { title: 'Fake result two', url: `${origin}/page/2`, content: 'Snippet two.' }
        ]
      })
    }
    if (url.pathname.startsWith('/page/')) {
      const name = url.pathname.slice(6)
      if (name === 'redirect') {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
        return res.end()
      }
      if (name === 'json') return json(res, 200, { not: 'text' })
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(
        `<html><head><style>p{}</style><script>alert(1)</script></head><body><h1>Page ${name}</h1><p>Fake &amp; useful text.</p></body></html>`
      )
    }
    const isOllama = url.pathname === '/api/chat'
    if ((isOllama || url.pathname === '/v1/chat/completions') && req.method === 'POST') {
      const body = await readJson(req)
      state.lastAuth = req.headers.authorization ?? null
      state.lastBody = body
      if (isOllama) state.lastOllama = { model: body.model, num_ctx: body.options?.num_ctx, temperature: body.options?.temperature }
      const messages = Array.isArray(body.messages) ? body.messages : []
      const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      const question = questionOf(last)
      if (question.includes('401')) return json(res, 401, { error: { message: 'Invalid API key' } })
      if (isOllama && body.model === 'missing') return json(res, 404, { error: "model 'missing' not found" })
      return stream(req, res, isOllama ? 'ndjson' : 'sse', chunksOf(replyFor(messages)), question.includes('SLOW'))
    }
    json(res, 404, { error: 'not found' })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : port,
        state,
        close: () => new Promise((r) => (server.closeAllConnections(), server.close(() => r())))
      })
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await start(Number(process.argv[2] ?? 11999))
  process.stdout.write(`listening ${port}\n`)
}
