// The drawer's conversation: the stored thread of the current note, one live chat, and the unsaved summaries.
import type { AiEvent, AiMessage } from '../../../shared/api'
import { t } from '../i18n'
import { abortRun, runAi } from './ai.svelte'
import { dispatchTo, tabs } from './tabs.svelte'
import type { Doc } from './tabs.svelte'
import { errorText, showToast, ui } from './ui.svelte'

export interface ChatRun {
  id: number
  key: string | null
  requestId: string
  user: string
  text: string
  error: string | null
  research: boolean
  running: boolean
}
/** A summary or key-points answer: shown in the drawer, never stored. */
export interface QuickResult {
  id: number
  key: string | null
  docId: string
  kind: 'summarize' | 'keyPoints'
  text: string
  error: string | null
  requestId: string
  running: boolean
}

class Companion {
  /** Whose thread is loaded (a note id, or null for the global thread). */
  key = $state<string | null>(null)
  thread = $state.raw<AiMessage[]>([])
  chat = $state<ChatRun | null>(null)
  quick = $state<QuickResult[]>([])
  get busy(): boolean {
    return !!this.chat?.running || this.quick.some((q) => q.running)
  }
}
export const comp = new Companion()
let chatSeq = 0

/** What the AI may read of a note: nothing when locked, even while it is unlocked. */
export const readable = (doc: Doc | null): boolean => !doc || !doc.note.locked

export async function loadThread(key: string | null): Promise<void> {
  comp.key = key
  if (comp.chat && !comp.chat.running && comp.chat.key !== key) comp.chat = null
  let rows: AiMessage[] = []
  try {
    rows = await window.api.ai.thread(key)
  } catch {
    /* backend unavailable: an empty thread; sending will show the reason */
  }
  if (comp.key === key) comp.thread = rows
}

export async function sendChat(doc: Doc | null, input: string, research: boolean): Promise<void> {
  const text = input.trim()
  if (!text || comp.busy || !readable(doc)) return
  const key = doc?.id ?? null
  const id = ++chatSeq
  comp.chat = { id, key, requestId: '', user: text, text: '', error: null, research, running: true }
  const onEvent = (e: AiEvent): void => {
    const c = comp.chat
    if (c?.id !== id) return
    if (e.type === 'chunk') c.text += e.delta
    else if (e.type === 'done') {
      c.running = false
      void loadThread(key).then(() => {
        if (comp.chat?.id === id) comp.chat = null
      })
    } else {
      c.running = false
      if (!e.aborted) c.error = e.error
    }
  }
  try {
    const rid = await runAi({ kind: 'chat', noteId: key, text: doc && !doc.sealed ? doc.cm.doc.toString() : '', input: text, research }, onEvent)
    if (comp.chat?.id === id) comp.chat.requestId = rid
    if (comp.chat?.id !== id || !comp.chat.running) abortRun(rid) // stopped or replaced while starting
  } catch (e) {
    if (comp.chat?.id === id) {
      comp.chat.running = false
      comp.chat.error = errorText(e)
    }
  }
}

export function stopChat(): void {
  const c = comp.chat
  if (!c?.running) return
  c.running = false
  if (c.requestId) abortRun(c.requestId)
}

/** Summarize / Key points on the selection, or the whole note. */
export async function runQuick(doc: Doc, kind: QuickResult['kind']): Promise<void> {
  if (comp.busy || doc.sealed || doc.note.locked) return
  const sel = doc.cm.selection.main
  const text = sel.empty ? doc.cm.doc.toString() : doc.cm.sliceDoc(sel.from, sel.to)
  if (!text.trim()) return void showToast(t('ai.nothingToRead'))
  const item = $state<QuickResult>({ id: Date.now(), key: doc.id, docId: doc.id, kind, text: '', error: null, requestId: '', running: true })
  comp.quick = [...comp.quick, item]
  const onEvent = (e: AiEvent): void => {
    if (e.type === 'chunk') item.text += e.delta
    else if (e.type === 'done') {
      item.text = e.text
      item.running = false
    } else {
      item.running = false
      if (!e.aborted) item.error = e.error
    }
  }
  try {
    item.requestId = await runAi({ kind, noteId: doc.id, text }, onEvent)
    if (!item.running) abortRun(item.requestId)
  } catch (e) {
    item.running = false
    item.error = errorText(e)
  }
}

export function stopQuick(item: QuickResult): void {
  item.running = false
  if (item.requestId) abortRun(item.requestId)
}

export function dismissQuick(item: QuickResult): void {
  comp.quick = comp.quick.filter((q) => q !== item)
}

/** Puts a result under the selection (or the cursor's line) as one undoable edit. */
export function insertBelow(item: QuickResult): void {
  const doc = tabs.list.find((d) => d.id === item.docId)
  if (!doc || doc.readOnly) return void showToast(t('ai.cantInsert'))
  const at = doc.cm.doc.lineAt(doc.cm.selection.main.to).to
  const insert = `\n\n${item.text.trim()}`
  dispatchTo(doc, { changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: 'input.paste', scrollIntoView: true })
  doc.view?.focus()
}

export async function copyResult(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    showToast(t('ai.copied'))
  } catch {
    showToast(t('ai.copyFailed'))
  }
}

export function askClearHistory(key: string | null): void {
  ui.confirm = {
    title: t('ai.clearTitle'),
    message: t(key ? 'ai.clearNote' : 'ai.clearGlobal'),
    confirmLabel: t('ai.clearOk'),
    run: () =>
      void (async () => {
        try {
          await window.api.ai.clearThread(key)
        } catch (e) {
          return void showToast(t('toast.error', { message: errorText(e) }))
        }
        comp.quick = comp.quick.filter((q) => q.key !== key)
        if (comp.chat?.key === key && !comp.chat.running) comp.chat = null
        await loadThread(comp.key)
        showToast(t('ai.cleared'))
      })()
  }
}
