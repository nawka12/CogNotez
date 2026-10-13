export type Lang = 'en' | 'es' | 'id' | 'ja' | 'jv'
export type LangPref = 'system' | Lang

/** Each language's own name, for the picker. */
export const LANGS: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ja', name: '日本語' },
  { code: 'jv', name: 'Basa Jawa' }
]
export const isLangPref = (v: unknown): v is LangPref => v === 'system' || LANGS.some((l) => l.code === v)

/** The active language. `t()` reads it, so every template that calls `t()` re-renders when it changes. */
class Locale {
  lang = $state<Lang>('en')
}
export const locale = new Locale()

/** The first supported language among the OS/browser locales (legacy codes `in` and `jw` included), else English. */
export function systemLang(locales: readonly string[]): Lang {
  for (const l of locales) {
    const base = l.toLowerCase().split('-')[0]
    const code = base === 'in' ? 'id' : base === 'jw' ? 'jv' : base
    const hit = LANGS.find((x) => x.code === code)
    if (hit) return hit.code
  }
  return 'en'
}

export const resolveLang = (pref: LangPref, locales: readonly string[]): Lang => (pref === 'system' ? systemLang(locales) : pref)
