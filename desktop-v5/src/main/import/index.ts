// Ties the v4 sources (read-only) to the mapper. Electron-free: the localStorage reader is injected.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ImportDetect, ImportSource, ImportSourceKind, ImportStats } from '../../shared/api'
import type { Media } from '../media'
import type { Secrets } from '../secrets'
import type { Store } from '../store/notes'
import { importV4, inspectBlob } from './v4'
import type { V4MediaFile, V4Result } from './v4'

export interface LocalStorageRead {
  raw: string
  extras: Record<string, string>
  /** IndexedDB media records, if v4 used its fallback store. */
  idb: V4MediaFile[]
}

export interface ImporterDeps {
  store: Store
  secrets: Pick<Secrets, 'has' | 'set'>
  media: Media
  /** v4's userData directory. Only ever read. */
  v4Dir: string
  readLocalStorage(): Promise<LocalStorageRead | null>
}

const MAX_JSON_BYTES = 200 * 1024 * 1024
const MAX_FILE_BYTES = 100 * 1024 * 1024

/** Files in v4's media directory; contents are read lazily. */
export function listV4MediaDir(dir: string): V4MediaFile[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => ({
      id: e.name.replace(/\.[^.]*$/, ''),
      name: e.name,
      read: () => {
        const p = join(dir, e.name)
        return lstatSync(p).size > MAX_FILE_BYTES ? null : readFileSync(p)
      }
    }))
}

export function readJsonFile(path: string): string | null {
  try {
    if (!existsSync(path) || lstatSync(path).size > MAX_JSON_BYTES) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function createImporter(d: ImporterDeps) {
  const jsonPath = join(d.v4Dir, 'cognotez_data.json')
  const mediaDir = join(d.v4Dir, 'media')
  let running = false

  const guarded = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (running) throw new Error('an import is already running')
    running = true
    try {
      return await fn()
    } finally {
      running = false
    }
  }

  const run = (kind: ImportSourceKind, raw: string, extras: Record<string, string>, idb: V4MediaFile[]): V4Result =>
    importV4(d.store, d.secrets, d.media, { kind, blob: raw, extras, files: [...listV4MediaDir(mediaDir), ...idb] })

  return {
    async detect(): Promise<ImportDetect> {
      const sources: ImportSource[] = []
      const ls = await d.readLocalStorage()
      const lsInfo = ls && inspectBlob(ls.raw)
      if (lsInfo) sources.push({ kind: 'localStorage', ...lsInfo })
      const js = readJsonFile(jsonPath)
      const jsInfo = js && inspectBlob(js)
      if (jsInfo) sources.push({ kind: 'json', ...jsInfo })
      const prev = d.store.settings.get('import.v4') as { at: number; stats: ImportStats } | null
      return { found: sources.length > 0, sources, alreadyImported: prev && typeof prev.at === 'number' ? prev : null }
    },

    /** 'auto' prefers localStorage (the live copy) and falls back to the JSON mirror. */
    run: (source: ImportSourceKind | 'auto'): Promise<V4Result> =>
      guarded(async () => {
        if (source !== 'json') {
          const ls = await d.readLocalStorage()
          if (ls && inspectBlob(ls.raw)) return run('localStorage', ls.raw, ls.extras, ls.idb)
          if (source === 'localStorage') throw new Error('no usable CogNotez 4 localStorage data found')
        }
        const js = readJsonFile(jsonPath)
        if (!js || !inspectBlob(js)) throw new Error('no usable CogNotez 4 data found')
        return run('json', js, {}, [])
      }),

    /** `path` must come from a dialog opened by main. Media is looked up in v4's media directory. */
    fromFile: (path: string): Promise<V4Result> =>
      guarded(async () => {
        const js = readJsonFile(path)
        if (!js || !inspectBlob(js)) throw new Error('this file is not a CogNotez 4 backup')
        return run('json', js, {}, [])
      })
  }
}

export type Importer = ReturnType<typeof createImporter>
