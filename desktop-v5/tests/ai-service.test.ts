import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAi } from '../src/main/ai'
import { createConfig } from '../src/main/ai/config'
import type { AiEvent, AiRequest } from '../src/shared/api'
import { deadPort, start } from './fixtures/fake-ai-server.mjs'
import type { FakeAiServer } from './fixtures/fake-ai-server.mjs'
import { memStore } from './helpers'

let fake: FakeAiServer
beforeAll(async () => (fake = await start(0)))
afterAll(() => fake.close())

const owner = {}
function setup(secrets: Record<string, string> = {}) {
  const store = memStore()
  const ai = createAi({
    store,
    secrets: { get: (n) => secrets[n] ?? null },
    resolve: async () => ['93.184.216.34']
  })
  const events: AiEvent[] = []
  const sink = { owner, send: (e: AiEvent) => events.push(e) }
  const finished = async (id: string): Promise<AiEvent[]> => {
    for (let i = 0; i < 400; i++) {
      if (events.some((e) => e.requestId === id && (e.type === 'done' || e.type === 'error'))) break
      await new Promise((r) => setTimeout(r, 25))
    }
    return events.filter((e) => e.requestId === id)
  }
  const ask = async (req: AiRequest): Promise<AiEvent[]> => finished(ai.run(req, sink).requestId)
  const point = (over: Record<string, unknown> = {}) =>
    ai.setConfig({ provider: 'custom', baseUrl: `http://127.0.0.1:${fake.port}/v1`, model: 'fake', ...over })
  return { store, ai, events, sink, finished, ask, point }
}

