import type { ImportStats, ListFilter } from '../../../shared/api'

export type Theme = 'system' | 'light' | 'dark'

export interface ToastAction {
  label: string
  run: () => void
}
export interface ToastData {
  message: string
  action?: ToastAction
}
export interface ConfirmData {
  title: string
  message: string
  confirmLabel: string
  run: () => void
}

/** The list filters main knows, plus the client-side "conflicted copies" view. */
export type UiFilter = ListFilter | { kind: 'conflicts' }

export interface PasswordDialogData {
  docId: string
  mode: 'set' | 'change'
}

export interface PromptData {
  title: string
  label: string
  initial: string
  confirmLabel: string
  run: (value: string) => void
}

class Ui {
  /** What the main column shows: the open note, or the settings page. */
  view = $state<'notes' | 'settings'>('notes')
  prompt = $state.raw<PromptData | null>(null)
  theme = $state<Theme>('system')
  filter = $state.raw<UiFilter>({ kind: 'all' })
  sideOpen = $state(false)
  paletteOpen = $state(false)
  /** Which sub-list the palette opens on (set just before opening it). */
  paletteSub = $state<'models' | 'edits' | null>(null)
  /** Tags the Companion suggested, waiting for the user's pick. */
  tagSuggest = $state.raw<{ docId: string; title: string; tags: string[] } | null>(null)
  now = $state(Date.now())
  toast = $state.raw<ToastData | null>(null)
  confirm = $state.raw<ConfirmData | null>(null)
  passwordDialog = $state.raw<PasswordDialogData | null>(null)
  importSummary = $state.raw<ImportStats | null>(null)
  /** Bumped to ask the open note to focus its title. */
  titleFocus = $state(0)
}
export const ui = new Ui()

export const MOD = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'

const THEMES: Theme[] = ['system', 'light', 'dark']
export const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme)

/** Applies the theme to <html>; `persist` also stores it (best effort). */
export function setTheme(theme: Theme, persist = true): void {
  ui.theme = theme
  document.documentElement.dataset['theme'] = theme
  if (persist) window.api.settings.set('ui.theme', theme).catch(() => undefined)
}

export function cycleTheme(): void {
  setTheme(THEMES[(THEMES.indexOf(ui.theme) + 1) % THEMES.length]!)
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function showToast(message: string, action?: ToastAction): void {
  clearTimeout(toastTimer)
  ui.toast = { message, action }
  toastTimer = setTimeout(dismissToast, 6000)
}
export function dismissToast(): void {
  clearTimeout(toastTimer)
  ui.toast = null
}

export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  // Electron prefixes IPC failures with "Error invoking remote method '...': Error: ".
  return m.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '')
}
export const notImplemented = (e: unknown): boolean => /not implemented/i.test(errorText(e))
