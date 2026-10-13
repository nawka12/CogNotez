import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDriveTransport, q, ROOT_NAME } from '../src/main/sync/drive'
import type { Transport } from '../src/main/sync/transport'
import { parseQuery, start } from './fixtures/fake-drive-server.mjs'
import type { FakeDrive } from './fixtures/fake-drive-server.mjs'

let drive: FakeDrive
beforeAll(async () => {
  drive = await start(0)
})
afterAll(() => drive.close())

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
const dec = (b: Uint8Array | null): string | null => (b ? new TextDecoder().decode(b) : null)

let seq = 0
/** A transport that talks to the fake server; each call gets a fresh Drive account so tests don't see each other. */
function make(over: Partial<Parameters<typeof createDriveTransport>[0]> = {}): Transport {
  return createDriveTransport({
    getAccessToken: async () => drive.token(),
    apiBase: drive.url,
    email: 'me@example.test',
    sleep: async () => undefined,
    ...over
  })
}
async function fresh(): Promise<void> {
  // Rename the app's root so a new transport creates its own tree (the fake has no per-user isolation).
  for (const f of drive.files()) if (f.name === ROOT_NAME) await fetch(`${drive.url}/drive/v3/files/${f.id}`, { method: 'PATCH', headers: { authorization: `Bearer ${drive.token()}` }, body: JSON.stringify({ name: `old-${++seq}` }) })
  drive.state.requests.length = 0
}
const folderId = (name: string): string => {
  const root = drive.files().find((f) => f.name === ROOT_NAME)!
  return name === ROOT_NAME ? root.id : drive.files().find((f) => f.name === name && f.parents.includes(root.id))!.id
}

afterEach(async () => {
  await fresh()
})

describe('query escaping', () => {
  it('escapes quotes and backslashes', () => {
    expect(q("it's")).toBe("it\\'s")
    expect(q('a\\b')).toBe('a\\\\b')
    expect(q("\\'")).toBe("\\\\\\'")
  })
  it('round-trips awkward names through the fake query parser', () => {
    const file = { name: "n.a'b\\c.json", parents: ['p'], trashed: false, mimeType: 'x', appProperties: { cognotez: 'sync-v2' } } as never
    const preds = parseQuery(`name = '${q("n.a'b\\c.json")}' and 'p' in parents and trashed = false and appProperties has { key='cognotez' and value='sync-v2' }`)
    expect(preds).toHaveLength(4)
    expect(preds.every((p) => p(file))).toBe(true)
  })
})

describe('drive transport', () => {
  it('creates the folder tree once and reuses it', async () => {
    const t = make()
    await t.ensureRoot()
    await t.ensureRoot()
    await make().ensureRoot() // a second device finds the same folders
    const folders = drive.files().filter((f) => !f.name.startsWith('old-'))
    expect(folders.map((f) => f.name).sort()).toEqual(['CogNotez Sync', 'media', 'objects'])
    expect(folders.every((f) => f.appProperties['cognotez'] === 'sync-v2')).toBe(true)
    expect(t.kind).toBe('gdrive')
    expect(t.describe()).toBe('me@example.test')
  })

  it('creates once, reads back bytes exactly, reports exists', async () => {
    const t = make()
    await t.ensureRoot()
    const bytes = Uint8Array.from([0, 255, 10, 13, 45, 45, 1, 2, 3])
    expect(await t.create('objects/n.a.1.json', bytes)).toBe('created')
    expect(await t.create('objects/n.a.1.json', enc('different'))).toBe('exists')
    expect(await t.read('objects/n.a.1.json')).toEqual(bytes)
    expect(await t.read('objects/missing.json')).toBeNull()
    expect(await t.create('meta.json', enc('{}'))).toBe('created')
    expect(dec(await t.read('meta.json'))).toBe('{}')
    expect(drive.state.uploads).toBeGreaterThanOrEqual(2)
  })

  it('pages through large listings, then returns a change cursor', async () => {
    const t = make()
    await t.ensureRoot()
    const objects = folderId('objects')
    const media = folderId('media')
    for (let i = 0; i < 2300; i++) drive.seed(`n.${i}.json`, [objects], enc('x'))
    drive.seed('m.abc', [media], enc('media'))
    drive.state.requests.length = 0
    const r = await t.list(null)
    expect(r.full).toBe(true)
    expect(r.added).toHaveLength(2301)
    expect(r.added).toContainEqual({ name: 'media/m.abc', size: 5 })
    expect(drive.state.requests.filter((x) => x === 'GET /drive/v3/files').length).toBeGreaterThanOrEqual(4) // 3 pages of objects + media
    expect(drive.state.requests).toContain('GET /drive/v3/changes/startPageToken')
    expect((await t.list(r.cursor)).added).toEqual([])
  })

  it('lists incrementally: additions, removals, paging, and no repeats', async () => {
    const a = make()
    const b = make()
    await a.ensureRoot()
    const first = await a.list(null)
    await b.create('objects/n.x.1.json', enc('one'))
    await b.create('media/m.1', enc('two'))
    const inc = await a.list(first.cursor)
    expect(inc.full).toBe(false)
    expect(inc.added.map((e) => e.name).sort()).toEqual(['media/m.1', 'objects/n.x.1.json'])
    expect(inc.removed).toEqual([])
    expect((await a.list(inc.cursor)).added).toEqual([])

    await b.create('meta.json', enc('{}')) // root files are not part of the listing
    await b.remove('objects/n.x.1.json')
    const gone = await a.list(inc.cursor)
    expect(gone.added).toEqual([])
    expect(gone.removed).toEqual(['objects/n.x.1.json'])
    expect(gone.full).toBe(false)
  })

  it('uses several change pages when there are many changes', async () => {
    const t = make()
    await t.ensureRoot()
    const { cursor } = await t.list(null)
    const objects = folderId('objects')
    for (let i = 0; i < 1500; i++) drive.seed(`n.p${i}.json`, [objects], enc('x'))
    const r = await t.list(cursor)
    expect(r.added).toHaveLength(1500)
    expect(drive.state.requests.filter((x) => x === 'GET /drive/v3/changes').length).toBe(2)
  })

  it('falls back to a full listing when a removed file is unknown (e.g. after a restart)', async () => {
    const a = make()
    await a.ensureRoot()
    const id = drive.seed('n.old.json', [folderId('objects')], enc('x'))
    const { cursor } = await a.list(null)
    await fetch(`${drive.url}/drive/v3/files/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${drive.token()}` } })
    const restarted = make() // no id -> name memory
    const r = await restarted.list(cursor)
    expect(r.full).toBe(true)
    expect(r.added).toEqual([])
  })

  it('treats duplicate names as one file: oldest wins, remove deletes all', async () => {
    const t = make()
    await t.ensureRoot()
    const objects = folderId('objects')
    drive.seed('n.dup.json', [objects], enc('first'))
    drive.seed('n.dup.json', [objects], enc('second'))
    expect(await t.create('objects/n.dup.json', enc('third'))).toBe('exists')
    expect(dec(await t.read('objects/n.dup.json'))).toBe('first')
    expect((await t.list(null)).added.filter((e) => e.name === 'objects/n.dup.json')).toHaveLength(1)
    await t.remove('objects/n.dup.json')
    expect(await t.read('objects/n.dup.json')).toBeNull()
    await t.remove('objects/n.dup.json') // already gone: not an error
  })

  it('finds only files tagged by CogNotez', async () => {
    const t = make()
    await t.ensureRoot()
    drive.seed('n.other.json', [folderId('objects')], enc('x'), {})
    expect(await t.read('objects/n.other.json')).toBeNull()
    expect((await t.list(null)).added).toEqual([])
  })

  it('handles names with quotes and backslashes', async () => {
    const t = make()
    await t.ensureRoot()
    const name = "objects/n.it's\\odd.json"
    expect(await t.create(name, enc('v'))).toBe('created')
    expect(await t.create(name, enc('v'))).toBe('exists')
    expect(dec(await t.read(name))).toBe('v')
  })

  it('rejects names outside meta.json, objects/ and media/', async () => {
    const t = make()
    await t.ensureRoot()
    await expect(t.read('other/x')).rejects.toThrow(/Invalid sync file name/)
    await expect(t.create('objects/a/b', enc('x'))).rejects.toThrow(/Invalid sync file name/)
  })
})

