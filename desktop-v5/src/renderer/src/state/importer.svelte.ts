import type { ImportDetect, ImportStats } from '../../../shared/api'
import { t } from '../i18n'
import { refresh } from './library.svelte'
import { errorText, notImplemented, showToast, ui } from './ui.svelte'

/** What a first-run user is offered: the best CogNotez 4 source found, if any. */
export interface Found {
  notes: number
}

class Importer {
  found = $state.raw<Found | null>(null)
  detected = $state(false)
  running = $state(false)
  error = $state('')
}
export const importer = new Importer()

export function pickSource(d: ImportDetect): Found | null {
  if (!d.found || d.alreadyImported) return null
  const best = [...d.sources].sort((a, b) => (b.newestUpdatedAt ?? 0) - (a.newestUpdatedAt ?? 0) || b.notes - a.notes)[0]
  return best && best.notes > 0 ? { notes: best.notes } : null
}

/** Looks for CogNotez 4 data once. Any failure (including "not implemented yet") just hides the offer. */
export async function detect(): Promise<void> {
  if (importer.detected) return
  importer.detected = true
  try {
    importer.found = pickSource(await window.api.importer.detectV4())
  } catch {
    importer.found = null
  }
}

/** Runs an import, then shows the summary. A null result means the user cancelled. */
export async function runImport(run: () => Promise<ImportStats | null>): Promise<void> {
  if (importer.running) return
  importer.running = true
  importer.error = ''
  try {
    const stats = await run()
    if (stats) {
      importer.found = null
      ui.importSummary = stats
      await refresh()
    }
  } catch (e) {
    importer.error = notImplemented(e) ? t('import.unavailable') : t('import.failed', { message: errorText(e) })
    showToast(importer.error)
  } finally {
    importer.running = false
  }
}

export const importFromV4 = (): Promise<void> => runImport(() => window.api.importer.runV4())
export const importFromFile = (): Promise<void> => runImport(() => window.api.importer.fromFile())
