import { app, BrowserWindow, ipcMain, net, powerMonitor, protocol, safeStorage, screen, shell } from 'electron'
import type { IpcMainEvent } from 'electron'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createAi } from './ai'
import { applyPendingRestore, createBackups } from './backup'
import { isVisible, parseWindowState } from './bounds'
import { createImporter } from './import'
import { readV4LocalStorage } from './import/v4-electron'
import { pickGoogleClientFile, pickSyncFolder, registerGoogleIpc, registerIpc, registerSyncIpc, registerUpdatesIpc } from './ipc'
import { log } from './log'
import { createMedia, MEDIA_SCHEME } from './media'
import type { Media } from './media'
import { createSecrets } from './secrets'
import { installSecurity, setAppTarget } from './security'
import { createUpdater, macAppSigned, updateSupported } from './updater'
import type { UpdaterLike } from './updater'
import { openDb } from './store/db'
import { createStore } from './store/notes'
import { createDriveTransport } from './sync/drive'
import { createFolderTransport } from './sync/folder'
import { createGoogleAuth } from './sync/google-auth'
import { createSyncService } from './sync/service'
import type { Store } from './store/notes'

const SMOKE = process.env['COGNOTEZ_SMOKE'] === '1'
const IMPORT_SMOKE = process.env['COGNOTEZ_IMPORT_SMOKE'] === '1'

// Must run before `ready`. `stream` lets <video>/<audio> seek with Range requests.
protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true } }])

// v5 keeps its data apart from v4 (~/.config/cognotez), which must never be touched.
// The final userData path is decided at release; this is a development placeholder.
// Must run before `ready`.
app.setPath(
  'userData',
  SMOKE || IMPORT_SMOKE ? mkdtempSync(join(tmpdir(), 'cognotez-smoke-')) : join(app.getPath('appData'), 'cognotez-v5')
)

/** Dev-only environment overrides (test servers, fake OAuth); ignored in a packaged app. */
const devEnv = (name: string): string | undefined => (app.isPackaged ? undefined : process.env[name])

const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL']
const indexHtml = join(__dirname, '../renderer/index.html')

/** Where the window was last closed, if that spot is still on a connected display. */
function savedBounds(store: Store): ReturnType<typeof parseWindowState> {
  const w = parseWindowState(store.settings.get('sys.window'))
  return w && isVisible(w, screen.getAllDisplays().map((d) => d.workArea)) ? w : null
}

function createWindow(store: Store): void {
  const saved = savedBounds(store)
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    ...(saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : {}),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })
  if (saved?.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  win.on('close', () => {
    try {
      store.settings.set('sys.window', { ...win.getNormalBounds(), maximized: win.isMaximized() })
    } catch (e) {
      log.warn('could not save window bounds:', String(e))
    }
  })
  flushBeforeClose(win)
  // Surface renderer warnings/errors (CSP violations included) in the main log.
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') log.warn('renderer:', e.message)
  })
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(indexHtml)
}

/** Lets the renderer save pending edits before the window goes away (gives up after 2 s). */
function flushBeforeClose(win: BrowserWindow): void {
  let closing = false
  win.on('close', (e) => {
    if (closing) return
    e.preventDefault()
    closing = true
    const finish = (): void => {
      ipcMain.removeListener('app:flushed', onFlushed)
      clearTimeout(timer)
      if (!win.isDestroyed()) win.destroy()
    }
    const onFlushed = (ev: IpcMainEvent): void => {
      if (ev.sender === win.webContents) finish()
    }
    const timer = setTimeout(finish, 2000)
    ipcMain.on('app:flushed', onFlushed)
    win.webContents.send('app:flush')
  })
}

