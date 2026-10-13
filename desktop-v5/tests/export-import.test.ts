import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportAllMarkdown, noteHtml, noteMarkdown, noteText, PDF_CSP, slugify } from '../src/main/export'
import { importMarkdownFiles, MAX_IMPORT_BYTES, splitFrontMatter, titleAndBody } from '../src/main/import/files'
import { createMedia } from '../src/main/media'
import { memStore } from './helpers'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

describe('export and import of files', () => {
  let dir: string
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'cog-files-'))))
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function setup(name = 'a') {
    const store = memStore()
    const media = createMedia(join(dir, name, 'media'), store.db)
    return { store, media }
  }
  const note = { title: 'Plan: "Q3"', body: 'Hello\n\n- [ ] task', tags: ['work/projects', 'idea'], createdAt: Date.UTC(2026, 0, 2, 3, 4, 5), updatedAt: Date.UTC(2026, 0, 3) }

  it('md export has YAML front matter then the body; txt has title, blank line, body', () => {
    expect(noteMarkdown(note)).toBe(
      '---\ntitle: "Plan: \\"Q3\\""\ntags: ["work/projects", "idea"]\ncreated: 2026-01-02T03:04:05.000Z\nupdated: 2026-01-03T00:00:00.000Z\n---\n\nHello\n\n- [ ] task'
    )
    expect(noteMarkdown({ ...note, pinned: true }, true)).toContain('\npinned: true\n---')
    expect(noteText(note)).toBe('Plan: "Q3"\n\nHello\n\n- [ ] task')
  })

  it('pdf html carries the CSP, escapes raw HTML and never runs note markup', () => {
    const html = noteHtml({ title: '<b>T</b>', body: '<meta http-equiv="refresh" content="0;url=https://evil.example">\n\n![](cognotez-media://' + 'a'.repeat(64) + ')' })
    expect(html).toContain(`content="${PDF_CSP}"`)
    expect(html).not.toContain('<meta http-equiv="refresh"')
    expect(html).toContain('&lt;meta http-equiv=')
    expect(html).toContain('&lt;b&gt;T&lt;/b&gt;')
    expect(html).toContain(`src="cognotez-media://${'a'.repeat(64)}"`)
  })

  it('slugs are readable and never empty', () => {
    expect(slugify('Plan: Q3 / Roadmap!')).toBe('plan-q3-roadmap')
    expect(slugify('日本語 メモ')).toBe('日本語-メモ')
    expect(slugify('???')).toBe('untitled')
  })

  it('export all: unique names, media copied and links rewritten, locked notes skipped but listed', () => {
    const { store, media } = setup()
    const ref = media.importBytes(new Uint8Array(PNG), 'image/png')
    store.notes.create({ title: 'Same', body: `![pic](${ref.url}) and ${ref.url}`, tags: ['t'] })
    store.notes.create({ title: 'Same', body: 'second' })
    store.notes.create({ title: 'Gone', body: 'in trash' })
    store.notes.trash(store.notes.list({ kind: 'all' }).find((n) => n.title === 'Gone')!.id)
    const secret = store.notes.create({ title: 'Diary', body: 'top secret plaintext' })
    store.db.prepare('UPDATE notes SET locked = 1 WHERE id = ?').run(secret.id)
    store.notes.create({ title: 'Broken', body: `![x](cognotez-media://${'b'.repeat(64)})` })

    const out = join(dir, 'out')
    const r = exportAllMarkdown(store, media.dir, out)
    expect(r).toMatchObject({ notes: 3, lockedSkipped: 1, media: 1 })
    expect(readdirSync(out).sort()).toEqual(['_locked-notes-not-exported.txt', 'broken.md', 'media', 'same-2.md', 'same.md'])
    expect(readdirSync(join(out, 'media'))).toEqual([`${ref.hash}.png`])
    expect(readFileSync(join(out, 'media', `${ref.hash}.png`))).toEqual(PNG)
    const names = ['same.md', 'same-2.md'].map((f) => readFileSync(join(out, f), 'utf8'))
    const withImg = names.find((s) => s.includes('media/'))!
    expect(withImg).toContain(`![pic](media/${ref.hash}.png) and media/${ref.hash}.png`)
    expect(withImg).not.toContain('cognotez-media://')
    expect(withImg).toContain('pinned: false')
    expect(readFileSync(join(out, 'broken.md'), 'utf8')).toContain(`cognotez-media://${'b'.repeat(64)}`) // unknown media is left alone
    expect(readFileSync(join(out, '_locked-notes-not-exported.txt'), 'utf8')).toContain('Diary')
    const all = readdirSync(out).map((f) => (f.endsWith('.md') || f.endsWith('.txt') ? readFileSync(join(out, f), 'utf8') : '')).join('\n')
    expect(all).not.toContain('top secret')
    expect(existsSync(join(out, 'diary.md'))).toBe(false)

    // exporting again never overwrites
    const again = exportAllMarkdown(store, media.dir, out)
    expect(again.notes).toBe(3)
    expect(existsSync(join(out, 'same-3.md'))).toBe(true)
  })

  it('title rules: front matter, then a leading # heading (removed), then the file name', () => {
    expect(titleAndBody('---\ntitle: From FM\n---\n\n# Heading\nbody', 'file')).toMatchObject({ title: 'From FM', body: '# Heading\nbody' })
    expect(titleAndBody('# My Heading ##\n\nbody text', 'file')).toMatchObject({ title: 'My Heading', body: 'body text' })
    expect(titleAndBody('intro\n\n# Later heading\nx', 'file')).toMatchObject({ title: 'file', body: 'intro\n\n# Later heading\nx' })
    expect(titleAndBody('just text', 'notes-2026')).toMatchObject({ title: 'notes-2026', body: 'just text' })
  })

  it('front matter parser reads quoted, bare, flow and block values, and ignores non-front-matter', () => {
    expect(splitFrontMatter('---\ntitle: \'It\'\'s\'\ntags:\n  - a\n  - "b c"\npinned: true\n---\nrest').data).toEqual({ title: "It's", tags: ['a', 'b c'], pinned: true })
    expect(splitFrontMatter('---\ntags: [x, "y/z"]\n---\nbody')).toEqual({ data: { tags: ['x', 'y/z'] }, body: 'body' })
    const hr = '---\nsome prose here\n---\nmore'
    expect(splitFrontMatter(hr)).toEqual({ data: {}, body: hr })
  })

  it('import: tags validated, files over the cap and non-files rejected, one note per file, notifies ids', () => {
    const { store, media } = setup()
    const src = join(dir, 'src')
    mkdirSync(src)
    writeFileSync(join(src, 'one.md'), '---\ntitle: One\ntags: [good, "bad//tag", "#hash", ""]\npinned: true\ncreated: 2025-05-06T07:08:09Z\n---\n\nbody one')
    writeFileSync(join(src, 'two.txt'), '# Two\r\n\r\nline\r\n')
    writeFileSync(join(src, 'big.md'), 'x'.repeat(MAX_IMPORT_BYTES + 1))
    mkdirSync(join(src, 'folder.md'))
    const r = importMarkdownFiles(store, media, [join(src, 'one.md'), join(src, 'two.txt'), join(src, 'big.md'), join(src, 'folder.md'), join(src, 'missing.md')])
    expect(r.ids).toHaveLength(2)
    expect(r.skipped.map((s) => s.name).sort()).toEqual(['big.md', 'folder.md', 'missing.md'])
    expect(r.skipped.find((s) => s.name === 'big.md')!.reason).toMatch(/5 MB/)
    const one = store.notes.get(r.ids[0]!)
    expect(one).toMatchObject({ title: 'One', body: 'body one', pinned: true, tags: ['good', 'hash'], createdAt: Date.UTC(2025, 4, 6, 7, 8, 9) })
    expect(store.notes.get(r.ids[1]!)).toMatchObject({ title: 'Two', body: 'line\n', tags: [] })
    expect(store.search('line')).toHaveLength(1)
  })

  it('import: relative images next to the file are stored and rewritten; others are left alone', () => {
    const { store, media } = setup()
    const src = join(dir, 'imgs')
    mkdirSync(join(src, 'media'), { recursive: true })
    writeFileSync(join(src, 'media', 'x.png'), PNG)
    writeFileSync(join(src, 'y one.png'), PNG)
    writeFileSync(join(src, 'not-an-image.png'), 'plain text, not a png')
    writeFileSync(join(dir, 'outside.png'), PNG)
    writeFileSync(
      join(src, 'n.md'),
      '# Pics\n\n![a](media/x.png) ![b](./y%20one.png) ![c](<y one.png> "t") ![d](missing.png) ![e](https://e.example/i.png) ![f](../outside.png) ![g](not-an-image.png)'
    )
    const r = importMarkdownFiles(store, media, [join(src, 'n.md')])
    const n = store.notes.get(r.ids[0]!)
    const hash = createMediaHash()
    expect(n.body).toBe(
      `![a](cognotez-media://${hash}) ![b](cognotez-media://${hash}) ![c](cognotez-media://${hash}) ![d](missing.png) ![e](https://e.example/i.png) ![f](../outside.png) ![g](not-an-image.png)`
    )
    expect(readdirSync(media.dir)).toEqual([hash])
    expect(store.db.prepare('SELECT count(*) AS c FROM note_media WHERE note_id = ?').get(n.id)).toEqual({ c: 1 })
  })

  it('round trip: export all, then import, keeps title, tags, body and the image', () => {
    const a = setup('a')
    const ref = a.media.importBytes(new Uint8Array(PNG), 'image/png')
    const body = `# Not the title\n\nText with ![img](${ref.url})\n\n- [x] done\n`
    a.store.notes.create({ title: 'Round "trip": 1', body, tags: ['x/y', 'z'] })
    a.store.notes.create({ title: '', body: 'no title here' })
    const out = join(dir, 'exp')
    exportAllMarkdown(a.store, a.media.dir, out)

    const b = setup('b')
    const files = readdirSync(out).filter((f) => f.endsWith('.md')).map((f) => join(out, f))
    const r = importMarkdownFiles(b.store, b.media, files)
    expect(r.ids).toHaveLength(2)
    const back = b.store.notes.list({ kind: 'all' }).map((s) => b.store.notes.get(s.id))
    const rt = back.find((n) => n.title === 'Round "trip": 1')!
    expect(rt.tags).toEqual(['x/y', 'z'])
    expect(rt.body).toBe(body) // image link round-trips to the same content address
    expect(readdirSync(b.media.dir)).toEqual([ref.hash])
    expect(back.find((n) => n.body === 'no title here')?.title).toBe('')
  })
})

const createMediaHash = (): string => createHash('sha256').update(PNG).digest('hex')
