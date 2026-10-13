// Database backups and the restore-on-next-start flow. No Electron imports: tests drive it with temp dirs.
// Media is content-addressed and never auto-deleted, so a backup file plus the media folder is a full copy.
import { backup, DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BackupInfo } from '../shared/api'
import { MIGRATIONS } from './store/migrations'
import { openDb } from './store/db'
import type { Db } from './store/db'

export const KEEP_AUTO = 7
export const AUTO_EVERY_MS = 24 * 60 * 60 * 1000
export const MARKER = 'restore-pending.json'
const ID_RE = /^cognotez-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(-auto)?$/

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
const stamp = (d: Date): string =>
  `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

export const isBackupId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)

/** Local time encoded in the id; the filename is the single source of truth for the date. */
function createdAt(id: string): number {
  const m = ID_RE.exec(id)!
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!).getTime()
}

/** Throws unless the file is a healthy database this build can open. */
export function checkBackup(path: string): void {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const rows = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[]
    if (rows.length !== 1 || rows[0]!.integrity_check !== 'ok') throw new Error('backup failed the integrity check')
    const v = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (v > MIGRATIONS.length) throw new Error(`backup is from a newer CogNotez (v${v})`)
  } finally {
    db.close()
  }
}

/** Online-backs `db` up to `dest` as one self-contained file (rollback journal, no -wal/-shm beside it). */
async function snapshot(db: DatabaseSync, dest: string): Promise<void> {
  await backup(db, dest)
  const copy = new DatabaseSync(dest)
  try {
    copy.exec('PRAGMA journal_mode = DELETE')
  } finally {
    copy.close()
  }
}

export function createBackups(userData: string, db: Db, now: () => Date = () => new Date()) {
  const dir = join(userData, 'backups')
  const file = (id: string): string => join(dir, `${id}.db`)

  function list(): BackupInfo[] {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return []
    }
    const out: BackupInfo[] = []
    for (const n of names) {
      const id = n.endsWith('.db') ? n.slice(0, -3) : ''
      if (!isBackupId(id)) continue
      out.push({ id, createdAt: createdAt(id), bytes: statSync(join(dir, n)).size, auto: id.endsWith('-auto') })
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  /** Keeps the newest KEEP_AUTO automatic backups. Manual ones are never touched. */
  function prune(): void {
    for (const b of list().filter((x) => x.auto).slice(KEEP_AUTO)) rmSync(file(b.id), { force: true })
  }

  async function create(auto = false): Promise<BackupInfo> {
    mkdirSync(dir, { recursive: true })
    const id = `cognotez-${stamp(now())}${auto ? '-auto' : ''}`
    const final = file(id)
    if (!existsSync(final)) {
      const tmp = join(dir, `.tmp-${id}.db`)
      try {
        await snapshot(db, tmp) // a consistent snapshot, WAL included
        renameSync(tmp, final)
      } finally {
        rmSync(tmp, { force: true })
      }
    }
    if (auto) prune()
    const info = list().find((b) => b.id === id)
    if (!info) throw new Error('backup was not written')
    return info
  }

  /** Called at startup: one automatic backup when the newest automatic one is over 24 h old. */
  async function autoIfDue(): Promise<BackupInfo | null> {
    const newest = list().find((b) => b.auto)
    if (newest && now().getTime() - newest.createdAt < AUTO_EVERY_MS) return null
    return create(true)
  }

  /** Validates the backup and leaves a marker; the caller relaunches. The swap happens before the DB opens. */
  function requestRestore(id: unknown): void {
    if (!isBackupId(id)) throw new Error('invalid argument: backup id')
    if (!existsSync(file(id))) throw new Error('backup not found')
    checkBackup(file(id))
    writeFileSync(join(userData, MARKER), JSON.stringify({ id }))
  }

  return { dir, list, create, autoIfDue, prune, requestRestore }
}

export type Backups = ReturnType<typeof createBackups>

/**
 * Runs at startup BEFORE the database is opened. If a restore is pending, keeps a safety copy of the
 * current database, swaps the chosen backup in, and rebuilds the search index. The marker is always removed,
 * so a failure can never loop; the caller logs `error`.
 */
export async function applyPendingRestore(userData: string, now: () => Date = () => new Date()): Promise<{ restored: boolean; error?: string }> {
  const marker = join(userData, MARKER)
  if (!existsSync(marker)) return { restored: false }
  const dbPath = join(userData, 'cognotez.db')
  try {
    const id: unknown = (JSON.parse(readFileSync(marker, 'utf8')) as { id?: unknown }).id
    if (!isBackupId(id)) throw new Error('marker has an invalid backup id')
    const src = join(userData, 'backups', `${id}.db`)
    checkBackup(src)

    if (existsSync(dbPath)) {
      const safety = join(userData, 'backups', `pre-restore-${stamp(now())}.db`)
      try {
        // Opening replays the WAL, so the safety copy includes the latest edits.
        const cur = new DatabaseSync(dbPath)
        try {
          await snapshot(cur, safety)
        } finally {
          cur.close()
        }
      } catch {
        copyFileSync(dbPath, safety) // unreadable database: the raw file is the best safety copy there is
      }
    }
    const tmp = `${dbPath}.restoring`
    copyFileSync(src, tmp)
    rmSync(`${dbPath}-wal`, { force: true })
    rmSync(`${dbPath}-shm`, { force: true })
    renameSync(tmp, dbPath)

    const db = openDb(dbPath) // also migrates an older backup
    try {
      db.exec("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')")
    } finally {
      db.close()
    }
    return { restored: true }
  } catch (e) {
    return { restored: false, error: String(e) }
  } finally {
    rmSync(marker, { force: true })
  }
}
