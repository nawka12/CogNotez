// The AI service: config, requests, streaming, abort and chat threads. No Electron imports: ipc.ts is the adapter.
import { randomUUID } from 'node:crypto'
import type { AiConfig, AiEvent, AiMessage, AiModel, AiRequest, AiStatus } from '../../shared/api'
import * as g from '../guards'
import { tx } from '../store/db'
import type { Secrets } from '../secrets'
import type { Store } from '../store/notes'
import { AiError, humanize, listModels, streamChat, testConnection, USER_ABORT } from './client'
import type { ClientDeps } from './client'
import { createConfig } from './config'
import { build, TASKS } from './prompts'
import { formatResearch, research } from './research'
import type { Resolver } from './research'

export interface AiDeps {
  store: Pick<Store, 'db' | 'settings'>
  secrets: Pick<Secrets, 'get'>
  /** Tests inject a fake fetch, a fake DNS resolver and short timeouts. */
  fetch?: typeof fetch
  resolve?: Resolver
  firstByteMs?: number
  idleMs?: number
  warn?: (...a: unknown[]) => void
}

/** Where a request's events go. `owner` is the window: its requests are aborted when it goes away. */
export interface AiSink {
  owner: object
  send(e: AiEvent): void
}

const MAX_TEXT = 2 * 1024 * 1024
const MAX_INPUT = 4_000

const fail = (msg: string): never => {
  throw new Error(`invalid argument: ${msg}`)
}

export function parseRequest(v: unknown): AiRequest {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail('request must be an object')
  const o = v as Record<string, unknown>
  for (const k of Object.keys(o)) if (!['kind', 'noteId', 'text', 'input', 'research'].includes(k)) fail(`${k} is not allowed`)
  if (typeof o['kind'] !== 'string' || !Object.hasOwn(TASKS, o['kind'])) fail('unknown kind')
  const kind = o['kind'] as AiRequest['kind']
  if (typeof o['text'] !== 'string') fail('text must be a string')
  if ((o['text'] as string).length > MAX_TEXT) fail('text is too long (max 2 MB)')
  if (o['input'] !== undefined && typeof o['input'] !== 'string') fail('input must be a string')
  if (((o['input'] as string | undefined) ?? '').length > MAX_INPUT) fail(`input is too long (max ${MAX_INPUT})`)
  if (o['research'] !== undefined && typeof o['research'] !== 'boolean') fail('research must be a boolean')
  const noteId = o['noteId'] === null ? null : g.id(o['noteId'])
  if (noteId === null && kind !== 'chat') fail('noteId is required')
  if ((kind === 'chat' || kind === 'translate') && !((o['input'] as string | undefined) ?? '').trim()) fail('input is required')
  const req: AiRequest = { kind, noteId, text: o['text'] as string }
  if (o['input'] !== undefined) req.input = o['input'] as string
  if (o['research'] !== undefined) req.research = o['research'] as boolean
  return req
}

