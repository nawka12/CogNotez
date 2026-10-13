import { contextBridge, ipcRenderer } from 'electron'
import type { Api, NotesChanged } from '../shared/api'

const call = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

const api: Api = {
  notes: {
    list: (filter) => call('notes:list', filter),
    get: (id) => call('notes:get', id),
    create: (input) => call('notes:create', input),
    save: (patch) => call('notes:save', patch),
    trash: (id) => call('notes:trash', id),
    restore: (id) => call('notes:restore', id),
    deleteForever: (id) => call('notes:deleteForever', id)
  },
  tags: { list: () => call('tags:list') },
  search: (q) => call('search', q),
  settings: {
    get: (key) => call('settings:get', key),
    set: (key, value) => call('settings:set', key, value)
  },
  secrets: {
    set: (name, value) => call('secrets:set', name, value),
    has: (name) => call('secrets:has', name),
    delete: (name) => call('secrets:delete', name),
    status: () => call('secrets:status')
  },
  importer: {
    detectV4: () => call('importer:detectV4'),
    runV4: (source) => call('importer:runV4', source ?? 'auto'),
    fromFile: () => call('importer:fromFile')
  },
  media: {
    importBytes: (bytes, mime) => call('media:importBytes', bytes, mime)
  },
  onFlushRequest(cb) {
    const listener = (): void => {
      void cb()
        .catch(() => undefined)
        .finally(() => ipcRenderer.send('app:flushed'))
    }
    ipcRenderer.on('app:flush', listener)
    return () => {
      ipcRenderer.removeListener('app:flush', listener)
    }
  },
  onNotesChanged(cb) {
    const listener = (_e: unknown, payload: NotesChanged): void => cb(payload)
    ipcRenderer.on('notes:changed', listener)
    return () => {
      ipcRenderer.removeListener('notes:changed', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
