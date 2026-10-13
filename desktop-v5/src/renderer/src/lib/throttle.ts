export interface Throttled<A extends unknown[]> {
  (...args: A): void
  /** Drops a pending trailing call. */
  cancel(): void
}

/** Runs `fn` at once, then at most once per `ms`; calls in between collapse into one trailing call with the latest arguments. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): Throttled<A> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: A | null = null
  let last = -Infinity
  const fire = (args: A): void => {
    last = Date.now()
    fn(...args)
  }
  const call = (...args: A): void => {
    const wait = last + ms - Date.now()
    if (wait <= 0 && timer === undefined) return fire(args)
    pending = args
    timer ??= setTimeout(() => {
      timer = undefined
      const a = pending
      pending = null
      if (a) fire(a)
    }, Math.max(0, wait))
  }
  call.cancel = (): void => {
    clearTimeout(timer)
    timer = undefined
    pending = null
  }
  return call
}
