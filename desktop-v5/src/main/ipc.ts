import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppInfo, ExportFormat, ImportSourceKind, NotesChanged } from '../shared/api'
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
import type { Store } from './store/notes'

/** Every channel goes through here: sender check first, then the handler (which validates its own args). */
function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertSender(event)
    return fn(...args)
  })
}

function notify(ids: string[]): void {
  const payload: NotesChanged = { ids }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('notes:changed', payload)
}

/** `undefined` means 'auto'. */
function importSource(v: unknown): ImportSourceKind | 'auto' {
  if (v === undefined || v === 'auto') return 'auto'
  if (v === 'localStorage' || v === 'json') return v
  throw new Error('invalid argument: unknown import source')
}

export function registerIpc(store: Store, secrets: Secrets, importer: Importer, media: Media, backups: Backups): void {
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
  handle('importer:fromFile', async () => {
    const opts = { properties: ['openFile' as const], filters: [{ name: 'CogNotez 4 backup', extensions: ['json'] }] }
    const win = BrowserWindow.getFocusedWindow()
    const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const path = picked.filePaths[0]
    if (picked.canceled || !path) return null
    const r = await importer.fromFile(path)
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

  registerDataIpc(store, media, backups)
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
    if (!r.ids.length) throw new Error(`nothing imported: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`)
    notify(r.ids)
    return { notes: r.ids.length }
  })

  handle('app:info', (): AppInfo => ({ version: app.getVersion(), electron: process.versions.electron, userData: app.getPath('userData') }))
}
