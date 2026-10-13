import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrate, openDb } from '../src/main/store/db'
import { MIGRATIONS } from '../src/main/store/migrations'
import { createStore } from '../src/main/store/notes'
import { DatabaseSync } from 'node:sqlite'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cognotez-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const version = (db: DatabaseSync) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

describe('migrations', () => {
  it('is idempotent: opening the same file twice is safe and keeps data', () => {
    const file = join(dir, 'a.db')
    const db1 = openDb(file)
    const store1 = createStore(db1)
    const id = store1.notes.create({ title: 'kept' }).id
    expect(version(db1)).toBe(MIGRATIONS.length)
    db1.close()

    const db2 = openDb(file)
    expect(version(db2)).toBe(MIGRATIONS.length)
    const store2 = createStore(db2)
    expect(store2.notes.get(id).title).toBe('kept')
    expect(store2.deviceId).toBe(store1.deviceId)
    migrate(db2) // and explicitly again
    expect(version(db2)).toBe(MIGRATIONS.length)
    db2.close()
  })

  it('sets the required pragmas', () => {
    const db = openDb(join(dir, 'p.db'))
    const pragma = (p: string) => Object.values(db.prepare(`PRAGMA ${p}`).get() as object)[0]
    expect(pragma('journal_mode')).toBe('wal')
    expect(pragma('foreign_keys')).toBe(1)
    expect(pragma('synchronous')).toBe(1) // NORMAL
    expect(pragma('busy_timeout')).toBe(3000)
    db.close()
  })

  it('rolls a failed step back and leaves user_version untouched', () => {
    const db = new DatabaseSync(':memory:')
    expect(() => migrate(db, ['CREATE TABLE a(x)', 'CREATE TABLE b(x); SELECT nope FROM missing;'])).toThrow()
    expect(version(db)).toBe(1)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined()
  })

  it('refuses a database from a newer app', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`)
    expect(() => migrate(db)).toThrow(/newer/)
  })
})

describe('pre-migration backup', () => {
  it('copies an older database before migrating it, and only then', () => {
    const path = join(dir, 'cognotez.db')
    const old = new DatabaseSync(path)
    migrate(old, MIGRATIONS.slice(0, 1))
    old.prepare("INSERT INTO settings(key, value) VALUES ('marker', '\"v1 data\"')").run()
    old.close()

    const backupTo = join(dir, 'backups', 'cognotez-20261013-120000.db')
    openDb(path, backupTo).close()
    const copy = new DatabaseSync(backupTo, { readOnly: true })
    expect(copy.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
    expect(copy.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' })
    expect(copy.prepare("SELECT value FROM settings WHERE key = 'marker'").get()).toEqual({ value: '"v1 data"' })
    copy.close()

    const again = join(dir, 'backups', 'cognotez-20261013-120001.db')
    openDb(path, again).close() // already current: no copy
    openDb(join(dir, 'fresh.db'), again).close() // brand new: no copy
    expect(() => new DatabaseSync(again, { readOnly: true })).toThrow()
  })
})
