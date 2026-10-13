// Auto-update from GitHub Releases (electron-updater). Nothing downloads without the user asking (autoDownload stays off).
// Electron-free: the updater, the platform check and the settings are injected so the state machine is testable.
import { execFile } from 'node:child_process'
import { dirname } from 'node:path'
import type { UpdateStatus } from '../shared/api'

/** Setting: check once a minute after startup. Anything but `false` means on. */
export const AUTO_KEY = 'updates.auto'
export const START_DELAY = 60_000

/** The slice of electron-updater's AppUpdater that this file uses. */
export interface UpdaterLike {
  autoDownload: boolean
  on(event: string, cb: (arg: never) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdaterDeps {
  /** Loaded only once supported() said yes, so builds that can't update never load electron-updater. */
  updater(): Promise<UpdaterLike>
  /** False for builds that cannot replace themselves; see updateSupported. */
  supported(): Promise<boolean>
  settings: { get(key: string): unknown }
  onStatus(s: UpdateStatus): void
  warn?(message: string): void
  startDelayMs?: number
}

/**
 * Which builds can update themselves:
 *  - unpacked / dev runs: no (electron-updater has no app-update.yml there);
 *  - Linux: only inside an AppImage (the APPIMAGE variable is set by the AppImage runtime);
 *  - macOS: only a properly signed app, because Squirrel.Mac refuses to swap in an update for an unsigned one;
 *  - Windows (NSIS): yes, signed or not.
 * `feedOverride` is the dev-only test feed, which makes an unpacked run behave as supported.
 */
export async function updateSupported(p: {
  packaged: boolean
  platform: NodeJS.Platform
  appImage: string | undefined
  macSigned: () => Promise<boolean>
  feedOverride?: boolean
}): Promise<boolean> {
  if (p.feedOverride) return true
  if (!p.packaged) return false
  if (p.platform === 'linux') return !!p.appImage
  if (p.platform === 'darwin') return p.macSigned()
  return true
}

/** `codesign -dv --verbose=2` output of a Developer ID signed app has `Authority=` lines; an ad-hoc or missing signature has none. */
export const codesignOutputSigned = (out: string): boolean => /^Authority=/m.test(out) && !/^Signature=adhoc/m.test(out)

/** Reads the signature of the running .app bundle (execPath is `X.app/Contents/MacOS/CogNotez`). */
export function macAppSigned(execPath: string): Promise<boolean> {
  const bundle = dirname(dirname(dirname(execPath)))
  return new Promise((resolve) => {
    // codesign prints its report on stderr; a non-zero exit (unsigned) resolves false.
    execFile('codesign', ['-dv', '--verbose=2', bundle], { timeout: 10_000 }, (err, stdout, stderr) => resolve(!err && codesignOutputSigned(`${stdout}\n${stderr}`)))
  })
}

/** electron-updater errors carry whole XML bodies and stacks; the UI wants one short line. */
const oneLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split('\n')[0]!.trim().slice(0, 200) || 'Unknown error'

const OFF: UpdateStatus = { state: 'idle', version: null, percent: null, error: null }

export function createUpdater(deps: UpdaterDeps) {
  const warn = (m: string): void => deps.warn?.(m)
  let s: UpdateStatus = OFF
  let silent = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const set = (next: Partial<UpdateStatus> & Pick<UpdateStatus, 'state'>): void => {
    const full = { ...OFF, ...next }
    if (JSON.stringify(full) === JSON.stringify(s)) return
    s = full
    deps.onStatus(s)
  }

  function fail(e: unknown): void {
    const message = oneLine(e)
    if (s.state === 'error' && s.error === message) return // the event and the rejected promise both report it
    if (silent && s.state === 'checking') {
      // A quiet background check that could not reach GitHub (offline at startup, say) is not worth showing.
      warn(`background update check failed: ${message}`)
      return set({ state: 'idle' })
    }
    set({ state: 'error', version: s.version, error: message })
  }

  let u: UpdaterLike | null = null
  const ready: Promise<void> = deps
    .supported()
    .then(async (ok) => (ok ? (u = await deps.updater()) : null))
    .catch(() => null)
    .then((u) => {
      if (!u) return set({ state: 'unsupported' })
      u.autoDownload = false
      u.on('update-available', (info: { version: string }) => set({ state: 'available', version: info.version }))
      u.on('update-not-available', () => set({ state: 'none' }))
      u.on('download-progress', (p: { percent: number }) => {
        if (s.state === 'downloading') set({ state: 'downloading', version: s.version, percent: Math.max(0, Math.min(100, Math.floor(p.percent))) })
      })
      u.on('update-downloaded', (info: { version: string }) => set({ state: 'ready', version: info.version }))
      u.on('error', (e: unknown) => fail(e))
    })

  const stateNow = (): UpdateStatus['state'] => s.state // TypeScript can't see the event handlers change `s`

  async function run(quiet: boolean): Promise<UpdateStatus> {
    await ready
    if (s.state === 'unsupported' || s.state === 'checking' || s.state === 'downloading' || s.state === 'ready') return s
    silent = quiet
    set({ state: 'checking', version: null })
    try {
      const r = await u!.checkForUpdates()
      if (stateNow() === 'checking') set({ state: r == null ? 'unsupported' : 'none' }) // null: electron-updater declined to check
    } catch (e) {
      fail(e)
    }
    return s
  }

  return {
    /** One quiet check after the delay (unless switched off in settings). Call once, after the window exists. */
    start(): void {
      void ready.then(() => {
        if (s.state === 'unsupported' || timer) return
        timer = setTimeout(() => {
          timer = null
          if (deps.settings.get(AUTO_KEY) !== false) void run(true)
        }, deps.startDelayMs ?? START_DELAY)
        timer.unref?.()
      })
    },
    stop(): void {
      if (timer) clearTimeout(timer)
      timer = null
    },
    async status(): Promise<UpdateStatus> {
      await ready
      return s
    },
    check: () => run(false),
    async download(): Promise<void> {
      await ready
      if (s.state !== 'available') return
      silent = false
      set({ state: 'downloading', version: s.version, percent: 0 })
      try {
        await u!.downloadUpdate()
      } catch (e) {
        fail(e)
      }
    },
    async install(): Promise<void> {
      await ready
      if (s.state === 'ready') u!.quitAndInstall(false, true)
    }
  }
}

export type Updater = ReturnType<typeof createUpdater>
