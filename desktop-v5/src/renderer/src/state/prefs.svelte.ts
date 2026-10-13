import { isLangPref, locale, resolveLang } from '../i18n'
import type { LangPref } from '../i18n'
import { DEFAULT_WIDTH, WIDTH_CSS, isNoteWidth } from '../lib/noteWidth'
import type { NoteWidth } from '../lib/noteWidth'

export type FontSize = 'small' | 'medium' | 'large'

/** Note text size, as the CSS length behind --note-size. */
const SIZES: Record<FontSize, string> = { small: '1rem', medium: '1.125rem', large: '1.3rem' }
export const FONT_SIZES = Object.keys(SIZES) as FontSize[]
export const isFontSize = (v: unknown): v is FontSize => typeof v === 'string' && v in SIZES
class Prefs {
  fontSize = $state<FontSize>('medium')
  noteWidth = $state<NoteWidth>(DEFAULT_WIDTH)
  spellcheck = $state(false)
  language = $state<LangPref>('system')
}
export const prefs = new Prefs()

const save = (key: string, value: unknown): void => void window.api.settings.set(key, value).catch(() => undefined)

export function setFontSize(v: FontSize, persist = true): void {
  prefs.fontSize = v
  document.documentElement.style.setProperty('--note-size', SIZES[v])
  if (persist) save('ui.font_size', v)
}

export function setNoteWidth(v: NoteWidth, persist = true): void {
  prefs.noteWidth = v
  document.documentElement.style.setProperty('--note-max', WIDTH_CSS[v])
  if (persist) save('ui.note_width', v)
}

export function setSpellcheck(v: boolean, persist = true): void {
  prefs.spellcheck = v
  if (persist) save('editor.spellcheck', v)
}

/** Applies a language choice (System follows the OS locale) to `t()` and `<html lang>`. */
export function setLanguage(v: LangPref, persist = true): void {
  prefs.language = v
  locale.lang = resolveLang(v, navigator.languages)
  document.documentElement.lang = locale.lang
  if (persist) save('ui.language', v)
}

/** Read before the first render, so the window never flashes English. */
export async function loadLanguage(): Promise<void> {
  const v = await window.api.settings.get('ui.language').catch(() => null)
  setLanguage(isLangPref(v) ? v : 'system', false)
}

/** Reads the saved preferences. */
export async function loadPrefs(): Promise<void> {
  const get = (k: string): Promise<unknown> => window.api.settings.get(k).catch(() => null)
  const [size, width, spell] = await Promise.all([get('ui.font_size'), get('ui.note_width'), get('editor.spellcheck')])
  setFontSize(isFontSize(size) ? size : 'medium', false)
  setNoteWidth(isNoteWidth(width) ? width : DEFAULT_WIDTH, false)
  setSpellcheck(spell === true, false)
}
