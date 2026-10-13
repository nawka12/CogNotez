// CogNotez 4 -> 5 mapping. Electron-free: the caller supplies the parsed v4 database blob and the media
// files, this module validates them (they are untrusted) and writes everything in ONE transaction.
//
// v4 formats this code relies on (desktop/src/js/database.js, app.js, encryption.js, rich-media.js):
//
//  DB blob (localStorage['cognotez_data'], also cognotez_data.json and v4 backup files):
//    { notes:{[id]:Note}, tags:{[id]:{id,name,color,created_at}}, note_tags:{['<noteId>_<tagId>']:{note_id,tag_id}},
//      ai_conversations:{[id]:{id,note_id|null,user_message,ai_response,context,action_type,created_at}},
//      settings:{[key]:{value,updated_at}}, encryption:{...passphrase...}, sync:{...}, metadata:{...} }
//  Note: { id, title, content, preview, tags:[tagId], is_archived, pinned, created_at, updated_at (ISO strings),
//          password_protected, password_hash, encrypted_content, ... }
//    note.tags holds TAG IDS (names come from blob.tags). Archived notes are hidden in v4, never trashed.
//  Password-protected note: content/preview are '' on disk; `encrypted_content` is a JSON STRING of the envelope
//    { v:1, alg:'AES-256-GCM', kdf:'PBKDF2-SHA256', iter, salt(b64), iv(b64), ct(b64), tag(b64) }.
//    key = PBKDF2-SHA256(password, salt, iter, 32 bytes); plaintext = JSON {content}. The GCM tag authenticates the
//    password, so `password_hash` ({hashBase64,saltBase64,iterations}, only a pre-check) is not needed and not imported.
//    Titles are NOT encrypted. We store the envelope string's UTF-8 bytes in notes.cipher with cipher_format 'v4'.
//    Decrypted content still holds `cognotez-media://<v4 id>` refs; `import.v4_media_map` maps them to hashes.
//  Media: file `<userData>/media/<id>.<ext>` (id = base36), or an IndexedDB record in db 'CogNotezMedia',
//    store 'media' (keyPath 'id'; {id,name,type,size,data:ArrayBuffer}). Bodies reference `cognotez-media://<id>`
//    inside markdown images or <img>/<video>/<audio> src. Attachments live in settings.note_attachments.value
//    = { [noteId]: [{id,name,type,...}] }.
//  Settings also live in plain localStorage keys (theme, language, ai_backend, ollama_*, openrouter_*, searxng_*).
//  Custom templates: settings.custom_templates.value.
import { createHash } from 'node:crypto'
import type { ImportSourceKind, ImportStats } from '../../shared/api'
import * as g from '../guards'
import { sniffMime } from '../media'
import type { Media } from '../media'
import type { Secrets } from '../secrets'
import { tx } from '../store/db'
import type { BulkMedia, BulkMessage, BulkNote } from '../store/bulk'
import type { Store } from '../store/notes'

export interface V4MediaFile {
  /** File name without the last extension (v4 reference id). */
  id: string
  name: string
  /** Declared type (IndexedDB records), a hint after magic bytes. */
  mime?: string
  /** Returns null when the file cannot be read. */
  read(): Uint8Array | null
}

export interface V4Input {
  kind: ImportSourceKind
  /** Parsed object or JSON text. */
  blob: unknown
  /** Plain localStorage keys (theme, ai_backend, ...). */
  extras?: Record<string, string>
  files: V4MediaFile[]
}

export interface V4Result {
  stats: ImportStats
  ids: string[]
  openrouterKeyImported: boolean
}

type Obj = Record<string, unknown>

const SECRET_KEY_RE = /key|token|secret|passphrase|password/i
const MEDIA_RE = /cognotez-media:\/\/([A-Za-z0-9_-]+(?:\.(?:png|jpe?g|gif|webp|avif|svg|bmp|mp4|m4v|webm|mov|mp3|ogg|wav|m4a|pdf))?)/gi
const MAX_WARNINGS = 200
const MAX_SETTING_BYTES = 64 * 1024
const MAX_TEMPLATES_BYTES = 2 * 1024 * 1024

const asObj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null)
const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex')
const isStr = (v: unknown): v is string => typeof v === 'string'

function toMs(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v)
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) && t > 0 ? t : null
  }
  return null
}

function validId(s: string): boolean {
  try {
    g.id(s)
    return true
  } catch {
    return false
  }
}

