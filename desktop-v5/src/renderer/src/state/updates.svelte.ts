// App-update state for the status bar and Settings → About. Main does the work (electron-updater); this only mirrors it.
import { tick } from 'svelte'
import type { UpdateStatus } from '../../../shared/api'
import { errorText, showToast, ui } from './ui.svelte'

const AUTO_KEY = 'updates.auto'

class UpdateState {
  status = $state.raw<UpdateStatus | null>(null)
  /** "Check for updates automatically"; on unless the user switched it off. */
  auto = $state(true)
}
export const updates = new UpdateState()

/** Fetches the status and the setting once, then follows main. Returns the unsubscribe. */
export function startUpdateStatus(): () => void {
  window.api.updates.status().then((s) => (updates.status = s)).catch(() => undefined) // no status = no row, no chip
  window.api.settings.get(AUTO_KEY).then((v) => (updates.auto = v !== false)).catch(() => undefined)
  return window.api.onUpdateStatus((s) => (updates.status = s))
}

const fail = (e: unknown): void => showToast(errorText(e))

export async function checkForUpdates(): Promise<void> {
  try {
    updates.status = await window.api.updates.check()
  } catch (e) {
    fail(e)
  }
}
export const downloadUpdate = (): Promise<void> => window.api.updates.download().catch(fail)
export const installUpdate = (): Promise<void> => window.api.updates.install().catch(fail)

export async function setAutoCheck(on: boolean): Promise<void> {
  updates.auto = on
  try {
    await window.api.settings.set(AUTO_KEY, on)
  } catch (e) {
    updates.auto = !on
    fail(e)
  }
}

/** The status-bar item: Settings, scrolled to About. */
export function openAboutSettings(): void {
  ui.view = 'settings'
  ui.sideOpen = false
  void tick().then(() => document.getElementById('h-about')?.scrollIntoView({ block: 'start' }))
}
