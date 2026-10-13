// Bridge contract between preload (window.api) and main. Types only; no runtime imports.

export interface Note {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  pinned: boolean
  locked: boolean
  /** True while a locked note's key is held in main memory (body is then plaintext). */
  unlocked?: boolean
  tags: string[]
}

export interface NoteSummary {
  id: string
  title: string
  snippet: string
  updatedAt: number
  pinned: boolean
  locked: boolean
  tags: string[]
}

export interface Tag {
  name: string
  count: number
}

export interface NoteInput {
  title?: string
  body?: string
  tags?: string[]
}

export interface NotePatch extends NoteInput {
  id: string
  pinned?: boolean
}

export type ListFilter = { kind: 'all' | 'pinned' | 'trash' } | { kind: 'tag'; tag: string }

export const SECRET_NAMES = ['openrouter_api_key', 'google_oauth_tokens', 'sync_dek'] as const
export type SecretName = (typeof SECRET_NAMES)[number]

export interface SecretsStatus {
  backend: string
  secure: boolean
}

export type ImportSourceKind = 'localStorage' | 'json'

export interface ImportSource {
  kind: ImportSourceKind
  notes: number
  newestUpdatedAt: number | null
}

export interface ImportStats {
  notes: number
  tags: number
  media: number
  mediaMissing: number
  locked: number
  lockedWithoutCipher: number
  conversations: number
  skippedExisting: number
  warnings: string[]
}

export interface ImportDetect {
  found: boolean
  sources: ImportSource[]
  alreadyImported: { at: number; stats: ImportStats } | null
}

export interface MediaRef {
  hash: string
  /** Put this in Markdown, e.g. `![](cognotez-media://<sha256>)`. */
  url: string
}

export interface BackupInfo {
  id: string
  createdAt: number
  bytes: number
  auto: boolean
}

export type ExportFormat = 'md' | 'txt' | 'pdf'

export interface AppInfo {
  version: string
  electron: string
  userData: string
}

export interface NotesChanged {
  ids: string[]
}

/** Every method returns a promise that rejects on invalid input or a forbidden sender. */
export interface Api {
  notes: {
    list(filter: ListFilter): Promise<NoteSummary[]>
    get(id: string): Promise<Note>
    create(input?: NoteInput): Promise<Note>
    save(patch: NotePatch): Promise<Note>
    trash(id: string): Promise<void>
    restore(id: string): Promise<void>
    deleteForever(id: string): Promise<void>
  }
  tags: { list(): Promise<Tag[]> }
  search(q: string): Promise<NoteSummary[]>
  settings: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
  }
  /** Write-only: secret values never come back to the renderer. */
  secrets: {
    set(name: SecretName, value: string): Promise<void>
    has(name: SecretName): Promise<boolean>
    delete(name: SecretName): Promise<void>
    status(): Promise<SecretsStatus>
  }
  /** One-way import from CogNotez 4. v4's own files are only ever read, from a temp copy. */
  importer: {
    detectV4(): Promise<ImportDetect>
    runV4(source?: ImportSourceKind | 'auto'): Promise<ImportStats>
    /** Opens a file dialog in main (paths never come from the renderer). Resolves null on cancel. */
    fromFile(): Promise<ImportStats | null>
    /** Imports .md/.txt files picked in a dialog (one note each). Resolves null on cancel. */
    files(): Promise<{ notes: number } | null>
  }
  /** Passwords never leave main except as the argument here; keys live only in main memory. */
  locks: {
    /** Decrypts and keeps the key in memory until lock() or the idle timeout (5 min). */
    unlock(id: string, password: string): Promise<Note>
    lock(id: string): Promise<void>
    /** Encrypts a plain note, or re-keys an unlocked one. */
    setPassword(id: string, password: string): Promise<void>
    /** Decrypts permanently. The note must be unlocked. */
    removeLock(id: string): Promise<Note>
  }
  backups: {
    list(): Promise<BackupInfo[]>
    create(): Promise<BackupInfo>
    /** Replaces the current database with this backup, then relaunches. */
    restore(id: string): Promise<void>
    /** Opens the backups folder in the system file manager. */
    reveal(): Promise<void>
  }
  exporter: {
    /** Save dialog in main. Resolves the written path, or null on cancel. */
    note(id: string, format: ExportFormat): Promise<string | null>
    /** Writes every note as Markdown, plus media, into a folder the user picks. */
    allMarkdown(): Promise<string | null>
  }
  app: { info(): Promise<AppInfo> }
  media: {
    /** Stores bytes content-addressed under userData/media. */
    importBytes(bytes: Uint8Array, mime: string): Promise<MediaRef>
  }
  /** Returns an unsubscribe function. */
  onNotesChanged(cb: (e: NotesChanged) => void): () => void
  /** Fires when main forgets keys (idle auto-lock or lock()); reload those notes. */
  onLocksChanged(cb: (e: NotesChanged) => void): () => void
  /** Main calls this before the window closes; resolve once pending edits are saved (2 s limit). */
  onFlushRequest(cb: () => Promise<void>): () => void
}
