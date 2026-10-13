// Research mode: main searches SearXNG itself and fetches a few result pages. The model never gets tools.
// Everything fetched here is untrusted: it is only ever handed to the model inside <search_results>.
import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { LookupFunction } from 'node:net'
import { BlockList, isIP } from 'node:net'
import { Readable } from 'node:stream'

export interface SearchResult {
  title: string
  url: string
  content: string
}
export interface Source extends SearchResult {
  /** Extracted page text; absent when the page could not be fetched safely (the snippet is used instead). */
  text?: string
}
/** Resolves a hostname to ALL its addresses. Injectable so tests can use local servers. */
export type Resolver = (host: string) => Promise<string[]>
export interface ResearchDeps {
  fetch?: typeof fetch
  resolve?: Resolver
  signal?: AbortSignal
}

const SEARCH_RESULTS = 5
const PAGES = 3
const MAX_HOPS = 3
const PAGE_BYTES = 300 * 1024
const PAGE_MS = 8_000
const SEARCH_MS = 10_000
const SEARCH_BYTES = 2 * 1024 * 1024
const PAGE_CHARS = 4_000

// ---- SSRF guard ---------------------------------------------------------------------------

const blocked = new BlockList()
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) blocked.addSubnet(a, p, 'ipv4')
for (const [a, p] of [
  ['::', 96], // unspecified, loopback and the deprecated IPv4-compatible range
  ['64:ff9b::', 96], ['2002::', 16], // NAT64 and 6to4 embed IPv4 addresses
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
] as const) blocked.addSubnet(a, p, 'ipv6')

/** True for anything that is not a plain public unicast address (unparsable input counts as blocked). IPv4-mapped IPv6 is checked as its IPv4 address. */
export function isBlockedIp(ip: string): boolean {
  const h = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const family = isIP(h)
  return family === 0 ? true : blocked.check(h, family === 4 ? 'ipv4' : 'ipv6')
}

const defaultResolve: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address)

/** Resolves `host` once and returns the addresses if every one of them is public; the connection is then pinned to them. */
async function assertPublic(host: string, resolve: Resolver): Promise<string[]> {
  const h = host.replace(/^\[|\]$/g, '')
  if (/(^|\.)localhost$/i.test(h)) throw new Error('blocked host')
  const addrs = isIP(h) ? [h] : await resolve(h)
  if (!addrs.length || addrs.some(isBlockedIp)) throw new Error('blocked address')
  return addrs
}

/** A DNS lookup that never asks DNS: it answers with the addresses that already passed the guard. */
export const pinnedLookup = (addrs: string[]): LookupFunction => (_host, opts, cb) => {
  const entries = addrs.map((address) => ({ address, family: isIP(address) }))
  if (opts.all) cb(null, entries)
  else cb(null, entries[0]!.address, entries[0]!.family)
}

/**
 * fetch() for one hop, connecting only to `addrs` (the vetted DNS answer), so a second, different DNS answer cannot matter.
 * The URL's hostname still drives the Host header, TLS SNI and certificate check. A fresh socket per request (agent: false)
 * means no pooled connection made for another hop or host is ever reused.
 */
