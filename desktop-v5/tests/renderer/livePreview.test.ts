// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import type { DecorationSet, WidgetType } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { blockField, inlineDecos, linkAt, livePreview, toggleTask } from '../../src/renderer/src/editor/livePreview'

const make = (doc: string, cursor = doc.length, ext = true): EditorState =>
  EditorState.create({ doc, selection: { anchor: cursor }, extensions: [markdown({ base: markdownLanguage }), ext ? livePreview : []] })

interface Hit {
  text: string
  widget?: WidgetType
}
/** Every replaced range (inline and block), as the text it covers. */
function hidden(s: EditorState): Hit[] {
  const out: Hit[] = []
  const collect = (set: DecorationSet): void => {
    for (let c = set.iter(); c.value; c.next()) if (c.from < c.to && !c.value.spec.class) out.push({ text: s.sliceDoc(c.from, c.to), widget: c.value.spec.widget })
  }
  collect(inlineDecos(s, [{ from: 0, to: s.doc.length }]))
  collect(s.field(blockField).decos)
  return out
}
const texts = (s: EditorState): string[] => hidden(s).map((h) => h.text)

const DOC = `# Title

Some *em* and **strong** ~~gone~~ \`code\` [link](https://a.b "t") end.

![alt](cognotez-media://abc)

| a | b |
| - | - |
| 1 | 2 |

\`\`\`js
x
\`\`\`

- item
- [ ] open
- [x] done

> quote

---
`
const lineStart = (s: EditorState, n: number): number => s.doc.line(n).from

describe('live preview: what is hidden', () => {
  it('hides everything when the cursor is elsewhere', () => {
    const s = make(DOC + '\nlast', DOC.length + 2)
    expect(texts(s)).toEqual([
      '# ',
      '*',
      '*',
      '**',
      '**',
      '~~',
      '~~',
      '`',
      '`',
      '[',
      '](https://a.b "t")',
      '![alt](cognotez-media://abc)',
      '```',
      'js',
      '```',
      '- ',
      '- [ ] ',
      '- [x] ',
      '> ',
      '---',
      '| a | b |\n| - | - |\n| 1 | 2 |'
    ])
  })
  it('reveals the heading line only', () => {
    expect(texts(make(DOC, 3))).not.toContain('# ')
    expect(texts(make(DOC, 3))).toContain('*')
  })
  it('reveals inline marks and links on the touched line', () => {
    const s = make(DOC, lineStart(make(DOC), 3) + 2)
    const t = texts(s)
    for (const m of ['*', '**', '~~', '`', '[', '](https://a.b "t")']) expect(t).not.toContain(m)
    expect(t).toContain('# ')
  })
  it('reveals an image on its line', () => {
    expect(texts(make(DOC, lineStart(make(DOC), 5)))).not.toContain('![alt](cognotez-media://abc)')
  })
  it('reveals the whole table when the cursor is in any row', () => {
    const s0 = make(DOC)
    for (const n of [7, 8, 9]) expect(texts(make(DOC, lineStart(s0, n) + 1)).some((x) => x.startsWith('| a'))).toBe(false)
  })
  it('reveals both fences when the cursor is inside the code block', () => {
    const t = texts(make(DOC, lineStart(make(DOC), 12)))
    expect(t).not.toContain('```')
    expect(t).not.toContain('js')
  })
  it('reveals list markers, tasks and quotes per line', () => {
    const s0 = make(DOC)
    expect(texts(make(DOC, lineStart(s0, 15)))).not.toContain('- ')
    expect(texts(make(DOC, lineStart(s0, 16) + 3))).not.toContain('- [ ] ')
    expect(texts(make(DOC, lineStart(s0, 16) + 3))).toContain('- [x] ')
    expect(texts(make(DOC, lineStart(s0, 19)))).not.toContain('> ')
  })
  it('respects every selection range', () => {
    const s0 = make(DOC)
    const s = EditorState.create({
      doc: DOC,
      selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(lineStart(s0, 19))]),
      extensions: [markdown({ base: markdownLanguage }), livePreview, EditorState.allowMultipleSelections.of(true)]
    })
    const t = texts(s)
    expect(t).not.toContain('# ')
    expect(t).not.toContain('> ')
    expect(t).toContain('*')
  })
  it('reveals a bare cursor only while focused, a selection always', () => {
    const s0 = make(DOC)
    const blurred = (s: EditorState): string[] => {
      const out: string[] = []
      for (let c = inlineDecos(s, [{ from: 0, to: s.doc.length }], false).iter(); c.value; c.next()) if (c.from < c.to) out.push(s.sliceDoc(c.from, c.to))
      return out
    }
    expect(blurred(make(DOC, 1))).toContain('# ')
    expect(blurred(s0.update({ selection: { anchor: 0, head: 3 } }).state)).not.toContain('# ')
  })
  it('keeps nested list indentation as space', () => {
    const t = hidden(make('- a\n  - b\n    1. c\n\nz'))
    expect(t.map((h) => h.text)).toEqual(['- ', '  ', '- ', '    ', '1. '])
  })
  it('updates the block reveal when only the selection moves', () => {
    const s = make(DOC)
    const inTable = s.update({ selection: { anchor: lineStart(s, 8) } }).state
    expect(inTable.field(blockField).decos.size).toBe(0)
    expect(inTable.update({ selection: { anchor: 0 } }).state.field(blockField).decos.size).toBe(1)
  })
  it('does not treat bracketed text without a target as a link', () => {
    expect(texts(make('a [ ] b [x] c\n\nz'))).toEqual([])
  })
})

