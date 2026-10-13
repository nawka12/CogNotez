// Remote storage contract for Sync v2 (docs/v5/sync-v2.md §10). Names are relative to the sync root:
// "meta.json", "objects/n.<id>.<rev>.<parents>.json|.bin", "media/m.<hash>[.bin]".
// Writers only ever create; remove() exists for GC alone.

/** A round-stopping problem whose message is ready to show as is. Transports throw it for user-facing failures. */
export class SyncError extends Error {}

export interface RemoteEntry {
  name: string
  size: number
}

export interface ListResult {
  /** Names present now (full listing) or added since the cursor (incremental). */
  added: RemoteEntry[]
  /** Names removed since the cursor (incremental only). */
  removed: string[]
  /** Opaque; pass back to list() next time. */
  cursor: string
  /** True when `added` is the complete set (first run, or the transport has no incremental mode). */
  full: boolean
}

export interface Transport {
  readonly kind: 'folder' | 'gdrive' | 'memory'
  /** Human label for the UI: the folder path or the Google account email. */
  describe(): string
  /** Makes sure the root and objects/ + media/ exist. Never deletes anything. */
  ensureRoot(): Promise<void>
  /** null when the file does not exist. */
  read(name: string): Promise<Uint8Array | null>
  /** Create-only. 'exists' when a file with this name is already there (same name = same content). */
  create(name: string, bytes: Uint8Array): Promise<'created' | 'exists'>
  /** cursor null = full listing. */
  list(cursor: string | null): Promise<ListResult>
  /** GC only. A missing file is not an error. */
  remove(name: string): Promise<void>
}
