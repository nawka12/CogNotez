// Imports .md / .markdown / .txt files, one note each. Electron-free: the file dialog lives in ipc.ts.
import { randomUUID } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, extname, resolve, sep } from 'node:path'
import { LIMITS, tagList, tagName } from '../guards'
import { ALLOWED_MIMES, MAX_MEDIA_BYTES, MEDIA_SCHEME, sniffMime } from '../media'
import type { Media } from '../media'
import { tx } from '../store/db'
import type { BulkNote } from '../store/bulk'
import type { Store } from '../store/notes'

export const MAX_IMPORT_BYTES = 5_000_000
export const IMPORT_EXTENSIONS = ['md', 'markdown', 'txt']

type Data = Record<string, unknown>

function scalar(raw: string): unknown {
  const v = raw.trim()
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v) as unknown
    } catch {
      return v.replace(/^"|"$/g, '')
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replaceAll("''", "'")
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

function flowList(v: string): unknown[] | null {
  if (!v.startsWith('[') || !v.endsWith(']')) return null
  try {
    const j: unknown = JSON.parse(v)
    if (Array.isArray(j)) return j
  } catch {
    /* not strict JSON: `[a, b]` or single quotes */
  }
  const inner = v.slice(1, -1).trim()
  return inner ? [...inner.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^,]+)/g)].map((m) => scalar(m[0].trim())) : []
}

/**
 * Reads a leading `---` block of simple `key: value` lines (quoted or bare scalars, `[a, b]`, or `- item` lists).
 * Anything else inside the fences means it was not front matter after all (e.g. two horizontal rules).
 */
export function splitFrontMatter(text: string): { data: Data; body: string } {
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text)
  if (!m) return { data: {}, body: text }
  const data: Data = {}
  let key: string | null = null
  for (const line of m[1]!.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const item = /^\s+-\s+(.*)$/.exec(line) ?? /^-\s+(.*)$/.exec(line)
    if (item && key && (data[key] === '' || Array.isArray(data[key]))) {
      data[key] = [...(Array.isArray(data[key]) ? (data[key] as unknown[]) : []), scalar(item[1]!)]
      continue
    }
    const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line)
    if (!kv) return { data: {}, body: text }
    key = kv[1]!
    const raw = (kv[2] ?? '').trim()
    data[key] = flowList(raw) ?? (raw === '' ? '' : scalar(raw))
  }
  return { data, body: text.slice(m[0].length).replace(/^\n/, '') }
}

function tagsFrom(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const out: string[] = []
  for (const t of list) {
    if (typeof t !== 'string') continue
    try {
      out.push(tagName(t.trim().replace(/^#/, '')))
    } catch {
      /* malformed tag: drop it, keep the rest */
    }
  }
  return tagList(out.slice(0, LIMITS.tags))
}

const date = (v: unknown, now: number): number | null => {
  const t = typeof v === 'string' || v instanceof Date ? Date.parse(String(v)) : NaN
  return Number.isFinite(t) && t > 0 && t <= now + 864e5 ? t : null
}

/** Title: front-matter `title`, else a leading `# heading` (removed from the body), else the file name. */
export function titleAndBody(text: string, fileName: string): { title: string; body: string; data: Data } {
  const { data, body } = splitFrontMatter(text)
  if (typeof data['title'] === 'string') return { title: data['title'], body, data }
  const h = /^\s*#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*(?:\n|$)/.exec(body)
  if (h) return { title: h[1]!, body: body.slice(h[0].length).replace(/^\s*\n/, ''), data }
  return { title: fileName, body, data }
}

const IMG_RE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g

export interface FilesResult {
  ids: string[]
  skipped: { name: string; reason: string }[]
}

/** Imports the given files in one transaction. Paths must come from a dialog opened by main. */
export function importMarkdownFiles(store: Store, media: Media, paths: readonly string[], now: () => number = Date.now): FilesResult {
  const skipped: FilesResult['skipped'] = []
  const notes: BulkNote[] = []
  const t = now()

  return tx(store.db, () => {
    for (const path of paths) {
      const name = basename(path)
      try {
        const st = lstatSync(path)
        if (!st.isFile()) throw new Error('not a regular file')
        if (st.size > MAX_IMPORT_BYTES) throw new Error('larger than 5 MB')
        const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
        const { title, body: text, data } = titleAndBody(raw, basename(name, extname(name)))
        const dir = realpathSync(dirname(path))
        const hashes = new Set<string>()
        const body = text.replace(IMG_RE, (whole, alt: string, src: string) => {
          let ref = src.startsWith('<') ? src.slice(1, -1) : src
          if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/') || ref.startsWith('#')) return whole
          try {
            ref = decodeURIComponent(ref)
            const file = realpathSync(resolve(dir, ref))
            if (!file.startsWith(dir + sep)) return whole // only files at or below the note's folder
            const img = lstatSync(file)
            if (!img.isFile() || img.size === 0 || img.size > MAX_MEDIA_BYTES) return whole
            const bytes = readFileSync(file)
            const mime = sniffMime(bytes) // content only: a text file named .png is not an image
            if (!ALLOWED_MIMES.has(mime)) return whole
            const hash = media.importBytes(new Uint8Array(bytes), mime).hash
            hashes.add(hash)
            return `![${alt}](${MEDIA_SCHEME}://${hash})`
          } catch {
            return whole // missing or unreadable image: leave the link as written
          }
        })
        if (body.length > LIMITS.body) throw new Error('text is too long')
        notes.push({
          id: randomUUID(),
          title: title.slice(0, LIMITS.title),
          body,
          createdAt: date(data['created'], t) ?? Math.round(st.mtimeMs),
          updatedAt: date(data['updated'], t) ?? Math.round(st.mtimeMs),
          pinned: data['pinned'] === true,
          archived: false,
          cipher: null,
          cipherFormat: null,
          tags: tagsFrom(data['tags']),
          media: [...hashes]
        })
      } catch (e) {
        skipped.push({ name, reason: e instanceof Error ? e.message : String(e) })
      }
    }
    const r = store.bulk.insert({ notes, media: [], messages: [] })
    return { ids: r.insertedIds, skipped }
  })
}
