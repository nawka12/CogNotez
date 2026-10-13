// One Sync v2 round (docs/v5/sync-v2.md §7) and remote bootstrap (§4). Electron-free: tests drive it directly.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { sniffMime } from '../media'
import type { Media } from '../media'
import type { Store } from '../store/notes'
import { decryptBlob, encryptBlob, mediaKey, newEnc, parseMeta, serializeMeta } from './crypto'
import type { Meta, Rand } from './crypto'
import {
  aadOf, MAX_MEDIA_BYTES, MAX_OBJECT_BYTES, META_NAME, mediaName, objectName, parseMediaName, parseObject, parseObjectName,
  serialize, sha256hex
} from './format'
import type { ObjectName, RevObject, Tombstone } from './format'
import { buildGraphs, NoteGraph } from './graph'
import { foldHeads } from './merge'
import { createLocal } from './local'
import { SyncError } from './transport'
import type { Transport } from './transport'

export { SyncError }

export const GONE = 'The sync location looks empty or was replaced.'
export const NEEDS_PASSPHRASE = 'This sync location is encrypted. Enter its passphrase on this device.'
export const ORPHAN_DATA = 'This location has CogNotez sync files but no meta.json. Pick the sync folder itself, or restore its meta.json.'

export interface RemoteId {
  created: number
  createdBy: string
}

export const sameRemote = (m: RemoteId, r: RemoteId | null): boolean => !!r && m.created === r.created && m.createdBy === r.createdBy

export interface RoundDeps {
  store: Store
  media: Media
  transport: Transport
  remote: RemoteId
  /** The data key of an encrypted remote; null for a plaintext one. */
  dek: Buffer | null
  deviceName: string
  warn?: (msg: string) => void
  rand?: Rand
}

export interface RoundResult {
  /** Local notes that were created, changed or deleted by this round. */
  changed: string[]
  /** Files this round created on the remote (not counting 'exists'). */
  written: number
  warnings: string[]
}

async function readMeta(t: Transport): Promise<Meta | null> {
  const bytes = await t.read(META_NAME)
  return bytes ? parseMeta(bytes) : null
}

/**
 * Opens or creates the remote for setup. Creates meta.json only when it is provably absent: the read said "no file"
 * AND a successful full listing shows no sync files. `known` is the remote this device synced with at this location
 * before, if any: then a missing meta.json is an error, never a reason to re-create it.
 */
export async function openRemote(
  t: Transport, opts: { known: RemoteId | null; deviceId: string; passphrase?: string; wall?: () => number; rand?: Rand }
): Promise<{ meta: Meta; created: boolean; dek: Buffer | null }> {
  await t.ensureRoot()
  const found = await readMeta(t)
  if (found) return { meta: found, created: false, dek: null }
  if (opts.known) throw new SyncError(GONE)
  const listing = await t.list(null)
  if (listing.added.some((e) => parseObjectName(e.name) || parseMediaName(e.name))) throw new SyncError(ORPHAN_DATA)
  let dek: Buffer | null = null
  let enc: Meta['enc'] = null
  if (opts.passphrase !== undefined) ({ enc, dek } = await newEnc(opts.passphrase, opts.rand))
  const meta: Meta = { format: 2, created: (opts.wall ?? Date.now)(), createdBy: opts.deviceId, enc }
  await t.create(META_NAME, serializeMeta(meta))
  // Re-read: when another device won a bootstrap race, its meta is the one (§4).
  const winner = await readMeta(t)
  if (!winner) throw new SyncError('Could not create the sync location. Try again.')
  if (!sameRemote(winner, meta)) {
    dek?.fill(0)
    return { meta: winner, created: false, dek: null }
  }
  return { meta: winner, created: true, dek }
}

