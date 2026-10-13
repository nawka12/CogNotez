import { t } from '../i18n'
import type { Key } from '../i18n'
import { mergeTags } from './tags'
import { countWords } from './text'

/** Does this base URL point at this computer? Used before (or without) a connection test. */
export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

/** Who gets the text: a friendly name for OpenRouter, otherwise the server's host name. */
export function remoteName(provider: string, baseUrl: string): string {
  if (provider === 'openrouter') return 'OpenRouter'
  try {
    return new URL(baseUrl).hostname
  } catch {
    return baseUrl
  }
}

/** The honest line(s) under the composer. Research searches the web, so "nothing is sent anywhere" would be untrue. */
export function hintKeys(remote: boolean, research: boolean): Key[] {
  const where: Key[] = remote ? ['ai.hint.remote'] : research ? [] : ['ai.hint.local']
  return research ? [...where, 'ai.hint.research'] : where
}

export const wordDelta = (before: string, after: string): number => countWords(after) - countWords(before)

/** "12 fewer words", "1 more word", "Same word count". */
export function deltaLabel(delta: number): string {
  if (delta < 0) return t('ai.fewer', { n: -delta })
  if (delta > 0) return t('ai.more', { n: delta })
  return t('ai.sameWords')
}

/**
 * Makes the model's answer fit where it goes. Rewrites keep the selection's own leading and trailing whitespace
 * (models trim or add newlines at will). A continuation gets a space when it would otherwise glue onto a word.
 */
export function fitResult(kind: string, original: string, before: string, result: string): string {
  if (kind === 'continue') {
    const out = result.replace(/\s+$/, '')
    return before && !/\s$/.test(before) && /^[\p{L}\p{N}]/u.test(out) ? ` ${out}` : out
  }
  const lead = /^\s*/.exec(original)![0]
  const trail = /\s*$/.exec(original)![0]
  return lead + result.trim() + trail
}

const LIST_MARK = /^\s*(?:[-*•]|\d+[.)])\s+/
const MAX_TAGS = 12

/** Tags from a model answer (a prose prefix like "Here are tags: work" is dropped): the first JSON array of strings if there is one, otherwise comma or line separated words. */
export function parseTags(text: string): string[] {
  let names: string[] = []
  for (const m of text.matchAll(/\[[^[\]]*\]/g)) {
    try {
      const v: unknown = JSON.parse(m[0])
      const strings = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
      if (strings.length) {
        names = strings
        break
      }
    } catch {
      /* not JSON; try the next bracket */
    }
  }
  if (!names.length) {
    names = text
      .split(/[,\n]/)
      .map((s) => s.replace(LIST_MARK, '').replace(/^[^:]*:\s*/, '').replace(/^["'`\s]+|["'`\s.]+$/g, ''))
      .filter((s) => s && !s.endsWith(':') && s.split(/\s+/).length <= 3) // longer pieces are prose, not tags
  }
  return mergeTags([], names).slice(0, MAX_TAGS)
}
