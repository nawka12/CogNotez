// Export, import and backup actions shared by the palette and the settings page.
import type { BackupInfo, ExportFormat } from '../../../shared/api'
import { t } from '../i18n'
import { refresh } from './library.svelte'
import { flush, flushAll } from './tabs.svelte'
import type { Doc } from './tabs.svelte'
import { errorText, showToast, ui } from './ui.svelte'

async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    showToast(t('toast.error', { message: errorText(e) }))
    return undefined
  }
}

export const openSettings = (): void => {
  ui.view = 'settings'
  ui.sideOpen = false
}

export async function exportNote(doc: Doc, format: ExportFormat): Promise<void> {
  await flush(doc) // export what is on screen, not the last autosave
  const path = await guarded(() => window.api.exporter.note(doc.id, format))
  if (path) showToast(t('toast.exported', { path }))
}

export async function exportAll(): Promise<void> {
  const dir = await guarded(() => window.api.exporter.allMarkdown())
  if (dir) showToast(t('toast.exportedAll', { path: dir }))
}

export async function importFiles(): Promise<void> {
  const r = await guarded(() => window.api.importer.files())
  if (!r) return
  await refresh()
  showToast(t('toast.importedFiles', { n: r.notes }))
}

export async function backupNow(): Promise<BackupInfo | undefined> {
  const b = await guarded(() => window.api.backups.create())
  if (b) showToast(t('toast.backedUp'))
  return b
}

/** Asks first; main swaps the database in and relaunches, so this promise never resolves on success. */
export function askRestore(b: BackupInfo): void {
  ui.confirm = {
    title: t('backups.restoreTitle'),
    message: t('backups.restoreMessage', { date: new Date(b.createdAt).toLocaleString() }),
    confirmLabel: t('backups.restore'),
    run: () =>
      void guarded(async () => {
        await flushAll()
        await window.api.backups.restore(b.id)
      })
  }
}
