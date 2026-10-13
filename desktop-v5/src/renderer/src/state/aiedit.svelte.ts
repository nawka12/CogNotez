// Inline Companion edits (rewrite, fix, translate, continue) and tag suggestions.
// One edit at a time. The answer is applied to the note it was asked about, even if its tab is in the background.
import type { ChangeSpec } from '@codemirror/state'
import type { AiEvent, AiTaskKind } from '../../../shared/api'
import { getChunks, getOriginalDoc } from '@codemirror/merge'
import { aiHooks, mergeCompartment, pendingField, reviewExtension, setPending } from '../editor/aiEdit'
import { t } from '../i18n'
import { deltaLabel, fitResult, parseTags, wordDelta } from '../lib/aiText'
import { abortRun, openEditMenu, runAi } from './ai.svelte'
import { dispatchTo, tabs } from './tabs.svelte'
import type { Doc } from './tabs.svelte'
import { errorText, showToast, ui } from './ui.svelte'

export type EditKind = 'rewrite' | 'fix' | 'translate' | 'continue'

interface Active {
  docId: string
  phase: 'working' | 'review'
  requestId: string
  token: object
  /** "12 fewer words", shown in the review bar. */
  label: string
}
class EditState {
  cur = $state.raw<Active | null>(null)
}
export const edit = new EditState()

let lastLanguage = ''

const find = (id: string): Doc | undefined => tabs.list.find((d) => d.id === id)
/** Can the Companion work on this note? Never for locked notes, even while unlocked. */
export const aiReady = (doc: Doc | null): doc is Doc => !!doc && !doc.note.locked && !doc.sealed && doc.note.deletedAt === null

interface Target {
  from: number
  to: number
  text: string
}

/** What to send: the selection, else the paragraph (fix), else the text before the cursor (continue). */
function targetFor(doc: Doc, kind: EditKind): Target | null {
  const st = doc.cm
  const sel = st.selection.main
  if (kind === 'continue') {
    const text = st.sliceDoc(0, sel.to)
    return text.trim() ? { from: sel.to, to: sel.to, text } : null
  }
  if (!sel.empty) {
    const text = st.sliceDoc(sel.from, sel.to)
    return text.trim() ? { from: sel.from, to: sel.to, text } : null
  }
  if (kind !== 'fix') return null
  const lines = st.doc
  const line = lines.lineAt(sel.head)
  if (!line.text.trim()) return null
  let a = line.number
  let b = line.number
  while (a > 1 && lines.line(a - 1).text.trim()) a--
  while (b < lines.lines && lines.line(b + 1).text.trim()) b++
  const from = lines.line(a).from
  const to = lines.line(b).to
  return { from, to, text: st.sliceDoc(from, to) }
}

/** Entry point for the palette, the Mod-Shift-E menu and the drawer chips: asks for what's missing, then runs. */
export function askEdit(kind: EditKind): void {
  const doc = tabs.current
  if (!aiReady(doc)) return
  if (edit.cur && find(edit.cur.docId)) return void showToast(t('ai.busy'))
  const target = targetFor(doc, kind)
  if (!target) return void showToast(t(kind === 'continue' ? 'ai.writeFirst' : 'ai.selectFirst'))
  if (kind === 'rewrite' || kind === 'translate') {
    ui.prompt = {
      title: t(kind === 'rewrite' ? 'ai.rewriteTitle' : 'ai.translateTitle'),
      label: t(kind === 'rewrite' ? 'ai.rewriteLabel' : 'ai.translateLabel'),
      initial: kind === 'rewrite' ? t('ai.rewriteDefault') : lastLanguage,
      confirmLabel: t(kind === 'rewrite' ? 'ai.rewriteOk' : 'ai.translateOk'),
      run: (value) => {
        if (kind === 'translate') lastLanguage = value
        void startEdit(doc, kind, value)
      }
    }
  } else void startEdit(doc, kind)
}

async function startEdit(doc: Doc, kind: EditKind, input?: string): Promise<void> {
  if (edit.cur && !find(edit.cur.docId)) edit.cur = null // its tab was closed
  if (edit.cur) return void showToast(t('ai.busy'))
  const target = targetFor(doc, kind) // re-read: the user may have moved while the prompt was open
  if (!target) return void showToast(t(kind === 'continue' ? 'ai.writeFirst' : 'ai.selectFirst'))
  if (ui.mode === 'preview') ui.mode = 'edit'
  const token = {}
  edit.cur = { docId: doc.id, phase: 'working', requestId: '', token, label: '' }
  dispatchTo(doc, { effects: setPending.of({ from: target.from, to: target.to, original: kind === 'continue' ? '' : target.text }) })
  doc.view?.focus()
  const before = kind === 'continue' ? target.text : ''
  try {
    const id = await runAi({ kind: kind as AiTaskKind, noteId: doc.id, text: target.text, input }, (e) => onEvent(token, doc, kind, before, e))
    if (edit.cur?.token === token) edit.cur = { ...edit.cur, requestId: id }
    else abortRun(id) // cancelled while the request was starting
  } catch (e) {
    if (edit.cur?.token !== token) return
    clearPending(doc)
    showToast(t('ai.error', { message: errorText(e) }))
  }
}

