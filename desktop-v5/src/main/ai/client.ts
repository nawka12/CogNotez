// Talks to model servers. Ollama uses its native /api (so num_ctx can be set); everything else is OpenAI-compatible.
// The API key is attached here and never appears in a log line, an error message or a return value.
import type { AiConfig, AiProvider, AiStatus } from '../../shared/api'
import type { ChatMessage } from './prompts'

/** Its message is written for the user. */
export class AiError extends Error {}
/** Abort reason for "the user (or a closing window) cancelled". */
export const USER_ABORT = new Error('aborted')

export interface ClientDeps {
  fetch?: typeof fetch
  firstByteMs?: number
  idleMs?: number
}
const LISTING_MS = 15_000

const LABELS: Record<AiProvider, string> = {
  ollama: 'Ollama', lmstudio: 'LM Studio', llamacpp: 'llama.cpp', openrouter: 'OpenRouter', custom: 'the server'
}

export function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

const base = (cfg: AiConfig): string => (cfg.provider === 'ollama' ? cfg.baseUrl.replace(/\/(v1|api)$/, '') : cfg.baseUrl)
const headers = (key: string | null): Record<string, string> => ({
  'content-type': 'application/json',
  ...(key ? { authorization: `Bearer ${key}` } : {})
})

// ---- errors -------------------------------------------------------------------------------

function unreachable(cfg: AiConfig): AiError {
  const where = `${LABELS[cfg.provider]} at ${base(cfg)}`
  return new AiError(`Can't reach ${where}. ${isLocalUrl(cfg.baseUrl) ? 'Is it running?' : 'Check the address and your connection.'}`)
}

async function httpError(res: Response, cfg: AiConfig): Promise<AiError> {
  let detail = ''
  try {
    const text = (await res.text()).slice(0, 2000)
    try {
      const j = JSON.parse(text) as { error?: string | { message?: string }; message?: string }
      detail = typeof j.error === 'string' ? j.error : (j.error?.message ?? j.message ?? '')
    } catch {
      detail = text
    }
  } catch {
    /* no body */
  }
  detail = detail.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (res.status === 401 || res.status === 403) return new AiError('The provider rejected the API key.')
  if (res.status === 402) return new AiError('The provider says the account has no credit left.')
  if (res.status === 404 && cfg.provider === 'ollama' && /model/i.test(detail)) return new AiError(`Model '${cfg.model}' isn't installed.`)
  if (res.status === 404) return new AiError(`The provider doesn't know that address or model (404). ${detail}`.trim())
  if (res.status === 429) return new AiError('The provider is rate-limiting requests. Try again in a moment.')
  return new AiError(`The provider returned an error (${res.status}). ${detail}`.trim())
}

/** Turns whatever fetch threw into a sentence for the user. */
export function humanize(e: unknown, cfg: AiConfig): string {
  if (e instanceof AiError) return e.message
  if (e instanceof Error && e.name === 'TimeoutError') return "The provider didn't respond in time."
  if (e instanceof TypeError) return unreachable(cfg).message // fetch rejects with TypeError for network failures
  return e instanceof Error ? e.message : String(e)
}

// ---- listing and testing ------------------------------------------------------------------

export async function listModels(cfg: AiConfig, key: string | null, deps: ClientDeps = {}, signal?: AbortSignal): Promise<string[]> {
  const doFetch = deps.fetch ?? fetch
  const ollama = cfg.provider === 'ollama'
  const sig = AbortSignal.any([AbortSignal.timeout(LISTING_MS), ...(signal ? [signal] : [])])
  let res: Response
  try {
    res = await doFetch(ollama ? `${base(cfg)}/api/tags` : `${cfg.baseUrl}/models`, { headers: headers(key), signal: sig })
  } catch (e) {
    throw new AiError(humanize(e, cfg))
  }
  if (!res.ok) throw await httpError(res, cfg)
  let body: { models?: { name?: unknown }[]; data?: { id?: unknown }[] }
  try {
    body = (await res.json()) as typeof body
  } catch {
    throw new AiError("That address didn't answer like a model server. Check the base URL.")
  }
  const list = ollama ? body.models?.map((m) => m.name) : body.data?.map((m) => m.id)
  if (!Array.isArray(list)) throw new AiError("That address didn't answer like a model server. Check the base URL.")
  return list.filter((n): n is string => typeof n === 'string').sort()
}

/** Ollama lists `llama3:latest` for a model the user may have typed as `llama3`. */
const sameModel = (listed: string, wanted: string): boolean => listed === wanted || listed === `${wanted}:latest`

export async function testConnection(cfg: AiConfig, key: string | null, deps: ClientDeps = {}): Promise<AiStatus> {
  const status: AiStatus = { ok: false, provider: cfg.provider, model: cfg.model, local: isLocalUrl(cfg.baseUrl) }
  try {
    const ids = await listModels(cfg, key, deps)
    if (cfg.model && !ids.some((id) => sameModel(id, cfg.model))) return { ...status, error: `Model '${cfg.model}' isn't installed.` }
    return { ...status, ok: true }
  } catch (e) {
    return { ...status, error: humanize(e, cfg) }
  }
}

