// Turns notes into Markdown, plain text or print-ready HTML, and writes the "export everything" folder.
// No Electron imports: dialogs and the PDF window live in ipc.ts and pdf.ts.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Marked } from 'marked'
import type { Note } from '../shared/api'
import { MEDIA_SCHEME } from './media'
import type { Store } from './store/notes'

const MEDIA_URL_RE = new RegExp(`${MEDIA_SCHEME}://([0-9a-fA-F]{64})`, 'g')

export const MIME_EXT: Readonly<Record<string, string>> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
  'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav'
}

type Exportable = Pick<Note, 'title' | 'body' | 'tags' | 'createdAt' | 'updatedAt'> & { pinned?: boolean }

/** A YAML double-quoted string is a JSON string, so JSON.stringify is the escaper. */
const q = (s: string): string => JSON.stringify(s)

export function noteMarkdown(n: Exportable, withPinned = false): string {
  const fm = [
    `title: ${q(n.title)}`,
    `tags: [${n.tags.map(q).join(', ')}]`,
    `created: ${new Date(n.createdAt).toISOString()}`,
    `updated: ${new Date(n.updatedAt).toISOString()}`
  ]
  if (withPinned) fm.push(`pinned: ${n.pinned === true}`)
  return `---\n${fm.join('\n')}\n---\n\n${n.body}`
}

export const noteText = (n: Pick<Note, 'title' | 'body'>): string => `${n.title}\n\n${n.body}`

export function slugify(title: string): string {
  const s = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return s || 'untitled'
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Raw HTML in a note is shown as text, not run: the print window must never be steered by note content.
const md = new Marked({ gfm: true, async: false, renderer: { html: ({ text }) => esc(text) } })

export const PDF_CSP = "default-src 'none'; img-src cognotez-media: data:; style-src 'unsafe-inline'; font-src file:"

/** `fontUrl` is a file:// URL to a bundled Fraunces woff2; without it the title falls back to Georgia. */
export function noteHtml(n: Pick<Note, 'title' | 'body'>, fontUrl?: string): string {
  const face = fontUrl
    ? `@font-face{font-family:"Fraunces";src:url("${fontUrl}") format("woff2");font-weight:100 900}`
    : ''
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PDF_CSP}">
<title>${esc(n.title)}</title>
<style>
${face}
body{font:11pt/1.6 Georgia,"Times New Roman",serif;color:#111;max-width:42rem;margin:0 auto}
h1.title{font:500 24pt/1.15 "Fraunces",Georgia,serif;margin:0 0 1.2em}
h1,h2,h3,h4{line-height:1.3;break-after:avoid}
img{max-width:100%;height:auto;break-inside:avoid}
pre{background:#f3f1ec;padding:.7em .9em;white-space:pre-wrap;overflow-wrap:anywhere;font:9.5pt/1.5 ui-monospace,Menlo,Consolas,monospace}
code{font:.9em ui-monospace,Menlo,Consolas,monospace}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #bbb;color:#444}
table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:.3em .6em}
a{color:#111}
</style></head><body>
<h1 class="title">${esc(n.title || 'Untitled')}</h1>
${md.parse(n.body, { async: false })}
</body></html>`
}

export interface ExportAllResult {
  dir: string
  notes: number
  lockedSkipped: number
  media: number
}

/**
 * Writes every live, unlocked note to `dir` as <slug>.md, copies the media they use to `media/`, and
 * rewrites cognotez-media:// links to relative paths. Locked notes are never exported, only listed by title.
 * Existing files are never overwritten.
 */
export function exportAllMarkdown(store: Store, mediaDir: string, dir: string): ExportAllResult {
  mkdirSync(dir, { recursive: true })
  const taken = new Set<string>()
  const unique = (base: string): string => {
    for (let i = 1; ; i++) {
      const name = i === 1 ? base : `${base}-${i}`
      if (!taken.has(name) && !existsSync(join(dir, `${name}.md`))) {
        taken.add(name)
        return name
      }
    }
  }
  const mimeOf = store.db.prepare('SELECT mime FROM media WHERE hash = ?')
  const copied = new Set<string>()
  const locked: string[] = []
  let notes = 0

  for (const s of store.notes.list({ kind: 'all' })) {
    if (s.locked) {
      locked.push(s.title || 'Untitled')
      continue
    }
    const n = store.notes.get(s.id)
    if (n.locked) continue // locked between the list and the read
    const body = n.body.replace(MEDIA_URL_RE, (whole, h: string) => {
      const hash = h.toLowerCase()
      const row = mimeOf.get(hash) as { mime: string } | undefined
      const src = join(mediaDir, hash)
      if (!row || !existsSync(src)) return whole
      const rel = `media/${hash}.${MIME_EXT[row.mime] ?? 'bin'}`
      if (!copied.has(hash)) {
        mkdirSync(join(dir, 'media'), { recursive: true })
        copyFileSync(src, join(dir, rel))
        copied.add(hash)
      }
      return rel
    })
    writeFileSync(join(dir, `${unique(slugify(n.title))}.md`), noteMarkdown({ ...n, body }, true))
    notes++
  }
  if (locked.length) {
    writeFileSync(join(dir, '_locked-notes-not-exported.txt'), `Locked notes are never exported.\n\n${locked.join('\n')}\n`)
  }
  return { dir, notes, lockedSkipped: locked.length, media: copied.size }
}
