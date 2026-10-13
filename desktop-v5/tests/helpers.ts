import { openDb } from '../src/main/store/db'
import { createStore } from '../src/main/store/notes'

export function memStore(wall?: () => number) {
  return createStore(openDb(':memory:'), wall)
}

/** A clock that advances 1s per call so ordering is deterministic. */
export function tickingClock(start = Date.UTC(2026, 0, 15, 12)) {
  let t = start
  return () => (t += 1000)
}