/** Proves node:sqlite + FTS5 work inside Electron: prints one JSON line and exits. */
function smoke(): void {
  try {
    const db = openDb(join(app.getPath('userData'), 'cognotez.db'))
    const store = createStore(db)
    const note = store.notes.create({ title: 'Smoke note', body: 'Hello from Electron SQLite', tags: ['smoke/test'] })
    store.notes.save({ id: note.id, tags: ['smoke/test', 'Extra'] })
    const hits = store.search('tag:smoke hel')
    const sqlite = (db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v
    db.close()
    const ok = hits.length === 1 && hits[0]?.id === note.id
    process.stdout.write(
      JSON.stringify({
        ok,
        electron: process.versions.electron,
        node: process.versions.node,
        sqlite,
        hits: hits.map((h) => ({ title: h.title, snippet: h.snippet, tags: h.tags })),
        secrets: createSecrets(join(app.getPath('userData'), 'secrets.json'), safeStorage).status()
      }) + '\n'
    )
    rmSync(app.getPath('userData'), { recursive: true, force: true })
    app.exit(ok ? 0 : 1)
  } catch (e) {
    process.stderr.write(`smoke failed: ${String(e)}\n`)
    app.exit(1)
  }
}

/** v4's userData dir. Only ever read from. */
const v4Dir = (): string => process.env['COGNOTEZ_V4_DIR'] ?? join(app.getPath('appData'), 'cognotez')

function serveMedia(media: Media): void {
  protocol.handle(MEDIA_SCHEME, (req) => media.serve(req.url, req.headers.get('range')))
}

/**
 * Dry-runs the importer against the real v4 profile into a temp v5 userData and prints ONE JSON line of counts
 * (never note text). Also fetches a media URL through the real protocol handler.
 */
async function importSmoke(): Promise<void> {
  const root = app.getPath('userData')
  let ok = false
  try {
    const db = openDb(join(root, 'cognotez.db'))
    const store = createStore(db)
    const media = createMedia(join(root, 'media'), db)
    serveMedia(media)
    let openrouterKey = false
    const importer = createImporter({
      store, media, v4Dir: v4Dir(),
      secrets: { has: () => false, set: () => void (openrouterKey = true) }, // never touch the keyring in a dry run
      readLocalStorage: () => readV4LocalStorage(v4Dir())
    })
    const detect = await importer.detect()
    const { stats } = await importer.run('auto')
    const again = (await importer.run('auto')).stats

    const row = db.prepare("SELECT hash, mime, bytes FROM media ORDER BY (mime LIKE 'image/%') DESC LIMIT 1").get() as
      | { hash: string; mime: string; bytes: number }
      | undefined
    const status = async (url: string): Promise<number> => {
      try {
        return (await net.fetch(url)).status
      } catch {
        return -1
      }
    }
    let protocolCheck: Record<string, unknown> = { fetched: false }
    if (row) {
      const res = await net.fetch(`${MEDIA_SCHEME}://${row.hash}`)
      const body = await res.arrayBuffer()
      protocolCheck = {
        fetched: true,
        status: res.status,
        mimeMatches: res.headers.get('content-type') === row.mime,
        sizeMatches: body.byteLength === row.bytes,
        traversal: await status(`${MEDIA_SCHEME}://../etc/passwd`),
        nonHex: await status(`${MEDIA_SCHEME}://not-a-hash`),
        shortHex: await status(`${MEDIA_SCHEME}://${row.hash.slice(1)}`),
        unknownHash: await status(`${MEDIA_SCHEME}://${'0'.repeat(64)}`)
      }
    }
    const searchHits = store.search('the').length
    ok = stats.notes > 0 && again.notes === 0 && again.skippedExisting === stats.notes
    process.stdout.write(
      JSON.stringify({
        ok,
        source: detect.sources.map((s) => ({ kind: s.kind, notes: s.notes })),
        used: (store.settings.get('import.v4') as { source: string } | null)?.source ?? null,
        notes: stats.notes, tags: stats.tags, media: stats.media, mediaMissing: stats.mediaMissing,
        locked: stats.locked, lockedWithoutCipher: stats.lockedWithoutCipher, conversations: stats.conversations,
        skippedExisting: stats.skippedExisting, warnings: stats.warnings.length, firstWarnings: stats.warnings.slice(0, 5),
        rerun: { notes: again.notes, skippedExisting: again.skippedExisting },
        openrouterKey, searchHits, protocol: protocolCheck
      }) + '\n'
    )
    db.close()
  } catch (e) {
    process.stderr.write(`import smoke failed: ${String(e)}\n`)
  } finally {
    rmSync(root, { recursive: true, force: true })
    app.exit(ok ? 0 : 1)
  }
}

void app.whenReady().then(async () => {
  if (SMOKE) return smoke()
  if (IMPORT_SMOKE) return importSmoke()

  // A restore chosen in Settings is applied here, before anything opens the database.
  const restore = await applyPendingRestore(app.getPath('userData'))
  if (restore.restored) log.info('restored the database from a backup')
  else if (restore.error) log.error('restore failed, kept the current database:', restore.error)

  const db = openDb(join(app.getPath('userData'), 'cognotez.db'))
  const store = createStore(db, undefined, {
    onLocksChanged(ids) {
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('locks:changed', { ids })
    }
  })
  // Unlocked notes lock when the screen locks or the machine sleeps, and on quit (also on idle, inside the store).
  powerMonitor.on('lock-screen', () => store.locks.lockAll())
  powerMonitor.on('suspend', () => store.locks.lockAll())
  const secrets = createSecrets(join(app.getPath('userData'), 'secrets.json'), safeStorage)

  setAppTarget(devUrl ?? pathToFileURL(indexHtml).href)
  installSecurity(devUrl)
  const media = createMedia(join(app.getPath('userData'), 'media'), db)
  serveMedia(media)
  const importer = createImporter({
    store, secrets, media, v4Dir: v4Dir(), readLocalStorage: () => readV4LocalStorage(v4Dir())
  })
  const backups = createBackups(app.getPath('userData'), db)
  const ai = createAi({ store, secrets, warn: log.warn })
  registerIpc(store, secrets, importer, media, backups, ai)
  const google = createGoogleAuth({
    secrets,
    settings: store.settings,
    // Dev-only: COGNOTEZ_TEST_OAUTH_AUTO=1 follows the fake consent page's redirect instead of opening a browser.
    openUrl: devEnv('COGNOTEZ_TEST_OAUTH_AUTO') === '1' ? async (url) => void (await fetch(url)) : (url) => shell.openExternal(url),
    pickClientFile: pickGoogleClientFile,
    readFile: (path) => readFileSync(path, 'utf8'),
    builtIn: {
      clientId: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? devEnv('MAIN_VITE_GOOGLE_CLIENT_ID') ?? '',
      clientSecret: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? devEnv('MAIN_VITE_GOOGLE_CLIENT_SECRET') ?? ''
    },
    oauthBase: devEnv('COGNOTEZ_OAUTH_BASE')
  })
  registerGoogleIpc(google)
  const toWindows = (channel: string, payload: unknown): void => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
  const sync = createSyncService({
    store, media, secrets,
    transports: {
      folder: (path) => createFolderTransport(path),
      // Fails with the human-readable sign-in message (not connected / expired) when the token can't be had.
      gdrive: async () => {
        await google.getAccessToken()
        return createDriveTransport({
          getAccessToken: (force) => google.getAccessToken(force),
          email: google.email() ?? undefined,
          apiBase: devEnv('COGNOTEZ_DRIVE_BASE')
        })
      }
    },
    pickFolder: pickSyncFolder,
    hostname,
    onStatus: (s) => toWindows('sync:status', s),
    onNotesChanged: (ids) => toWindows('notes:changed', { ids }),
    warn: (m) => log.warn('sync:', m)
  })
  registerSyncIpc(sync)
  // Dev-only: COGNOTEZ_UPDATE_FEED=<url of a generic update feed> lets an unpacked run exercise the update flow.
  const updateFeed = devEnv('COGNOTEZ_UPDATE_FEED')
  const updates = createUpdater({
    updater: async () => {
      const { autoUpdater } = await import('electron-updater')
      if (updateFeed) {
        autoUpdater.forceDevUpdateConfig = true
        autoUpdater.setFeedURL({ provider: 'generic', url: updateFeed })
      }
      return autoUpdater as unknown as UpdaterLike
    },
    supported: () =>
      updateSupported({
        packaged: app.isPackaged,
        platform: process.platform,
        appImage: process.env['APPIMAGE'],
        macSigned: () => macAppSigned(process.execPath),
        feedOverride: !!updateFeed
      }),
    settings: store.settings,
    onStatus: (s) => toWindows('updates:status', s),
    warn: (m) => log.warn('updates:', m)
  })
  registerUpdatesIpc(updates)
  updates.start()
  createWindow(store)
  // Only arms timers: the first round runs STARTUP_DELAY after launch, never before the window (sync-v2.md §7).
  sync.start()
  backups.autoIfDue().catch((e: unknown) => log.warn('automatic backup failed:', String(e)))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(store)
  })
  app.on('will-quit', () => {
    sync.stop()
    updates.stop()
    store.locks.lockAll()
    db.close()
  })
})

app.on('window-all-closed', () => {
  if (IMPORT_SMOKE) return // the importer's hidden reader window closes while the dry run is still going
  if (process.platform !== 'darwin') app.quit()
})
