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
  }
  media: {
    /** Stores bytes content-addressed under userData/media. */
    importBytes(bytes: Uint8Array, mime: string): Promise<MediaRef>
  }
  /** Returns an unsubscribe function. */
  onNotesChanged(cb: (e: NotesChanged) => void): () => void
  /** Main calls this before the window closes; resolve once pending edits are saved (2 s limit). */
  onFlushRequest(cb: () => Promise<void>): () => void
}