describe('errors and retries', () => {
  it('retries 429 and 5xx with backoff, then succeeds', async () => {
    const sleeps: number[] = []
    const t = make({ sleep: async (ms) => void sleeps.push(ms) })
    await t.ensureRoot()
    drive.fail(429, 2, /GET \/drive\/v3\/files$/)
    drive.fail(503, 1, /GET \/drive\/v3\/files$/)
    expect(await t.read('objects/none.json')).toBeNull()
    expect(sleeps).toHaveLength(3)
    expect(sleeps[1]!).toBeGreaterThanOrEqual(sleeps[0]! * 0.5) // grows (with jitter)
    expect(sleeps.every((s) => s > 0 && s <= 8000)).toBe(true)
  })

  it('gives up after 5 tries with a readable message', async () => {
    const t = make()
    await t.ensureRoot()
    drive.state.requests.length = 0
    drive.fail(500, 5, /GET \/drive\/v3\/files$/)
    await expect(t.read('objects/x.json')).rejects.toThrow(/Google Drive is having trouble \(HTTP 500\)/)
    expect(drive.state.requests.filter((x) => x === 'GET /drive/v3/files')).toHaveLength(5)
  })

  it('treats quota-style rate limits (403 rateLimitExceeded) as retryable', async () => {
    const t = make()
    await t.ensureRoot()
    drive.fail(403, 1, /GET \/drive\/v3\/files$/, 'rateLimitExceeded')
    expect(await t.read('meta.json')).toBeNull()
  })

  it('refreshes the token once on 401, then retries', async () => {
    let current = drive.token()
    const getAccessToken = vi.fn(async (force?: boolean) => (force ? (current = drive.token()) : current))
    const t = make({ getAccessToken })
    await t.ensureRoot()
    drive.expireAccessTokens()
    expect(await t.read('meta.json')).toBeNull()
    expect(getAccessToken.mock.calls.filter(([f]) => f === true)).toHaveLength(1)
  })

  it('stops after one refresh when 401 persists', async () => {
    const getAccessToken = vi.fn(async () => 'bad-token')
    const t = make({ getAccessToken })
    await expect(t.ensureRoot()).rejects.toThrow(/Reconnect your Google account/)
    expect(getAccessToken).toHaveBeenCalledTimes(2)
  })

  it('passes sign-in expiry through unchanged', async () => {
    const t = make({
      getAccessToken: async () => {
        throw new Error('Google sign-in expired. Reconnect in Settings.')
      }
    })
    await expect(t.ensureRoot()).rejects.toThrow('Google sign-in expired. Reconnect in Settings.')
  })

  it('explains network failures', async () => {
    const t = make({
      fetch: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch
    })
    await expect(t.ensureRoot()).rejects.toThrow(/Could not reach Google Drive/)
  })

  it('explains a full Drive', async () => {
    const t = make()
    await t.ensureRoot()
    drive.fail(403, 1, /POST \/upload/, 'storageQuotaExceeded')
    await expect(t.create('objects/n.q.json', enc('x'))).rejects.toThrow(/Google Drive is full/)
  })
})
