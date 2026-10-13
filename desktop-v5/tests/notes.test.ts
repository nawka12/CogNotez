import { describe, expect, it } from 'vitest'
import { snippetOf } from '../src/main/store/notes'
import { memStore, tickingClock } from './helpers'

describe('notes', () => {
  it('create + get round-trips with defaults', () => {
    const s = memStore(tickingClock())
    const n = s.notes.create({ title: 'T', body: 'B', tags: ['a', 'b/c'] })
    expect(n).toMatchObject({ title: 'T', body: 'B', pinned: false, locked: false, deletedAt: null, tags: ['a', 'b/c'] })
    expect(n.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(n.createdAt).toBe(n.updatedAt)
    expect(s.notes.get(n.id)).toEqual(n)
    expect(s.notes.create().title).toBe('')
  })

  it('get throws for a missing note', () => {
    expect(() => memStore().notes.get('does-not-exist')).toThrow(/not found/)
  })

  it('save updates only the given fields, bumps updated_at and rev', () => {
    const s = memStore(tickingClock())
    const n = s.notes.create({ title: 'T', body: 'B', tags: ['x'] })
    const revOf = (id: string) => (s.db.prepare('SELECT rev FROM notes WHERE id = ?').get(id) as { rev: string }).rev
    const rev1 = revOf(n.id)

    const a = s.notes.save({ id: n.id, body: 'B2' })
    expect(a).toMatchObject({ title: 'T', body: 'B2', tags: ['x'], pinned: false })
    expect(a.updatedAt).toBeGreaterThan(n.updatedAt)
    const rev2 = revOf(n.id)
    expect(rev2 > rev1).toBe(true)

    expect(s.notes.save({ id: n.id, pinned: true }).pinned).toBe(true)
    expect(s.notes.save({ id: n.id, tags: [] }).tags).toEqual([])
    expect(revOf(n.id) > rev2).toBe(true)
  })

  it('save is atomic: a failure rolls everything back', () => {
    const s = memStore()
    const n = s.notes.create({ title: 'T', tags: ['keep'] })
    // 'x'.repeat bypasses nothing: force a failure through the store-level tag guard.
    expect(() => s.notes.save({ id: n.id, title: 'changed', tags: ['ok', '//bad'] })).toThrow()
    expect(s.notes.get(n.id)).toMatchObject({ title: 'T', tags: ['keep'] })
    expect(() => s.notes.save({ id: 'missing-id', title: 'x' })).toThrow(/not found/)
  })

  it('save refuses a body change on a locked note', () => {
    const s = memStore()
    const n = s.notes.create({ title: 'secret' })
    s.db.prepare('UPDATE notes SET locked = 1 WHERE id = ?').run(n.id)
    expect(() => s.notes.save({ id: n.id, body: 'plaintext!' })).toThrow(/locked/)
    expect(s.notes.save({ id: n.id, title: 'renamed' }).title).toBe('renamed')
  })

  it('trash / restore / deleteForever rules', () => {
    const s = memStore(tickingClock())
    const n = s.notes.create({ title: 'bye', tags: ['t'] })

    expect(() => s.notes.deleteForever(n.id)).toThrow(/not in the trash/)
    expect(s.notes.get(n.id)).toBeTruthy()

    s.notes.trash(n.id)
    expect(s.notes.get(n.id).deletedAt).not.toBeNull()
    expect(s.notes.list({ kind: 'all' })).toHaveLength(0)
    expect(s.notes.list({ kind: 'trash' }).map((x) => x.id)).toEqual([n.id])

    s.notes.restore(n.id)
    expect(s.notes.get(n.id).deletedAt).toBeNull()
    expect(s.notes.list({ kind: 'all' })).toHaveLength(1)

    s.notes.trash(n.id)
    s.notes.deleteForever(n.id)
    expect(() => s.notes.get(n.id)).toThrow(/not found/)
    expect(s.tags.list()).toEqual([]) // tag garbage-collected
    expect(s.db.prepare('SELECT count(*) AS c FROM tags').get()).toEqual({ c: 0 })
    expect(() => s.notes.trash('missing-id')).toThrow(/not found/)
    expect(() => s.notes.deleteForever('missing-id')).toThrow(/not found/)
  })

  it('list orders pinned first, then updated_at desc, and filters', () => {
    const s = memStore(tickingClock())
    const a = s.notes.create({ title: 'a' })
    const b = s.notes.create({ title: 'b' })
    const c = s.notes.create({ title: 'c', tags: ['k'] })
    s.notes.save({ id: a.id, pinned: true })
    s.notes.save({ id: b.id, body: 'touched' })
    expect(s.notes.list({ kind: 'all' }).map((x) => x.title)).toEqual(['a', 'b', 'c'])
    expect(s.notes.list({ kind: 'pinned' }).map((x) => x.id)).toEqual([a.id])
    expect(s.notes.list({ kind: 'tag', tag: 'K' }).map((x) => x.id)).toEqual([c.id])
  })

  it('summaries carry a stripped ~160 char snippet; locked notes get none', () => {
    const s = memStore()
    const n = s.notes.create({ title: 'md', body: '# Heading\n\n**bold** and [a link](http://x.y) `code`\n' + 'z'.repeat(400) })
    const sum = s.notes.list({ kind: 'all' })[0]!
    expect(sum.id).toBe(n.id)
    expect(sum.snippet.startsWith('Heading bold and a link code zzz')).toBe(true)
    expect(sum.snippet.length).toBe(160)
    s.db.prepare('UPDATE notes SET locked = 1, body = ? WHERE id = ?').run('', n.id)
    expect(s.notes.list({ kind: 'all' })[0]).toMatchObject({ snippet: '', locked: true })
  })

  it('snippetOf strips markdown marks but keeps snake_case', () => {
    expect(snippetOf('> quote\n- item\n1. one\n~~gone~~ *em* _u_ snake_case ![alt](i.png)')).toBe(
      'quote item one gone em u snake_case alt'
    )
  })
})

describe('tags', () => {
  it('counts exclude trashed notes and hierarchy filtering includes children', () => {
    const s = memStore(tickingClock())
    const a = s.notes.create({ title: 'a', tags: ['work', 'work/projects'] })
    const b = s.notes.create({ title: 'b', tags: ['work/projects/x'] })
    const c = s.notes.create({ title: 'c', tags: ['workshop', 'Work'] }) // 'Work' reuses 'work'
    expect(s.tags.list()).toEqual([
      { name: 'work', count: 2 },
      { name: 'work/projects', count: 1 },
      { name: 'work/projects/x', count: 1 },
      { name: 'workshop', count: 1 }
    ])

    s.notes.trash(c.id)
    expect(s.tags.list().find((t) => t.name === 'work')?.count).toBe(1)
    expect(s.tags.list().find((t) => t.name === 'workshop')).toBeUndefined()

    const ids = (tag: string) => s.notes.list({ kind: 'tag', tag }).map((x) => x.id).sort()
    expect(ids('work')).toEqual([a.id, b.id].sort()) // children included, 'workshop' is not a child
    expect(ids('work/projects')).toEqual([a.id, b.id].sort())
    expect(ids('work/projects/x')).toEqual([b.id])
    expect(ids('wor')).toEqual([])
    expect(ids('100%_')).toEqual([]) // LIKE wildcards are escaped
  })

  it('unused tags are garbage collected when a note drops them', () => {
    const s = memStore()
    const n = s.notes.create({ tags: ['one', 'two'] })
    s.notes.save({ id: n.id, tags: ['two'] })
    expect(s.db.prepare('SELECT name FROM tags').all().map((r) => (r as { name: string }).name)).toEqual(['two'])
  })
})

describe('settings', () => {
  it('stores JSON and returns null for unknown keys', () => {
    const s = memStore()
    expect(s.settings.get('theme')).toBeNull()
    s.settings.set('theme', { mode: 'dark', n: [1, 2] })
    expect(s.settings.get('theme')).toEqual({ mode: 'dark', n: [1, 2] })
    s.settings.set('theme', 'light')
    expect(s.settings.get('theme')).toBe('light')
    expect(() => s.settings.set('big', 'x'.repeat(70_000))).toThrow(/too large/)
    expect(() => s.settings.set('undef', undefined)).toThrow()
  })

  it('creates a device id once and keeps it', () => {
    const s = memStore()
    expect(s.deviceId).toMatch(/^[a-z0-9]{8,32}$/) // sync-v2.md §2
    expect(s.settings.get('sys.device_id')).toBe(s.deviceId)
  })
})
