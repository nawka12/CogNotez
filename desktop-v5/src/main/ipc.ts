import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AiEvent, AppInfo, ExportFormat, ImportSourceKind, NotesChanged, SyncSetup } from '../shared/api'
import type { Ai } from './ai'
import type { Backups } from './backup'
import { exportAllMarkdown, noteHtml, noteMarkdown, noteText, slugify } from './export'
import * as g from './guards'
import type { Importer } from './import'
import { IMPORT_EXTENSIONS, importMarkdownFiles } from './import/files'
import { log } from './log'
import type { Media } from './media'
import { fraunces, htmlToPdf } from './pdf'
import { assertSender } from './security'
import type { Secrets } from './secrets'
import type { SyncService } from './sync/service'
import type { GoogleAuth } from './sync/google-auth'
import type { Updater } from './updater'
import type { Store } from './store/notes'

/** Every channel goes through here: sender check first, then the handler (which validates its own args). */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertSender(event)
    return fn(...args)
  })
}

/** Like `handle`, but the handler also gets the calling webContents (AI events go to that window only). */
function handleFrom(channel: string, fn: (sender: WebContents, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertSender(event)
    return fn(event.sender, ...args)
  })
}

/** Set by registerSyncIpc: local note changes schedule a sync round. */
let onLocalChange: (() => void) | null = null

function notify(ids: string[]): void {
  const payload: NotesChanged = { ids }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('notes:changed', payload)
  onLocalChange?.()
}

/** `undefined` means 'auto'. */
function importSource(v: unknown): ImportSourceKind | 'auto' {
  if (v === undefined || v === 'auto') return 'auto'
  if (v === 'localStorage' || v === 'json') return v
  throw new Error('invalid argument: unknown import source')
}

export function registerIpc(store: Store, secrets: Secrets, importer: Importer, media: Media, backups: Backups, ai: Ai): void {
  const { notes } = store

  handle('notes:list', (f) => notes.list(g.listFilter(f)))
  handle('notes:get', (id) => notes.get(g.id(id)))
  handle('notes:create', (input) => {
    const note = notes.create(g.noteInput(input))
    notify([note.id])
    return note
  })
  handle('notes:save', (patch) => {
    const note = notes.save(g.notePatch(patch))
    notify([note.id])
    return note
  })
  handle('notes:trash', (raw) => {
    const id = g.id(raw)
    notes.trash(id)
    notify([id])
  })
  handle('notes:restore', (raw) => {
    const id = g.id(raw)
    notes.restore(id)
    notify([id])
  })
  handle('notes:deleteForever', (raw) => {
    const id = g.id(raw)
    notes.deleteForever(id)
    notify([id])
  })

  handle('tags:list', () => store.tags.list())
  handle('search', (q) => store.search(g.query(q)))

  handle('settings:get', (key) => store.settings.get(g.settingKey(key)))
  handle('settings:set', (key, value) => store.settings.set(g.settingKey(key), value))

  handle('secrets:set', (name, value) => secrets.set(g.secretName(name), g.secretValue(value)))
  handle('secrets:has', (name) => secrets.has(g.secretName(name)))
  handle('secrets:delete', (name) => secrets.delete(g.secretName(name)))
  handle('secrets:status', () => secrets.status())

  handle('importer:detectV4', () => importer.detect())
  handle('importer:runV4', async (source) => {
    const r = await importer.run(importSource(source))
    notify(r.ids)
    return r.stats
  })
  handle('importer:fromFile', async (passphrase) => {
    const pick = async (): Promise<string | null> =>
      (await pickPaths({ properties: ['openFile'], filters: [{ name: 'CogNotez 4 backup or sync file', extensions: ['json'] }] }, testEnv('COGNOTEZ_TEST_IMPORT_FILE')))[0] ?? null
    const r = await importer.fromFile(pick, passphrase === undefined ? undefined : g.password(passphrase))
    if (!r) return null
    notify(r.ids)
    return r.stats
  })

  handle('media:importBytes', (bytes, mime) => media.importBytes(bytes, mime))

  handle('locks:unlock', async (id, pw) => {
    const note = await store.locks.unlock(g.id(id), g.password(pw))
    notify([note.id])
    return note
  })
  handle('locks:lock', (id) => store.locks.lock(g.id(id))) // keys.lock() sends locks:changed
  handle('locks:setPassword', async (id, pw) => {
    const nid = g.id(id)
    await store.locks.setPassword(nid, g.password(pw))
    notify([nid])
  })
  handle('locks:removeLock', (id) => {
    const note = store.locks.removeLock(g.id(id))
    notify([note.id])
    return note
  })

  registerAiIpc(ai)
  registerDataIpc(store, media, backups)
}

