import type { Mode } from './ui.svelte'

export type FontSize = 'small' | 'medium' | 'large'

/** Note text size, as the CSS length behind --note-size. */
const SIZES: Record<FontSize, string> = { small: '1rem', medium: '1.125rem', large: '1.3rem' }
export const FONT_SIZES = Object.keys(SIZES) as FontSize[]
export const isFontSize = (v: unknown): v is FontSize => typeof v === 'string' && v in SIZES
export const isMode = (v: unknown): v is Mode => v === 'edit' || v === 'split' || v === 'preview'

class Prefs {
  fontSize = $state<FontSize>('medium')
  spellcheck = $state(false)
  defaultMode = $state<Mode>('edit')
}
export const prefs = new Prefs()

const save = (key: string, value: unknown): void => void window.api.settings.set(key, value).catch(() => undefined)

export function setFontSize(v: FontSize, persist = true): void {
  prefs.fontSize = v
  document.documentElement.style.setProperty('--note-size', SIZES[v])
  if (persist) save('ui.font_size', v)
}

export function setSpellcheck(v: boolean, persist = true): void {
  prefs.spellcheck = v
  if (persist) save('editor.spellcheck', v)
}

export function setDefaultMode(v: Mode): void {
  prefs.defaultMode = v
  save('ui.default_mode', v)
}

/** Reads the saved preferences; the caller decides what to do with the default view. */
export async function loadPrefs(): Promise<void> {
  const get = (k: string): Promise<unknown> => window.api.settings.get(k).catch(() => null)
  const [size, spell, mode] = await Promise.all([get('ui.font_size'), get('editor.spellcheck'), get('ui.default_mode')])
  setFontSize(isFontSize(size) ? size : 'medium', false)
  setSpellcheck(spell === true, false)
  prefs.defaultMode = isMode(mode) ? mode : 'edit'
}
