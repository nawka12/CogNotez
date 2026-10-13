// Live preview: Markdown renders in place and shows its source wherever the selection touches it.
// Inline marks reveal per line; tables and HTML blocks are block widgets (a StateField, as CodeMirror requires)
// and reveal as a whole. Nothing here changes the text except the task checkbox, which is one undoable edit.
import { StateField } from '@codemirror/state'
import type { EditorState, Range, TransactionSpec } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { isolateHistory } from '@codemirror/commands'
import { syntaxTree } from '@codemirror/language'
import { getChunks } from '@codemirror/merge'
import type { SyntaxNode, Tree } from '@lezer/common'
import { renderMarkdown } from '../lib/markdown'

/** During an AI review everything shows as source, so the merge view's marks sit on the real text. */
const raw = (s: EditorState): boolean => getChunks(s) !== null

/** Does any selection range touch [from, to]? Bare cursors count only while the editor has focus. */
const touches = (s: EditorState, from: number, to: number, cursors = true): boolean =>
  s.selection.ranges.some((r) => r.from <= to && r.to >= from && (cursors || !r.empty))

const SAFE_IMG = /^(?:cognotez-media:|data:image\/)/i
const hide = Decoration.replace({})

// ---- block widgets (tables, HTML blocks) ----

interface Block {
  from: number
  to: number
  table: boolean
}

function findBlocks(s: EditorState, tree: Tree): Block[] {
  const out: Block[] = []
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    const from = n.from
    const media = (n.name === 'Paragraph' || n.name === 'HTMLBlock') && /<(video|audio)\b/i.exec(s.sliceDoc(n.from, n.to))?.[1]
    if (n.name !== 'Table' && n.name !== 'HTMLBlock' && !media) continue
    // v4 media HTML often continues a paragraph, so the parser splits it: keep it whole, up to its closing tag.
    if (media) {
      const close = new RegExp(`</${media}>`, 'i')
      while (!close.test(s.sliceDoc(from, n.to)) && n.nextSibling && s.doc.lineAt(n.nextSibling.from).from <= s.doc.lineAt(n.to).to + 1) n = n.nextSibling
    }
    // Whole lines: a block replace must not split one. A node may end just past its newline.
    out.push({ from: s.doc.lineAt(from).from, to: s.doc.lineAt(Math.max(from, n.to - 1)).to, table: n.name === 'Table' })
  }
  return out
}

function placeholder(text: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'cm-lp-noimg'
  el.textContent = text
  return el
}

class BlockWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly table: boolean
  ) {
    super()
  }
  eq(o: BlockWidget): boolean {
    return o.src === this.src
  }
  toDOM(): HTMLElement {
    const el = document.createElement('div')
    el.className = 'cm-lp-block prose'
    if (this.table) el.dataset.table = ''
    el.innerHTML = renderMarkdown(this.src) // sanitized by DOMPurify
    for (const m of el.querySelectorAll<HTMLMediaElement>('video, audio')) {
      m.controls = true
      m.preload = 'metadata'
    }
    // Remote images are blocked by the CSP anyway; don't try.
    for (const img of el.querySelectorAll('img')) if (!SAFE_IMG.test(img.getAttribute('src') ?? '')) img.replaceWith(placeholder(img.alt || img.src))
    if (!el.innerHTML.trim()) {
      el.className = 'cm-lp-block cm-lp-raw'
      el.textContent = this.src
    }
    return el
  }
  /** Media controls work in place; any other click moves the cursor into the source. */
  ignoreEvent(e: Event): boolean {
    return !!(e.target as Element).closest?.('video, audio')
  }
}

function blockDecos(s: EditorState, blocks: Block[]): DecorationSet {
  if (raw(s)) return Decoration.none
  const out = blocks
    .filter((b) => !touches(s, b.from, b.to))
    .map((b) => Decoration.replace({ widget: new BlockWidget(s.sliceDoc(b.from, b.to), b.table), block: true }).range(b.from, b.to))
  return Decoration.set(out)
}

