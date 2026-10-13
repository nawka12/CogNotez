import { describe, expect, it } from 'vitest'
import { fillDate, fromV4, MAX_CUSTOM_BYTES, noteFrom, parseBuiltin, parseCustom, seedCustom } from '../../src/renderer/src/lib/templates'

const day = new Date(2026, 9, 13, 8, 30)

describe('templates', () => {
  it('built-in: name from the first line, title and body split when a note is made', () => {
    const t = parseBuiltin('daily-journal', '# Daily journal {{date}}\n\n## Mood\n')
    expect(t.name).toBe('Daily journal')
    expect(noteFrom(t, true, day)).toEqual({ title: 'Daily journal 2026-10-13', body: '## Mood\n' })
    expect(fillDate('{{date}} and {{date}}', day)).toBe('2026-10-13 and 2026-10-13')
  })

  it('custom: the template name is the note title and the body is used as written', () => {
    expect(noteFrom({ id: 'c', name: 'Weekly', body: '# Not a title\n{{date}}' }, false, day)).toEqual({ title: 'Weekly', body: '# Not a title\n2026-10-13' })
  })

  it('reads stored custom templates defensively', () => {
    expect(parseCustom([{ id: 'a', name: 'A', body: 'x' }, { id: 1, name: 'bad' }, null, { id: 'b', name: ' ', body: '' }])).toEqual([{ id: 'a', name: 'A', body: 'x' }])
    expect(parseCustom('nope')).toEqual([])
  })

  it('seeds from the v4 import only when templates.custom was never set', () => {
    const v4 = [
      { id: 'custom-1699', name: 'Weekly Report', description: 'd', icon: 'x', content: '## Done\n', isDefault: false },
      { id: 'custom-2', name: '', content: 'skipped: no name' },
      { id: 3, name: 'No content' }
    ]
    expect(seedCustom(null, v4)).toEqual({
      seeded: true,
      templates: [{ id: 'v4-custom-1699', name: 'Weekly Report', body: '## Done\n' }, { id: 'v4-3', name: 'No content', body: '' }]
    })
    expect(seedCustom([], v4)).toEqual({ seeded: false, templates: [] }) // the user deleted them all: do not bring them back
    expect(seedCustom(null, undefined)).toEqual({ seeded: false, templates: [] })
    expect(seedCustom([{ id: 'a', name: 'Mine', body: '' }], v4).templates).toHaveLength(1)
  })

  it('v4 templates are capped to fit the 64 KB setting', () => {
    const big = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `T${i}`, content: 'x'.repeat(5000) }))
    const out = fromV4(big)
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(30)
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(MAX_CUSTOM_BYTES)
  })
})
