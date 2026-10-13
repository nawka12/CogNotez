// Hybrid logical clock. Rev format: `${ms(13)}-${counter(base36, 4)}-${deviceId}`.
// Plain string comparison orders revs by (ms, counter, deviceId). See docs/v5/sync-v2.md §2.

const REV_RE = /^(\d{13})-([0-9a-z]{4})-(.+)$/
const COUNTER_MAX = 36 ** 4 - 1
/** Edit revs stay below 9 000 000 000 000 ms (year 2255), so merge-rev carries can never need a 14th digit. */
export const MAX_MS = 8_999_999_999_999
/** How far ahead of the wall clock another device's rev may pull this clock. */
export const MAX_DRIFT_MS = 24 * 60 * 60_000

export interface ParsedRev {
  ms: number
  counter: number
  deviceId: string
}

export function parseRev(rev: string): ParsedRev | null {
  const m = REV_RE.exec(rev)
  return m ? { ms: Number(m[1]), counter: parseInt(m[2], 36), deviceId: m[3] } : null
}

export class Hlc {
  private ms = 0
  private counter = 0

  /** `wall` is injectable so tests can drive the clock backwards. */
  constructor(
    readonly deviceId: string,
    private readonly wall: () => number = Date.now
  ) {}

  /** A new rev for a local event. Strictly greater than any rev returned or received before. */
  now(): string {
    const w = Math.min(this.wall(), MAX_MS)
    if (w > this.ms) {
      this.ms = w
      this.counter = 0
    } else {
      this.counter++
    }
    return this.stamp()
  }

  /**
   * Merge a remote rev (sync) and return a rev that is greater than everything local and than the remote rev, unless
   * that rev is from another device and more than MAX_DRIFT_MS ahead of the wall clock: then it counts as wall +
   * MAX_DRIFT_MS, so one device with a wrong clock can't move every clock forward for good. This device's own revs
   * always count in full, so its revs stay unique (the device id is part of every rev).
   */
  receive(remoteRev: string): string {
    const r = parseRev(remoteRev)
    if (!r) throw new Error('invalid rev')
    const w = Math.min(this.wall(), MAX_MS)
    const cap = r.deviceId === this.deviceId ? MAX_MS : Math.min(w + MAX_DRIFT_MS, MAX_MS)
    if (r.ms > cap) {
      r.ms = cap
      r.counter = 0
    }
    const ms = Math.max(this.ms, r.ms, w)
    let counter = 0
    if (ms === this.ms && ms === r.ms) counter = Math.max(this.counter, r.counter) + 1
    else if (ms === this.ms) counter = this.counter + 1
    else if (ms === r.ms) counter = r.counter + 1
    this.ms = ms
    this.counter = counter
    return this.stamp()
  }

  private stamp(): string {
    if (this.counter > COUNTER_MAX) {
      this.ms++
      this.counter = 0
    }
    return `${this.ms.toString().padStart(13, '0')}-${this.counter.toString(36).padStart(4, '0')}-${this.deviceId}`
  }
}
