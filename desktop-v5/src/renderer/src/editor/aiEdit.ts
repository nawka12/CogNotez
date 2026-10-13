// CodeMirror side of the Companion's inline edits: a "working" marker while a request runs, and the
// accept/reject review (@codemirror/merge) once the answer has replaced the text. State lives in the
// EditorState, so it follows each tab. The controller (state/aiedit.svelte.ts) fills in `aiHooks`.
import { Compartment, Prec, StateEffect, StateField } from '@codemirror/state'
import type { Extension, Text } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, keymap } from '@codemirror/view'
import { getChunks, unifiedMergeView } from '@codemirror/merge'
import { t } from '../i18n'
import { mapRange } from '../lib/aiRange'
import type { Tracked } from '../lib/aiRange'

export interface Pending extends Tracked {
  changed: boolean
}

/** Set by the controller. Key handlers return true when they used the key. */
export const aiHooks = {
  escape: (): boolean => false,
  accept: (): boolean => false,
  menu: (): boolean => false,
  /** The text under the request changed. Called mid-update, so the controller must defer. */
  changed: (): void => {},
  /** Every chunk has been accepted or rejected. */
  resolved: (): void => {}
}

export const setPending = StateEffect.define<Tracked | null>()

/** The range an in-flight request will replace, kept in place through every edit. */
export const pendingField = StateField.define<Pending | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setPending)) return e.value && { ...e.value, changed: false }
    return value && tr.docChanged ? mapRange(value, tr.changes, tr.newDoc) : value
  },
  provide: (f) =>
    EditorView.decorations.from(f, (p) => {
      if (!p) return Decoration.none
      const out = [Decoration.widget({ widget: new Working(), side: 1 }).range(p.to)]
      if (p.to > p.from) out.unshift(Decoration.mark({ class: 'cm-ai-pending' }).range(p.from, p.to))
      return Decoration.set(out, true)
    })
})

class Working extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-ai-working'
    el.textContent = t('ai.workingInline')
    return el
  }
}

export const mergeCompartment = new Compartment()

const control = (type: 'accept' | 'reject', action: (e: MouseEvent) => void): HTMLElement => {
  const b = document.createElement('button')
  b.name = type
  b.type = 'button'
  b.textContent = t(type === 'accept' ? 'ai.accept' : 'ai.reject')
  b.onmousedown = action
  return b
}

/** Shows the change against the text as it was before the Companion touched it. */
export const reviewExtension = (original: Text): Extension =>
  unifiedMergeView({
    original,
    mergeControls: control,
    gutter: false,
    highlightChanges: true,
    syntaxHighlightDeletions: false
  })

export const inReview = (state: EditorView['state']): boolean => getChunks(state) !== null

const theme = EditorView.theme({
  '.cm-ai-pending': { background: 'var(--accent-soft)', borderRadius: '2px' },
  '.cm-ai-working': {
    marginLeft: '.5em',
    padding: '1px 8px',
    border: '1px solid var(--rule)',
    borderRadius: '999px',
    background: 'var(--panel)',
    color: 'var(--ink-2)',
    font: '13px/1.4 var(--ui)',
    whiteSpace: 'nowrap',
    animation: 'cm-ai-pulse 1.4s ease-in-out infinite'
  },
  // Review: deleted text struck through in rubric, inserted text on the accent wash with an accent underline.
  '.cm-changedLine, .cm-inlineChangedLine': { backgroundColor: 'transparent !important' },
  '.cm-deletedChunk': {
    backgroundColor: 'var(--panel) !important',
    borderRadius: '6px',
    margin: '.2em 0',
    padding: '.15em 6px .15em 10px',
    position: 'relative'
  },
  '.cm-deletedChunk .cm-deletedLine, .cm-deletedChunk .cm-deletedLine del, .cm-deletedText': {
    color: 'var(--rubric)',
    textDecoration: 'line-through',
    textDecorationThickness: '1px',
    background: 'none !important'
  },
  '.cm-insertedLine, .cm-changedText': {
    background: 'var(--accent-soft) !important',
    boxShadow: 'inset 0 -1.5px 0 var(--accent)',
    borderRadius: '2px',
    textDecoration: 'none'
  },
  '.cm-deletedChunk .cm-chunkButtons': { insetInlineEnd: '6px', top: '4px', display: 'flex', gap: '4px' },
  '.cm-deletedChunk button': {
    margin: '0',
    padding: '2px 8px',
    border: '1px solid var(--rule)',
    borderRadius: '5px',
    background: 'var(--paper)',
    color: 'var(--ink)',
    font: '500 12px/1.4 var(--ui)',
    cursor: 'pointer'
  },
  '.cm-deletedChunk button:hover': { background: 'var(--hover)' },
  '.cm-deletedChunk button[name=accept]': { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--on-accent)' }
})

export const aiEditExtensions: Extension[] = [
  pendingField,
  mergeCompartment.of([]),
  Prec.highest(
    keymap.of([
      { key: 'Escape', run: () => aiHooks.escape() },
      { key: 'Mod-Enter', run: () => aiHooks.accept() },
      { key: 'Mod-Shift-e', run: () => aiHooks.menu() }
    ])
  ),
  EditorView.updateListener.of((u) => {
    if (u.state.field(pendingField)?.changed) aiHooks.changed()
    if (getChunks(u.state)?.chunks.length === 0) aiHooks.resolved()
  }),
  theme
]
