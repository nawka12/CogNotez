import { SvelteSet } from 'svelte/reactivity'
import { EditorState, Transaction } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { Note, NotePatch } from '../../../shared/api'
import { createState, external } from '../editor/setup'
import { t } from '../i18n'
import { countWords } from '../lib/text'
import { errorText, showToast, ui } from './ui.svelte'

export const MAX_TABS = 8
const SAVE_DELAY = 400

/** One open note: server copy, local edits, and its own CodeMirror state (undo history, selection). */
export class Doc {
  readonly id: string
  note: Note
  title = $state('')
  words = $state(0)
  /** Bumped on every text change; the preview watches it. */
  rev = $state(0)
  dirty = $state(false)
  failed = $state(false)

  cm: EditorState
  view: EditorView | null = null
  scroll = 0
  version = 0
  savedVersion = 0
  savedTitle: string
  savedBody: string
  inflight: Promise<boolean> | null = null
  failures = 0
  timer: ReturnType<typeof setTimeout> | undefined
  retry: ReturnType<typeof setTimeout> | undefined
  wordTimer: ReturnType<typeof setTimeout> | undefined

  constructor(note: Note) {
    this.id = note.id
    this.note = $state.raw(note)
    this.title = note.title
    this.cm = createState(note.locked ? '' : note.body)
    this.savedTitle = note.title
    this.savedBody = this.cm.doc.toString()
    this.words = note.locked ? 0 : countWords(note.body)
  }
  get readOnly(): boolean {
    return this.note.deletedAt !== null || this.note.locked
  }
}

class Tabs {
  list = $state.raw<Doc[]>([])
  currentId = $state<string | null>(null)
  get current(): Doc | null {
    return this.list.find((d) => d.id === this.currentId) ?? null
  }
}
export const tabs = new Tabs()

/** Docs with unsaved work, including ones whose tab was closed while a save was failing. */
const pending = new SvelteSet<Doc>()

export function saveStatus(): 'saved' | 'saving' | 'failed' {
  let saving = false
  for (const d of pending) {
    if (d.failed) return 'failed'
    saving = true
  }
  return saving ? 'saving' : 'saved'
}

// ---------- saving ----------

/** Call after any local change to title or body. */
export function touch(doc: Doc): void {
  doc.version++
  doc.dirty = true
  pending.add(doc)
  clearTimeout(doc.timer)
  doc.timer = setTimeout(() => void flush(doc), SAVE_DELAY)
}

export function bodyChanged(doc: Doc): void {
  doc.rev++
  touch(doc)
  clearTimeout(doc.wordTimer)
  doc.wordTimer = setTimeout(() => (doc.words = countWords(doc.cm.doc.toString())), 250)
}

export function setTitle(doc: Doc, title: string): void {
  doc.title = title
  touch(doc)
}

function applyMeta(doc: Doc, n: Note): void {
  doc.note = { ...doc.note, tags: n.tags, pinned: n.pinned, locked: n.locked, deletedAt: n.deletedAt, updatedAt: n.updatedAt }
}

/** Saves now. Resolves true when the doc is clean afterwards. Text is never dropped on failure. */
export function flush(doc: Doc): Promise<boolean> {
  clearTimeout(doc.timer)
  clearTimeout(doc.retry)
  if (doc.inflight) return doc.inflight
  if (doc.version === doc.savedVersion) return Promise.resolve(true)
  const run = (async (): Promise<boolean> => {
    await null // always async, so `inflight` is set before the finally below clears it
    try {
      while (doc.version !== doc.savedVersion) {
        const v = doc.version
        const patch: NotePatch = { id: doc.id }
        const title = doc.title
        const body = doc.cm.doc.toString()
        if (title !== doc.savedTitle) patch.title = title
        if (body !== doc.savedBody) patch.body = body
        if (patch.title !== undefined || patch.body !== undefined) {
          try {
            applyMeta(doc, await window.api.notes.save(patch))
          } catch {
            doc.failed = true
            doc.failures++
            doc.retry = setTimeout(() => void flush(doc), Math.min(30_000, 1000 * 2 ** (doc.failures - 1)))
            return false
          }
          doc.savedTitle = title
          doc.savedBody = body
        }
        doc.savedVersion = v
        doc.failed = false
        doc.failures = 0
      }
      doc.dirty = false
      pending.delete(doc)
      return true
    } finally {
      doc.inflight = null
    }
  })()
  doc.inflight = run
  return run
}

