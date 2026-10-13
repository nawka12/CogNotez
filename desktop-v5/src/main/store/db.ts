// No Electron imports here: tests open DBs with a path or ':memory:'.
import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from './migrations'

export type Db = DatabaseSync

export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 3000;
    PRAGMA secure_delete = ON;
  `)
  try {
    migrate(db)
  } catch (e) {
    db.close()
    throw e
  }
  return db
}

export function migrate(db: Db, steps: readonly string[] = MIGRATIONS): void {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (current > steps.length) throw new Error(`database is newer (v${current}) than this app (v${steps.length})`)
  for (let v = current; v < steps.length; v++) {
    // user_version is transactional, so a failed step leaves the DB at the previous version.
    tx(db, () => {
      db.exec(steps[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
    })
  }
}

/** Runs fn in an immediate transaction; joins an outer transaction if there is one. */
export function tx<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