// ---- AI -------------------------------------------------------------------------------------

const watched = new WeakSet<WebContents>()

function registerAiIpc(ai: Ai): void {
  handle('ai:getConfig', () => ai.getConfig())
  handle('ai:setConfig', (patch) => ai.setConfig(patch))
  handle('ai:models', () => ai.models())
  handle('ai:test', () => ai.test())
  handleFrom('ai:run', (wc, req) => {
    if (!watched.has(wc)) {
      watched.add(wc)
      wc.once('destroyed', () => ai.abortOwner(wc)) // a closed window must not leave a model generating
    }
    return ai.run(req, {
      owner: wc,
      send: (e: AiEvent) => {
        if (!wc.isDestroyed()) wc.send('ai:event', e)
      }
    })
  })
  handleFrom('ai:abort', (wc, requestId) => ai.abort(g.id(requestId), wc))
  handle('ai:thread', (noteId) => ai.thread(noteId === null ? null : g.id(noteId)))
  handle('ai:clearThread', (noteId) => ai.clearThread(noteId === null ? null : g.id(noteId)))
}

// ---- backups, export, file import, app info ------------------------------------------------

/** Dev-only dialog stand-ins so the real app can be driven without a human at a file picker. */
const testEnv = (name: string): string | undefined => (app.isPackaged ? undefined : process.env[name])

const FORMATS: readonly ExportFormat[] = ['md', 'txt', 'pdf']
function exportFormat(v: unknown): ExportFormat {
  if (typeof v !== 'string' || !(FORMATS as readonly string[]).includes(v)) throw new Error('invalid argument: unknown export format')
  return v as ExportFormat
}

const dialogWindow = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? undefined

async function pickSavePath(defaultName: string, format: ExportFormat): Promise<string | null> {
  const fake = testEnv('COGNOTEZ_TEST_SAVE_PATH')
  if (fake) return fake
  const opts = { defaultPath: defaultName, filters: [{ name: format.toUpperCase(), extensions: [format] }] }
  const win = dialogWindow()
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  return r.canceled || !r.filePath ? null : r.filePath
}

async function pickPaths(options: Electron.OpenDialogOptions, fake: string | undefined): Promise<string[]> {
  if (fake) return fake.split(':')
  const win = dialogWindow()
  const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return r.canceled ? [] : r.filePaths
}