export async function syncRound(d: RoundDeps): Promise<RoundResult> {
  const { store, transport: t, dek } = d
  const local = createLocal(store)
  const warnings: string[] = []
  const warn = (m: string): void => {
    warnings.push(m)
    d.warn?.(m)
  }
  const rand = d.rand ?? randomBytes
  let written = 0

  // 1. Meta. Never bootstraps here: a round only runs against a remote this device already joined.
  const meta = await readMeta(t)
  if (!meta || !sameRemote(meta, d.remote)) throw new SyncError(GONE)
  const enc = meta.enc !== null
  if (enc && !dek) throw new SyncError(NEEDS_PASSPHRASE)
  if (!enc && dek) throw new SyncError(GONE) // the remote we unlocked was encrypted; this one is not

  const known = local.knownNames()
  const createdNames = new Set<string>()
  const put = async (name: string, plain: Uint8Array): Promise<'created' | 'exists'> => {
    const data = dek ? encryptBlob(dek, aadOf(name), plain, rand) : plain
    const r = await t.create(name, data)
    if (r === 'created') written++
    createdNames.add(name)
    return r
  }
  const remoteMediaName = (sha: string): string => mediaName(dek ? mediaKey(dek, sha) : sha, enc)
  const localMediaPath = (sha: string): string => join(d.media.dir, sha)
  const hasLocalMedia = (sha: string): boolean => {
    if (!store.db.prepare('SELECT 1 FROM media WHERE hash = ?').get(sha)) return false
    try {
      return statSync(localMediaPath(sha)).size > 0
    } catch {
      return false
    }
  }

  // 2. Upload local changes first (media before the revisions that use them), then tombstones.
  for (const o of local.dirty(d.deviceName)) {
    const bytes = serialize(o)
    if (bytes.length > MAX_OBJECT_BYTES) {
      warn(`"${o.title || 'Untitled'}" is too large to sync (over 8 MB).`)
      continue
    }
    for (const sha of o.media) {
      const name = remoteMediaName(sha)
      if (known.has(name) || createdNames.has(name)) continue
      if (!hasLocalMedia(sha)) {
        warn(`media ${sha.slice(0, 12)} is missing on this device`)
        continue
      }
      await put(name, readFileSync(localMediaPath(sha)))
    }
    await put(objectName(o.id, o.rev, o.parents, enc), bytes)
    local.markUploaded(o)
  }
  for (const p of local.purged()) {
    const tomb: Tombstone = { v: 2, id: p.id, rev: store.hlc.now(), parents: [p.rev], device: store.deviceId, deviceName: d.deviceName.slice(0, 100), deleted: true }
    await put(objectName(tomb.id, tomb.rev, tomb.parents, enc), serialize(tomb))
    local.markTombstoneUploaded(tomb, p.rev)
  }
  // Step 5 applies a head only to notes unchanged since here, so a note uploaded above takes its merge this round.
  const snap = local.snapshot()

  // 3. List and build the graphs.
  const listing = await t.list(local.cursor())
  const names = listing.full ? new Set<string>() : new Set(known)
  if (!listing.full) for (const n of listing.removed) names.delete(n)
  for (const e of listing.added) names.add(e.name)
  for (const n of createdNames) names.add(n)
  const objects: ObjectName[] = []
  for (const n of names) {
    const p = parseObjectName(n)
    if (p && p.encrypted === enc) objects.push(p) // never read plaintext objects on an encrypted remote
  }
  const graphs = buildGraphs(objects)

  // 5 (clock). The next local rev must be greater than anything seen. Receiving the greatest rev is enough.
  let top = ''
  for (const o of objects) for (const r of [o.rev, ...o.parents]) if (r > top) top = r
  if (top) store.hlc.receive(top)

  const cache = new Map<string, RevObject>()
  const loadByName = async (name: string): Promise<RevObject | null> => {
    const hit = cache.get(name)
    if (hit) return hit
    const parsed = parseObjectName(name)
    const data = await t.read(name) // a transport error aborts the round
    if (!parsed || !data) return null
    try {
      if (data.length > MAX_OBJECT_BYTES + 28) throw new Error('object is over 8 MB')
      const o = parseObject(dek ? decryptBlob(dek, aadOf(name), data) : data, parsed)
      cache.set(name, o)
      return o
    } catch (e) {
      warn(`skipped ${name}: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }
  const loader = (g: NoteGraph) => async (rev: string): Promise<RevObject | null> => {
    const name = g.names.get(rev)
    return name ? loadByName(name) : null
  }

  // 4. Merge notes with several heads. Copies go up before the merge that hides the losing side.
  for (const id of [...graphs.keys()].sort()) {
    const g = graphs.get(id)!
    if (g.heads().length < 2) continue
    const r = await foldHeads(g, loader(g))
    if (!r) {
      warn(`could not merge note ${id} this round (a head is unreadable)`)
      continue
    }
    for (const w of r.writes) {
      const name = objectName(w.id, w.rev, w.parents, enc)
      const result = await put(name, serialize(w))
      let wg = graphs.get(w.id)
      if (!wg) graphs.set(w.id, (wg = new NoteGraph()))
      wg.add(w.rev, w.parents, name)
      // What is on the remote is the truth: when the file already existed, read it back rather than trust ours.
      if (result === 'created') cache.set(name, w)
    }
  }

  // 5. Apply each note's single head, one transaction per note.
  const changed: string[] = []
  for (const id of [...graphs.keys()].sort()) {
    const g = graphs.get(id)!
    const heads = g.heads()
    if (heads.length !== 1) continue
    const head = heads[0]
    const localRev = snap.revs.get(id) ?? null
    const base = snap.bases.get(id) ?? null
    if (head === localRev) {
      if (base !== head) local.adoptBase(id, head)
      continue
    }
    if (localRev === null && head === base) continue
    if (localRev !== null && localRev !== base) continue // edited locally and not uploaded (too large): keep it
    if (localRev !== null && !g.has(localRev)) {
      // The remote no longer has the revision we agreed on (restored or rolled back): upload ours again.
      warn(`the remote lost a revision of note ${id}; re-uploading this device's copy`)
      local.restamp(id, localRev)
      continue
    }
    const name = g.names.get(head)
    const o = name ? await loadByName(name) : null
    if (!o) continue
    if (!o.deleted) {
      for (const sha of o.media) if (!hasLocalMedia(sha)) await download(sha)
    }
    if (local.apply(o, localRev)) changed.push(id)
  }

  // 6. Save the listing and cursor.
  local.saveListing(names, listing.cursor)
  return { changed, written, warnings }

  async function download(sha: string): Promise<void> {
    const data = await t.read(remoteMediaName(sha))
    if (!data) return warn(`media ${sha.slice(0, 12)} is not on the remote yet`)
    let plain: Uint8Array
    try {
      plain = dek ? decryptBlob(dek, aadOf(remoteMediaName(sha)), data) : data
    } catch {
      return warn(`media ${sha.slice(0, 12)} could not be decrypted`)
    }
    if (plain.length > MAX_MEDIA_BYTES || sha256hex(plain) !== sha) return warn(`media ${sha.slice(0, 12)} failed its checksum`)
    d.media.store(plain)
    store.db.prepare('INSERT OR IGNORE INTO media(hash, mime, bytes, created_at) VALUES (?, ?, ?, ?)').run(sha, sniffMime(plain), plain.length, Date.now())
  }
}
