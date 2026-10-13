// In-memory transport for tests. One MemoryRemote is the shared "cloud"; each device gets its own view with hooks
// that can delay an operation (to interleave devices or local edits) or throw (to inject a failure).
import type { ListResult, Transport } from './transport'

export type Op = 'ensureRoot' | 'read' | 'create' | 'list' | 'remove'

export interface Hooks {
  /** Runs before the operation touches the remote. Await to interleave; throw to fail the operation. */
  before?: (op: Op, name: string) => Promise<void> | void
  /** Runs after a create decided its result (for counting writes). */
  created?: (name: string, result: 'created' | 'exists') => void
}

export class MemoryRemote {
  readonly files = new Map<string, Uint8Array>()
  /** Append-only change log for incremental listing; the cursor is an index into it. */
  readonly log: { name: string; removed: boolean }[] = []
  /** Count of files created (not 'exists'). */
  writes = 0
  /**
   * false = create behaves like Drive's check-then-upload losing a race: a name that exists still answers 'created',
   * the duplicate is counted and readers keep seeing the first (oldest) file.
   */
  atomicCreate = true
  duplicates = 0
}

export function memoryTransport(remote: MemoryRemote, hooks: Hooks = {}): Transport & { hooks: Hooks } {
  const step = async (op: Op, name: string): Promise<void> => {
    await hooks.before?.(op, name)
  }
  return {
    kind: 'memory',
    hooks,
    describe: () => 'memory',
    async ensureRoot() {
      await step('ensureRoot', '')
    },
    async read(name) {
      await step('read', name)
      const b = remote.files.get(name)
      return b ? new Uint8Array(b) : null
    },
    async create(name, bytes) {
      await step('create', name)
      let r: 'created' | 'exists' = 'exists'
      if (remote.files.has(name) && !remote.atomicCreate) {
        remote.duplicates++
        r = 'created'
      } else if (!remote.files.has(name)) {
        remote.files.set(name, new Uint8Array(bytes))
        remote.log.push({ name, removed: false })
        remote.writes++
        r = 'created'
      }
      hooks.created?.(name, r)
      return r
    },
    async list(cursor): Promise<ListResult> {
      await step('list', '')
      const from = cursor === null ? -1 : Number(cursor)
      if (!Number.isInteger(from) || from < 0 || from > remote.log.length) {
        const added = [...remote.files].map(([name, b]) => ({ name, size: b.length }))
        return { added, removed: [], cursor: String(remote.log.length), full: true }
      }
      const added: { name: string; size: number }[] = []
      const removed: string[] = []
      for (const e of remote.log.slice(from)) {
        const b = remote.files.get(e.name)
        if (e.removed) removed.push(e.name)
        else if (b) added.push({ name: e.name, size: b.length })
      }
      return { added, removed, cursor: String(remote.log.length), full: false }
    },
    async remove(name) {
      await step('remove', name)
      if (remote.files.delete(name)) remote.log.push({ name, removed: true })
    }
  }
}
