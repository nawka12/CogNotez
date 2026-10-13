// Sync v2 transport over Google Drive v3 REST (scope drive.file: only files this app created are visible).
// Layout in My Drive: "CogNotez Sync" / { meta.json, objects/, media/ }, every item tagged appProperties.cognotez = 'sync-v2'.
import { randomBytes } from 'node:crypto'
import { SyncError } from './transport'
import type { ListResult, RemoteEntry, Transport } from './transport'

export const ROOT_NAME = 'CogNotez Sync'
const TAG = 'sync-v2'
const FOLDER = 'application/vnd.google-apps.folder'
const MAX_TRIES = 5

export interface DriveOptions {
  /** `force` asks for a fresh token (after a 401). */
  getAccessToken: (force?: boolean) => Promise<string>
  fetch?: typeof fetch
  /** Default https://www.googleapis.com */
  apiBase?: string
  /** The Google account, for describe(). */
  email?: string
  /** Tests inject a no-op to skip backoff waits. */
  sleep?: (ms: number) => Promise<void>
}

/** Escapes a value for use inside '...' in a Drive query. */
export const q = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

interface DriveFile {
  id: string
  name: string
  size?: string
  createdTime?: string
  parents?: string[]
  trashed?: boolean
}

const TAGGED = `appProperties has { key='cognotez' and value='${TAG}' }`
const FILE_FIELDS = 'id,name,size,createdTime,parents,trashed'

