import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { ImportSourceKind, NotesChanged } from '../shared/api'
import * as g from './guards'
import type { Importer } from './import'
import type { Media } from './media'
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

export function registerIpc(store: Store, secrets: Secrets, importer: Importer, media: Media): void {
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
}
