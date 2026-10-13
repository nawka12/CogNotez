import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchPageText, formatResearch, htmlToText, isBlockedIp, research, searchWeb } from '../src/main/ai/research'
import { start } from './fixtures/fake-ai-server.mjs'
import type { FakeAiServer } from './fixtures/fake-ai-server.mjs'

/** Connects to loopback whatever the hostname says, so a fake public name can be served by a local server. */
const toLoopback: typeof fetch = (input, init) => {
  const u = new URL(input instanceof Request ? input.url : String(input))
  const headers = new Headers(init?.headers)
  headers.set('x-forwarded-host', u.host)
  u.hostname = '127.0.0.1'
  return fetch(u, { ...init, headers })
}

describe('SSRF guard', () => {
  it.each([
    '127.0.0.1', '127.8.8.8', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '::ffff:10.0.0.1', '::ffff:7f00:1', 'not-an-ip'
  ])('rejects %s', (ip) => expect(isBlockedIp(ip)).toBe(true))

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111'])('allows public %s', (ip) => expect(isBlockedIp(ip)).toBe(false))
})

describe('htmlToText', () => {
  it('drops script and style, strips tags, decodes entities, collapses whitespace', () => {
    const t = htmlToText('<style>p{}</style><h1>A &amp; B</h1><script>x()</script><p>one   two&nbsp;&#65;&#x42;</p><!-- c --><p>last &bogus;</p>')
    expect(t).toBe('A & B\none two AB\nlast &bogus;')
  })
  it('drops a script cut off by the size cap', () => {
    expect(htmlToText('<p>ok</p><script>var a = "unterminated')).toBe('ok')
  })
})

describe('page fetching', () => {
  let fake: FakeAiServer
  let http: Server
  let hostPort: number
  const publicIp = async (): Promise<string[]> => ['93.184.216.34'] // pretend DNS says "public" while we connect locally
  const deps = { resolve: publicIp, fetch: toLoopback }
  beforeAll(async () => {
    fake = await start(0)
    http = createServer((req, res) => {
      if (req.url === '/loop') res.writeHead(302, { location: '/loop' }).end()
      else if (req.url === '/big') res.writeHead(200, { 'content-type': 'text/plain' }).end('x'.repeat(1_000_000))
      else if (req.url === '/hop') res.writeHead(302, { location: `http://other.test:${fake.port}/page/ok` }).end()
      else if (req.url === '/hop2') res.writeHead(302, { location: `http://other.test:${fake.port}/page/ok` }).end()
      else res.writeHead(404).end()
    })
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
    hostPort = (http.address() as { port: number }).port
  })
  afterAll(async () => {
    await fake.close()
    http.close()
  })

  it('extracts text from a public page', async () => {
    expect(await fetchPageText(`http://pub.test:${fake.port}/page/1`, deps)).toBe('Page 1\nFake & useful text.')
  })

  it('refuses private addresses by IP literal and by DNS answer', async () => {
    await expect(fetchPageText(`http://127.0.0.1:${fake.port}/page/1`, deps)).rejects.toThrow(/blocked/)
    await expect(fetchPageText(`http://10.1.2.3/`, deps)).rejects.toThrow(/blocked/)
    await expect(fetchPageText('http://[::1]:1/')).rejects.toThrow(/blocked/)
    await expect(fetchPageText('http://localhost:1/', deps)).rejects.toThrow(/blocked/)
    await expect(fetchPageText('http://example.test/', { resolve: async () => ['93.184.216.34', '10.0.0.5'] })).rejects.toThrow(/blocked/)
    await expect(fetchPageText('http://example.test/', { resolve: async () => [] })).rejects.toThrow(/blocked/)
  })

  it('refuses non-http schemes and credentials', async () => {
    await expect(fetchPageText('file:///etc/passwd', deps)).rejects.toThrow(/http/)
    await expect(fetchPageText('ftp://example.test/', deps)).rejects.toThrow(/http/)
    await expect(fetchPageText('http://u:p@example.test/', deps)).rejects.toThrow(/credentials/)
  })

  it('re-checks every redirect hop, and caps the number of hops', async () => {
    // The first hop is "public" for the test; the redirect target is the cloud metadata address and must be refused.
    await expect(fetchPageText(`http://pub.test:${fake.port}/page/redirect`, deps)).rejects.toThrow(/blocked/)
    // A redirect to another public-looking host is followed; one that resolves to a private address is not.
    await expect(fetchPageText(`http://pub.test:${hostPort}/hop`, deps)).resolves.toContain('Fake')
    const perHost: (h: string) => Promise<string[]> = async (h) => (h === 'pub.test' ? ['93.184.216.34'] : ['10.0.0.1'])
    await expect(fetchPageText(`http://pub.test:${hostPort}/hop2`, { resolve: perHost, fetch: toLoopback })).rejects.toThrow(/blocked/)
    await expect(fetchPageText(`http://pub.test:${hostPort}/loop`, deps)).rejects.toThrow(/redirects/)
  })

  it('only takes text pages and caps the size', async () => {
    await expect(fetchPageText(`http://pub.test:${fake.port}/page/json`, deps)).rejects.toThrow(/text/)
    const big = await fetchPageText(`http://pub.test:${hostPort}/big`, deps)
    expect(big.length).toBeLessThanOrEqual(4000)
  })
})

describe('research', () => {
  let fake: FakeAiServer
  beforeAll(async () => (fake = await start(0)))
  afterAll(() => fake.close())
  const url = (): string => `http://127.0.0.1:${fake.port}`

  it('searches SearXNG (LAN/localhost allowed) and fetches result pages', async () => {
    const results = await searchWeb(url(), 'what is "x"?')
    expect(results.map((r) => r.title)).toEqual(['Fake result one', 'Fake result two'])
    const sources = await research(`http://searx.test:${fake.port}`, 'q', { resolve: async () => ['93.184.216.34'], fetch: toLoopback })
    expect(sources[0]?.text).toBe('Page 1\nFake & useful text.')
    const block = formatResearch(sources)
    expect(block).toContain('[1] Fake result one')
    expect(block).toContain(`URL: http://searx.test:${fake.port}/page/1`)
  })

  it('falls back to the snippet when the page is unsafe to fetch', async () => {
    const sources = await research(url(), 'q') // real resolver: 127.0.0.1 is private
    expect(sources.every((s) => s.text === undefined)).toBe(true)
    expect(formatResearch(sources)).toContain('Snippet one.')
  })
})