interface Blocks {
  tree: Tree
  blocks: Block[]
  decos: DecorationSet
}
const build = (s: EditorState): Blocks => {
  const tree = syntaxTree(s)
  const blocks = findBlocks(s, tree)
  return { tree, blocks, decos: blockDecos(s, blocks) }
}

export const blockField = StateField.define<Blocks>({
  create: build,
  update(v, tr) {
    // The tree changes with the text and as background parsing advances; a moved cursor only re-reveals.
    if (syntaxTree(tr.state) !== v.tree) return build(tr.state)
    if (tr.selection || tr.reconfigured) return { ...v, decos: blockDecos(tr.state, v.blocks) }
    return v
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decos)
})

// ---- inline widgets ----

const IMG_H = '26rem'
/** Natural sizes of loaded images, so a re-created widget reserves its box before the image loads. */
const sizes = new Map<string, [number, number]>()

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly width = '',
    readonly below = false
  ) {
    super()
  }
  eq(o: ImageWidget): boolean {
    return o.src === this.src && o.alt === this.alt && o.width === this.width && o.below === this.below
  }
  toDOM(): HTMLElement {
    if (!SAFE_IMG.test(this.src)) return placeholder(this.alt || this.src)
    const img = document.createElement('img')
    img.className = this.below ? 'cm-lp-img cm-lp-below' : 'cm-lp-img'
    img.alt = this.alt
    img.draggable = false
    const size = sizes.get(this.src)
    if (size) {
      const [w, h] = size
      img.style.aspectRatio = `${w} / ${h}`
      img.style.width = `min(100%, ${w}px, calc(${IMG_H} * ${w / h}))`
    }
    if (/^\d+$/.test(this.width)) img.style.width = `min(100%, ${this.width}px)`
    img.onload = () => sizes.set(this.src, [img.naturalWidth, img.naturalHeight])
    img.src = this.src
    return img
  }
  ignoreEvent(): boolean {
    return false
  }
}

class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly readOnly: boolean
  ) {
    super()
  }
  eq(o: TaskWidget): boolean {
    return o.checked === this.checked && o.readOnly === this.readOnly
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-lp-task'
    this.updateDOM(box)
    box.onchange = () => {
      const spec = toggleTask(view.state, view.posAtDOM(box))
      if (spec) view.dispatch(spec)
      else box.checked = this.checked
    }
    return box
  }
  /** Keeps the same input (and its focus) when only the state changed. */
  updateDOM(dom: HTMLElement): boolean {
    const box = dom as HTMLInputElement
    box.checked = this.checked
    box.disabled = this.readOnly
    return true
  }
}

/** A list marker (`•` or the item's number), or the indentation before one (`cols` spaces wide). */
class Marker extends WidgetType {
  constructor(
    readonly text: string,
    readonly cols = 0
  ) {
    super()
  }
  eq(o: Marker): boolean {
    return o.text === this.text && o.cols === this.cols
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = this.cols ? 'cm-lp-indent' : 'cm-lp-marker'
    el.textContent = this.text
    if (this.cols) el.style.width = `${this.cols * 0.75}em`
    return el
  }
  ignoreEvent(): boolean {
    return false
  }
}

/** Flips the `[ ]`/`[x]` at or after `pos` on its line: one change, its own undo step. */
export function toggleTask(s: EditorState, pos: number): TransactionSpec | null {
  if (s.readOnly) return null
  const line = s.doc.lineAt(pos)
  const m = /\[([ xX])\]/.exec(line.text.slice(pos - line.from))
  if (!m) return null
  const at = pos + m.index + 1
  return { changes: { from: at, to: at + 1, insert: m[1] === ' ' ? 'x' : ' ' }, annotations: isolateHistory.of('full'), userEvent: 'input.toggle' }
}

