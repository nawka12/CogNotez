// Hybrid logical clock. Rev format: `${ms(13)}-${counter(base36, 4)}-${deviceId}`.
// Plain string comparison orders revs by (ms, counter, deviceId).

const REV_RE = /^(\d{13})-([0-9a-z]{4})-(.+)$/
const COUNTER_MAX = 36 ** 4 - 1

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
    const w = this.wall()
    if (w > this.ms) {
      this.ms = w
      this.counter = 0
    } else {
      this.counter++
    }
    return this.stamp()
  }

  /** Merge a remote rev (sync) and return a rev that is greater than both it and everything local. */
  receive(remoteRev: string): string {
    const r = parseRev(remoteRev)
    if (!r) throw new Error('invalid rev')
    const w = this.wall()
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