// ---- streaming ----------------------------------------------------------------------------

/** Splits a byte stream into lines, whatever the chunk boundaries. */
export class LineBuffer {
  private buf = ''
  push(s: string): string[] {
    const parts = (this.buf + s).split(/\r?\n/)
    this.buf = parts.pop() ?? ''
    return parts
  }
  flush(): string[] {
    const rest = this.buf
    this.buf = ''
    return rest ? [rest] : []
  }
}

export interface Parsed {
  delta?: string
  done?: boolean
}

const errorText = (e: unknown): string => (typeof e === 'string' ? e : ((e as { message?: string } | null)?.message ?? 'unknown error'))

/** One SSE line. `null` = nothing to act on (comments, blank lines, role-only deltas, junk). */
export function parseSseLine(line: string): Parsed | null {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (data === '[DONE]') return { done: true }
  let j: { error?: unknown; choices?: { delta?: { content?: unknown } }[] }
  try {
    j = JSON.parse(data) as typeof j
  } catch {
    return null
  }
  if (j.error) throw new AiError(`The provider reported an error: ${errorText(j.error)}`.slice(0, 300))
  const c = j.choices?.[0]?.delta?.content
  return typeof c === 'string' && c ? { delta: c } : null
}

/** One line of Ollama's NDJSON stream. */
export function parseNdjsonLine(line: string): Parsed | null {
  if (!line.trim()) return null
  let j: { error?: unknown; done?: boolean; message?: { content?: unknown } }
  try {
    j = JSON.parse(line) as typeof j
  } catch {
    return null
  }
  if (j.error) throw new AiError(`The provider reported an error: ${errorText(j.error)}`.slice(0, 300))
  const c = j.message?.content
  const out: Parsed = {}
  if (typeof c === 'string' && c) out.delta = c
  if (j.done) out.done = true
  return out.delta !== undefined || out.done ? out : null
}

/** Aborts `parent`'s child controller on user abort, first-byte timeout or idle timeout. */
function watchdog(parent: AbortSignal) {
  const ctl = new AbortController()
  const onAbort = (): void => ctl.abort(parent.reason)
  if (parent.aborted) onAbort()
  else parent.addEventListener('abort', onAbort, { once: true })
  let timer: NodeJS.Timeout | undefined
  return {
    signal: ctl.signal,
    arm(ms: number, message: string): void {
      clearTimeout(timer)
      timer = setTimeout(() => ctl.abort(new AiError(message)), ms)
    },
    stop(): void {
      clearTimeout(timer)
      parent.removeEventListener('abort', onAbort)
    }
  }
}

/** Yields the reply text as it arrives. Throws AiError (human message), or the abort reason when cancelled. */
export async function* streamChat(
  cfg: AiConfig,
  key: string | null,
  messages: ChatMessage[],
  temperature: number,
  signal: AbortSignal,
  deps: ClientDeps = {}
): AsyncGenerator<string> {
  const doFetch = deps.fetch ?? fetch
  const ollama = cfg.provider === 'ollama'
  const wd = watchdog(signal)
  const model = cfg.model || undefined
  const body = ollama
    ? { model, messages, stream: true, options: { num_ctx: cfg.contextTokens, temperature } }
    : { model, messages, stream: true, temperature }
  const parse = ollama ? parseNdjsonLine : parseSseLine
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    wd.arm(deps.firstByteMs ?? 60_000, "The provider didn't respond within 60 seconds.")
    let res: Response
    try {
      res = await doFetch(ollama ? `${base(cfg)}/api/chat` : `${cfg.baseUrl}/chat/completions`, {
        method: 'POST', headers: headers(key), body: JSON.stringify(body), signal: wd.signal
      })
    } catch (e) {
      if (wd.signal.aborted) throw wd.signal.reason
      throw new AiError(humanize(e, cfg))
    }
    if (!res.ok) throw await httpError(res, cfg)
    if (!res.body) throw new AiError('The provider sent an empty response.')
    reader = res.body.getReader()
    const decoder = new TextDecoder()
    const lines = new LineBuffer()
    const idle = deps.idleMs ?? 120_000
    for (;;) {
      wd.arm(idle, 'The provider stopped responding.')
      let chunk: Awaited<ReturnType<typeof reader.read>>
      try {
        chunk = await reader.read()
      } catch {
        if (wd.signal.aborted) throw wd.signal.reason
        throw new AiError('The connection to the provider was interrupted.')
      }
      const batch = chunk.done ? lines.flush() : lines.push(decoder.decode(chunk.value, { stream: true }))
      for (const line of batch) {
        const p = parse(line)
        if (p?.delta) yield p.delta
        if (p?.done) return
      }
      if (chunk.done) return
    }
  } finally {
    wd.stop()
    void reader?.cancel().catch(() => undefined)
  }
}
