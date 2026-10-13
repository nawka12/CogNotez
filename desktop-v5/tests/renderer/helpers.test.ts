import { describe, expect, it } from 'vitest'
import { filterItems } from '../../src/renderer/src/lib/palette'
import { cleanTag, hasTag, mergeTags, parseTagInput, tagRows } from '../../src/renderer/src/lib/tags'
import { countWords, plainText, readingMinutes } from '../../src/renderer/src/lib/text'
import { relativeTime } from '../../src/renderer/src/lib/time'
import { t } from '../../src/renderer/src/i18n'

describe('word count and reading time', () => {
  it('ignores markdown syntax', () => {
    expect(countWords('## Title\n\n- [ ] one two\n- [x] three\n\n> quote **bold** `code`')).toBe(7)
    expect(plainText('![alt text](cognotez-media://x) and [a link](https://x.y)')).toBe('alt text and a link')
  })
  it('skips fence lines but counts code content', () => {
    expect(countWords('```js\nconst a = 1\n```')).toBe(3)
  })
  it('counts nothing for an empty note', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  \n\n ')).toBe(0)
  })
  it('rounds reading time at 230 wpm, never below one minute', () => {
    expect(readingMinutes(0)).toBe(1)
    expect(readingMinutes(230)).toBe(1)
    expect(readingMinutes(700)).toBe(3)
  })
})

describe('relative time', () => {
  const now = new Date(2026, 9, 13, 15, 0, 0).getTime()
  const ago = (ms: number): number => now - ms
  it('formats recent times', () => {
    expect(relativeTime(ago(10_000), now)).toBe('just now')
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 min ago')
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 hr ago')
  })
  it('formats days', () => {
    expect(relativeTime(new Date(2026, 9, 12, 9, 0).getTime(), now)).toBe('Yesterday')
    expect(relativeTime(new Date(2026, 9, 10, 9, 0).getTime(), now)).toBe('Sat')
    expect(relativeTime(new Date(2026, 8, 21, 9, 0).getTime(), now)).toBe('Sep 21')
    expect(relativeTime(new Date(2024, 11, 3, 9, 0).getTime(), now)).toBe('Dec 3, 2024')
  })
  it('treats a future timestamp as now', () => {
    expect(relativeTime(now + 5000, now)).toBe('just now')
  })
})

describe('t()', () => {
  it('interpolates and picks the singular form for n = 1', () => {
    expect(t('meta.words', { n: 12 })).toBe('12 words')
    expect(t('meta.words', { n: 1 })).toBe('1 word')
    expect(t('tabs.close', { title: 'A' })).toBe('Close A')
  })
})

describe('palette filtering', () => {
  const items = [
    { group: 'Actions', label: 'New note' },
    { group: 'Actions', label: 'Split view' },
    { group: 'Theme', label: 'Theme: Dark', hint: 'night' },
    { group: 'Notes', label: 'Ramen broth', hint: 'chicken paitan' }
  ]
  it('returns everything for an empty query', () => {
    expect(filterItems(items, '  ')).toHaveLength(4)
  })
  it('needs every word, in any order, case-insensitively', () => {
    expect(filterItems(items, 'VIEW split').map((i) => i.label)).toEqual(['Split view'])
    expect(filterItems(items, 'note new')).toHaveLength(1)
  })
  it('matches group and hint text', () => {
    expect(filterItems(items, 'theme').map((i) => i.label)).toEqual(['Theme: Dark'])
    expect(filterItems(items, 'paitan')).toHaveLength(1)
    expect(filterItems(items, 'zzz')).toEqual([])
  })
})

describe('tag input', () => {
  it('splits on commas, strips #, joins spaces, drops empties and duplicates', () => {
    expect(parseTagInput('work, #ideas/new,, a b ,WORK')).toEqual(['work', 'ideas/new', 'a-b'])
  })
  it('rejects unusable names', () => {
    expect(cleanTag('///')).toBeNull()
    expect(cleanTag('x'.repeat(101))).toBeNull()
    expect(cleanTag('bad\u0007tag')).toBeNull()
    expect(cleanTag('a//b/')).toBe('a/b')
  })
  it('merges without case-insensitive duplicates', () => {
    expect(mergeTags(['Work'], ['work', 'home'])).toEqual(['Work', 'home'])
  })
  it('matches a tag and its children only', () => {
    expect(hasTag(['cognotez/sync'], 'cognotez')).toBe(true)
    expect(hasTag(['Cognotez'], 'cognotez')).toBe(true)
    expect(hasTag(['cognotez2'], 'cognotez')).toBe(false)
  })
  it('builds a tree with parents counted once per note', () => {
    const rows = tagRows(['a/b', 'a/c', 'z'], [{ tags: ['a/b', 'a/c'] }, { tags: ['a/b'] }, { tags: ['z'] }])
    expect(rows.map((r) => [r.path, r.depth, r.count])).toEqual([
      ['a', 0, 2],
      ['a/b', 1, 2],
      ['a/c', 1, 1],
      ['z', 0, 1]
    ])
  })
})