function clearPending(doc: Doc | undefined): void {
  edit.cur = null
  if (doc) dispatchTo(doc, { effects: setPending.of(null) })
}

function onEvent(token: object, doc: Doc, kind: EditKind, before: string, e: AiEvent): void {
  if (edit.cur?.token !== token || e.type === 'chunk') return
  if (!tabs.list.includes(doc)) {
    edit.cur = null // the tab was closed; nothing to apply to
    return
  }
  if (e.type === 'error') {
    clearPending(doc)
    if (!e.aborted) showToast(t('ai.error', { message: e.error }))
    return
  }
  const p = doc.cm.field(pendingField, false)
  if (!p || p.changed) {
    clearPending(doc)
    return void showToast(t('ai.changed'))
  }
  const result = fitResult(kind, p.original, before, e.text)
  if (!result.trim() || result === p.original) {
    clearPending(doc)
    return void showToast(t('ai.noChange'))
  }
  // continue: p.original is '' (nothing replaced), so the delta is just the new words.
  edit.cur = { docId: doc.id, phase: 'review', requestId: e.requestId, token, label: deltaLabel(wordDelta(p.original, result)) }
  // One transaction: the replacement, and the review that compares it with the text as it was.
  dispatchTo(doc, {
    changes: { from: p.from, to: p.to, insert: result },
    effects: [setPending.of(null), mergeCompartment.reconfigure(reviewExtension(doc.cm.doc))],
    userEvent: 'ai.edit',
    scrollIntoView: true
  })
}

/** Esc while working: stop the request. */
export function cancelEdit(message?: string): void {
  const cur = edit.cur
  if (cur?.phase !== 'working') return
  if (cur.requestId) abortRun(cur.requestId)
  clearPending(find(cur.docId))
  if (message) showToast(message)
}

function endReview(doc: Doc | undefined, changes?: ChangeSpec): void {
  edit.cur = null
  if (!doc) return
  const effects = mergeCompartment.reconfigure([])
  dispatchTo(doc, changes ? { changes, effects, userEvent: 'ai.reject' } : { effects })
}

/** Keep everything: the text is already in the note, so only the review goes away. */
export function acceptAll(): boolean {
  const cur = edit.cur
  if (cur?.phase !== 'review') return false
  endReview(find(cur.docId))
  return true
}

/** Put every changed chunk back as it was, in one transaction. */
export function rejectAll(): boolean {
  const cur = edit.cur
  if (cur?.phase !== 'review') return false
  const doc = find(cur.docId)
  endReview(doc, doc ? revertChanges(doc) : undefined)
  return true
}

function revertChanges(doc: Doc): { from: number; to: number; insert: string }[] {
  const st = doc.cm
  const orig = getOriginalDoc(st)
  const out: { from: number; to: number; insert: string }[] = []
  for (const ch of getChunks(st)?.chunks ?? []) {
    // Same arithmetic as the merge package's own rejectChunk, so line breaks at chunk edges come out right.
    let insert = orig.sliceString(ch.fromA, Math.max(ch.fromA, ch.toA - 1))
    if (ch.fromA !== ch.toA && ch.toB <= st.doc.length) insert += st.lineBreak
    out.push({ from: ch.fromB, to: Math.min(st.doc.length, ch.toB), insert })
  }
  return out
}

// ---------- hooks used by the editor's keymap and update listener ----------

Object.assign(aiHooks, {
  escape: (): boolean => {
    if (edit.cur?.phase === 'working') {
      cancelEdit()
      return true
    }
    return rejectAll()
  },
  accept: (): boolean => acceptAll(),
  menu: (): boolean => {
    if (!aiReady(tabs.current)) return false
    openEditMenu()
    return true
  },
  // Called from inside an editor update, where dispatching again is not allowed.
  changed: (): void => queueMicrotask(() => cancelEdit(t('ai.changed'))),
  resolved: (): void =>
    queueMicrotask(() => {
      const cur = edit.cur
      if (cur?.phase === 'review') endReview(find(cur.docId))
    })
})

// ---------- tag suggestions ----------

export async function suggestTags(): Promise<void> {
  const doc = tabs.current
  if (!aiReady(doc)) return
  const text = doc.cm.doc.toString()
  if (!text.trim()) return void showToast(t('ai.writeFirst'))
  try {
    await runAi({ kind: 'tags', noteId: doc.id, text }, (e) => {
      if (e.type === 'chunk') return
      if (e.type === 'error') return void (e.aborted || showToast(t('ai.error', { message: e.error })))
      const have = doc.note.tags.map((x) => x.toLowerCase())
      const tags = parseTags(e.text).filter((x) => !have.includes(x.toLowerCase()))
      if (tags.length) ui.tagSuggest = { docId: doc.id, title: doc.title, tags }
      else showToast(t('ai.noTags'))
    })
  } catch (e) {
    showToast(t('ai.error', { message: errorText(e) }))
  }
}
