import en from './en.json'

export type Key = keyof typeof en

/** `t('meta.words', { n })` picks `meta.words_one` when n is 1 and that key exists. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s: string = en[key]
  if (vars?.['n'] === 1) {
    const one = (en as Record<string, string>)[`${key}_one`]
    if (one) s = one
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}