function registerDataIpc(store: Store, media: Media, backups: Backups): void {
  handle('backups:list', () => backups.list())
  handle('backups:create', () => backups.create(false))
  handle('backups:restore', (id) => {
    backups.requestRestore(id) // validates the backup and leaves the marker; the swap happens at next start
    store.db.close()
    app.relaunch()
    app.exit(0)
  })
  handle('backups:reveal', async () => {
    mkdirSync(backups.dir, { recursive: true })
    const err = await shell.openPath(backups.dir)
    if (err) throw new Error(err)
  })

  handle('exporter:note', async (id, fmt) => {
    const format = exportFormat(fmt)
    const note = store.notes.get(g.id(id))
    if (note.locked) throw new Error('note is locked') // never plaintext, even while unlocked
    const path = await pickSavePath(`${slugify(note.title)}.${format}`, format)
    if (!path) return null
    if (format === 'pdf') writeFileSync(path, await htmlToPdf(noteHtml(note, fraunces())))
    else writeFileSync(path, format === 'md' ? noteMarkdown(note) : noteText(note))
    return path
  })
  handle('exporter:allMarkdown', async () => {
    const [parent] = await pickPaths({ properties: ['openDirectory', 'createDirectory'] }, testEnv('COGNOTEZ_TEST_EXPORT_DIR'))
    if (!parent) return null
    // A fresh subfolder, so exporting into Documents never scatters hundreds of files there.
    const dir = join(parent, `cognotez-export-${new Date().toISOString().slice(0, 10)}`)
    const r = exportAllMarkdown(store, media.dir, dir)
    log.info(`exported ${r.notes} notes, ${r.media} media, ${r.lockedSkipped} locked skipped`)
    return r.dir
  })

  handle('importer:files', async () => {
    const fake = testEnv('COGNOTEZ_TEST_IMPORT_FILES') // dev only: a folder standing for "the .md files in it"
    const paths = fake
      ? readdirSync(fake).filter((n) => n.endsWith('.md')).map((n) => join(fake, n))
      : await pickPaths({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown or text', extensions: IMPORT_EXTENSIONS }] }, undefined)
    if (!paths.length) return null
    const r = importMarkdownFiles(store, media, paths)
    if (r.skipped.length) log.warn('import skipped:', r.skipped.map((s) => `${s.name} (${s.reason})`).join('; '))
    if (r.ids.length) notify(r.ids)
    return { notes: r.ids.length, skipped: r.skipped }
  })

  handle('app:info', (): AppInfo => ({ version: app.getVersion(), electron: process.versions.electron, userData: app.getPath('userData') }))
}

// ---- Sync ------------------------------------------------------------------------------------

function syncSetup(v: unknown): SyncSetup {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('invalid argument: setup must be an object')
  const o = v as Record<string, unknown>
  for (const k of Object.keys(o)) if (k !== 'transport' && k !== 'passphrase') throw new Error(`invalid argument: setup.${k} is not allowed`)
  if (o.transport !== 'folder' && o.transport !== 'gdrive') throw new Error('invalid argument: unknown sync transport')
  if (o.passphrase === undefined) return { transport: o.transport }
  if (typeof o.passphrase !== 'string' || o.passphrase.length < 8 || o.passphrase.length > g.LIMITS.password) {
    throw new Error('invalid argument: the passphrase must be 8 to 1024 characters')
  }
  return { transport: o.transport, passphrase: o.passphrase }
}

function deviceName(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  if (typeof v !== 'string' || !v.trim() || v.length > 100 || /[\u0000-\u001f\u007f]/.test(v)) {
    throw new Error('invalid argument: the device name must be 1 to 100 characters')
  }
  return v.trim()
}

export function registerSyncIpc(sync: SyncService): void {
  onLocalChange = () => sync.noteChanged()
  handle('sync:status', () => sync.status())
  handle('sync:setup', (s) => sync.setup(syncSetup(s)))
  handle('sync:unlock', (p) => sync.unlock(g.password(p)))
  handle('sync:now', () => sync.now())
  handle('sync:disable', () => sync.disable())
  handle('sync:setDeviceName', (n) => sync.setDeviceName(deviceName(n)))
}

/** The sync folder picker; COGNOTEZ_TEST_SYNC_FOLDER stands in for the dialog in dev (ignored when packaged). */
export async function pickSyncFolder(): Promise<string | null> {
  const [path] = await pickPaths({ properties: ['openDirectory', 'createDirectory'] }, testEnv('COGNOTEZ_TEST_SYNC_FOLDER'))
  return path ?? null
}

// ---- Google account (Drive sync sign-in) ---------------------------------------------------

export function registerGoogleIpc(google: GoogleAuth): void {
  handle('google:connect', () => google.connect())
  handle('google:disconnect', () => google.disconnect())
  handle('google:status', () => google.status())
  handle('google:importClient', () => google.importClient())
}

/** The OAuth client JSON picker for `google.importClient()`; COGNOTEZ_TEST_GOOGLE_CLIENT_FILE stands in for the dialog in dev. */
export async function pickGoogleClientFile(): Promise<string | null> {
  const [path] = await pickPaths(
    { properties: ['openFile'], filters: [{ name: 'Google OAuth client', extensions: ['json'] }] },
    testEnv('COGNOTEZ_TEST_GOOGLE_CLIENT_FILE')
  )
  return path ?? null
}

// ---- App updates (GitHub Releases) -----------------------------------------------------------

export function registerUpdatesIpc(updates: Updater): void {
  handle('updates:status', () => updates.status())
  handle('updates:check', () => updates.check())
  handle('updates:download', () => updates.download())
  handle('updates:install', () => updates.install())
}
