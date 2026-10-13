import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMedia, MAX_MEDIA_BYTES, sniffMime } from '../src/main/media'
import type { Media } from '../src/main/media'
import { memStore } from './helpers'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

describe('media', () => {
  let dir: string
  let media: Media
  let db: ReturnType<typeof memStore>['db']
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cog-media-'))
    db = memStore().db
    media = createMedia(join(dir, 'media'), db)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('importBytes stores <sha256> without extension, writes a row, and is idempotent', () => {
    const ref = media.importBytes(new Uint8Array(PNG), 'image/png')
    const hash = createHash('sha256').update(PNG).digest('hex')
    expect(ref).toEqual({ hash, url: `cognotez-media://${hash}` })
    expect(readFileSync(join(dir, 'media', hash))).toEqual(PNG)
    expect(readdirSync(join(dir, 'media'))).toEqual([hash]) // no temp files left behind
    expect(media.importBytes(new Uint8Array(PNG), 'image/png')).toEqual(ref)
    expect(db.prepare('SELECT mime, bytes FROM media').all()).toEqual([{ mime: 'image/png', bytes: PNG.length }])
  })

  it('validates bytes, size and mime', () => {
    expect(() => media.importBytes('x', 'image/png')).toThrow(/Uint8Array/)
    expect(() => media.importBytes(new Uint8Array(0), 'image/png')).toThrow(/50 MB/)
    expect(() => media.importBytes(new Uint8Array(MAX_MEDIA_BYTES + 1), 'image/png')).toThrow(/50 MB/)
    expect(() => media.importBytes(new Uint8Array(3), 'text/html')).toThrow(/mime/)
    expect(() => media.importBytes(new Uint8Array(3), 5)).toThrow(/mime/)
    expect(db.prepare('SELECT count(*) AS c FROM media').get()).toEqual({ c: 0 })
  })

  it('serves stored files with the right mime and hardening headers', async () => {
    const { hash } = media.importBytes(new Uint8Array(PNG), 'image/png')
    for (const url of [`cognotez-media://${hash}`, `cognotez-media://${hash.toUpperCase()}/`, `cognotez-media:///${hash}`]) {
      const r = media.serve(url)
      expect(r.status).toBe(200)
      expect(r.headers.get('content-type')).toBe('image/png')
      expect(r.headers.get('x-content-type-options')).toBe('nosniff')
      expect(Buffer.from(await r.arrayBuffer())).toEqual(PNG)
    }
  })

  it('answers 404 for traversal, non-hex, wrong-length, wrong-scheme and unknown hashes', () => {
    const { hash } = media.importBytes(new Uint8Array(PNG), 'image/png')
    for (const url of [
      'cognotez-media://../etc/passwd', 'cognotez-media://not-a-hash', `cognotez-media://${hash.slice(1)}`,
      `cognotez-media://${hash}/../x`, `cognotez-media://${hash}/x.png`, `cognotez-media://${'0'.repeat(64)}`,
      `https://${hash}`, 'cognotez-media://', 'garbage', `cognotez-media://${'g'.repeat(64)}`
    ]) {
      expect(media.serve(url).status, url).toBe(404)
    }
  })

  it('serves SVG with script-src none, and non-allowlisted types as attachments', () => {
    const svg = media.importBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'image/svg+xml')
    const r = media.serve(svg.url)
    expect(r.headers.get('content-security-policy')).toBe("script-src 'none'")
    // a file only the importer can add (e.g. a v4 attachment)
    const hash = media.store(Buffer.from('<html>x</html>'))
    db.prepare("INSERT INTO media VALUES (?, 'text/html', 14, 1)").run(hash)
    const h = media.serve(`cognotez-media://${hash}`)
    expect(h.headers.get('content-type')).toBe('application/octet-stream')
    expect(h.headers.get('content-disposition')).toBe('attachment')
  })

  it('supports Range requests and 404s when the file is gone', async () => {
    const { hash } = media.importBytes(new Uint8Array(PNG), 'image/png')
    const r = media.serve(`cognotez-media://${hash}`, 'bytes=2-5')
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe(`bytes 2-5/${PNG.length}`)
    expect(Buffer.from(await r.arrayBuffer())).toEqual(PNG.subarray(2, 6))
    expect(media.serve(`cognotez-media://${hash}`, 'bytes=-4').headers.get('content-range')).toBe(`bytes ${PNG.length - 4}-${PNG.length - 1}/${PNG.length}`)
    expect(media.serve(`cognotez-media://${hash}`, 'bytes=999-').status).toBe(416)
    rmSync(join(dir, 'media', hash))
    expect(existsSync(join(dir, 'media', hash))).toBe(false)
    expect(media.serve(`cognotez-media://${hash}`).status).toBe(404)
  })

  it('sniffs mime from magic bytes, then hint, then extension', () => {
    expect(sniffMime(PNG, 'x.bin')).toBe('image/png')
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(sniffMime(Buffer.from('GIF89a'))).toBe('image/gif')
    expect(sniffMime(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffMime(Buffer.from('RIFF\0\0\0\0WAVEfmt '))).toBe('audio/wav')
    expect(sniffMime(Buffer.from('\0\0\0\x20ftypisom'))).toBe('video/mp4')
    expect(sniffMime(Buffer.from('\0\0\0\x20ftypavif'))).toBe('image/avif')
    expect(sniffMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe('video/webm')
    expect(sniffMime(Buffer.from('OggS\0'))).toBe('audio/ogg')
    expect(sniffMime(Buffer.from('ID3\x04'))).toBe('audio/mpeg')
    expect(sniffMime(Buffer.from('<?xml version="1.0"?><svg xmlns=""/>'))).toBe('image/svg+xml')
    expect(sniffMime(Buffer.from('????'), 'a.png')).toBe('image/png')
    expect(sniffMime(Buffer.from('????'), 'a.png', 'image/webp')).toBe('image/webp')
    expect(sniffMime(Buffer.from('????'), 'a.zzz')).toBe('application/octet-stream')
  })
})