const attr = (tag: string, name: string): string => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined) ?? ''

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/
const link = Decoration.mark({ class: 'cm-lp-link' })
const icode = Decoration.mark({ class: 'cm-icode' })

/** Line styles everywhere; marks hidden and widgets drawn on lines the selection doesn't touch. */
export function inlineDecos(s: EditorState, visible: readonly { from: number; to: number }[], focused = true): DecorationSet {
  const all = raw(s)
  const doc = s.doc
  const lines = new Map<number, Set<string>>()
  const out: Range<Decoration>[] = []
  const addLines = (from: number, to: number, cls: string): void => {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos)
      lines.set(line.from, (lines.get(line.from) ?? new Set<string>()).add(cls))
      pos = line.to + 1
    }
  }
  const shown = (pos: number): boolean => {
    if (all) return true
    const line = doc.lineAt(pos)
    return touches(s, line.from, line.to, focused)
  }
  const at = (pos: number): string => s.sliceDoc(pos, pos + 1)
  const ro = s.readOnly
  const imageAt = (n: SyntaxNode): ImageWidget | null => {
    if (n.name === 'Image') {
      const marks = n.getChildren('LinkMark')
      const url = n.getChild('URL')
      return new ImageWidget(url ? s.sliceDoc(url.from, url.to) : '', marks.length > 1 ? s.sliceDoc(marks[0].to, marks[1].from) : '')
    }
    const tag = n.name === 'HTMLTag' ? s.sliceDoc(n.from, n.to) : ''
    return /^<img\b/i.test(tag) ? new ImageWidget(attr(tag, 'src'), attr(tag, 'alt'), attr(tag, 'width')) : null
  }
  for (const { from, to } of visible) {
    syntaxTree(s).iterate({
      from,
      to,
      enter(ref) {
        const { name, from: a, to: b } = ref
        const parent = ref.node.parent?.name ?? ''
        const h = HEADING.exec(name)
        if (h) addLines(a, b, `cm-h${Math.min(Number(h[1]), 3)}`)
        else if (name === 'Table' || name === 'HTMLBlock') return false // block widgets; raw text when revealed
        else if (name === 'CodeBlock') addLines(a, b, 'cm-code')
        else if (name === 'FencedCode') {
          addLines(a, b, 'cm-code')
          addLines(a, a, 'cm-code-top')
          addLines(b, b, 'cm-code-end')
          if (all || touches(s, a, b, focused)) return false
          for (let c = ref.node.firstChild; c; c = c.nextSibling) {
            if (c.name !== 'CodeMark' && c.name !== 'CodeInfo') continue
            out.push(hide.range(c.from, c.to))
            addLines(c.from, c.from, 'cm-lp-fence') // an empty fence line shrinks to padding
          }
          return false
        } else if (name === 'Blockquote') addLines(a, b, 'cm-lp-quote')
        else if (name === 'InlineCode') out.push(icode.range(a, b))
        else if (name === 'URL' && parent !== 'Link' && parent !== 'Image') out.push(link.range(a, b))
        else if (shown(a)) {
          if (name === 'Task' && /^\[[xX]\]/.test(s.sliceDoc(a, a + 3))) addLines(a, b, 'cm-done')
          // A revealed image stays visible after its source, so moving through it doesn't collapse the page.
          const img = imageAt(ref.node)
          if (img && !all && SAFE_IMG.test(img.src)) out.push(Decoration.widget({ widget: new ImageWidget(img.src, img.alt, img.width, true), side: 1 }).range(b))
          return
        }
        // Only lines the selection doesn't touch from here on.
        else if (name === 'HeaderMark') {
          if (parent.startsWith('Setext')) out.push(hide.range(a, b))
          else out.push(hide.range(at(a - 1) === ' ' && a > doc.lineAt(a).from ? a - 1 : a, at(b) === ' ' ? b + 1 : b))
        } else if (name === 'EmphasisMark' || name === 'StrikethroughMark' || (name === 'CodeMark' && parent === 'InlineCode')) out.push(hide.range(a, b))
        else if (name === 'QuoteMark') out.push(hide.range(a, at(b) === ' ' ? b + 1 : b))
        else if (name === 'HorizontalRule') {
          out.push(hide.range(a, b))
          addLines(a, a, 'cm-lp-hr')
        } else if (name === 'ListMark') {
          const lead = s.sliceDoc(doc.lineAt(a).from, a)
          if (/^[ \t]+$/.test(lead)) out.push(Decoration.replace({ widget: new Marker('', lead.replace(/\t/g, '    ').length) }).range(a - lead.length, a))
          const text = ref.node.parent?.parent?.name === 'BulletList' ? '•' : s.sliceDoc(a, b)
          if (ref.node.nextSibling?.name !== 'Task') out.push(Decoration.replace({ widget: new Marker(text) }).range(a, at(b) === ' ' ? b + 1 : b))
        } else if (name === 'Task') {
          const checked = /^\[[xX]\]/.test(s.sliceDoc(a, a + 3))
          if (checked) addLines(a, b, 'cm-done')
          const mark = ref.node.parent?.firstChild
          const end = at(a + 3) === ' ' ? a + 4 : a + 3
          if (mark?.name === 'ListMark') out.push(Decoration.replace({ widget: new TaskWidget(checked, ro) }).range(mark.from, end))
        } else if (name === 'Link' || name === 'Autolink') {
          const marks = ref.node.getChildren('LinkMark')
          if (marks.length < (name === 'Link' ? 3 : 2)) return // `[x]` with no target is just text
          const close = name === 'Link' ? marks[1] : marks[marks.length - 1]
          out.push(hide.range(marks[0].from, marks[0].to), hide.range(close.from, b))
          if (name === 'Link') out.push(link.range(marks[0].to, close.from))
        } else {
          const img = imageAt(ref.node)
          if (img) out.push(Decoration.replace({ widget: img }).range(a, b))
          return !img
        }
      }
    })
  }
  for (const [pos, set] of lines) out.push(Decoration.line({ class: [...set].join(' ') }).range(pos))
  return Decoration.set(out, true)
}

