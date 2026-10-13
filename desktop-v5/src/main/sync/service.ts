// Sync configuration, scheduling and status. Electron-free: index.ts supplies the dialog, windows and transports.
import type { SyncProgress, SyncSetup, SyncStatus, SyncTransportKind } from '../../shared/api'
import type { Media } from '../media'
import type { Secrets } from '../secrets'
import type { Store } from '../store/notes'
import { MetaError, parseMeta, PASSPHRASE_MIN, unwrapDek, WRONG_PASSPHRASE } from './crypto'
import { META_NAME } from './format'
import { NEEDS_PASSPHRASE, openRemote, sameRemote, SyncError, syncRound } from './engine'
import type { RemoteId } from './engine'
import { createLocal } from './local'
import type { Transport } from './transport'

const CONFIG_KEY = 'sys.sync'
/** The remote this device last joined. Survives disable(), so re-joining it keeps the agreed bases. */
const LAST_REMOTE_KEY = 'sys.sync_last_remote'
const NAME_KEY = 'sync.device_name'

export const STARTUP_DELAY = 10_000
export const INTERVAL = 5 * 60_000
export const AFTER_EDIT = 30_000
export const BACKOFF_START = 30_000
export const BACKOFF_MAX = 30 * 60_000
/** At most ~4 status events a second while a round reports progress. */
const EMIT_EVERY = 250
/** A progress line in the log every this many items of a long upload or apply. */
const LOG_EVERY = 25

export interface SyncConfig {
  transport: SyncTransportKind
  folderPath?: string
  /** transport.describe() at setup (the Google account email), shown before this launch's first round. */
  target?: string
  everSynced: boolean
  remoteId: RemoteId
  encrypted: boolean
}

export interface SyncDeps {
  store: Store
  media: Media
  secrets: Pick<Secrets, 'get' | 'set' | 'delete'>
  transports: { folder(path: string): Transport; gdrive?: () => Promise<Transport> }
  /** Folder picker (main-process dialog). null = cancelled. */
  pickFolder(): Promise<string | null>
  hostname(): string
  onStatus(s: SyncStatus): void
  onNotesChanged(ids: string[]): void
  warn?(msg: string): void
  /** Progress lines for the log. Ids and counts only, never note text. */
  info?(msg: string): void
  wall?: () => number
}

/** Turns anything thrown into one line a person can act on. */
export function humanError(e: unknown): string {
  if (e instanceof SyncError || e instanceof MetaError) return e.message
  const err = e as NodeJS.ErrnoException
  const msg = e instanceof Error ? e.message : String(e)
  if (err?.code === 'EACCES' || err?.code === 'EPERM') return 'CogNotez is not allowed to write to the sync folder.'
  if (err?.code === 'ENOSPC') return 'The sync location is out of space.'
  if (err?.code === 'ENOENT') return 'The sync folder is not reachable.'
  return `Sync failed: ${msg}`
}

const validPassphrase = (p: unknown): string => {
  if (typeof p !== 'string' || p.length < PASSPHRASE_MIN || p.length > 1024) throw new Error(`the passphrase must be ${PASSPHRASE_MIN} to 1024 characters`)
  return p
}

