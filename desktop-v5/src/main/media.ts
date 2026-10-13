// Content-addressed media: userData/media/<sha256> (no extension) + a `media` row for the mime.
// Electron-free so tests run in plain Node; the protocol wiring lives in index.ts.
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { MediaRef } from '../shared/api'
import type { Db } from './store/db'

export const MAX_MEDIA_BYTES = 50 * 1024 * 1024
export const MEDIA_SCHEME = 'cognotez-media'

/** What `media.importBytes` accepts from the renderer. */
export const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml',
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/wav'
])

const HASH_RE = /^[0-9a-f]{64}$/

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  avif: 'image/avif', svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
  m4a: 'audio/mp4', pdf: 'application/pdf'
}

const ascii = (b: Uint8Array, from: number, to: number): string => Buffer.from(b.subarray(from, to)).toString('latin1')

/** Magic bytes first, then the caller's hint, then the file extension. */
export function sniffMime(bytes: Uint8Array, name = '', hint = ''): string {
  const b = bytes
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (ascii(b, 0, 4) === 'GIF8') return 'image/gif'
  if (ascii(b, 0, 4) === 'RIFF') {
    if (ascii(b, 8, 12) === 'WEBP') return 'image/webp'
    if (ascii(b, 8, 12) === 'WAVE') return 'audio/wav'
  }
  if (ascii(b, 4, 8) === 'ftyp') {
    const brand = ascii(b, 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (brand === 'M4A ') return 'audio/mp4'
    if (brand === 'qt  ') return 'video/quicktime'
    return 'video/mp4'
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm'
  if (ascii(b, 0, 4) === 'OggS') return 'audio/ogg'
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && b[1] !== undefined && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg'
  if (ascii(b, 0, 4) === '%PDF') return 'application/pdf'
  if (/<svg[\s>]/.test(ascii(b, 0, 1024))) return 'image/svg+xml'
  if (/^[a-z]+\/[a-z0-9.+-]+$/.test(hint)) return hint
  return EXT_MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

function parseHash(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${MEDIA_SCHEME}:`) return null
  // `cognotez-media://<hash>` (host) or `cognotez-media:///<hash>` (path); nothing else.
  const candidate = u.host ? (u.pathname === '' || u.pathname === '/' ? u.host : '') : u.pathname.replace(/^\//, '')
  const hash = candidate.toLowerCase()
  return HASH_RE.test(hash) ? hash : null
}

const notFound = (): Response => new Response('not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } })

export function createMedia(dir: string, db: Db, wall: () => number = Date.now) {
  mkdirSync(dir, { recursive: true })

  /** Writes the file if it is not there yet (temp file + rename) and returns its sha256. */
  function store(bytes: Uint8Array): string {
    const hash = sha256(bytes)
    const final = join(dir, hash)
    try {
      if (statSync(final).size === bytes.length) return hash
    } catch {
      /* not stored yet */
    }
    const tmp = join(dir, `.tmp-${randomUUID()}`)
    try {
      writeFileSync(tmp, bytes, { mode: 0o600 })
      renameSync(tmp, final)
    } catch (e) {
      try {
        unlinkSync(tmp)
      } catch {
        /* nothing to clean */
      }
      throw e
    }
    return hash
  }

  function importBytes(bytes: unknown, mime: unknown): MediaRef {
    if (!(bytes instanceof Uint8Array)) throw new Error('invalid argument: bytes must be a Uint8Array')
    if (bytes.length === 0 || bytes.length > MAX_MEDIA_BYTES) throw new Error('invalid argument: bytes must be 1 byte to 50 MB')
    if (typeof mime !== 'string' || !ALLOWED_MIMES.has(mime)) throw new Error('invalid argument: mime type is not allowed')
    const hash = store(bytes)
    db.prepare('INSERT OR IGNORE INTO media(hash, mime, bytes, created_at) VALUES (?, ?, ?, ?)').run(hash, mime, bytes.length, wall())
    return { hash, url: `${MEDIA_SCHEME}://${hash}` }
  }

  /** Handler for `protocol.handle`. Only a 64-hex hash that has a `media` row is ever turned into a path. */
  function serve(url: string, range?: string | null): Response {
    const hash = parseHash(url)
    if (!hash) return notFound()
    const row = db.prepare('SELECT mime FROM media WHERE hash = ?').get(hash) as { mime: string } | undefined
    if (!row) return notFound()
    const file = join(dir, hash)
    let size: number
    try {
      size = statSync(file).size
    } catch {
      return notFound()
    }
    if (size === 0) return notFound()

    const safe = ALLOWED_MIMES.has(row.mime)
    const headers: Record<string, string> = {
      'Content-Type': safe ? row.mime : 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes'
    }
    if (!safe) headers['Content-Disposition'] = 'attachment'
    if (row.mime === 'image/svg+xml') headers['Content-Security-Policy'] = "script-src 'none'"

    let start = 0
    let end = size - 1
    let status = 200
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range)
      const a = m?.[1] ? Number(m[1]) : null
      const z = m?.[2] ? Number(m[2]) : null
      if (!m || (a === null && z === null)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      if (a === null) start = Math.max(0, size - (z ?? 0))
      else {
        start = a
        if (z !== null) end = Math.min(end, z)
      }
      if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    }
    headers['Content-Length'] = String(end - start + 1)
    const body = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream
    return new Response(body, { status, headers })
  }

  return { dir, store, importBytes, serve }
}

export type Media = ReturnType<typeof createMedia>
