// AI settings: stored under `sys.ai_config` (main-only prefix), so the renderer can only change them through setConfig.
import type { AiConfig, AiProvider } from '../../shared/api'

export const PROVIDERS: readonly AiProvider[] = ['ollama', 'lmstudio', 'llamacpp', 'openrouter', 'custom']

/** `null` = no preset: the current value is kept. */
export const PRESETS: Record<AiProvider, string | null> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234/v1',
  llamacpp: 'http://localhost:8080/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: null
}

export const DEFAULT_CONFIG: AiConfig = { provider: 'ollama', baseUrl: PRESETS.ollama as string, model: '', contextTokens: 8192, searxngUrl: '' }

const KEY = 'sys.ai_config'
const FIELDS = ['provider', 'baseUrl', 'model', 'contextTokens', 'searxngUrl']

const fail = (msg: string): never => {
  throw new Error(`invalid argument: ${msg}`)
}

function provider(v: unknown): AiProvider {
  if (typeof v !== 'string' || !(PROVIDERS as readonly string[]).includes(v)) fail('unknown provider')
  return v as AiProvider
}

function httpUrl(v: unknown, name: string, allowEmpty: boolean): string {
  if (typeof v !== 'string') fail(`${name} must be a string`)
  const s = (v as string).trim()
  if (s === '' && allowEmpty) return ''
  if (s.length > 500) fail(`${name} is too long (max 500)`)
  let u: URL | undefined
  try {
    u = new URL(s)
  } catch {
    /* handled below */
  }
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) fail(`${name} must be an http(s) URL`)
  if (u?.username || u?.password) fail(`${name} must not contain credentials`)
  return s.replace(/\/+$/, '')
}

function model(v: unknown): string {
  if (typeof v !== 'string') fail('model must be a string')
  const s = (v as string).trim()
  if (s.length > 200) fail('model is too long (max 200)')
  return s
}

function contextTokens(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1024 || v > 262_144) fail('contextTokens must be an integer from 1024 to 262144')
  return v as number
}

/** Settings that v4 stored as plain localStorage strings are only trusted after the same validation. */
const truthy = (v: unknown): boolean => v === true || v === 1 || v === 'true' || v === '1'

type Settings = { get(key: string): unknown; set(key: string, value: unknown): void }

export function createConfig(settings: Settings) {
  /** Field by field, so one bad stored value falls back to its default instead of losing the whole config. */
  const sanitize = (raw: Record<string, unknown>): AiConfig => {
    const pick = <T>(fn: (v: unknown) => T, v: unknown, dflt: T): T => {
      try {
        return fn(v)
      } catch {
        return dflt
      }
    }
    const d = DEFAULT_CONFIG
    const p = pick(provider, raw['provider'], d.provider)
    return {
      provider: p,
      baseUrl: pick((v) => httpUrl(v, 'baseUrl', false), raw['baseUrl'], PRESETS[p] ?? d.baseUrl),
      model: pick(model, raw['model'], d.model),
      contextTokens: pick(contextTokens, raw['contextTokens'], d.contextTokens),
      searxngUrl: pick((v) => httpUrl(v, 'searxngUrl', true), raw['searxngUrl'], d.searxngUrl)
    }
  }

  /** v4 stored `ai_backend`, `ollama_*`, `openrouter_model` and `searxng_*`; the importer kept the non-secret ones. */
  function seed(): AiConfig {
    const v4 = settings.get('import.v4_settings')
    if (typeof v4 !== 'object' || v4 === null || Array.isArray(v4)) return { ...DEFAULT_CONFIG }
    const s = v4 as Record<string, unknown>
    const raw: Record<string, unknown> = {}
    if (s['ai_backend'] === 'openrouter') {
      raw['provider'] = 'openrouter'
      raw['baseUrl'] = PRESETS.openrouter
      raw['model'] = s['openrouter_model']
    } else if (s['ai_backend'] === 'ollama' || s['ollama_endpoint'] !== undefined || s['ollama_model'] !== undefined) {
      raw['provider'] = 'ollama'
      raw['baseUrl'] = s['ollama_endpoint']
      raw['model'] = s['ollama_model']
    }
    if (truthy(s['searxng_enabled'])) raw['searxngUrl'] = s['searxng_url']
    return sanitize(raw)
  }

  function getConfig(): AiConfig {
    const stored = settings.get(KEY)
    if (typeof stored === 'object' && stored !== null && !Array.isArray(stored)) return sanitize(stored as Record<string, unknown>)
    const seeded = seed()
    settings.set(KEY, seeded)
    return seeded
  }

  function setConfig(patch: unknown): AiConfig {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) fail('config patch must be an object')
    const o = patch as Record<string, unknown>
    for (const k of Object.keys(o)) if (!FIELDS.includes(k)) fail(`${k} is not allowed`)
    const cur = getConfig()
    const next = { ...cur }
    if (o['provider'] !== undefined) next.provider = provider(o['provider'])
    if (o['baseUrl'] !== undefined) next.baseUrl = httpUrl(o['baseUrl'], 'baseUrl', false)
    else if (next.provider !== cur.provider) next.baseUrl = PRESETS[next.provider] ?? cur.baseUrl
    if (o['model'] !== undefined) next.model = model(o['model'])
    if (o['contextTokens'] !== undefined) next.contextTokens = contextTokens(o['contextTokens'])
    if (o['searxngUrl'] !== undefined) next.searxngUrl = httpUrl(o['searxngUrl'], 'searxngUrl', true)
    settings.set(KEY, next)
    return next
  }

  return { getConfig, setConfig }
}