export function createAi(deps: AiDeps) {
  const { db, settings } = deps.store
  const { getConfig, setConfig } = createConfig(settings)
  const active = new Map<string, { ctl: AbortController; owner: object }>()
  const client: ClientDeps = {
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    ...(deps.firstByteMs ? { firstByteMs: deps.firstByteMs } : {}),
    ...(deps.idleMs ? { idleMs: deps.idleMs } : {})
  }
  /** Main-only. openrouter has its own key; every other provider uses the generic one, if set. */
  const keyFor = (cfg: AiConfig): string | null => deps.secrets.get(cfg.provider === 'openrouter' ? 'openrouter_api_key' : 'ai_api_key')

  // ---- threads ----------------------------------------------------------------------------
  // v4's imported conversations live in `v4-<id>` threads; they are shown with the note's own.
  const threads = (noteId: string | null): [string, string] => [noteId ?? 'global', `v4-${noteId ?? 'global'}`]

  function thread(noteId: string | null): AiMessage[] {
    const rows = db
      .prepare(
        `SELECT id, note_id, role, content, model, created_at FROM ai_messages
         WHERE thread_id IN (?, ?) AND role IN ('user', 'assistant') ORDER BY created_at, rowid`
      )
      .all(...threads(noteId)) as { id: string; note_id: string | null; role: 'user' | 'assistant'; content: string; model: string | null; created_at: number }[]
    return rows.map((r) => ({ id: r.id, noteId: r.note_id, role: r.role, content: r.content, model: r.model, createdAt: r.created_at }))
  }

  function clearThread(noteId: string | null): void {
    db.prepare('DELETE FROM ai_messages WHERE thread_id IN (?, ?)').run(...threads(noteId))
  }

  function saveExchange(noteId: string | null, user: string, assistant: string, model: string, at: number): void {
    const ins = db.prepare('INSERT INTO ai_messages(id, note_id, thread_id, role, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const thread = threads(noteId)[0]
    tx(db, () => {
      ins.run(randomUUID(), noteId, thread, 'user', user, null, at)
      ins.run(randomUUID(), noteId, thread, 'assistant', assistant, model || null, Math.max(Date.now(), at + 1))
    })
  }

  // ---- requests ---------------------------------------------------------------------------

  function checkNote(noteId: string | null): void {
    if (noteId === null) return
    const row = db.prepare('SELECT locked FROM notes WHERE id = ?').get(noteId) as { locked: number } | undefined
    if (!row) throw new Error('note not found')
    // Even while it is unlocked: the model would otherwise be handed plaintext of a note the user locked.
    if (row.locked) throw new Error('note is locked')
  }

  function run(raw: unknown, sink: AiSink): { requestId: string } {
    const req = parseRequest(raw)
    checkNote(req.noteId) // before anything touches the network
    const cfg = getConfig()
    if (!cfg.model && (cfg.provider === 'ollama' || cfg.provider === 'openrouter')) throw new Error('Choose a model in Settings first.')
    const researching = req.kind === 'chat' && req.research === true
    if (researching && !cfg.searxngUrl) throw new Error('Research needs a SearXNG address in Settings.')
    const history = req.kind === 'chat' ? thread(req.noteId).map((m) => ({ role: m.role, content: m.content })) : []
    const first = build({ req, contextTokens: cfg.contextTokens, history }) // rejects an oversized edit right here

    const requestId = randomUUID()
    const ctl = new AbortController()
    active.set(requestId, { ctl, owner: sink.owner })
    const started = Date.now()

    const execute = async (): Promise<void> => {
      try {
        let built = first
        if (researching) {
          try {
            const sources = await research(cfg.searxngUrl, req.input ?? '', {
              signal: ctl.signal,
              ...(deps.fetch ? { fetch: deps.fetch } : {}),
              ...(deps.resolve ? { resolve: deps.resolve } : {})
            })
            built = build({ req, contextTokens: cfg.contextTokens, history, research: formatResearch(sources) })
          } catch (e) {
            if (ctl.signal.aborted) throw e
            throw new AiError(`Couldn't search the web through SearXNG at ${cfg.searxngUrl}.`)
          }
        }
        let text = ''
        for await (const delta of streamChat(cfg, keyFor(cfg), built.messages, built.temperature, ctl.signal, client)) {
          text += delta
          sink.send({ type: 'chunk', requestId, delta })
        }
        if (!text.trim()) throw new AiError('The model returned an empty reply.')
        if (req.kind === 'chat') {
          try {
            saveExchange(req.noteId, (req.input ?? '').trim(), text, cfg.model, started)
          } catch (e) {
            deps.warn?.('could not store the chat exchange:', String(e)) // e.g. the note was deleted meanwhile
          }
        }
        sink.send({ type: 'done', requestId, text, model: cfg.model })
      } catch (e) {
        const aborted = ctl.signal.aborted && ctl.signal.reason === USER_ABORT
        sink.send({ type: 'error', requestId, error: aborted ? 'Cancelled.' : humanize(e, cfg), aborted })
      } finally {
        active.delete(requestId)
      }
    }
    // After the caller has the id, so no event can beat the reply.
    setImmediate(() => void execute())
    return { requestId }
  }

  return {
    getConfig,
    setConfig,
    async models(): Promise<AiModel[]> {
      const cfg = getConfig()
      return (await listModels(cfg, keyFor(cfg), client)).map((id) => ({ id }))
    },
    test(): Promise<AiStatus> {
      const cfg = getConfig()
      return testConnection(cfg, keyFor(cfg), client)
    },
    run,
    /** The cancelled request reports itself with an `error` event (aborted: true). */
    abort(requestId: string, owner?: object): void {
      const a = active.get(requestId)
      if (a && (owner === undefined || a.owner === owner)) a.ctl.abort(USER_ABORT)
    },
    abortOwner(owner: object): void {
      for (const a of active.values()) if (a.owner === owner) a.ctl.abort(USER_ABORT)
    },
    thread,
    clearThread
  }
}

export type Ai = ReturnType<typeof createAi>
