const words = new Intl.Segmenter(undefined, { granularity: 'word' })

/** Markdown with syntax marks removed, so word counts see only prose. */
export function plainText(md: string): string {
  return md
    .replace(/^ {0,3}(```|~~~).*$/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/[*_`~]/g, '')
}

export function countWords(md: string): number {
  let n = 0
  for (const s of words.segment(plainText(md))) if (s.isWordLike) n++
  return n
}

/** About 230 words per minute, never below one minute. */
export const readingMinutes = (wordCount: number): number => Math.max(1, Math.round(wordCount / 230))
