import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isLocalUrl, LineBuffer, listModels, parseNdjsonLine, parseSseLine, streamChat, testConnection } from '../src/main/ai/client'
import type { AiConfig } from '../src/shared/api'
import { deadPort, start } from './fixtures/fake-ai-server.mjs'
import type { FakeAiServer } from './fixtures/fake-ai-server.mjs'

describe('stream parsing', () => {
  it('SSE: deltas, [DONE], comments and junk', () => {
    expect(parseSseLine('data: {"choices":[{"delta":{"content":"Hi"}}]}')).toEqual({ delta: 'Hi' })
    expect(parseSseLine('data:{"choices":[{"delta":{"content":"x"}}]}')).toEqual({ delta: 'x' })
    expect(parseSseLine('data: [DONE]')).toEqual({ done: true })
    expect(parseSseLine('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toBeNull()
    expect(parseSseLine(': OPENROUTER PROCESSING')).toBeNull()
    expect(parseSseLine('')).toBeNull()
    expect(parseSseLine('data: {broken')).toBeNull()
    expect(() => parseSseLine('data: {"error":{"message":"boom"}}')).toThrow(/boom/)
  })

  it('NDJSON: content, done, errors', () => {
    expect(parseNdjsonLine('{"message":{"content":"Hi"},"done":false}')).toEqual({ delta: 'Hi' })
    expect(parseNdjsonLine('{"message":{"content":""},"done":true}')).toEqual({ done: true })
    expect(parseNdjsonLine('   ')).toBeNull()
    expect(() => parseNdjsonLine('{"error":"out of memory"}')).toThrow(/out of memory/)
  })

  it('LineBuffer handles split chunks and several events per chunk', () => {
    const b = new LineBuffer()
    const lines = [
      ...b.push('data: {"a":1}\n\ndata: {"b"'),
      ...b.push(':2}\r\n\r\nda'),
      ...b.push('ta: [DONE]\n\n')
    ]
    expect(lines).toEqual(['data: {"a":1}', '', 'data: {"b":2}', '', 'data: [DONE]', ''])
    expect(new LineBuffer().push('no newline')).toEqual([])
  })
})

describe('against a real HTTP server', () => {
  let fake: FakeAiServer
  beforeAll(async () => (fake = await start(0)))
  afterAll(() => fake.close())

  const cfg = (over: Partial<AiConfig> = {}): AiConfig => ({
    provider: 'custom', baseUrl: `http://127.0.0.1:${fake.port}/v1`, model: 'fake', contextTokens: 4096, searxngUrl: '', ...over
  })
  const ollama = (over: Partial<AiConfig> = {}): AiConfig => cfg({ provider: 'ollama', baseUrl: `http://127.0.0.1:${fake.port}`, ...over })
  const msgs = (text: string): { role: 'system' | 'user'; content: string }[] => [{ role: 'system', content: 'sys' }, { role: 'user', content: text }]
  const collect = async (c: AiConfig, text: string, key: string | null = null, signal = new AbortController().signal): Promise<string[]> => {
    const out: string[] = []
    for await (const d of streamChat(c, key, msgs(text), 0.5, signal)) out.push(d)
    return out
  }

  it('streams OpenAI-style SSE in several chunks and sends the key as a Bearer token', async () => {
    const chunks = await collect(cfg(), 'hello there', 'sk-test')
    expect(chunks.length).toBeGreaterThanOrEqual(4)
    expect(chunks.join('')).toBe('Echo: hello there')
    expect(fake.state.lastAuth).toBe('Bearer sk-test')
  })

  it('streams Ollama NDJSON and sends num_ctx', async () => {
    const chunks = await collect(ollama({ contextTokens: 16384 }), 'hola')
    expect(chunks.join('')).toBe('Echo: hola')
    expect(fake.state.lastOllama).toMatchObject({ model: 'fake', num_ctx: 16384, temperature: 0.5 })
  })

  it('ignores a trailing /v1 on an Ollama address', async () => {
    expect((await collect(ollama({ baseUrl: `http://127.0.0.1:${fake.port}/v1` }), 'x')).join('')).toBe('Echo: x')
  })

  it('maps HTTP 401 to a human message and never echoes the key', async () => {
    const err = await collect(cfg(), 'please 401', 'sk-leaky').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('The provider rejected the API key.')
    expect(String((err as Error).message)).not.toContain('sk-leaky')
  })

  it('maps an unknown Ollama model to "isn\'t installed"', async () => {
    await expect(collect(ollama({ model: 'missing' }), 'x')).rejects.toThrow("Model 'missing' isn't installed.")
  })

  it('reports an unreachable host in plain words', async () => {
    const at = `http://127.0.0.1:${await deadPort()}`
    await expect(collect(ollama({ baseUrl: at }), 'x')).rejects.toThrow(`Can't reach Ollama at ${at}. Is it running?`)
    await expect(collect(cfg({ provider: 'openrouter', baseUrl: 'https://nonexistent.invalid/api/v1' }), 'x')).rejects.toThrow(/Can't reach OpenRouter at .*connection/)
  })

  it('stops on abort and surfaces the abort reason', async () => {
    const ctl = new AbortController()
    const reason = new Error('mine')
    const got: string[] = []
    const run = (async () => {
      for await (const d of streamChat(cfg(), null, msgs('SLOW'), 0.5, ctl.signal)) {
        got.push(d)
        if (got.length === 2) ctl.abort(reason)
      }
    })()
    await expect(run).rejects.toBe(reason)
    expect(got.length).toBe(2)
  })

  it('lists models for both provider styles (sorted)', async () => {
    expect(await listModels(cfg(), 'k')).toEqual(['fake', 'fake-large'])
    expect(await listModels(ollama(), null)).toEqual(['fake-small:latest', 'fake:latest'])
    await expect(listModels(ollama({ baseUrl: `http://127.0.0.1:${await deadPort()}` }), null)).rejects.toThrow(/Can't reach Ollama/)
  })

  it('test(): ok, missing model, no model chosen, unreachable', async () => {
    expect(await testConnection(cfg(), null)).toEqual({ ok: true, provider: 'custom', model: 'fake', local: true })
    expect(await testConnection(ollama({ model: 'fake' }), null)).toMatchObject({ ok: true }) // matches fake:latest
    expect(await testConnection(cfg({ model: 'x' }), null)).toMatchObject({ ok: false, error: "Model 'x' isn't installed." })
    expect(await testConnection(cfg({ model: '' }), null)).toMatchObject({ ok: true })
    const at = `http://127.0.0.1:${await deadPort()}`
    expect(await testConnection(ollama({ baseUrl: at }), null)).toMatchObject({ ok: false, error: `Can't reach Ollama at ${at}. Is it running?` })
  })

  it('test(): reports local vs remote', async () => {
    for (const url of ['http://localhost:11434', 'http://127.0.0.1:1', 'http://127.5.5.5/v1', 'http://[::1]:8080/v1']) expect(isLocalUrl(url)).toBe(true)
    for (const url of ['https://openrouter.ai/api/v1', 'http://192.168.1.5:11434', 'http://localhost.evil.com', 'http://128.0.0.1']) expect(isLocalUrl(url)).toBe(false)
    const remote = await testConnection(cfg({ provider: 'openrouter', baseUrl: `http://127.0.0.2:${await deadPort()}/v1` }), null)
    expect(remote).toMatchObject({ ok: false, local: true, provider: 'openrouter' })
    expect((await testConnection({ ...cfg(), baseUrl: 'https://nonexistent.invalid/v1' }, null)).local).toBe(false)
  })
})

describe('timeouts', () => {
  let srv: Server
  let port = 0
  beforeAll(async () => {
    srv = createServer((req, res) => {
      if (req.url?.startsWith('/silent')) return // never answers
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"one"}}]}\n\n') // then nothing
    })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    port = (srv.address() as { port: number }).port
  })
  afterAll(() => {
    srv.closeAllConnections()
    srv.close()
  })
  const c = (path: string): AiConfig => ({ provider: 'custom', baseUrl: `http://127.0.0.1:${port}/${path}`, model: 'm', contextTokens: 2048, searxngUrl: '' })
  const drain = async (cfg: AiConfig, deps: { firstByteMs?: number; idleMs?: number }): Promise<string> => {
    const out: string[] = []
    for await (const d of streamChat(cfg, null, [{ role: 'user', content: 'x' }], 0, new AbortController().signal, deps)) out.push(d)
    return out.join('')
  }

  it('gives up when nothing arrives', async () => {
    await expect(drain(c('silent'), { firstByteMs: 80 })).rejects.toThrow(/didn't respond/)
  })
  it('gives up when the stream goes quiet', async () => {
    await expect(drain(c('v1'), { idleMs: 80 })).rejects.toThrow('The provider stopped responding.')
  })
})