class DriveError extends SyncError {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

function humanError(status: number, body: string): string {
  let message = ''
  let reason = ''
  try {
    const e = (JSON.parse(body) as { error?: { message?: string; errors?: { reason?: string }[] } }).error
    message = e?.message ?? ''
    reason = e?.errors?.[0]?.reason ?? ''
  } catch {
    /* not JSON */
  }
  if (status === 401) return 'Google rejected the sign-in. Reconnect your Google account in Settings.'
  if (reason === 'storageQuotaExceeded') return 'Your Google Drive is full. Free some space and sync again.'
  if (status === 403 && /rateLimit/i.test(reason)) return 'Google Drive is busy. Try again in a minute.'
  if (status === 403) return `Google Drive refused the request${message ? `: ${message}` : ''}. Check that CogNotez may use Drive in your Google account.`
  if (status === 404) return 'A file was not found on Google Drive.'
  if (status === 429) return 'Google Drive is limiting requests. Try again in a minute.'
  if (status >= 500) return `Google Drive is having trouble (HTTP ${status}). Try again in a minute.`
  return `Google Drive error (HTTP ${status})${message ? `: ${message}` : ''}`
}

const retryable = (status: number, body: string): boolean =>
  status === 429 || status >= 500 || (status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(body))

export function createDriveTransport(opts: DriveOptions): Transport {
  const doFetch = opts.fetch ?? fetch
  const base = (opts.apiBase ?? 'https://www.googleapis.com').replace(/\/+$/, '')
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const backoff = (attempt: number): number => Math.min(8000, 400 * 2 ** (attempt - 1)) * (0.5 + Math.random() * 0.5)

  /** One request with auth, a single refresh on 401, and exponential backoff (jittered) on 429 / 5xx / network errors. */
  async function request(url: string, init: { method?: string; headers?: Record<string, string>; body?: Uint8Array | string } = {}): Promise<Response> {
    let refreshed = false
    let force = false
    for (let attempt = 1; ; attempt++) {
      const token = await opts.getAccessToken(force) // its errors are already human-readable
      force = false
      let res: Response
      try {
        res = await doFetch(base + url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } })
      } catch {
        if (attempt >= MAX_TRIES) throw new SyncError('Could not reach Google Drive. Check your internet connection.')
        await sleep(backoff(attempt))
        continue
      }
      if (res.ok) return res
      const body = await res.text().catch(() => '')
      if (res.status === 401 && !refreshed) {
        refreshed = true
        force = true
        attempt-- // refreshing the token is not a retry
        continue
      }
      const failure = new DriveError(humanError(res.status, body), res.status)
      if (!retryable(res.status, body) || attempt >= MAX_TRIES) throw failure
      await sleep(backoff(attempt))
    }
  }

  const json = async <T>(url: string, init?: Parameters<typeof request>[1]): Promise<T> => (await request(url, init)).json() as Promise<T>

  async function find(query: string, fields = FILE_FIELDS): Promise<DriveFile[]> {
    const out: DriveFile[] = []
    let pageToken = ''
    do {
      const p = new URLSearchParams({ q: query, fields: `nextPageToken,files(${fields})`, pageSize: '1000', spaces: 'drive', orderBy: 'createdTime' })
      if (pageToken) p.set('pageToken', pageToken)
      const r = await json<{ files?: DriveFile[]; nextPageToken?: string }>(`/drive/v3/files?${p}`)
      out.push(...(r.files ?? []))
      pageToken = r.nextPageToken ?? ''
    } while (pageToken)
    return out
  }

  /** Oldest first, so concurrent creators converge on the same folder. */
  const byAge = (a: DriveFile, b: DriveFile): number => (a.createdTime ?? '').localeCompare(b.createdTime ?? '') || a.id.localeCompare(b.id)

  async function folder(name: string, parent: string): Promise<string> {
    const query = `mimeType = '${FOLDER}' and name = '${q(name)}' and '${q(parent)}' in parents and trashed = false and ${TAGGED}`
    const existing = (await find(query)).sort(byAge)[0]
    if (existing) return existing.id
    const made = await json<DriveFile>('/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent], appProperties: { cognotez: TAG } })
    })
    // Another device may have created it at the same moment: the oldest wins, the loser removes its own.
    const all = (await find(query)).sort(byAge)
    const winner = all[0]
    if (winner && winner.id !== made.id) {
      await request(`/drive/v3/files/${made.id}`, { method: 'DELETE' }).catch(() => undefined)
      return winner.id
    }
    return made.id
  }

  let ids: { root: string; objects: string; media: string } | null = null
  async function folders(): Promise<{ root: string; objects: string; media: string }> {
    if (ids) return ids
    const root = await folder(ROOT_NAME, 'root')
    const [objects, media] = [await folder('objects', root), await folder('media', root)]
    return (ids = { root, objects, media })
  }

  /** "objects/n.x.json" -> the folder id and the bare file name. "meta.json" lives in the root. */
  async function locate(name: string): Promise<{ parent: string; leaf: string }> {
    const f = await folders()
    const i = name.indexOf('/')
    const dir = i < 0 ? '' : name.slice(0, i)
    const leaf = i < 0 ? name : name.slice(i + 1)
    if (!leaf || leaf.includes('/') || (dir !== '' && dir !== 'objects' && dir !== 'media')) throw new Error(`Invalid sync file name: ${name}`)
    return { parent: dir === 'objects' ? f.objects : dir === 'media' ? f.media : f.root, leaf }
  }

  /** fileId -> remote name. Kept after deletions on purpose: the changes feed will report them as removed later. */
  const names = new Map<string, string>()

  const files = async (name: string): Promise<DriveFile[]> => {
    const { parent, leaf } = await locate(name)
    const found = (await find(`name = '${q(leaf)}' and '${q(parent)}' in parents and trashed = false and ${TAGGED}`)).sort(byAge)
    for (const f of found) names.set(f.id, name)
    return found
  }

  async function fullListing(): Promise<ListResult> {
    const f = await folders()
    // Take the start token first: anything that changes while we list shows up in the next incremental call.
    const { startPageToken } = await json<{ startPageToken: string }>('/drive/v3/changes/startPageToken')
    const seen = new Map<string, RemoteEntry>()
    for (const [dir, id] of [['objects', f.objects], ['media', f.media]] as const) {
      for (const file of await find(`'${q(id)}' in parents and trashed = false and ${TAGGED}`)) {
        const name = `${dir}/${file.name}`
        names.set(file.id, name)
        if (!seen.has(name)) seen.set(name, { name, size: Number(file.size ?? 0) }) // oldest first: duplicates collapse onto it
      }
    }
    return { added: [...seen.values()], removed: [], cursor: startPageToken, full: true }
  }

  interface Change {
    fileId?: string
    removed?: boolean
    file?: DriveFile
  }

  return {
    kind: 'gdrive',
    describe: () => opts.email ?? 'Google Drive',

    async ensureRoot() {
      await folders()
    },

    async read(name) {
      const [file] = await files(name)
      if (!file) return null
      try {
        return new Uint8Array(await (await request(`/drive/v3/files/${file.id}?alt=media`)).arrayBuffer())
      } catch (e) {
        if (e instanceof DriveError && e.status === 404) return null
        throw e
      }
    },

    async create(name, bytes) {
      if ((await files(name)).length) return 'exists'
      const { parent, leaf } = await locate(name)
      const boundary = `cognotez-${randomBytes(12).toString('hex')}`
      const meta = JSON.stringify({ name: leaf, parents: [parent], appProperties: { cognotez: TAG } })
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--`)
      ])
      const made = await json<DriveFile>('/upload/drive/v3/files?uploadType=multipart&fields=id', {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body
      })
      names.set(made.id, name)
      return 'created'
    },

    async list(cursor) {
      if (cursor === null) return fullListing()
      const f = await folders()
      const added = new Map<string, RemoteEntry>()
      const removed = new Set<string>()
      let pageToken = cursor
      let next = cursor
      while (pageToken) {
        const p = new URLSearchParams({
          pageToken,
          pageSize: '1000',
          includeRemoved: 'true',
          spaces: 'drive',
          fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`
        })
        const r = await json<{ changes?: Change[]; nextPageToken?: string; newStartPageToken?: string }>(`/drive/v3/changes?${p}`)
        for (const c of r.changes ?? []) {
          const file = c.file
          const dir = file?.parents?.includes(f.objects) ? 'objects' : file?.parents?.includes(f.media) ? 'media' : null
          if (file && !c.removed && !file.trashed) {
            if (!dir) continue
            const name = `${dir}/${file.name}`
            names.set(file.id, name)
            added.set(name, { name, size: Number(file.size ?? 0) })
          } else {
            const id = c.fileId ?? file?.id
            const name = (id && names.get(id)) || (file && dir ? `${dir}/${file.name}` : undefined)
            // A removal of an id we never saw (e.g. after a restart) could be ours: fall back to a full listing.
            if (!name) {
              if (file && !dir) continue
              return fullListing()
            }
            removed.add(name)
          }
        }
        pageToken = r.nextPageToken ?? ''
        next = r.newStartPageToken ?? r.nextPageToken ?? next
      }
      for (const n of removed) added.delete(n)
      return { added: [...added.values()], removed: [...removed], cursor: next, full: false }
    },

    async remove(name) {
      for (const file of await files(name)) {
        try {
          await request(`/drive/v3/files/${file.id}`, { method: 'DELETE' })
        } catch (e) {
          if (!(e instanceof DriveError && e.status === 404)) throw e
        }
      }
    }
  }
}
