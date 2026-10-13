import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKeyCache, IDLE_MS } from '../src/main/crypto/keycache'
import { openV5, openWithPassword, parseEnvelope, sealV5 } from '../src/main/crypto/notecrypto'
import { openDb } from '../src/main/store/db'
import { createStore } from '../src/main/store/notes'
import { memStore } from './helpers'

const PW = 'correct horse battery'
const ID = 'note-id-aaaa-0001'
const ID2 = 'note-id-bbbb-0002'
const HASH = 'ab'.repeat(32)

/** An independent re-implementation of desktop/src/js/encryption.js encryptData(), written from its source. */
function v4Envelope(content: string, password: string, opts: { iter?: number; omitIter?: boolean } = {}): Buffer {
  const iter = opts.iter ?? 210000
  const iv = randomBytes(12)
  const salt = randomBytes(16)
  const key = pbkdf2Sync(password, salt, iter, 32, 'sha256')
  const c = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify({ content }), 'utf8')), c.final()])
  const env: Record<string, unknown> = {
    v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter,
    salt: salt.toString('base64'), iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64')
  }
  if (opts.omitIter) delete env.iter
  return Buffer.from(JSON.stringify(env), 'utf8') // v4 stores the JSON *string*; v5 keeps its UTF-8 bytes
}

function addV4(s: ReturnType<typeof memStore>, id: string, cipher: Buffer, title = 'Secret'): void {
  s.bulk.insert({
    notes: [{ id, title, body: '', createdAt: 1, updatedAt: 1, pinned: false, archived: false, cipher, cipherFormat: 'v4', tags: [], media: [] }],
    media: [{ hash: HASH, mime: 'image/png', bytes: 3, createdAt: 1 }],
    messages: []
  })
}

const row = (s: ReturnType<typeof memStore>, id: string) =>
  s.db.prepare('SELECT body, locked, cipher, cipher_format FROM notes WHERE id = ?').get(id) as {
    body: string; locked: number; cipher: Uint8Array | null; cipher_format: string | null
  }

afterEach(() => vi.useRealTimers())

describe('v4 compatibility', () => {
  it('opens an envelope built the way encryption.js builds it', async () => {
    const o = await openWithPassword(v4Envelope('hello v4 ✓', PW), 'v4', ID, PW)
    expect(o.text).toBe('hello v4 ✓')
    expect(o.key).toHaveLength(32)
  })

  it('defaults a missing iter to 210000 like v4 does', async () => {
    const env = v4Envelope('x', PW, { omitIter: true })
    expect(parseEnvelope(env, 'v4').iter).toBe(210000)
    expect((await openWithPassword(env, 'v4', ID, PW)).text).toBe('x')
  })

  it('a wrong password and a damaged envelope both say only "wrong password"', async () => {
    const env = v4Envelope('x', PW, { iter: 10_000 })
    await expect(openWithPassword(env, 'v4', ID, 'nope nope nope')).rejects.toThrow('wrong password')
    await expect(openWithPassword(Buffer.from('not json'), 'v4', ID, PW)).rejects.toThrow('wrong password')
    const tampered = JSON.parse(env.toString()) as { ct: string }
    tampered.ct = Buffer.from('tampered').toString('base64')
    await expect(openWithPassword(Buffer.from(JSON.stringify(tampered)), 'v4', ID, PW)).rejects.toThrow('wrong password')
  })
})