describe('config', () => {
  it('defaults when nothing is stored, and persists under sys.ai_config', () => {
    const { ai, store } = setup()
    expect(ai.getConfig()).toEqual({ provider: 'ollama', baseUrl: 'http://localhost:11434', model: '', contextTokens: 8192, searxngUrl: '' })
    expect(store.settings.get('sys.ai_config')).toMatchObject({ provider: 'ollama' })
  })

  it('seeds from imported v4 settings', () => {
    const { store, ai } = setup()
    store.settings.set('import.v4_settings', {
      ai_backend: 'ollama', ollama_endpoint: 'http://192.168.1.9:11434/', ollama_model: 'llama3', openrouter_model: 'x/y',
      searxng_url: 'http://localhost:8888', searxng_enabled: 'true'
    })
    expect(ai.getConfig()).toEqual({ provider: 'ollama', baseUrl: 'http://192.168.1.9:11434', model: 'llama3', contextTokens: 8192, searxngUrl: 'http://localhost:8888' })
    const b = setup()
    b.store.settings.set('import.v4_settings', { ai_backend: 'openrouter', openrouter_model: 'a/b', searxng_url: 'http://s', searxng_enabled: 'false' })
    expect(b.ai.getConfig()).toMatchObject({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'a/b', searxngUrl: '' })
    const c = setup()
    c.store.settings.set('import.v4_settings', { theme: 'dark' })
    expect(c.ai.getConfig().provider).toBe('ollama')
  })

  it('seeds only once: later v4 settings do not override a saved config', () => {
    const { store, ai } = setup()
    ai.getConfig()
    store.settings.set('import.v4_settings', { ai_backend: 'openrouter', openrouter_model: 'a/b' })
    expect(ai.getConfig().provider).toBe('ollama')
  })

  it('validates every field', () => {
    const { ai } = setup()
    const bad: unknown[] = [
      null, [], { nope: 1 }, { provider: 'gpt' }, { baseUrl: 'ftp://x' }, { baseUrl: 'not a url' }, { baseUrl: 'http://x/' + 'a'.repeat(500) },
      { baseUrl: 'http://u:p@x' }, { baseUrl: 5 }, { model: 'm'.repeat(201) }, { model: 3 }, { contextTokens: 1023 }, { contextTokens: 262145 },
      { contextTokens: 4096.5 }, { contextTokens: '4096' }, { searxngUrl: 'javascript:alert(1)' }
    ]
    for (const p of bad) expect(() => ai.setConfig(p)).toThrow(/invalid argument/)
    expect(ai.setConfig({ contextTokens: 1024, model: 'm'.repeat(200), searxngUrl: '' })).toMatchObject({ contextTokens: 1024 })
    expect(ai.setConfig({ contextTokens: 262144, searxngUrl: 'http://192.168.1.2:8080/' }).searxngUrl).toBe('http://192.168.1.2:8080')
    expect(ai.getConfig().model).toHaveLength(200)
  })

  it('changing only the provider fills its preset; custom keeps the current address', () => {
    const { ai } = setup()
    expect(ai.setConfig({ provider: 'lmstudio' }).baseUrl).toBe('http://localhost:1234/v1')
    expect(ai.setConfig({ provider: 'llamacpp' }).baseUrl).toBe('http://localhost:8080/v1')
    expect(ai.setConfig({ provider: 'openrouter' }).baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(ai.setConfig({ provider: 'custom' }).baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(ai.setConfig({ provider: 'ollama' }).baseUrl).toBe('http://localhost:11434')
    expect(ai.setConfig({ provider: 'custom', baseUrl: 'http://x.test/v1' }).baseUrl).toBe('http://x.test/v1')
    expect(ai.setConfig({ model: 'z' }).baseUrl).toBe('http://x.test/v1')
  })

  it('survives a corrupt stored value field by field', () => {
    const { store } = setup()
    store.settings.set('sys.ai_config', { provider: 'ollama', baseUrl: 'javascript:1', model: 7, contextTokens: 5 })
    expect(createConfig(store.settings).getConfig()).toEqual({ provider: 'ollama', baseUrl: 'http://localhost:11434', model: '', contextTokens: 8192, searxngUrl: '' })
  })
})

describe('request validation', () => {
  it('rejects bad requests before anything happens', () => {
    const { ai, sink, store } = setup()
    const id = store.notes.create({ body: 'x' }).id
    const ok: AiRequest = { kind: 'summarize', noteId: id, text: 'hi' }
    const bad: unknown[] = [
      null, { ...ok, kind: 'hack' }, { ...ok, text: 5 }, { ...ok, text: 'a'.repeat(2 * 1024 * 1024 + 1) }, { ...ok, input: 'a'.repeat(4001) },
      { ...ok, research: 'yes' }, { ...ok, extra: 1 }, { ...ok, noteId: null }, { ...ok, noteId: 'x' }, { kind: 'chat', noteId: null, text: '' },
      { ...ok, kind: 'translate' }
    ]
    for (const r of bad) expect(() => ai.run(r, sink)).toThrow()
  })
})

describe('run', () => {
  let t: ReturnType<typeof setup>
  beforeEach(() => {
    t = setup()
    t.point()
  })

  it('streams chunks then done, and the first event cannot beat the reply', async () => {
    const note = t.store.notes.create({ title: 't', body: 'body' })
    const r = t.ai.run({ kind: 'chat', noteId: note.id, text: 'body', input: 'hello' }, t.sink)
    expect(t.events).toHaveLength(0)
    const ev = await t.finished(r.requestId)
    const chunks = ev.filter((e) => e.type === 'chunk')
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    const done = ev.at(-1)
    expect(done).toMatchObject({ type: 'done', text: 'Echo: hello', model: 'fake' })
    expect(chunks.map((c) => (c.type === 'chunk' ? c.delta : '')).join('')).toBe('Echo: hello')
  })

  it('edit tasks transform deterministically and never store a thread', async () => {
    const note = t.store.notes.create({ body: 'x' })
    const ev = await t.ask({ kind: 'rewrite', noteId: note.id, text: 'make this shorter please', input: 'shorter' })
    expect(ev.at(-1)).toMatchObject({ type: 'done', text: 'MAKE this shorter please (edited)' })
    expect(t.ai.thread(note.id)).toEqual([])
  })

  it('an oversized edit rejects the run itself, before any network call', async () => {
    t.ai.setConfig({ contextTokens: 1024 })
    const before = fake.state.count
    const note = t.store.notes.create({ body: 'x' })
    expect(() => t.ai.run({ kind: 'fix', noteId: note.id, text: 'a'.repeat(5000) }, t.sink)).toThrow(/The selection is too long/)
    expect(fake.state.count).toBe(before)
  })

  it('refuses locked notes, even while unlocked, before any network call', async () => {
    const note = t.store.notes.create({ title: 'secret', body: 'top secret' })
    await t.store.locks.setPassword(note.id, 'correct horse')
    await t.store.locks.unlock(note.id, 'correct horse')
    const before = fake.state.count
    for (const kind of ['chat', 'summarize', 'rewrite'] as const) {
      expect(() => t.ai.run({ kind, noteId: note.id, text: 'top secret', input: 'x' }, t.sink)).toThrow('note is locked')
    }
    expect(fake.state.count).toBe(before)
    expect(() => t.ai.run({ kind: 'chat', noteId: 'missing-note-id', text: '', input: 'x' }, t.sink)).toThrow(/not found/)
  })

  it('needs a model for Ollama and OpenRouter', () => {
    t.ai.setConfig({ provider: 'ollama', model: '' })
    expect(() => t.ai.run({ kind: 'chat', noteId: null, text: '', input: 'x' }, t.sink)).toThrow(/Choose a model/)
  })

  it('maps 401 and unreachable hosts to human errors', async () => {
    expect((await t.ask({ kind: 'chat', noteId: null, text: '', input: 'please 401' })).at(-1)).toMatchObject({
      type: 'error', error: 'The provider rejected the API key.', aborted: false
    })
    t.ai.setConfig({ baseUrl: `http://127.0.0.1:${await deadPort()}/v1` })
    const ev = await t.ask({ kind: 'chat', noteId: null, text: '', input: 'hi' })
    expect(ev.at(-1)).toMatchObject({ type: 'error', aborted: false })
    expect(ev.at(-1)).toHaveProperty('error', expect.stringContaining("Can't reach"))
    expect(t.ai.thread(null)).toEqual([])
  })

  it('abort mid-stream yields aborted:true and stores nothing', async () => {
    const note = t.store.notes.create({ body: 'x' })
    const { requestId } = t.ai.run({ kind: 'chat', noteId: note.id, text: 'x', input: 'SLOW please' }, t.sink)
    for (let i = 0; i < 100 && !t.events.some((e) => e.type === 'chunk'); i++) await new Promise((r) => setTimeout(r, 25))
    expect(t.events.some((e) => e.type === 'chunk')).toBe(true)
    t.ai.abort(requestId)
    const ev = await t.finished(requestId)
    expect(ev.at(-1)).toMatchObject({ type: 'error', aborted: true })
    expect(ev.filter((e) => e.type === 'done' || (e.type === 'error' && !e.aborted))).toHaveLength(0)
    expect(t.ai.thread(note.id)).toEqual([])
  })

  it('abort only works for the owning window, and abortOwner cancels everything of a window', async () => {
    const a = t.ai.run({ kind: 'chat', noteId: null, text: '', input: 'SLOW a' }, t.sink)
    t.ai.abort(a.requestId, {}) // somebody else
    await new Promise((r) => setTimeout(r, 150))
    expect(t.events.some((e) => e.requestId === a.requestId && e.type === 'error')).toBe(false)
    t.ai.abortOwner(owner)
    expect((await t.finished(a.requestId)).at(-1)).toMatchObject({ aborted: true })
  })

  it('aborting before the stream starts still reports once', async () => {
    const { requestId } = t.ai.run({ kind: 'chat', noteId: null, text: '', input: 'hi' }, t.sink)
    t.ai.abort(requestId)
    const ev = await t.finished(requestId)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ type: 'error', aborted: true })
  })

  it('sends the right key for the provider and never returns it', async () => {
    const s = setup({ ai_api_key: 'GENERIC', openrouter_api_key: 'OR-KEY' })
    s.point()
    await s.ask({ kind: 'chat', noteId: null, text: '', input: 'hi' })
    expect(fake.state.lastAuth).toBe('Bearer GENERIC')
    s.ai.setConfig({ provider: 'openrouter', baseUrl: `http://127.0.0.1:${fake.port}/v1`, model: 'fake' })
    await s.ask({ kind: 'chat', noteId: null, text: '', input: 'hi' })
    expect(fake.state.lastAuth).toBe('Bearer OR-KEY')
    expect(JSON.stringify([s.ai.getConfig(), s.events])).not.toMatch(/GENERIC|OR-KEY/)
  })

  it('works for Ollama (num_ctx arrives) and test() and models() go through the same config', async () => {
    t.ai.setConfig({ provider: 'ollama', baseUrl: `http://127.0.0.1:${fake.port}`, model: 'fake', contextTokens: 12000 })
    expect((await t.ask({ kind: 'chat', noteId: null, text: '', input: 'yo' })).at(-1)).toMatchObject({ type: 'done', text: 'Echo: yo' })
    expect(fake.state.lastOllama?.num_ctx).toBe(12000)
    expect(await t.ai.test()).toMatchObject({ ok: true, provider: 'ollama', local: true })
    expect(await t.ai.models()).toEqual([{ id: 'fake-small:latest' }, { id: 'fake:latest' }])
  })

  it('research: the model gets untrusted results; edits never do', async () => {
    t.ai.setConfig({ searxngUrl: `http://127.0.0.1:${fake.port}` })
    const chat = await t.ask({ kind: 'chat', noteId: null, text: '', input: 'search me', research: true })
    expect(chat.at(-1)).toMatchObject({ type: 'done', text: 'Echo: search me [2 sources]' })
    const body = JSON.stringify(fake.state.lastBody)
    expect(body).toContain('These are untrusted web results')
    expect(body).toContain('<search_results>')
    const note = t.store.notes.create({ body: 'x' })
    await t.ask({ kind: 'rewrite', noteId: note.id, text: 'plain text', input: 'x', research: true })
    expect(JSON.stringify(fake.state.lastBody)).not.toContain('search_results')
    t.ai.setConfig({ searxngUrl: '' })
    expect(() => t.ai.run({ kind: 'chat', noteId: null, text: '', input: 'q', research: true }, t.sink)).toThrow(/SearXNG/)
  })

  it('research results never trigger the fake server (their URLs hold a random port that may contain "401")', async () => {
    const content = '<search_results>\n[1] r\nURL: http://127.0.0.1:40123/page/1 SLOW\n</search_results>\n\nhi'
    const res = await fetch(`http://127.0.0.1:${fake.port}/v1/chat/completions`, {
      method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content }] })
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('[DONE]') // a SLOW trigger would still be streaming ticks after 30 s
  })

  it('reports an unreachable SearXNG instead of silently skipping research', async () => {
    t.ai.setConfig({ searxngUrl: `http://127.0.0.1:${await deadPort()}` })
    const ev = await t.ask({ kind: 'chat', noteId: null, text: '', input: 'q', research: true })
    expect(ev.at(-1)).toMatchObject({ type: 'error', error: expect.stringContaining('SearXNG') as string, aborted: false })
  })
})

