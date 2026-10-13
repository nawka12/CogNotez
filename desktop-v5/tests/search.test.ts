import { describe, expect, it } from 'vitest'
import { ftsMatch, parseSearch } from '../src/main/store/notes'
import { memStore, tickingClock } from './helpers'

// Local-time days, matching how before:/after: are interpreted.
const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()

function fixture() {
  const s = memStore(tickingClock())
  const make = (title: string, body: string, tags: string[] = []) => s.notes.create({ title, body, tags })
  const alpha = make('Alpha plan', 'Quarterly roadmap for the café project', ['work'])
  const beta = make('Beta', 'Grocery list: apples, bananas', ['home'])
  const gamma = make('Gamma', 'Roadmap draft with "quoted" text', ['work/projects'])
  s.notes.save({ id: beta.id, pinned: true })
  return { s, alpha, beta, gamma }
}
const titles = (r: { title: string }[]) => r.map((x) => x.title).sort()

describe('search', () => {
  it('matches prefix words, AND-combined, diacritics-insensitive', () => {
    const { s } = fixture()
    expect(titles(s.search('road'))).toEqual(['Alpha plan', 'Gamma'])
    expect(titles(s.search('road quart'))).toEqual(['Alpha plan'])
    expect(titles(s.search('cafe'))).toEqual(['Alpha plan']) // remove_diacritics
    expect(titles(s.search('BANAN'))).toEqual(['Beta'])
    expect(s.search('nothingmatches')).toEqual([])
  })

  it('returns a snippet() around the match', () => {
    const { s } = fixture()
    const [hit] = s.search('apples')
    expect(hit?.snippet).toContain('apples')
    expect(hit).toMatchObject({ title: 'Beta', pinned: true, tags: ['home'] })
  })

  it('supports tag: (with children, case-insensitive, quoted values)', () => {
    const { s } = fixture()
    expect(titles(s.search('tag:work'))).toEqual(['Alpha plan', 'Gamma'])
    expect(titles(s.search('TAG:Work/Projects'))).toEqual(['Gamma'])
    expect(titles(s.search('tag:work roadmap draft'))).toEqual(['Gamma'])
    s.notes.create({ title: 'Spaced', tags: ['my tag'] })
    expect(titles(s.search('tag:"my tag"'))).toEqual(['Spaced'])
  })

  it('supports is:pinned and in:trash', () => {
    const { s, alpha } = fixture()
    expect(titles(s.search('is:pinned'))).toEqual(['Beta'])
    expect(titles(s.search('is:pinned list'))).toEqual(['Beta'])
    expect(s.search('is:pinned plan')).toEqual([])

    s.notes.trash(alpha.id)
    expect(titles(s.search('road'))).toEqual(['Gamma']) // trash excluded by default
    expect(titles(s.search('in:trash'))).toEqual(['Alpha plan'])
    expect(titles(s.search('in:trash road'))).toEqual(['Alpha plan'])
  })

  it('supports before: and after: (after inclusive, before exclusive)', () => {
    const s = memStore()
    const mk = (title: string, at: number) => {
      const n = s.notes.create({ title })
      s.db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(at, n.id)
    }
    mk('jan10', day(2026, 1, 10))
    mk('jan20', day(2026, 1, 20))
    mk('feb05', day(2026, 2, 5))
    expect(titles(s.search('before:2026-01-20'))).toEqual(['jan10'])
    expect(titles(s.search('after:2026-01-20'))).toEqual(['feb05', 'jan20'])
    expect(titles(s.search('after:2026-01-11 before:2026-02-01'))).toEqual(['jan20'])
    expect(titles(s.search('after:2026-01-01 jan'))).toEqual(['jan10', 'jan20'])
    // not a real date -> treated as an ordinary word, no crash
    expect(s.search('before:2026-02-31')).toEqual([])
  })

  it('an empty query lists everything the filters allow', () => {
    const { s } = fixture()
    expect(s.search('')).toHaveLength(3)
    expect(s.search('   ')).toHaveLength(3)
  })

  it('quotes, FTS operators and punctuation never break the query', () => {
    const { s } = fixture()
    for (const q of ['"', '""', 'say "hello', 'a"b', '"quoted"', 'NEAR(', 'a OR b', 'AND', '-x', '*', '(', ')', ':', 'tag:', 'is:', '^x', 'x:y', "it's", '\\']) {
      expect(() => s.search(q), q).not.toThrow()
    }
    expect(titles(s.search('"quoted"'))).toEqual(['Gamma'])
    expect(titles(s.search('"quote'))).toEqual(['Gamma'])
    // FTS keywords are plain words, not operators
    expect(s.search('roadmap OR zzz')).toEqual([])
  })

  it('stays in sync with edits and deletes (triggers)', () => {
    const { s, alpha } = fixture()
    s.notes.save({ id: alpha.id, body: 'completely different' })
    expect(s.search('quarterly')).toEqual([])
    expect(titles(s.search('different'))).toEqual(['Alpha plan'])
    s.notes.trash(alpha.id)
    s.notes.deleteForever(alpha.id)
    expect(s.search('different in:trash')).toEqual([])
  })
})

describe('query parsing', () => {
  it('parseSearch splits operators from words', () => {
    expect(parseSearch('tag:a is:pinned in:trash before:2026-01-02 after:2026-01-01 hello wor"ld')).toMatchObject({
      tags: ['a'],
      pinned: true,
      trash: true,
      words: ['hello', 'wor"ld']
    })
    expect(parseSearch('IS:Pinned').pinned).toBe(true)
    expect(parseSearch('is:other tag:').words).toEqual(['is:other', 'tag:'])
  })

  it('ftsMatch quotes each word as a prefix term and escapes "', () => {
    expect(ftsMatch(['abc', 'x"y'])).toBe('"abc"* "x""y"*')
    expect(ftsMatch(['"', '...', '日本'])).toBe('"日本"*')
    expect(ftsMatch([])).toBe('')
  })
})