const inline = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = inlineDecos(view.state, view.visibleRanges, view.hasFocus)
    }
    update(u: ViewUpdate): void {
      const reconfigured = u.transactions.some((t) => t.reconfigured)
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || reconfigured || syntaxTree(u.startState) !== syntaxTree(u.state))
        this.decorations = inlineDecos(u.state, u.view.visibleRanges, u.view.hasFocus)
    }
  },
  { decorations: (v) => v.decorations }
)

// ---- mouse ----

/** The link at `pos`, as an absolute URL, or null. */
export function linkAt(s: EditorState, pos: number): string | null {
  for (let n: SyntaxNode | null = syntaxTree(s).resolveInner(pos, 1); n; n = n.parent) {
    const url = n.name === 'URL' ? n : n.name === 'Link' || n.name === 'Autolink' ? n.getChild('URL') : null
    if (!url) continue
    const u = s.sliceDoc(url.from, url.to)
    return /^[a-z][\w+.-]*:/i.test(u) ? u : u.includes('@') ? `mailto:${u}` : `https://${u}`
  }
  return null
}

/** Main opens http(s)/mailto in the browser and denies everything else; the app window never navigates. */
const open = (url: string): void => {
  if (/^(?:https?:|mailto:)/i.test(url)) window.open(url, '_blank', 'noopener')
}