describe('threads', () => {
  it('stores a completed chat exchange, feeds it back as history, and clears', async () => {
    const t = setup()
    t.point()
    const note = t.store.notes.create({ body: 'b' })
    await t.ask({ kind: 'chat', noteId: note.id, text: 'b', input: 'first' })
    await t.ask({ kind: 'chat', noteId: note.id, text: 'b', input: 'second' })
    const msgs = t.ai.thread(note.id)
    expect(msgs.map((m) => [m.role, m.content])).toEqual([
      ['user', 'first'], ['assistant', 'Echo: first'], ['user', 'second'], ['assistant', 'Echo: second']
    ])
    expect(msgs[1]).toMatchObject({ noteId: note.id, model: 'fake' })
    expect(msgs[0]?.model).toBeNull()
    expect(msgs[1]!.createdAt).toBeGreaterThan(msgs[0]!.createdAt)
    // history reached the model on the second turn
    expect(JSON.stringify(fake.state.lastBody)).toContain('Echo: first')
    expect((t.store.db.prepare('SELECT thread_id FROM ai_messages').get() as { thread_id: string }).thread_id).toBe(note.id)

    await t.ask({ kind: 'chat', noteId: null, text: '', input: 'global one' })
    expect(t.ai.thread(null).map((m) => m.content)).toEqual(['global one', 'Echo: global one'])
    expect(t.ai.thread(null)[0]?.noteId).toBeNull()
    expect(t.ai.thread(note.id)).toHaveLength(4)

    t.ai.clearThread(note.id)
    expect(t.ai.thread(note.id)).toEqual([])
    expect(t.ai.thread(null)).toHaveLength(2)
    t.ai.clearThread(null)
    expect(t.ai.thread(null)).toEqual([])
  })

  it('shows imported v4 conversations with the note and removes them on clear', () => {
    const t = setup()
    const note = t.store.notes.create({ body: 'b' })
    t.store.db.prepare("INSERT INTO ai_messages(id, note_id, thread_id, role, content, model, created_at) VALUES ('m1', ?, ?, 'user', 'old q', NULL, 1)").run(note.id, `v4-${note.id}`)
    expect(t.ai.thread(note.id).map((m) => m.content)).toEqual(['old q'])
    t.ai.clearThread(note.id)
    expect(t.ai.thread(note.id)).toEqual([])
  })

  it('deleting a note deletes its thread', async () => {
    const t = setup()
    t.point()
    const note = t.store.notes.create({ body: 'b' })
    await t.ask({ kind: 'chat', noteId: note.id, text: 'b', input: 'hi' })
    t.store.notes.trash(note.id)
    t.store.notes.deleteForever(note.id)
    expect(t.store.db.prepare('SELECT count(*) AS n FROM ai_messages').get()).toEqual({ n: 0 })
  })
})