describe('live preview: links', () => {
  it('finds the target under the cursor', () => {
    const s = make('[x](https://a.b) <https://c.d> www.e.f me@g.h')
    expect(linkAt(s, 1)).toBe('https://a.b')
    expect(linkAt(s, 20)).toBe('https://c.d')
    expect(linkAt(s, 33)).toBe('https://www.e.f')
    expect(linkAt(s, 42)).toBe('mailto:me@g.h')
    expect(linkAt(make('plain text'), 3)).toBeNull()
  })
})

describe('live preview: tasks', () => {
  it('toggles with exactly one single-character change', () => {
    const s = make('- [ ] a\n- [x] b')
    const spec = toggleTask(s, 0)!
    const tr = s.update(spec)
    let n = 0
    tr.changes.iterChanges(() => n++)
    expect(n).toBe(1)
    expect(tr.newDoc.toString()).toBe('- [x] a\n- [x] b')
    expect(s.update(toggleTask(s, 8)!).newDoc.toString()).toBe('- [ ] a\n- [ ] b')
  })
  it('does nothing when read-only', () => {
    const s = EditorState.create({ doc: '- [ ] a', extensions: [EditorState.readOnly.of(true)] })
    expect(toggleTask(s, 0)).toBeNull()
  })
})

describe('live preview: the text', () => {
  it('is identical with and without rendering, through selection changes', () => {
    let a = make(DOC, 0)
    const b = make(DOC, 0, false)
    for (const pos of [5, 40, 90, DOC.length]) a = a.update({ selection: { anchor: pos } }).state
    expect(a.doc.toString()).toBe(b.doc.toString())
    expect(a.doc.toString()).toBe(DOC)
  })
})

describe('live preview: HTML blocks', () => {
  it('render sanitized', () => {
    const src = '<div>\n<script>alert(1)</script><img src="cognotez-media://abc" onerror="alert(2)"><iframe src="https://x.y"></iframe><b>ok</b>\n</div>'
    const s = make(src + '\n\nz')
    const w = hidden(s).find((h) => h.text === src)!.widget!
    const html = w.toDOM(null as never).innerHTML
    expect(html).toContain('<b>ok</b>')
    expect(html).toContain('cognotez-media://abc')
    for (const bad of ['<script', 'onerror', '<iframe']) expect(html).not.toContain(bad)
  })
  it('render v4 video embeds with controls, also when they continue a paragraph', () => {
    const v4 = '<video width="100%">\n  <source src="cognotez-media://abc" type="video/mp4">\n  Your browser does not support the video tag.\n</video>'
    for (const src of [v4, 'Clip:\n' + v4, '<video><source src="cognotez-media://abc"></video>']) {
      const el = hidden(make(src + '\n\nz')).find((h) => h.text === src)!.widget!.toDOM(null as never)
      expect(el.querySelector('video')?.controls).toBe(true)
    }
  })
})
