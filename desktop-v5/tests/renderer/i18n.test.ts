import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../../src/renderer/src/i18n/en.json'
import es from '../../src/renderer/src/i18n/es.json'
import id from '../../src/renderer/src/i18n/id.json'
import ja from '../../src/renderer/src/i18n/ja.json'
import jv from '../../src/renderer/src/i18n/jv.json'
import { LANGS, locale, resolveLang, t } from '../../src/renderer/src/i18n'
import type { Lang } from '../../src/renderer/src/i18n'

const locales: Record<Exclude<Lang, 'en'>, Record<string, string>> = { es, id, ja, jv }
const enKeys = Object.keys(en)
const holders = (s: string): string[] => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort()

// Keys built at runtime, as t(`prefix.${value}`). Listed in full so a stray key in these families is still caught.
const DYNAMIC = [
  /^filter\.(all|pinned|trash)$/,
  /^filter\.(all|pinned|trash|conflicts)\.title$/,
  /^mode\.(edit|split|preview)(\.view)?$/,
  /^theme\.(system|light|dark)$/,
  /^settings\.size\.(small|medium|large)$/,
  /^ai\.provider\.(ollama|lmstudio|llamacpp|openrouter|custom)$/,
  /^updates\.chip\.(available|downloading|ready)$/
]

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'i18n') sources(p, out)
    } else if (/\.(ts|svelte)$/.test(e.name)) out.push(readFileSync(p, 'utf8'))
  }
  return out
}

describe('en.json has no dead keys', () => {
  const quoted = new Set(sources('src/renderer/src').flatMap((s) => [...s.matchAll(/(['"`])([A-Za-z][\w.]*)\1/g)].map((m) => m[2]!)))
  it('every key is named in a source file or belongs to a dynamic family', () => {
    const dead = enKeys.filter((k) => {
      const base = k.replace(/_one$/, '')
      return !quoted.has(base) && !DYNAMIC.some((re) => re.test(base))
    })
    expect(dead).toEqual([])
  })
  it('every _one key has a base key', () => {
    for (const k of enKeys.filter((k) => k.endsWith('_one'))) expect(en).toHaveProperty(k.replace(/_one$/, ''))
  })
})

describe.each(Object.entries(locales))('locale %s', (code, dict) => {
  const base = (k: string): string => k.replace(/_one$/, '')
  it('has exactly the base keys of en.json', () => {
    const want = enKeys.filter((k) => !k.endsWith('_one')).sort()
    expect(Object.keys(dict).filter((k) => !k.endsWith('_one')).sort()).toEqual(want)
  })
  it('only adds _one keys for keys that exist', () => {
    for (const k of Object.keys(dict).filter((k) => k.endsWith('_one'))) expect(en).toHaveProperty(base(k))
  })
  it('keeps the plural forms English has when the language distinguishes them', () => {
    const own = Object.keys(dict).filter((k) => k.endsWith('_one'))
    if (code === 'es') expect(own.sort()).toEqual(enKeys.filter((k) => k.endsWith('_one')).sort())
    else expect(own).toEqual([])
  })
  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe('')
  })
  it('keeps every {placeholder}', () => {
    const src = en as Record<string, string>
    for (const [k, v] of Object.entries(dict)) expect(holders(v), k).toEqual(holders(src[k] ?? src[base(k)]!))
  })
})

describe('language choice', () => {
  it('maps the OS locales to a supported language, else English', () => {
    expect(resolveLang('system', ['es-MX', 'en'])).toBe('es')
    expect(resolveLang('system', ['fr-FR', 'ja-JP'])).toBe('ja')
    expect(resolveLang('system', ['in-ID'])).toBe('id')
    expect(resolveLang('system', ['jw'])).toBe('jv')
    expect(resolveLang('system', ['fr', 'de'])).toBe('en')
    expect(resolveLang('system', [])).toBe('en')
    expect(resolveLang('ja', ['es'])).toBe('ja')
  })
  it('offers each language by its own name', () => {
    expect(LANGS.map((l) => l.code)).toEqual(['en', 'es', 'id', 'ja', 'jv'])
  })
  it('t() follows the active language, with the plural rule of that language', () => {
    locale.lang = 'es'
    expect(t('meta.words', { n: 1 })).toBe('1 palabra')
    expect(t('meta.words', { n: 2 })).toBe('2 palabras')
    locale.lang = 'ja'
    expect(t('meta.words', { n: 1 })).toBe(ja['meta.words'].replace('{n}', '1'))
    locale.lang = 'en'
    expect(t('meta.words', { n: 1 })).toBe('1 word')
  })
})
