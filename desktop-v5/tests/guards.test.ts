import { describe, expect, it } from 'vitest'
import * as g from '../src/main/guards'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const FILE = 'file:///opt/CogNotez/resources/app/out/renderer/index.html'
const DEV = 'http://localhost:5173/'

describe('validators', () => {
  it('id', () => {
    expect(g.id(ID)).toBe(ID)
    for (const bad of [undefined, null, 5, {}, '', 'short', 'has space 1234', '../../etc/passwd', 'a'.repeat(65), ID + '\n']) {
      expect(() => g.id(bad), String(bad)).toThrow(/invalid argument/)
    }
  })

  it('tag names and lists', () => {
    expect(g.tagName('  work/projects ')).toBe('work/projects')
    for (const bad of ['', '   ', '/x', 'x/', 'a//b', 'a\nb', 'a\u0000b', 'x'.repeat(101), 5, null]) {
      expect(() => g.tagName(bad), String(bad)).toThrow()
    }
    expect(g.tagList(['A', 'a', ' b '])).toEqual(['A', 'b'])
    expect(() => g.tagList('a')).toThrow()
    expect(() => g.tagList(Array.from({ length: 51 }, (_, i) => `t${i}`))).toThrow(/too many/)
  })

  it('noteInput / notePatch reject wrong types, unknown keys and oversize strings', () => {
    expect(g.noteInput(undefined)).toEqual({})
    expect(g.noteInput({ title: 'a', body: 'b', tags: ['t'] })).toEqual({ title: 'a', body: 'b', tags: ['t'] })
    for (const bad of [null, 'x', [], { title: 5 }, { body: {} }, { tags: 'x' }, { evil: 1 }, { title: 'x'.repeat(1001) }, { body: 'x'.repeat(5_000_001) }]) {
      expect(() => g.noteInput(bad), JSON.stringify(bad)).toThrow()
    }
    expect(g.notePatch({ id: ID, pinned: true, title: 't' })).toEqual({ id: ID, title: 't', pinned: true })
    for (const bad of [{}, { id: 'x' }, { id: ID, pinned: 1 }, { id: ID, rev: 'x' }, { id: ID, locked: true }, { id: ID, __proto__x: 1 }, null]) {
      expect(() => g.notePatch(bad), JSON.stringify(bad)).toThrow()
    }
  })

  it('listFilter', () => {
    expect(g.listFilter({ kind: 'trash' })).toEqual({ kind: 'trash' })
    expect(g.listFilter({ kind: 'tag', tag: ' a/b ' })).toEqual({ kind: 'tag', tag: 'a/b' })
    for (const bad of [null, {}, { kind: 'nope' }, { kind: 'tag' }, { kind: 'all', tag: 'x' }, { kind: 'tag', tag: 5 }, 'all']) {
      expect(() => g.listFilter(bad), JSON.stringify(bad)).toThrow()
    }
  })

  it('query', () => {
    expect(g.query('')).toBe('')
    expect(() => g.query(5)).toThrow()
    expect(() => g.query('x'.repeat(501))).toThrow()
  })

  it('settings keys and values', () => {
    expect(g.settingKey('ui.theme_2')).toBe('ui.theme_2')
    for (const bad of ['', 'UPPER', 'has space', 'a-b', 'sys.device_id', 5, 'x'.repeat(129)]) {
      expect(() => g.settingKey(bad), String(bad)).toThrow()
    }
    expect(g.settingValueJson({ a: [1] })).toBe('{"a":[1]}')
    expect(() => g.settingValueJson(undefined)).toThrow()
    expect(() => g.settingValueJson(() => 1)).toThrow()
    expect(() => g.settingValueJson(1n)).toThrow()
    const cyc: Record<string, unknown> = {}
    cyc.self = cyc
    expect(() => g.settingValueJson(cyc)).toThrow()
    expect(() => g.settingValueJson('x'.repeat(65 * 1024))).toThrow(/too large/)
  })

  it('secret names are allowlisted; values are non-empty strings', () => {
    for (const ok of ['openrouter_api_key', 'google_oauth_tokens', 'sync_dek']) expect(g.secretName(ok)).toBe(ok)
    for (const bad of ['', 'other', '__proto__', 'constructor', 5, null]) expect(() => g.secretName(bad)).toThrow()
    expect(() => g.secretValue('')).toThrow()
    expect(() => g.secretValue(5)).toThrow()
    expect(g.secretValue('sk-abc')).toBe('sk-abc')
  })
})

describe('sender check and navigation policy', () => {
  it('accepts only the top frame of our own page', () => {
    expect(g.isAppSender({ url: FILE, parent: null }, FILE)).toBe(true)
    expect(g.isAppSender({ url: FILE + '#/notes', parent: null }, FILE)).toBe(true)
    expect(g.isAppSender({ url: DEV + 'index.html', parent: null }, DEV)).toBe(true)
  })

  it('rejects foreign URLs, other files, subframes and missing frames', () => {
    expect(g.isAppSender({ url: 'https://evil.example/', parent: null }, FILE)).toBe(false)
    expect(g.isAppSender({ url: 'https://evil.example/', parent: null }, DEV)).toBe(false)
    expect(g.isAppSender({ url: 'http://localhost:5174/', parent: null }, DEV)).toBe(false)
    expect(g.isAppSender({ url: 'http://localhost.evil.com:5173/', parent: null }, DEV)).toBe(false)
    expect(g.isAppSender({ url: 'file:///home/user/evil.html', parent: null }, FILE)).toBe(false)
    expect(g.isAppSender({ url: 'file:///opt/CogNotez/resources/app/out/renderer/other.html', parent: null }, FILE)).toBe(false)
    expect(g.isAppSender({ url: FILE, parent: {} }, FILE)).toBe(false)
    expect(g.isAppSender({ url: '', parent: null }, FILE)).toBe(false)
    expect(g.isAppSender({ url: 'not a url', parent: null }, FILE)).toBe(false)
    expect(g.isAppSender(null, FILE)).toBe(false)
    expect(g.isAppSender(undefined, FILE)).toBe(false)
    expect(g.isAppSender({ url: FILE, parent: null }, '')).toBe(false) // target not set yet
  })

  it('CSP matches the spec; dev adds only the dev server to connect-src', () => {
    const prod = g.buildCsp()
    expect(prod).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: cognotez-media:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"
    )
    expect(g.buildCsp(DEV)).toContain("connect-src 'self' http://localhost:5173 ws://localhost:5173;")
    expect(g.buildCsp(DEV).replace(/connect-src [^;]*/, '')).toBe(prod.replace(/connect-src [^;]*/, ''))
  })
})
