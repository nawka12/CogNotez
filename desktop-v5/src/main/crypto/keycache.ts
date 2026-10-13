// In-memory note keys. Nothing here is ever persisted. Electron-free.
export const IDLE_MS = 5 * 60_000

export interface KeyEntry {
  key: Buffer
  salt: Buffer
  iter: number
  timer: ReturnType<typeof setTimeout>
}

export function createKeyCache(onLocked: (ids: string[]) => void, idleMs = IDLE_MS) {
  const map = new Map<string, KeyEntry>()

  const arm = (id: string): ReturnType<typeof setTimeout> => {
    const timer = setTimeout(() => cache.lock([id]), idleMs)
    timer.unref?.()
    return timer
  }
  const wipe = (id: string): boolean => {
    const e = map.get(id)
    if (!e) return false
    clearTimeout(e.timer)
    e.key.fill(0)
    map.delete(id)
    return true
  }

  const cache = {
    /** Takes ownership of `key` (it is zero-filled when the entry goes away). Restarts the idle timer. */
    set(id: string, key: Buffer, salt: Buffer, iter: number): void {
      wipe(id)
      map.set(id, { key, salt, iter, timer: arm(id) })
    },
    /** Looking a key up counts as activity: it restarts the idle timer. */
    get(id: string): KeyEntry | undefined {
      const e = map.get(id)
      if (e) {
        clearTimeout(e.timer)
        e.timer = arm(id)
      }
      return e
    },
    has: (id: string): boolean => map.has(id),
    /** Drops a key without telling the windows (the caller changed the note itself). */
    forget: wipe,
    /** Zero-fills and drops the keys, then tells the windows which notes were affected. */
    lock(ids: string[]): void {
      const done = ids.filter(wipe)
      if (done.length) onLocked(done)
    },
    lockAll(): void {
      cache.lock([...map.keys()])
    }
  }
  return cache
}

export type KeyCache = ReturnType<typeof createKeyCache>