export function createSyncService(deps: SyncDeps) {
  const { store } = deps
  const wall = deps.wall ?? Date.now
  const local = createLocal(store)
  const warn = (m: string): void => deps.warn?.(m)
  const info = (m: string): void => deps.info?.(m)

  let transport: Transport | null = null
  let dek: Buffer | null = null
  let running: Promise<void> | null = null
  let state: SyncStatus['state'] = 'off'
  let progress: SyncProgress | null = null
  let roundStart = 0
  let lastPhase: SyncProgress['phase'] | null = null
  let lastEmit = 0
  let lastError: string | null = null
  let lastSyncAt: number | null = null
  let failures = 0
  let notBefore = 0
  let started = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let editTimer: ReturnType<typeof setTimeout> | null = null

  const config = (): SyncConfig | null => (store.settings.get(CONFIG_KEY) as SyncConfig | null) ?? null
  const saveConfig = (c: SyncConfig | null): void => {
    if (c) store.bulk.putSettings({ [CONFIG_KEY]: c })
    else store.db.prepare('DELETE FROM settings WHERE key = ?').run(CONFIG_KEY)
  }
  const deviceName = (): string => {
    const n = store.settings.get(NAME_KEY)
    return typeof n === 'string' && n.trim() ? n.trim() : deps.hostname()
  }
  const needsPassphrase = (): boolean => !!config()?.encrypted && !dek

  function status(): SyncStatus {
    const c = config()
    return {
      configured: !!c,
      transport: c?.transport ?? null,
      target: c ? (transport?.describe() ?? c.target ?? c.folderPath ?? null) : null,
      encrypted: !!c?.encrypted,
      needsPassphrase: needsPassphrase(),
      state: c ? state : 'off',
      lastSyncAt,
      lastError,
      conflicts: local.conflicts(),
      deviceName: deviceName(),
      progress: state === 'syncing' ? progress : null
    }
  }
  const emit = (): void => deps.onStatus(status())

  async function transportFor(c: SyncConfig): Promise<Transport> {
    if (c.transport === 'folder') return deps.transports.folder(c.folderPath ?? '')
    if (!deps.transports.gdrive) throw new SyncError("Google Drive sync isn't available yet.")
    return deps.transports.gdrive()
  }

  function loadKey(): void {
    const hex = config()?.encrypted ? safeGet() : null
    dek = hex && /^[0-9a-f]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null
  }
  function safeGet(): string | null {
    try {
      return deps.secrets.get('sync_dek')
    } catch (e) {
      warn(`could not read the sync key: ${String(e)}`)
      return null
    }
  }
  function storeKey(key: Buffer | null): void {
    dek?.fill(0)
    dek = key
    try {
      if (key) deps.secrets.set('sync_dek', key.toString('hex'))
      else deps.secrets.delete('sync_dek')
    } catch (e) {
      // No OS keychain: the key stays in memory for this session and the passphrase is asked again next launch.
      warn(`could not store the sync key: ${String(e)}`)
    }
  }

  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

  /** Keeps the status current and logs phase starts. Status events are throttled; a phase's first and last always go out. */
  function onProgress(phase: SyncProgress['phase'], done: number, total: number, full: boolean): void {
    const first = lastPhase !== phase
    lastPhase = phase
    progress = { phase, done, total, startedAt: roundStart }
    if (first) {
      if (phase === 'upload') info(`uploading ${plural(total, 'change', 'changes')}`)
      else if (phase === 'merge') info(`merging ${plural(total, 'note', 'notes')}`)
      else if (phase === 'apply') info(`applying ${plural(total, 'note', 'notes')}`)
    } else if (phase === 'list' && total > 0 && done === total) info(`listed ${plural(done, 'remote file', 'remote files')}${full ? '' : ' (changes since last time)'}`)
    else if (phase !== 'list' && done > 0 && done < total && done % LOG_EVERY === 0) info(`${phase === 'upload' ? 'uploaded' : phase === 'merge' ? 'merged' : 'applied'} ${done} of ${total}`)
    const now = Date.now()
    if (first || (total > 0 && done >= total) || now - lastEmit >= EMIT_EVERY) {
      lastEmit = now
      emit()
    }
  }

  async function round(): Promise<void> {
    const c = config()
    if (!c || needsPassphrase()) return
    state = 'syncing'
    const startedAt = (roundStart = wall())
    lastPhase = null
    progress = { phase: 'upload', done: 0, total: 0, startedAt }
    lastEmit = Date.now()
    emit()
    info(`round started (${c.transport})`)
    const full = local.cursor() === null
    try {
      transport ??= await transportFor(c)
      const r = await syncRound({ store, media: deps.media, transport, remote: c.remoteId, dek, deviceName: deviceName(), warn, onProgress: (p, d, t) => onProgress(p, d, t, full) })
      info(`round done in ${((wall() - startedAt) / 1000).toFixed(1)} s (wrote ${plural(r.written, 'file', 'files')}, changed ${plural(r.changed.length, 'note', 'notes')})`)
      if (!c.everSynced) saveConfig({ ...c, everSynced: true })
      lastSyncAt = wall()
      lastError = r.warnings.find((w) => w.includes('too large')) ?? null
      state = 'idle'
      failures = 0
      notBefore = 0
      if (r.changed.length) deps.onNotesChanged(r.changed)
    } catch (e) {
      lastError = humanError(e)
      state = 'error'
      failures++
      notBefore = wall() + Math.min(BACKOFF_MAX, BACKOFF_START * 2 ** (failures - 1))
      warn(`round failed after ${((wall() - startedAt) / 1000).toFixed(1)} s: ${lastError}`)
    }
    progress = null
    emit()
  }

  /** One round at a time; a request while one runs waits for it and then runs a fresh round. */
  async function run(force: boolean): Promise<void> {
    while (running) await running
    if (!force && wall() < notBefore) return
    running = round().finally(() => (running = null))
    await running
  }

  const later = (ms: number, force = false): void => {
    const t = setTimeout(() => {
      timers.delete(t)
      void run(force)
    }, ms)
    t.unref?.()
    timers.add(t)
  }

  function start(): void {
    if (started || !config()) return
    started = true
    if (!dek) loadKey() // never drop a key held in memory only (no OS keychain) for an empty read
    state = 'idle'
    later(STARTUP_DELAY)
    const iv = setInterval(() => void run(false), INTERVAL)
    iv.unref?.()
    timers.add(iv)
    emit()
  }

  function stop(): void {
    for (const t of timers) clearTimeout(t)
    timers.clear()
    if (editTimer) clearTimeout(editTimer)
    editTimer = null
    started = false
  }

  return {
    status,
    start,
    stop,

    /** Local note changes: one round 30 s after the last one. */
    noteChanged(): void {
      if (!started) return
      if (editTimer) clearTimeout(editTimer)
      editTimer = setTimeout(() => {
        editTimer = null
        void run(false)
      }, AFTER_EDIT)
      editTimer.unref?.()
    },

    async setup(s: SyncSetup): Promise<SyncStatus | null> {
      const passphrase = s.passphrase === undefined ? undefined : validPassphrase(s.passphrase)
      let t: Transport
      let folderPath: string | undefined
      if (s.transport === 'folder') {
        const picked = await deps.pickFolder()
        if (!picked) return null
        folderPath = picked
        t = deps.transports.folder(picked)
      } else if (s.transport === 'gdrive') {
        if (!deps.transports.gdrive) throw new Error("Google Drive sync isn't available yet.")
        t = await deps.transports.gdrive()
      } else throw new Error('invalid argument: unknown sync transport')

      // No round may run while the configuration (and possibly every base) changes underneath it.
      stop()
      while (running) await running
      const cur = config()
      let opened: Awaited<ReturnType<typeof openRemote>>
      let key: Buffer | null
      try {
        // Same location as the current config: a missing meta.json is an error, never a reason to re-create it.
        const sameLocation = !!cur && cur.transport === s.transport && (s.transport !== 'folder' || cur.folderPath === folderPath)
        opened = await openRemote(t, { known: sameLocation ? cur.remoteId : null, deviceId: store.deviceId, passphrase, wall })
        if (!opened.created && passphrase !== undefined && !opened.meta.enc) {
          throw new Error(
            s.transport === 'gdrive'
              ? 'This Google Drive location already exists without encryption, and that can\'t be changed. To encrypt: turn sync off on this device, delete the "CogNotez Sync" folder in Google Drive (and empty the Drive trash), then turn sync on again with encryption.'
              : 'This folder already holds an unencrypted sync location, and that can\'t be changed. To encrypt, pick an empty folder instead.'
          )
        }
        key = opened.dek
        if (!key && opened.meta.enc && passphrase !== undefined) key = await unwrapDek(passphrase, opened.meta.enc).catch(() => null)
      } catch (e) {
        start() // keep syncing with the current configuration, if any
        throw e
      }
      const { meta } = opened
      const remoteId: RemoteId = { created: meta.created, createdBy: meta.createdBy }
      if (!sameRemote(remoteId, store.settings.get(LAST_REMOTE_KEY) as RemoteId | null)) local.resetForNewRemote()
      store.bulk.putSettings({ [LAST_REMOTE_KEY]: remoteId })
      saveConfig({ transport: s.transport, ...(folderPath ? { folderPath } : {}), target: t.describe(), everSynced: false, remoteId, encrypted: !!meta.enc })
      transport = t
      storeKey(key)
      lastError = null
      lastSyncAt = null
      failures = 0
      notBefore = 0
      start()
      void run(true)
      return status()
    },

    async unlock(passphrase: string): Promise<SyncStatus> {
      const c = config()
      if (!c) throw new Error('sync is not set up')
      if (!c.encrypted) return status()
      transport ??= await transportFor(c)
      const bytes = await transport.read(META_NAME)
      if (!bytes) throw new SyncError('The sync location looks empty or was replaced.')
      const meta = parseMeta(bytes)
      if (!meta.enc || !sameRemote(meta, c.remoteId)) throw new SyncError('The sync location looks empty or was replaced.')
      let key: Buffer
      try {
        key = await unwrapDek(passphrase, meta.enc)
      } catch {
        throw new Error(WRONG_PASSPHRASE)
      }
      storeKey(key)
      if (lastError === NEEDS_PASSPHRASE) lastError = null
      emit()
      void run(true)
      return status()
    },

    async now(): Promise<SyncStatus> {
      if (config() && !started) start()
      await run(true)
      return status()
    },

    /** Forgets the location, cursor and key on this device. Local notes and the remote are untouched. */
    async disable(): Promise<void> {
      stop()
      while (running) await running
      saveConfig(null)
      local.forgetListing()
      storeKey(null)
      transport = null
      state = 'off'
      lastError = null
      lastSyncAt = null
      emit()
    },

    setDeviceName(name: string): void {
      store.bulk.putSettings({ [NAME_KEY]: name })
      emit()
    }
  }
}

export type SyncService = ReturnType<typeof createSyncService>
