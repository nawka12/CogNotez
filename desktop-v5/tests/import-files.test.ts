import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importMarkdownFiles, MAX_IMPORT_BYTES } from '../src/main/import/files'
import { createMedia } from '../src/main/media'
import { memStore } from './helpers'

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'cog-files-'))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('importMarkdownFiles skipped report', () => {
  it('names each skipped file by base name with a short reason that never holds a path', () => {
    const store = memStore()
    const media = createMedia(join(dir, 'media'), store.db)
    const src = join(dir, 'src')
    mkdirSync(src)
    writeFileSync(join(src, 'ok.md'), '# Fine\n\nbody')
    writeFileSync(join(src, 'big.md'), 'x'.repeat(MAX_IMPORT_BYTES + 1))
    writeFileSync(join(src, 'latin1.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0xff, 0xfe]))
    writeFileSync(join(src, 'locked.md'), 'secret')
    chmodSync(join(src, 'locked.md'), 0)
    symlinkSync(join(src, 'nowhere'), join(src, 'dangling.md'))
    const r = importMarkdownFiles(store, media, ['ok.md', 'big.md', 'latin1.txt', 'locked.md', 'dangling.md', 'gone.md'].map((n) => join(src, n)))
    expect(r.ids).toHaveLength(1)
    const by = Object.fromEntries(r.skipped.map((s) => [s.name, s.reason]))
    expect(by['big.md']).toBe('over 5 MB')
    expect(by['latin1.txt']).toBe('not UTF-8 text')
    expect(by['gone.md']).toBe('unreadable')
    expect(by['dangling.md']).toBe('not a regular file')
    if (process.getuid?.() !== 0) expect(by['locked.md']).toBe('unreadable')
    for (const s of r.skipped) {
      expect(s.name).not.toContain('/')
      expect(s.reason).not.toContain(dir)
    }
  })
})