describe('v5 format', () => {
  it('round-trips through setPassword -> lock -> unlock', async () => {
    const s = memStore()
    const n = s.notes.create({ title: 'T', body: 'plain text body' })
    await s.locks.setPassword(n.id, PW)
    expect(s.notes.get(n.id)).toMatchObject({ locked: true, unlocked: true, body: 'plain text body' })
    s.locks.lock(n.id)
    expect(s.notes.get(n.id)).toMatchObject({ locked: true, unlocked: false, body: '' })
    const back = await s.locks.unlock(n.id, PW)
    expect(back).toMatchObject({ locked: true, unlocked: true, body: 'plain text body' })
    const r = row(s, n.id)
    expect(r.cipher_format).toBe('v5')
    const env = JSON.parse(Buffer.from(r.cipher!).toString()) as Record<string, unknown>
    expect(env).toMatchObject({ v: 5, kdf: 'pbkdf2-sha256', iter: 600000 })
    expect(Buffer.from(env.salt as string, 'base64')).toHaveLength(16)
    expect(Buffer.from(env.iv as string, 'base64')).toHaveLength(12)
  })

  it('a wrong password throws "wrong password" and leaves the note sealed', async () => {
    const s = memStore()
    const n = s.notes.create({ body: 'b' })
    await s.locks.setPassword(n.id, PW)
    s.locks.lock(n.id)
    await expect(s.locks.unlock(n.id, 'a different one')).rejects.toThrow('wrong password')
    expect(s.notes.get(n.id).unlocked).toBe(false)
  })

  it('binds the ciphertext to the note id (AAD)', async () => {
    const s = memStore()
    const a = s.notes.create({ body: 'secret of A' })
    const b = s.notes.create({ body: 'secret of B' })
    await s.locks.setPassword(a.id, PW)
    await s.locks.setPassword(b.id, PW)
    const ca = row(s, a.id).cipher!
    s.locks.lock(a.id)
    s.locks.lock(b.id)
    s.db.prepare('UPDATE notes SET cipher = ? WHERE id = ?').run(ca, b.id) // paste A's ciphertext into B
    await expect(s.locks.unlock(b.id, PW)).rejects.toThrow('wrong password')
  })

  it('with the same key and salt, only the id differs: opening under another id fails', () => {
    const key = randomBytes(32)
    const cipher = sealV5(ID, 'for A only', key, randomBytes(16), 600000)
    expect(openV5(cipher, ID, key)).toBe('for A only')
    expect(() => openV5(cipher, ID2, key)).toThrow('wrong password')
  })

  it('uses a fresh IV for every save', async () => {
    const s = memStore()
    const n = s.notes.create({ body: 'one' })
    await s.locks.setPassword(n.id, PW)
    const iv = (): string => (JSON.parse(Buffer.from(row(s, n.id).cipher!).toString()) as { iv: string }).iv
    const a = iv()
    s.notes.save({ id: n.id, body: 'two' })
    expect(iv()).not.toBe(a)
    expect(s.notes.get(n.id).body).toBe('two')
  })

  it('changing the password re-keys with a new salt; the old password stops working', async () => {
    const s = memStore()
    const n = s.notes.create({ body: 'keep me' })
    await s.locks.setPassword(n.id, PW)
    const salt = (): string => (JSON.parse(Buffer.from(row(s, n.id).cipher!).toString()) as { salt: string }).salt
    const before = salt()
    await s.locks.setPassword(n.id, 'a brand new password')
    expect(salt()).not.toBe(before)
    s.locks.lock(n.id)
    await expect(s.locks.unlock(n.id, PW)).rejects.toThrow('wrong password')
    expect((await s.locks.unlock(n.id, 'a brand new password')).body).toBe('keep me')
  })

  it('enforces the password rules and refuses to re-key a sealed note', async () => {
    const s = memStore()
    const n = s.notes.create({ body: 'b' })
    await expect(s.locks.setPassword(n.id, 'short')).rejects.toThrow(/8 to 1024/)
    await expect(s.locks.setPassword(n.id, 'x'.repeat(1025))).rejects.toThrow(/8 to 1024/)
    await s.locks.setPassword(n.id, PW)
    s.locks.lock(n.id)
    await expect(s.locks.setPassword(n.id, 'another password')).rejects.toThrow('note is locked')
    expect(() => s.locks.removeLock(n.id)).toThrow('note is locked')
  })
})

describe('iteration clamping', () => {
  it('clamps iter from a crafted envelope to the allowed range', () => {
    const v4 = (iter: unknown) => parseEnvelope(Buffer.from(JSON.stringify({ ...JSON.parse(v4Envelope('x', PW, { iter: 10_000 }).toString()), iter })), 'v4').iter
    expect(v4(4_000_000_000)).toBe(2_000_000)
    expect(v4(1)).toBe(10_000)
    expect(v4('junk')).toBe(210000)
    const v5 = (iter: unknown) => {
      const env = JSON.parse(sealV5(ID, 'x', randomBytes(32), randomBytes(16), 600000).toString()) as Record<string, unknown>
      return parseEnvelope(Buffer.from(JSON.stringify({ ...env, iter })), 'v5').iter
    }
    expect(v5(9e15)).toBe(2_000_000)
    expect(v5(5)).toBe(100_000)
  })

  it('a huge iter does not hang the unlock', async () => {
    const env = JSON.parse(v4Envelope('x', PW, { iter: 10_000 }).toString()) as Record<string, unknown>
    env.iter = 2 ** 40
    const t0 = Date.now()
    await expect(openWithPassword(Buffer.from(JSON.stringify(env)), 'v4', ID, PW)).rejects.toThrow('wrong password')
    expect(Date.now() - t0).toBeLessThan(15_000)
  }, 20_000)
})

