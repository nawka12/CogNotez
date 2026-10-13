// Reads v4's live data (renderer localStorage, plus its IndexedDB media fallback) WITHOUT touching v4's directory:
// the storage folders are copied to a temp dir (skipping LevelDB's LOCK files) and a hidden, sandboxed window on
// `session.fromPath(tmp)` reads them. file:// pages share one origin, so a blank page written into the temp dir sees
// the same localStorage v4's pages did. The temp dir is deleted afterwards (Chromium may re-create an empty
// Cache/Preferences stub in it at process exit; it holds none of v4's data).
import { BrowserWindow, session } from 'electron'
import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { log } from '../log'
import type { LocalStorageRead } from './index'

/** Plain localStorage keys v4 used for settings (see ai.js, general-settings.js, i18n.js). */
const EXTRA_KEYS = [
  'theme', 'language', 'ai_backend', 'ollama_endpoint', 'ollama_model', 'openrouter_api_key', 'openrouter_model',
  'searxng_url', 'searxng_enabled', 'searxng_max_results'
]

const PAGE_SCRIPT = `(async () => {
  const out = { raw: localStorage.getItem('cognotez_data'), extras: {}, idb: [] }
  for (const k of ${JSON.stringify(EXTRA_KEYS)}) { const v = localStorage.getItem(k); if (v !== null) out.extras[k] = v }
  const b64 = (buf) => new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result).split(',')[1] || '')
    fr.onerror = () => rej(fr.error)
    fr.readAsDataURL(new Blob([buf]))
  })
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  try {
    const dbs = indexedDB.databases ? await indexedDB.databases() : []
    if (dbs.some((d) => d.name === 'CogNotezMedia')) {
      const db = await req(indexedDB.open('CogNotezMedia'))
      if (db.objectStoreNames.contains('media')) {
        for (const r of await req(db.transaction('media').objectStore('media').getAll())) {
          if (r && typeof r.id === 'string' && r.data) {
            out.idb.push({ id: r.id, name: typeof r.name === 'string' ? r.name : r.id, type: typeof r.type === 'string' ? r.type : '', b64: await b64(r.data) })
          }
        }
      }
      db.close()
    }
  } catch (e) { out.idbError = String(e) }
  return JSON.stringify(out)
})()`

const TIMEOUT_MS = 30_000

export async function readV4LocalStorage(v4Dir: string): Promise<LocalStorageRead | null> {
  const lsSrc = join(v4Dir, 'Local Storage')
  const tmp = await mkdtemp(join(tmpdir(), 'cognotez-v4-'))
  let win: BrowserWindow | null = null
  try {
    const copy = (src: string, dest: string): Promise<void> =>
      cp(src, dest, { recursive: true, filter: (s) => basename(s) !== 'LOCK' })
    try {
      await copy(lsSrc, join(tmp, 'Local Storage'))
    } catch {
      return null // no localStorage in v4's directory
    }
    // file:// pages keep their IndexedDB under "file__0.indexeddb.leveldb" (and a matching .blob dir).
    try {
      for (const e of await readdir(join(v4Dir, 'IndexedDB'))) {
        if (e.startsWith('file__')) await copy(join(v4Dir, 'IndexedDB', e), join(tmp, 'IndexedDB', e))
      }
    } catch {
      /* no IndexedDB */
    }

    await writeFile(join(tmp, 'blank.html'), '<!doctype html><meta charset="utf-8"><title>v4</title>')
    win = new BrowserWindow({
      show: false,
      webPreferences: { session: session.fromPath(tmp), sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    const work = (async () => {
      await win!.loadFile(join(tmp, 'blank.html'))
      return (await win!.webContents.executeJavaScript(PAGE_SCRIPT)) as string
    })()
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('timed out reading v4 localStorage')), TIMEOUT_MS)
    })
    const json = await Promise.race([work, timeout]).finally(() => clearTimeout(timer))

    const out = JSON.parse(json) as {
      raw: string | null
      extras: Record<string, string>
      idb: { id: string; name: string; type: string; b64: string }[]
      idbError?: string
    }
    if (out.idbError) log.warn('v4 IndexedDB media not read:', out.idbError)
    if (typeof out.raw !== 'string' || !out.raw) return null
    return {
      raw: out.raw,
      extras: out.extras,
      idb: out.idb.map((r) => ({ id: r.id, name: r.name, mime: r.type, read: () => Buffer.from(r.b64, 'base64') }))
    }
  } catch (e) {
    log.warn('could not read v4 localStorage:', String(e))
    return null
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => undefined)
  }
}
