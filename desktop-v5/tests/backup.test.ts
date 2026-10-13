import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyPendingRestore, checkBackup, createBackups, isBackupId, KEEP_AUTO, MARKER } from '../src/main/backup'
import { openDb } from '../src/main/store/db'
import { createStore } from '../src/main/store/notes'

describe('backups', () => {
  let dir: string
  let clock: Date
  const now = (): Date => clock
  const at = (iso: string): void => void (clock = new Date(iso))
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cog-backup-'))
    at('2026-03-01T10:00:00')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  function setup() {
    const db = openDb(join(dir, 'cognotez.db'))
    const store = createStore(db)
    return { db, store, backups: createBackups(dir, db, now) }
  }

  it('creates a named, listed backup that passes the integrity check', async () => {
    const { db, store, backups } = setup()
    store.notes.create({ title: 'Hello' })
    const info = await backups.create()
    expect(info).toMatchObject({ id: 'cognotez-20260301-100000', auto: false })
    expect(info.createdAt).toBe(new Date('2026-03-01T10:00:00').getTime())
    expect(info.bytes).toBeGreaterThan(0)
    expect(backups.list()).toEqual([info])
    checkBackup(join(dir, 'backups', `${info.id}.db`))
    expect(readdirSync(join(dir, 'backups'))).toEqual([`${info.id}.db`]) // no temp or wal files left
    db.close()
  })

  it('keeps the newest 7 automatic backups and never prunes manual ones', async () => {
    const { db, backups } = setup()
    await backups.create() // manual, oldest
    for (let day = 2; day <= 11; day++) {
      at(`2026-03-${String(day).padStart(2, '0')}T08:00:00`)
      await backups.create(true)
    }
    at('2026-03-12T09:00:00')
    await backups.create()
    const all = backups.list()
    const auto = all.filter((b) => b.auto)
    expect(auto).toHaveLength(KEEP_AUTO)
    expect(auto[0]!.id).toBe('cognotez-20260311-080000-auto')
    expect(auto.at(-1)!.id).toBe('cognotez-20260305-080000-auto')
    expect(all.filter((b) => !b.auto)).toHaveLength(2)
    db.close()
  })

  it('autoIfDue backs up only when the newest automatic one is over 24 h old', async () => {
    const { db, backups } = setup()
    expect(await backups.autoIfDue()).not.toBeNull()
    at('2026-03-02T09:59:00')
    expect(await backups.autoIfDue()).toBeNull()
    at('2026-03-02T10:00:01')
    expect(await backups.autoIfDue()).not.toBeNull()
    db.close()
  })

  it('validates ids and refuses unknown or newer backups', async () => {
    const { db, backups } = setup()
    for (const bad of ['../x', 'cognotez-1', 'cognotez-20260301-100000.db', 5, undefined]) expect(isBackupId(bad)).toBe(false)
    expect(() => backups.requestRestore('../../etc/passwd')).toThrow(/invalid/)
    expect(() => backups.requestRestore('cognotez-20260301-100000')).toThrow(/not found/)
    const info = await backups.create()
    db.exec('PRAGMA user_version = 99')
    const newer = await backups.create(true)
    expect(() => backups.requestRestore(newer.id)).toThrow(/newer/)
    db.exec('PRAGMA user_version = 1')
    expect(() => backups.requestRestore(info.id)).not.toThrow()
    expect(existsSync(join(dir, MARKER))).toBe(true)
    db.close()
  })

  it('restore marker: swaps the database in, keeps a safety copy and rebuilds search', async () => {
    const { db, store, backups } = setup()
    store.notes.create({ title: 'Keep me', body: 'zebra stripes' })
    const info = await backups.create()
    store.notes.create({ title: 'Made later', body: 'giraffe neck' })
    backups.requestRestore(info.id)
    db.close()

    at('2026-03-01T11:00:00')
    expect(await applyPendingRestore(dir, now)).toEqual({ restored: true })
    expect(existsSync(join(dir, MARKER))).toBe(false)
    expect(existsSync(join(dir, 'backups', 'pre-restore-20260301-110000.db'))).toBe(true)

    const again = createStore(openDb(join(dir, 'cognotez.db')))
    expect(again.notes.list({ kind: 'all' }).map((n) => n.title)).toEqual(['Keep me'])
    expect(again.search('zebra').map((n) => n.title)).toEqual(['Keep me'])
    expect(again.search('giraffe')).toEqual([])
    again.db.close()

    // the safety copy still has the later note
    const safe = createStore(openDb(join(dir, 'backups', 'pre-restore-20260301-110000.db')))
    expect(safe.search('giraffe')).toHaveLength(1)
    safe.db.close()
  })

  it('a bad marker is removed and leaves the database alone', async () => {
    const { db, store } = setup()
    store.notes.create({ title: 'Still here' })
    db.close()
    writeFileSync(join(dir, MARKER), JSON.stringify({ id: '../../evil' }))
    const r = await applyPendingRestore(dir, now)
    expect(r.restored).toBe(false)
    expect(r.error).toMatch(/invalid/)
    expect(existsSync(join(dir, MARKER))).toBe(false)
    const again = createStore(openDb(join(dir, 'cognotez.db')))
    expect(again.notes.list({ kind: 'all' })).toHaveLength(1)
    again.db.close()
  })
})