describe('key cache', () => {
  it('auto-locks after 5 minutes idle, zero-fills the key and reports the ids', () => {
    vi.useFakeTimers()
    const seen: string[][] = []
    const keys = createKeyCache((ids) => seen.push(ids))
    const key = Buffer.alloc(32, 7)
    keys.set('n1', key, Buffer.alloc(16), 600000)
    vi.advanceTimersByTime(IDLE_MS - 1)
    expect(keys.has('n1')).toBe(true)
    keys.get('n1') // activity restarts the clock
    vi.advanceTimersByTime(IDLE_MS - 1)
    expect(keys.has('n1')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(keys.has('n1')).toBe(false)
    expect([...key].every((b) => b === 0)).toBe(true)
    expect(seen).toEqual([['n1']])
  })

  it('lockAll and replacing a key zero-fill what they drop', () => {
    const seen: string[][] = []
    const keys = createKeyCache((ids) => seen.push(ids))
    const k1 = Buffer.alloc(32, 1)
    const k2 = Buffer.alloc(32, 2)
    keys.set('a', k1, Buffer.alloc(16), 1)
    keys.set('a', k2, Buffer.alloc(16), 1)
    expect(k1.every((b) => b === 0)).toBe(true)
    keys.lockAll()
    expect(k2.every((b) => b === 0)).toBe(true)
    expect(seen).toEqual([['a']])
    keys.lockAll()
    expect(seen).toHaveLength(1)
  })

  it('a store note locks itself after the idle timeout and the windows hear about it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const seen: string[][] = []
    const s = createStore(openDb(':memory:'), undefined, { onLocksChanged: (ids) => seen.push(ids) })
    const n = s.notes.create({ body: 'idle body' })
    await s.locks.setPassword(n.id, PW)
    vi.advanceTimersByTime(IDLE_MS - 1000)
    s.notes.get(n.id) // activity
    vi.advanceTimersByTime(IDLE_MS - 1000)
    expect(s.notes.get(n.id).unlocked).toBe(true)
    vi.advanceTimersByTime(IDLE_MS)
    expect(seen).toEqual([[n.id]])
    expect(s.notes.get(n.id)).toMatchObject({ unlocked: false, body: '' })
  })
})

describe('saving locked notes', () => {
  it('throws "note is locked" for a body save without a key; title, tags and pin still work', async () => {
    const s = memStore()
    const n = s.notes.create({ body: 'b' })
    await s.locks.setPassword(n.id, PW)
    s.locks.lock(n.id)
    expect(() => s.notes.save({ id: n.id, body: 'x' })).toThrow('note is locked')
    const r = s.notes.save({ id: n.id, title: 'New title', tags: ['t'], pinned: true })
    expect(r).toMatchObject({ title: 'New title', tags: ['t'], pinned: true, body: '', unlocked: false })
  })

  it('encrypts a body save with the cached key and keeps body = ""', async () => {
    const s = memStore()
    const n = s.notes.create({ body: 'first' })
    await s.locks.setPassword(n.id, PW)
    expect(s.notes.save({ id: n.id, body: 'second draft' })).toMatchObject({ body: 'second draft', unlocked: true })
    expect(row(s, n.id).body).toBe('')
    expect(Buffer.from(row(s, n.id).cipher!).toString()).not.toContain('second')
  })
})

