import type { ChangeDesc, Text } from '@codemirror/state'

export interface Tracked {
  from: number
  to: number
  /** The text that was in [from, to) when the request started. */
  original: string
}

/**
 * Follows a range through one transaction. `from` sticks to the text after it and `to` to the text before it, so typing
 * at either edge shifts the range instead of growing it. `changed` is true when the text inside no longer matches
 * what the request was sent with, which means the Companion's answer would land on something else.
 */
export function mapRange(r: Tracked, changes: ChangeDesc, doc: Text): Tracked & { changed: boolean } {
  const from = changes.mapPos(r.from, 1)
  const to = Math.max(from, changes.mapPos(r.to, -1))
  return { ...r, from, to, changed: doc.sliceString(from, to) !== r.original }
}