export function pinnedFetch(u: URL, addrs: string[], init: { signal: AbortSignal; headers: Record<string, string> }): Promise<Response> {
  return new Promise((resolve, reject) => {
    const secure = u.protocol === 'https:'
    const req = (secure ? httpsRequest : httpRequest)(
      {
        host: u.hostname.replace(/^\[|\]$/g, ''), port: u.port || undefined, path: u.pathname + u.search, headers: init.headers,
        lookup: pinnedLookup(addrs), agent: false, signal: init.signal
      },
      (res) => {
        const headers = new Headers()
        for (const [k, v] of Object.entries(res.headers)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) headers.append(k, x)
        const status = res.statusCode ?? 502
        const empty = status === 204 || status === 205 || status === 304
        if (empty) res.resume()
        resolve(new Response(empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), { status, headers }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

// ---- fetching -----------------------------------------------------------------------------

/** Reads at most `max` bytes, then stops the download. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < max) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
  }
  void reader.cancel().catch(() => undefined)
  return Buffer.concat(chunks).subarray(0, max).toString('utf8')
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(script|style)\b[\s\S]*$/i, ' ') // cut off by the size cap before it closed
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m
      const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m
    })
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/**
 * Fetches one result page as text. Only http(s); every hop (at most 3 redirects) is resolved and checked.
 * DNS is resolved once per hop and the connection is pinned to the vetted answer (pinnedFetch), so rebinding cannot swap in
 * a private address between the check and the connect. `deps.fetch` replaces the transport (tests only).
 */
export async function fetchPageText(url: string, deps: ResearchDeps = {}): Promise<string> {
  const resolve = deps.resolve ?? defaultResolve
  const signal = AbortSignal.any([AbortSignal.timeout(PAGE_MS), ...(deps.signal ? [deps.signal] : [])])
  let current = url
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const u = new URL(current)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('only http(s) pages can be fetched')
    if (u.username || u.password) throw new Error('credentials in URL')
    const addrs = await assertPublic(u.hostname, resolve)
    const headers = { accept: 'text/html,text/plain;q=0.9', 'user-agent': 'CogNotez' }
    const res = deps.fetch ? await deps.fetch(u, { redirect: 'manual', signal, headers }) : await pinnedFetch(u, addrs, { signal, headers })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      void res.body?.cancel().catch(() => undefined)
      current = new URL(location, u).href // re-checked at the top of the next hop
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
    if (type !== 'text/html' && type !== 'text/plain') {
      void res.body?.cancel().catch(() => undefined)
      throw new Error('not a text page')
    }
    const raw = await readCapped(res, PAGE_BYTES)
    return (type === 'text/html' ? htmlToText(raw) : raw.replace(/\s+/g, ' ').trim()).slice(0, PAGE_CHARS)
  }
  throw new Error('too many redirects')
}

/** SearXNG may be on localhost or the LAN: the user configured it, so it is not subject to the guard. */
export async function searchWeb(searxngUrl: string, query: string, deps: ResearchDeps = {}): Promise<SearchResult[]> {
  const doFetch = deps.fetch ?? fetch
  const signal = AbortSignal.any([AbortSignal.timeout(SEARCH_MS), ...(deps.signal ? [deps.signal] : [])])
  const url = `${searxngUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json`
  const res = await doFetch(url, { signal, headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`SearXNG answered HTTP ${res.status}`)
  const body = JSON.parse(await readCapped(res, SEARCH_BYTES)) as { results?: unknown }
  if (!Array.isArray(body.results)) throw new Error('SearXNG answered without results')
  const out: SearchResult[] = []
  for (const r of body.results as Record<string, unknown>[]) {
    if (typeof r?.['url'] !== 'string' || !/^https?:\/\//i.test(r['url'])) continue
    out.push({
      title: typeof r['title'] === 'string' ? r['title'] : r['url'],
      url: r['url'],
      content: typeof r['content'] === 'string' ? r['content'] : ''
    })
    if (out.length === SEARCH_RESULTS) break
  }
  return out
}

/** Search, then fetch the first few result pages (never any other URL). A failed page just keeps its snippet. */
export async function research(searxngUrl: string, query: string, deps: ResearchDeps = {}): Promise<Source[]> {
  const results = await searchWeb(searxngUrl, query.slice(0, 400), deps)
  const pages = await Promise.allSettled(results.slice(0, PAGES).map((r) => fetchPageText(r.url, deps)))
  return results.map((r, i) => {
    const page = pages[i]
    return page?.status === 'fulfilled' && page.value ? { ...r, text: page.value } : r
  })
}

/** The body of the `<search_results>` block. Prompts frame it as untrusted. */
export function formatResearch(sources: Source[]): string {
  if (!sources.length) return '(no results)'
  return sources.map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.text || s.content}`).join('\n\n')
}