describe('plaintext never reaches disk', () => {
  it('has secure_delete on', () => {
    const r = openDb(':memory:').prepare('PRAGMA secure_delete').get() as { secure_delete: number }
    expect(r.secure_delete).toBe(1)
  })

  it('setPassword clears notes.body and the FTS index; removeLock brings both back', async () => {
    const s = memStore()
    const n = s.notes.create({ title: 'Plans', body: 'the zebrafishquux conspiracy' })
    expect(s.search('zebrafishquux')).toHaveLength(1)
    await s.locks.setPassword(n.id, PW)
    expect(row(s, n.id).body).toBe('')
    expect(s.search('zebrafishquux')).toHaveLength(0)
    expect(s.search('conspiracy')).toHaveLength(0)
    expect(s.search('Plans').map((x) => x.snippet)).toEqual([''])
    expect(s.notes.list({ kind: 'all' })[0]!.snippet).toBe('')
    s.notes.save({ id: n.id, body: 'now a quokkaxylo secret' })
    expect(s.search('quokkaxylo')).toHaveLength(0)

    const back = s.locks.removeLock(n.id)
    expect(back).toMatchObject({ locked: false, body: 'now a quokkaxylo secret' })
    expect(back.unlocked).toBeUndefined()
    expect(row(s, n.id)).toMatchObject({ locked: 0, cipher: null, cipher_format: null })
    expect(s.search('quokkaxylo').map((x) => x.id)).toEqual([n.id])
  })

  it('leaves no trace of the old words in the database file or its WAL', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cog-lock-'))
    try {
      const file = join(dir, 'cognotez.db')
      const db = openDb(file)
      const s = createStore(db)
      const n = s.notes.create({ title: 'T', body: 'the vermilionthrush notes ' + 'filler '.repeat(50) })
      s.notes.save({ id: n.id, body: n.body + ' tail' }) // a second version, so old pages exist
      await s.locks.setPassword(n.id, PW)
      s.notes.save({ id: n.id, body: 'edited glimmerwort text' })
      const scan = (): string => [file, `${file}-wal`].filter(existsSync).map((f) => readFileSync(f).toString('latin1')).join('')
      const before = scan()
      expect(before).not.toContain('vermilionthrush')
      expect(before).not.toContain('glimmerwort')
      db.close()
      const after = scan()
      expect(after).not.toContain('vermilionthrush')
      expect(after).not.toContain('glimmerwort')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('v4 notes', () => {
  it('unlock decrypts, rewrites media refs through the map and stores the note as v5', async () => {
    const s = memStore()
    s.bulk.putSettings({ 'import.v4_media_map': { mg5w30vvs3emcw8uz3: HASH } })
    const body = 'pic ![a](cognotez-media://mg5w30vvs3emcw8uz3) and cognotez-media://mg5w30vvs3emcw8uz3.png and cognotez-media://unknownid99'
    const v4 = v4Envelope(body, PW, { iter: 10_000 })
    addV4(s, ID, v4)
    expect(s.notes.get(ID)).toMatchObject({ locked: true, unlocked: false, body: '' })

    const n = await s.locks.unlock(ID, PW)
    expect(n.unlocked).toBe(true)
    expect(n.body).toBe(`pic ![a](cognotez-media://${HASH}) and cognotez-media://${HASH} and cognotez-media://unknownid99`)

    const r = row(s, ID)
    expect(r.cipher_format).toBe('v5')
    expect(Buffer.from(r.cipher!).equals(v4)).toBe(false)
    expect(r.body).toBe('')
    expect(s.db.prepare('SELECT hash FROM note_media WHERE note_id = ?').all(ID)).toEqual([{ hash: HASH }])

    s.locks.lock(ID)
    expect((await s.locks.unlock(ID, PW)).body).toBe(n.body) // now opens as v5
  })

  it('a wrong password leaves a v4 note untouched', async () => {
    const s = memStore()
    const v4 = v4Envelope('x', PW, { iter: 10_000 })
    addV4(s, ID, v4)
    await expect(s.locks.unlock(ID, 'bad bad bad bad')).rejects.toThrow('wrong password')
    expect(row(s, ID).cipher_format).toBe('v4')
    expect(Buffer.from(row(s, ID).cipher!).equals(v4)).toBe(true)
  })

  it('a v4 envelope pasted into another note still opens (v4 has no AAD) but never as v5', async () => {
    const s = memStore()
    addV4(s, ID, v4Envelope('shared', PW, { iter: 10_000 }))
    addV4(s, ID2, row(s, ID).cipher as Buffer)
    expect((await s.locks.unlock(ID2, PW)).body).toBe('shared')
  })
})