/** Returns the v4 database object, or null if `raw` is not one. Also accepts the Drive sync wrapper `{data: blob}`. */
export function normalizeBlob(raw: unknown): Obj | null {
  let v = raw
  if (isStr(v)) {
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  let o = asObj(v)
  if (o && !asObj(o.notes) && asObj(o.data)) o = asObj(o.data)
  return o && asObj(o.notes) ? o : null
}

/** Note count and newest update time, for `detectV4`. */
export function inspectBlob(raw: unknown): { notes: number; newestUpdatedAt: number | null } | null {
  const blob = normalizeBlob(raw)
  if (!blob) return null
  let notes = 0
  let newest: number | null = null
  for (const n of Object.values(asObj(blob.notes) ?? {})) {
    const o = asObj(n)
    if (!o) continue
    notes++
    const t = toMs(o.updated_at) ?? toMs(o.modified)
    if (t !== null && (newest === null || t > newest)) newest = t
  }
  return { notes, newestUpdatedAt: newest }
}

export function importV4(
  store: Store,
  secrets: Pick<Secrets, 'has' | 'set'>,
  media: Pick<Media, 'store'>,
  input: V4Input,
  now: () => number = Date.now
): V4Result {
  const blob = normalizeBlob(input.blob)
  if (!blob) throw new Error('this is not a CogNotez 4 database')

  const warnings: string[] = []
  let extraWarnings = 0
  const warn = (m: string): void => {
    if (warnings.length < MAX_WARNINGS) warnings.push(m)
    else extraWarnings++
  }
  const t0 = now()

  // ---- media files: hash, copy to <userData>/media/<sha256>, remember how v4 ids map to hashes ----------
  const mediaRows = new Map<string, BulkMedia>()
  const byName = new Map<string, string>()
  const byId = new Map<string, string>()
  for (const f of input.files) {
    let bytes: Uint8Array | null = null
    try {
      bytes = f.read()
    } catch {
      /* reported below */
    }
    if (!bytes || bytes.length === 0) {
      warn(`media file ${f.id} is empty or unreadable`)
      continue
    }
    try {
      const hash = media.store(bytes)
      if (!mediaRows.has(hash)) {
        mediaRows.set(hash, { hash, mime: sniffMime(bytes, f.name, f.mime), bytes: bytes.length, createdAt: t0 })
      }
      if (!byName.has(f.name)) byName.set(f.name, hash)
      if (!byId.has(f.id)) byId.set(f.id, hash)
    } catch {
      warn(`media file ${f.id} could not be copied`)
    }
  }
  const resolve = (ref: string): string | undefined =>
    byName.get(ref) ?? byId.get(ref) ?? byId.get(ref.replace(/\.[A-Za-z0-9]+$/, ''))
  const missing = new Set<string>()
  const noteMissing = (ref: string): void => {
    if (!missing.has(ref)) {
      missing.add(ref)
      warn(`media ${ref} is referenced but missing; the reference was left unchanged`)
    }
  }

  // ---- settings (also needed for attachments) ---------------------------------------------------------
  const dbSettings = asObj(blob.settings) ?? {}
  const settingValue = (key: string): unknown => {
    const s = asObj(dbSettings[key])
    return s && 'value' in s ? s.value : s ? undefined : dbSettings[key]
  }

  // ---- tags -------------------------------------------------------------------------------------------
  const tagNameById = new Map<string, string>()
  for (const [key, raw] of Object.entries(asObj(blob.tags) ?? {})) {
    const t = asObj(raw)
    if (t && isStr(t.name)) tagNameById.set(isStr(t.id) ? t.id : key, t.name)
  }
  const linkTags = new Map<string, string[]>()
  for (const raw of Object.values(asObj(blob.note_tags) ?? {})) {
    const l = asObj(raw)
    if (!l || !isStr(l.note_id) || !isStr(l.tag_id)) continue
    const arr = linkTags.get(l.note_id) ?? []
    arr.push(l.tag_id)
    linkTags.set(l.note_id, arr)
  }
  /** v4 normally stores tag ids; an unknown value that does not look like a generated id is treated as a name. */
  const tagNameOf = (t: string): string | null => tagNameById.get(t) ?? (/^[a-z0-9]{12,}$/.test(t) ? null : t)

  // ---- notes ------------------------------------------------------------------------------------------
  const idMap = new Map<string, string>()
  const noteHashes = new Map<string, Set<string>>()
  const notes: BulkNote[] = []
  const usedIds = new Set<string>()
  let index = 0
  for (const [key, raw] of Object.entries(asObj(blob.notes) ?? {})) {
    index++
    const n = asObj(raw)
    if (!n) {
      warn(`note #${index} skipped: not an object`)
      continue
    }
    const v4id = isStr(n.id) && n.id ? n.id : typeof n.id === 'number' ? String(n.id) : key
    if (!v4id) {
      warn(`note #${index} skipped: no id`)
      continue
    }
    const id = validId(v4id) ? v4id : `v4-${sha256Hex(v4id).slice(0, 32)}`
    if (idMap.has(v4id) || usedIds.has(id)) {
      warn(`note #${index} skipped: duplicate id`)
      continue
    }
    if (n.title !== undefined && !isStr(n.title)) warn(`note #${index}: title is not text; imported untitled`)
    if (n.content !== undefined && !isStr(n.content)) warn(`note #${index}: content is not text; imported empty`)
    let title = isStr(n.title) ? n.title : ''
    let body = isStr(n.content) ? n.content : ''
    if (title.length > g.LIMITS.title) {
      title = title.slice(0, g.LIMITS.title)
      warn(`note #${index}: title truncated`)
    }

    const created = toMs(n.created_at) ?? toMs(n.created)
    const updated = toMs(n.updated_at) ?? toMs(n.modified)
    const createdAt = created ?? updated ?? t0
    const updatedAt = updated ?? created ?? t0

    // tags: note.tags[] union note_tags, dedupe case-insensitively, validate like guards.tagName
    const wanted = [...(Array.isArray(n.tags) ? n.tags.filter(isStr) : []), ...(linkTags.get(v4id) ?? [])]
    const seen = new Map<string, string>()
    let dropped = 0
    for (const t of wanted) {
      const name = tagNameOf(t)
      let ok: string | null = null
      if (name !== null) {
        try {
          ok = g.tagName(name)
        } catch {
          /* counted below */
        }
      }
      if (ok === null) dropped++
      else if (!seen.has(ok.toLowerCase())) seen.set(ok.toLowerCase(), ok)
    }
    if (dropped) warn(`note #${index}: dropped ${dropped} invalid tag(s)`)
    const tags = [...seen.values()]

    const hashes = new Set<string>()
    let cipher: Uint8Array | null = null
    if (n.password_protected === true || n.password_protected === 1) {
      const enc = n.encrypted_content
      const text = isStr(enc) ? enc : asObj(enc) ? JSON.stringify(enc) : ''
      if (text) {
        // Never copy plaintext content/preview of a protected note.
        cipher = Buffer.from(text, 'utf8')
        body = ''
        let env: Obj | null = null
        try {
          env = asObj(JSON.parse(text))
        } catch {
          /* checked below */
        }
        if (!env || env.v !== 1 || env.alg !== 'AES-256-GCM') warn(`note #${index}: locked note has an unrecognised cipher format; kept as is`)
      } else {
        tags.push('imported/was-locked')
        warn(`note #${index}: was password-protected but has no ciphertext; imported unlocked`)
      }
    }
    if (body.length > g.LIMITS.body) {
      body = body.slice(0, g.LIMITS.body)
      warn(`note #${index}: body truncated`)
    }
    if (!cipher) {
      body = body.replace(MEDIA_RE, (m, ref: string) => {
        if (/^[0-9a-f]{64}$/.test(ref)) return m
        const h = resolve(ref)
        if (!h) {
          noteMissing(ref)
          return m
        }
        hashes.add(h)
        return `cognotez-media://${h}`
      })
    }

    idMap.set(v4id, id)
    usedIds.add(id)
    noteHashes.set(id, hashes)
    notes.push({
      id, title, body, createdAt, updatedAt,
      pinned: n.pinned === true || n.pinned === 1,
      archived: n.is_archived === true || n.is_archived === 1,
      cipher,
      cipherFormat: cipher ? 'v4' : null,
      tags,
      media: []
    })
  }

  // attachments are not referenced from the body; they link through settings.note_attachments
  for (const [v4note, list] of Object.entries(asObj(settingValue('note_attachments')) ?? {})) {
    const id = idMap.get(v4note)
    if (!id || !Array.isArray(list)) continue
    for (const a of list) {
      const att = asObj(a)
      if (!att || !isStr(att.id)) continue
      const h = resolve(att.id)
      if (h) noteHashes.get(id)?.add(h)
      else noteMissing(att.id)
    }
  }
  for (const n of notes) n.media = [...(noteHashes.get(n.id) ?? [])]

  // ---- AI conversations: one user + one assistant row each; v4's full-note `context` is dropped --------
  const messages: BulkMessage[] = []
  const convOf = new Map<string, string>() // first message id -> conversation (for counting)
  let convIndex = 0
  for (const [key, raw] of Object.entries(asObj(blob.ai_conversations) ?? {})) {
    convIndex++
    const c = asObj(raw)
    if (!c || (!isStr(c.user_message) && !isStr(c.ai_response))) {
      warn(`conversation #${convIndex} skipped: malformed`)
      continue
    }
    let noteId: string | null = null
    if (isStr(c.note_id) && c.note_id) {
      noteId = idMap.get(c.note_id) ?? null
      if (!noteId) continue // belongs to a note that is not being imported
    }
    const cid = isStr(c.id) && c.id ? c.id : key
    const at = toMs(c.created_at) ?? toMs(c.created) ?? t0
    const model = isStr(c.model) && c.model ? c.model.slice(0, 200) : null
    const threadId = `v4-${noteId ?? 'global'}`
    const clip = (s: string): string => s.slice(0, g.LIMITS.body)
    if (isStr(c.user_message) && c.user_message) {
      const mid = `v4:${cid}:u`
      messages.push({ id: mid, noteId, threadId, role: 'user', content: clip(c.user_message), model: null, createdAt: at })
      convOf.set(mid, cid)
    }
    if (isStr(c.ai_response) && c.ai_response) {
      const mid = `v4:${cid}:a`
      messages.push({ id: mid, noteId, threadId, role: 'assistant', content: clip(c.ai_response), model, createdAt: at + 1 })
      if (!convOf.has(`v4:${cid}:u`)) convOf.set(mid, cid)
    }
  }

  // ---- settings: non-secret only -----------------------------------------------------------------------
  const v4Settings: Obj = Object.create(null) as Obj
  const addSetting = (k: string, v: unknown): void => {
    if (SECRET_KEY_RE.test(k) || k === 'note_attachments' || k === 'custom_templates' || k in v4Settings) return
    let size = 0
    try {
      size = JSON.stringify(v)?.length ?? 0
    } catch {
      /* dropped below */
    }
    if (size === 0 || size > MAX_SETTING_BYTES) {
      warn(`setting ${k} skipped: not serialisable or too large`)
      return
    }
    v4Settings[k] = v
  }
  for (const k of Object.keys(dbSettings)) addSetting(k, settingValue(k))
  for (const [k, v] of Object.entries(input.extras ?? {})) if (isStr(v)) addSetting(k, v)
  const templates = settingValue('custom_templates')

  const extraKey = input.extras?.['openrouter_api_key']
  const keyCandidate = settingValue('openrouter_api_key') ?? extraKey
  let openrouterKey: string | null = null
  if (isStr(keyCandidate) && keyCandidate.trim()) {
    try {
      openrouterKey = g.secretValue(keyCandidate.trim())
    } catch {
      warn('OpenRouter key skipped: invalid')
    }
  }

  // ---- write: one transaction -------------------------------------------------------------------------
  const batch = { notes, media: [...mediaRows.values()], messages }
  const hasLocked = notes.some((n) => n.cipher)
  const result = tx(store.db, () => {
    const r = store.bulk.insert(batch)
    const inserted = new Set(r.insertedIds)
    const insertedMsgs = new Set(r.insertedMessageIds)
    const sub = notes.filter((n) => inserted.has(n.id))
    if (extraWarnings) warnings.push(`... and ${extraWarnings} more warnings`)
    const stats: ImportStats = {
      notes: r.insertedIds.length,
      tags: r.tags,
      media: mediaRows.size,
      mediaMissing: missing.size,
      locked: sub.filter((n) => n.cipher).length,
      lockedWithoutCipher: sub.filter((n) => n.tags.includes('imported/was-locked')).length,
      conversations: [...convOf.entries()].filter(([mid]) => insertedMsgs.has(mid)).length,
      skippedExisting: r.skippedExisting,
      warnings
    }
    const settings: Record<string, unknown> = { 'import.v4_settings': v4Settings }
    if (templates !== undefined && (JSON.stringify(templates)?.length ?? Infinity) <= MAX_TEMPLATES_BYTES) settings['import.v4_templates'] = templates
    if (hasLocked) {
      const map: Record<string, string> = Object.create(null) as Record<string, string>
      for (const [k, h] of byId) map[k] = h
      settings['import.v4_media_map'] = map
    }
    // A re-run that adds nothing keeps the first run's record, which is the one worth showing.
    if (stats.notes > 0 || store.settings.get('import.v4') === null) {
      settings['import.v4'] = { at: now(), source: input.kind, stats }
    }
    store.bulk.putSettings(settings)
    return { r, stats }
  })

  let openrouterKeyImported = false
  if (openrouterKey && !secrets.has('openrouter_api_key')) {
    try {
      secrets.set('openrouter_api_key', openrouterKey)
      openrouterKeyImported = true
    } catch {
      result.stats.warnings.push('OpenRouter key not imported: secure storage is unavailable')
    }
  }
  return { stats: result.stats, ids: result.r.insertedIds, openrouterKeyImported }
}
