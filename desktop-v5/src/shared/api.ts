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
  /** Set on a conflicted copy created by sync: the id of the note it was split from. */
  conflictOf?: string | null
}

export interface NoteSummary {
  id: string
  title: string
  snippet: string
  updatedAt: number
  pinned: boolean
  locked: boolean
  tags: string[]
  conflictOf?: string | null
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
  /** Only null is accepted: "Keep both" on a conflicted copy. */
  conflictOf?: null
}

export type ListFilter = { kind: 'all' | 'pinned' | 'trash' } | { kind: 'tag'; tag: string }

export const SECRET_NAMES = ['openrouter_api_key', 'ai_api_key', 'google_oauth_tokens', 'google_client_secret', 'sync_dek'] as const
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

export interface UpdateStatus {
  /** 'unsupported': dev runs, and builds that can't update themselves (unsigned macOS, Linux outside an AppImage). */
  state: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error' | 'unsupported'
  /** The newer version, when one is available, downloading or ready. */
  version: string | null
  /** 0..100 while downloading. */
  percent: number | null
  error: string | null
}

export interface AppInfo {
  version: string
  electron: string
  userData: string
}

export type AiProvider = 'ollama' | 'lmstudio' | 'llamacpp' | 'openrouter' | 'custom'

export interface AiConfig {
  provider: AiProvider
  /** OpenAI-compatible base URL, e.g. http://localhost:11434 (Ollama) or https://openrouter.ai/api/v1. */
  baseUrl: string
  model: string
  /** Context window to budget prompts against (and to request from Ollama). */
  contextTokens: number
  /** Empty = research mode unavailable. */
  searxngUrl: string
}

export type AiTaskKind = 'chat' | 'summarize' | 'keyPoints' | 'rewrite' | 'fix' | 'translate' | 'continue' | 'tags'

export interface AiRequest {
  kind: AiTaskKind
  /** Locked notes are refused, even while unlocked. null = no note (chat only). */
  noteId: string | null
  /** The selection, or the whole note when nothing is selected. For chat: the current note text. */
  text: string
  /** Chat message, rewrite instruction, or target language for translate. */
  input?: string
  /** Chat only: search SearXNG first and pass results as untrusted context. Never used for edits. */
  research?: boolean
}

export type AiEvent =
  | { type: 'chunk'; requestId: string; delta: string }
  | { type: 'done'; requestId: string; text: string; model: string }
  | { type: 'error'; requestId: string; error: string; aborted: boolean }

export interface AiMessage {
  id: string
  noteId: string | null
  role: 'user' | 'assistant'
  content: string
  model: string | null
  createdAt: number
}

export interface AiModel {
  id: string
}

export interface AiStatus {
  ok: boolean
  provider: AiProvider
  model: string
  /** True when baseUrl points at this computer (localhost / 127.0.0.1 / ::1). */
  local: boolean
  error?: string
}

export type SyncTransportKind = 'folder' | 'gdrive'

export interface SyncStatus {
  configured: boolean
  transport: SyncTransportKind | null
  /** Folder path or Google account email. */
  target: string | null
  encrypted: boolean
  /** The remote is encrypted and this device has no key yet: call sync.unlock(passphrase). */
  needsPassphrase: boolean
  state: 'off' | 'idle' | 'syncing' | 'error'
  lastSyncAt: number | null
  /** Human-readable, ready to show. */
  lastError: string | null
  /** Notes with conflictOf set. */
  conflicts: number
  deviceName: string
}

export interface SyncSetup {
  transport: SyncTransportKind
  /** Only used when the remote does not exist yet: turns on end-to-end encryption (min 8 chars). */
  passphrase?: string
}

export interface GoogleStatus {
  connected: boolean
  email: string | null
  /** False until a Google OAuth client is available (built in, or imported). */
  clientConfigured: boolean
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
    /**
     * Opens a file dialog in main (paths never come from the renderer). Resolves null on cancel. Takes a v4 JSON backup
     * or a v4 Google Drive sync file (cognotez_sync_backup.json). An encrypted sync file rejects with 'needs passphrase'
     * or 'wrong passphrase'; call again with the passphrase and main re-uses the file picked last, without a dialog.
     */
    fromFile(passphrase?: string): Promise<ImportStats | null>
    /** Imports .md/.txt files picked in a dialog (one note each). Resolves null on cancel. */
    files(): Promise<{ notes: number; skipped: { name: string; reason: string }[] } | null>
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
  /** GitHub Releases via electron-updater. Nothing downloads without download(). */
  updates: {
    status(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    download(): Promise<void>
    /** Quits and installs a downloaded update. */
    install(): Promise<void>
  }
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
  /** All model traffic runs in main; keys stay in main. Results stream through onAiEvent. */
  ai: {
    getConfig(): Promise<AiConfig>
    setConfig(patch: Partial<AiConfig>): Promise<AiConfig>
    models(): Promise<AiModel[]>
    test(): Promise<AiStatus>
    run(req: AiRequest): Promise<{ requestId: string }>
    abort(requestId: string): Promise<void>
    /** Chat history for a note (null = the global thread), oldest first. */
    thread(noteId: string | null): Promise<AiMessage[]>
    clearThread(noteId: string | null): Promise<void>
  }
  onAiEvent(cb: (e: AiEvent) => void): () => void
  sync: {
    status(): Promise<SyncStatus>
    /** Folder: opens a folder picker in main (null on cancel). Drive: needs google.connect() first. */
    setup(setup: SyncSetup): Promise<SyncStatus | null>
    /** Unlocks an encrypted remote on this device. Rejects with 'wrong passphrase'. */
    unlock(passphrase: string): Promise<SyncStatus>
    now(): Promise<SyncStatus>
    /** Forgets the sync location and cached key on this device. Never touches remote data. */
    disable(): Promise<void>
    setDeviceName(name: string): Promise<void>
  }
  google: {
    /** Opens the system browser (loopback redirect, PKCE, state). */
    connect(): Promise<{ email: string }>
    disconnect(): Promise<void>
    status(): Promise<GoogleStatus>
    /** Imports an OAuth "installed app" client JSON (like v4's credentials file) via a dialog in main. */
    importClient(): Promise<boolean>
  }
  onSyncStatus(cb: (s: SyncStatus) => void): () => void
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
