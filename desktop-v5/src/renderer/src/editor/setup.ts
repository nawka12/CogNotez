import { Annotation, EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, drawSelection, keymap, placeholder } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'
import { t as tr } from '../i18n'
import { prefs } from '../state/prefs.svelte'

/** Marks a transaction that came from outside the user (a reload): it must not count as an edit. */
export const external = Annotation.define<boolean>()

// Markdown marks stay inline (CodeMirror needs real text to place the caret) but fade into the background.
const mark = { fontFamily: 'var(--mono)', fontSize: '.67em', fontStyle: 'normal', fontWeight: '400', color: 'var(--ink-3)', opacity: '.7' }

const highlight = HighlightStyle.define([
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.quote, fontStyle: 'italic', color: 'var(--ink-2)' },
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '600' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, ...mark },
  { tag: [t.processingInstruction, t.atom, t.labelName], ...mark }
])

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/

function decorate(view: EditorView): DecorationSet {
  const { state } = view
  const lines = new Map<number, Set<string>>()
  const ranges: Range<Decoration>[] = []
  const addLines = (from: number, to: number, cls: string): void => {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos)
      const set = lines.get(line.from) ?? new Set<string>()
      lines.set(line.from, set.add(cls))
      pos = line.to + 1
    }
  }
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const h = HEADING.exec(node.name)
        if (h) addLines(node.from, node.to, `cm-h${Math.min(Number(h[1]), 3)}`)
        else if (node.name === 'FencedCode' || node.name === 'CodeBlock') addLines(node.from, node.to, 'cm-code')
        else if (node.name === 'Task' && /^\[[xX]\]/.test(state.sliceDoc(node.from, node.from + 3))) addLines(node.from, node.to, 'cm-done')
        else if (node.name === 'InlineCode') ranges.push(Decoration.mark({ class: 'cm-icode' }).range(node.from, node.to))
      }
    })
  }
  for (const [pos, set] of lines) ranges.push(Decoration.line({ class: [...set].join(' ') }).range(pos))
  return Decoration.set(ranges, true)
}

const structure = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorate(view)
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = decorate(u.view)
    }
  },
  { decorations: (v) => v.decorations }
)

const theme = EditorView.theme({
  '&': { font: '400 var(--note-size, 1.125rem)/1.7 var(--read)', color: 'var(--ink)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { font: 'inherit', lineHeight: 'inherit' },
  '.cm-content': { padding: '0', minHeight: '40vh', caretColor: 'var(--accent)' },
  // Long unbroken tokens (a media URL, a hash) wrap anywhere instead of overflowing or leaving a ragged gap.
  '.cm-line': { padding: '0', overflowWrap: 'anywhere' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--accent) 22%, transparent)'
  },
  '.cm-placeholder': { color: 'var(--ink-3)' },
  '.cm-h1': { fontSize: 'calc(var(--note-size, 1.125rem) * 1.33)', fontWeight: '600', lineHeight: '1.4', paddingTop: '.35em' },
  '.cm-h2': { fontSize: 'calc(var(--note-size, 1.125rem) * 1.17)', fontWeight: '600', lineHeight: '1.45', paddingTop: '.35em' },
  '.cm-h3': { fontSize: 'var(--note-size, 1.125rem)', fontWeight: '600', paddingTop: '.3em' },
  '.cm-code': { fontFamily: 'var(--mono)', fontSize: '.8em', lineHeight: '1.65', background: 'var(--panel)', padding: '0 .9em' },
  '.cm-done': { color: 'var(--ink-3)', textDecoration: 'line-through', textDecorationColor: 'var(--rule)' },
  '.cm-icode': { fontFamily: 'var(--mono)', fontSize: '.85em', background: 'var(--sunk)', padding: '.1em .3em', borderRadius: '3px' },
  // search panel (Mod-F)
  '.cm-panels': { background: 'var(--panel)', color: 'var(--ink)', font: '13px/1.45 var(--ui)' },
  '.cm-panels-top': {
    position: 'sticky',
    top: '0',
    zIndex: '5',
    border: '1px solid var(--rule)',
    borderRadius: '8px',
    marginBottom: '.75rem',
    boxShadow: 'var(--shadow)'
  },
  '.cm-search': { padding: '8px 28px 8px 8px' },
  '.cm-search label': { color: 'var(--ink-2)' },
  '.cm-textfield': {
    background: 'var(--paper)',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '5px',
    padding: '3px 8px'
  },
  '.cm-button': {
    background: 'var(--paper)',
    backgroundImage: 'none',
    color: 'var(--ink)',
    border: '1px solid var(--rule)',
    borderRadius: '5px',
    padding: '3px 10px'
  },
  '.cm-button:hover': { background: 'var(--hover)' },
  '.cm-panel.cm-search [name=close]': { color: 'var(--ink-2)', cursor: 'pointer' },
  '.cm-searchMatch': { background: 'var(--accent-soft)', outline: '1px solid var(--mark)' },
  '.cm-searchMatch-selected': { background: 'color-mix(in srgb, var(--accent) 30%, transparent)' }
})

const extensions = [
  history(),
  drawSelection(),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ 'aria-label': tr('editor.label') }),
  // A function, so the Settings toggle takes effect on the next update (the editor dispatches an empty one).
  EditorView.contentAttributes.of(() => ({ spellcheck: prefs.spellcheck ? 'true' : 'false' })),
  placeholder(tr('editor.placeholder')),
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(highlight),
  structure,
  search({ top: true }),
  keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap]),
  theme
]

/** A fresh editor state: its own undo history, selection and document. */
export const createState = (body: string): EditorState => EditorState.create({ doc: body, extensions })