export async function flushAll(): Promise<void> {
  await Promise.all([...pending].map(flush))
}

/** Patches tags/pin right away (these are not debounced). */
export async function saveMeta(doc: Doc, patch: Omit<NotePatch, 'id'>): Promise<boolean> {
  try {
    applyMeta(doc, await window.api.notes.save({ id: doc.id, ...patch }))
    return true
  } catch (e) {
    showToast(t('toast.error', { message: errorText(e) }))
    return false
  }
}

// ---------- external changes ----------

function applyExternalBody(doc: Doc, body: string): void {
  const spec = {
    changes: { from: 0, to: doc.cm.doc.length, insert: body },
    selection: { anchor: Math.min(doc.cm.selection.main.head, body.length) },
    annotations: [external.of(true), Transaction.addToHistory.of(false)]
  }
  const tr = doc.cm.update(spec)
  if (doc.view) doc.view.dispatch(tr)
  else doc.cm = tr.state
  doc.savedBody = body
  doc.rev++
  doc.words = countWords(body)
}

/** Another writer changed this note. Local unsaved edits win; otherwise take the new text. */
async function reload(doc: Doc): Promise<void> {
  if (doc.dirty) return
  let fresh: Note
  try {
    fresh = await window.api.notes.get(doc.id)
  } catch {
    return
  }
  if (fresh.updatedAt === doc.note.updatedAt) return
  applyMeta(doc, fresh)
  if (doc.dirty) return // typed while we were fetching
  if (fresh.title !== doc.title) {
    doc.title = fresh.title
    doc.savedTitle = fresh.title
  }
  if (!fresh.locked && fresh.body !== doc.cm.doc.toString()) applyExternalBody(doc, fresh.body)
}

export function reloadOpen(ids: string[]): void {
  for (const doc of tabs.list) if (ids.includes(doc.id)) void reload(doc)
}

// ---------- tabs ----------

export async function openNote(id: string, seed?: Note): Promise<void> {
  const prev = tabs.current
  if (prev && prev.id !== id) void flush(prev)
  let doc = tabs.list.find((d) => d.id === id)
  if (!doc) {
    let note = seed
    if (!note) {
      try {
        note = await window.api.notes.get(id)
      } catch (e) {
        showToast(t('toast.openFailed', { message: errorText(e) }))
        return
      }
    }
    doc = tabs.list.find((d) => d.id === id) ?? new Doc(note)
    if (!tabs.list.includes(doc)) {
      let list = [...tabs.list, doc]
      if (list.length > MAX_TABS) {
        const victim = list.find((d) => d !== doc && d.id !== tabs.currentId) ?? list[0]!
        void flush(victim)
        list = list.filter((d) => d !== victim)
      }
      tabs.list = list
    }
  }
  tabs.currentId = id
  ui.sideOpen = false
}

export function closeTab(id: string): void {
  const i = tabs.list.findIndex((d) => d.id === id)
  if (i < 0) return
  const doc = tabs.list[i]!
  void flush(doc)
  const list = tabs.list.filter((d) => d !== doc)
  tabs.list = list
  if (tabs.currentId === id) tabs.currentId = (list[i] ?? list[i - 1])?.id ?? null
}

/** Inserts text at `pos` (or the selection) in a doc that may or may not be on screen. */
export function insertText(doc: Doc, text: string, pos?: number): void {
  const { from, to } = doc.cm.selection.main
  const at = pos ?? from
  const spec = {
    changes: { from: at, to: pos === undefined ? to : at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: 'input.paste'
  }
  if (doc.view) doc.view.dispatch({ ...spec, scrollIntoView: true })
  else {
    doc.cm = doc.cm.update(spec).state
    bodyChanged(doc)
  }
}
