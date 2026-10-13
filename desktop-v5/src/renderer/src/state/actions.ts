import type { Note } from '../../../shared/api'
import { t } from '../i18n'
import { mergeTags } from '../lib/tags'
import { refresh, scheduleRefresh } from './library.svelte'
import { closeTab, flush, openNote, reloadOpen, saveMeta, tabs } from './tabs.svelte'
import type { Doc } from './tabs.svelte'
import { errorText, showToast, ui } from './ui.svelte'

/** Handles a `notes changed` event from main. */
export function notesChanged(ids: string[]): void {
  scheduleRefresh()
  reloadOpen(ids)
}

async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    showToast(t('toast.error', { message: errorText(e) }))
    return undefined
  }
}

export async function createNote(): Promise<void> {
  const note = await guarded<Note>(() => window.api.notes.create({}))
  if (!note) return
  if (ui.filter.kind === 'trash') ui.filter = { kind: 'all' }
  if (ui.mode === 'preview') ui.mode = 'edit'
  await openNote(note.id, note)
  void refresh()
  ui.titleFocus++
}

export async function trashNote(id: string): Promise<void> {
  const doc = tabs.list.find((d) => d.id === id)
  if (doc) await flush(doc)
  const ok = await guarded(async () => {
    await window.api.notes.trash(id)
    return true
  })
  if (!ok) return
  closeTab(id)
  showToast(t('toast.trashed'), {
    label: t('toast.undo'),
    run: () =>
      void guarded(async () => {
        await window.api.notes.restore(id)
        await openNote(id)
      })
  })
}

export async function restoreNote(id: string): Promise<void> {
  const ok = await guarded(async () => {
    await window.api.notes.restore(id)
    return true
  })
  if (!ok) return
  if (ui.filter.kind === 'trash') ui.filter = { kind: 'all' }
  showToast(t('toast.restored'))
}

export function askDeleteForever(id: string, title: string): void {
  ui.confirm = {
    title: t('confirm.delete.title'),
    message: t('confirm.delete.message', { title: title || t('untitled') }),
    confirmLabel: t('confirm.delete.ok'),
    run: () =>
      void guarded(async () => {
        closeTab(id)
        await window.api.notes.deleteForever(id)
        showToast(t('toast.deleted'))
      })
  }
}

export async function togglePin(doc: Doc): Promise<void> {
  await saveMeta(doc, { pinned: !doc.note.pinned })
}

export async function addTags(doc: Doc, names: string[]): Promise<void> {
  const next = mergeTags(doc.note.tags, names)
  if (next.length !== doc.note.tags.length) await saveMeta(doc, { tags: next })
}

export async function removeTag(doc: Doc, tag: string): Promise<void> {
  await saveMeta(doc, { tags: doc.note.tags.filter((x) => x !== tag) })
}