const mouse = EditorView.domEventHandlers({
  mousedown(e, view) {
    const el = e.target as HTMLElement
    if (e.ctrlKey || e.metaKey) {
      const a = el.closest('a')
      const pos = a ? null : view.posAtCoords(e)
      const url = a ? a.href : pos === null ? null : linkAt(view.state, pos)
      if (url) {
        e.preventDefault()
        open(url)
        return true
      }
    }
    const block = el.closest<HTMLElement>('.cm-lp-block')
    if (!block || e.button !== 0) return false
    // Into the source: the clicked row of a Markdown table (header, delimiter, body rows), else the first line.
    e.preventDefault()
    const start = view.state.doc.lineAt(view.posAtDOM(block))
    const row = block.dataset.table !== undefined ? (el.closest('tr')?.rowIndex ?? 0) : 0
    const line = view.state.doc.line(Math.min(start.number + (row ? row + 1 : 0), view.state.doc.lines))
    view.dispatch({ selection: { anchor: line.from } })
    view.focus()
    return true
  },
  /** Links inside rendered blocks never follow on a plain click. */
  click(e) {
    if ((e.target as Element).closest('a')) e.preventDefault()
  }
})

/** Up/Down onto a rendered block enters its source (its first or last line) instead of jumping past it. */
const enterBlock =
  (down: boolean) =>
  (view: EditorView): boolean => {
    const { state } = view
    const sel = state.selection
    if (sel.ranges.length > 1 || !sel.main.empty || raw(state)) return false
    const line = state.doc.lineAt(sel.main.head)
    const edge = down ? line.to + 1 : line.from - 1
    const b = state.field(blockField).blocks.find((x) => (down ? x.from : x.to) === edge)
    if (!b) return false
    view.dispatch({ selection: { anchor: down ? b.from : state.doc.lineAt(b.to).from }, scrollIntoView: true })
    return true
  }

const theme = EditorView.theme({
  '.cm-lp-link': { color: 'var(--accent)', textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, var(--accent) 45%, transparent)', textUnderlineOffset: '.18em' },
  '.cm-lp-img': { display: 'inline-block', verticalAlign: 'bottom', maxWidth: '100%', maxHeight: IMG_H, margin: '.3em 0', borderRadius: '4px' },
  '.cm-lp-below': { display: 'block' },
  '.cm-lp-noimg': { padding: '1px 8px', border: '1px dashed var(--rule)', borderRadius: '4px', color: 'var(--ink-3)', font: '13px/1.5 var(--ui)' },
  '.cm-lp-block': { padding: '.3em 0', cursor: 'text', whiteSpace: 'normal' },
  '.cm-lp-block > :last-child': { marginBottom: '0' },
  '.cm-lp-block video, .cm-lp-block audio': { display: 'block', maxWidth: '100%', cursor: 'default' },
  '.cm-lp-block video': { maxHeight: IMG_H },
  '.cm-lp-raw': { whiteSpace: 'pre-wrap', font: '.8em/1.6 var(--mono)', color: 'var(--ink-3)' },
  '.cm-lp-task': { width: '.95em', height: '.95em', margin: '0 .55em 0 0', verticalAlign: '-.1em', accentColor: 'var(--accent)', cursor: 'pointer' },
  '.cm-lp-task:disabled': { cursor: 'default' },
  '.cm-lp-marker': { display: 'inline-block', minWidth: '1.5em', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' },
  '.cm-lp-indent': { display: 'inline-block' },
  '.cm-lp-quote': { borderLeft: '2px solid var(--mark)', paddingLeft: '1em !important', color: 'var(--ink-2)' },
  '.cm-lp-hr': { background: 'linear-gradient(var(--rule), var(--rule)) center / 100% 1px no-repeat' },
  '.cm-code-top': { borderRadius: '6px 6px 0 0', paddingTop: '.3em !important' },
  '.cm-code-end': { borderRadius: '0 0 6px 6px', paddingBottom: '.3em !important' },
  '.cm-lp-fence': { fontSize: '.45em' }
})

export const livePreview = [
  blockField,
  inline,
  mouse,
  keymap.of([
    { key: 'ArrowDown', run: enterBlock(true) },
    { key: 'ArrowUp', run: enterBlock(false) }
  ]),
  theme
]
