// Sync and Google-account state shared by the status bar, the settings page and the conflict banner.
import { tick } from 'svelte'
import type { GoogleStatus, SyncStatus } from '../../../shared/api'
import { refresh } from './library.svelte'
import { ui } from './ui.svelte'

class SyncState {
  status = $state.raw<SyncStatus | null>(null)
  google = $state.raw<GoogleStatus | null>(null)
}
export const sync = new SyncState()

export async function loadSync(): Promise<void> {
  try {
    sync.status = await window.api.sync.status()
  } catch {
    sync.status = null // sync is unavailable; the chip says "Sync off"
  }
}

export async function loadGoogle(): Promise<void> {
  try {
    sync.google = await window.api.google.status()
  } catch {
    sync.google = null
  }
}

/** Fetches the status once and follows main's updates. Returns the unsubscribe. */
export function startSyncStatus(): () => void {
  void loadSync()
  void loadGoogle()
  let lastConflicts = -1
  return window.api.onSyncStatus((s) => {
    sync.status = s
    if (s.conflicts !== lastConflicts) {
      lastConflicts = s.conflicts
      void refresh() // new or resolved conflicted copies change the note list
    }
  })
}

/** The status-bar chip: Settings, scrolled to the Sync section. */
export function openSyncSettings(): void {
  ui.view = 'settings'
  ui.sideOpen = false
  void tick().then(() => document.getElementById('h-sync')?.scrollIntoView({ block: 'start' }))
}
