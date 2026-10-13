import en from './en.json'
import es from './es.json'
import id from './id.json'
import ja from './ja.json'
import jv from './jv.json'
import { locale } from './lang.svelte'
import type { Lang } from './lang.svelte'

export type Key = keyof typeof en
export { LANGS, isLangPref, resolveLang, locale } from './lang.svelte'
export type { Lang, LangPref } from './lang.svelte'

const dicts: Record<Lang, Partial<Record<string, string>>> = { en, es, id, ja, jv }

/**
 * `t('meta.words', { n })` picks `meta.words_one` when n is 1 and the language has that key (es does; id, ja and jv
 * use the base key for every n). A key a language lacks falls back to English. Reads the reactive `locale`.
 */
export function t(key: Key, vars?: Record<string, string | number>): string {
  const d = dicts[locale.lang]
  const src = d[key] === undefined ? (en as Record<string, string>) : d
  let s = src[key]!
  if (vars?.['n'] === 1) s = src[`${key}_one`] ?? s
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}
