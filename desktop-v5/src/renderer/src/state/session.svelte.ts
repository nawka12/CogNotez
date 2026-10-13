// Remembers the open tabs, the current tab and the view mode across restarts (settings ui.tabs / ui.current / ui.mode).
import { isMode, loadPrefs, prefs } from './prefs.svelte'
import { MAX_TABS, openNote, tabs } from './tabs.svelte'
import { ui } from './ui.svelte'

const state = $state({ ready: false })

const save = (key: string, value: unknown): void => void window.api.settings.set(key, value).catch(() => undefined)
const get = (key: string): Promise<unknown> => window.api.settings.get(key).catch(() => null)

/** Reopens what was open last time. Ids of notes that no longer exist are skipped quietly. */
export async function restoreSession(): Promise<void> {
  try {
    await loadPrefs()
    const [ids, current, mode] = await Promise.all([get('ui.tabs'), get('ui.current'), get('ui.mode')])
    ui.mode = isMode(mode) ? mode : prefs.defaultMode
    if (Array.isArray(ids)) {
      for (const id of ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_TABS)) {
        try {
          await openNote(id, await window.api.notes.get(id))
        } catch {
          /* deleted since last run */
        }
      }
    }
    if (typeof current === 'string' && tabs.list.some((d) => d.id === current)) tabs.currentId = current
  } finally {
    state.ready = true
  }
}

/** Call once from a component: writes each value as it changes, but only after the session was restored. */
export function trackSession(): void {
  $effect(() => {
    const ids = tabs.list.map((d) => d.id)
    if (state.ready) save('ui.tabs', ids)
  })
  $effect(() => {
    const id = tabs.currentId
    if (state.ready) save('ui.current', id)
  })
  $effect(() => {
    const mode = ui.mode
    if (state.ready) save('ui.mode', mode)
  })
}
