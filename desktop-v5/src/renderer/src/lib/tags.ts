const CONTROL = /[\u0000-\u001f\u007f]/ // eslint-disable-line no-control-regex
const MAX_TAG = 100

/** One tag from user text: no leading '#', spaces become '-', slashes tidied. Null if unusable. */
export function cleanTag(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
  return s && s.length <= MAX_TAG && !CONTROL.test(s) ? s : null
}

/** "work, #ideas/new,, a b" -> ['work', 'ideas/new', 'a-b']. De-duplicated case-insensitively. */
export function parseTagInput(text: string): string[] {
  return mergeTags([], text.split(/[,\n]/))
}

/** Adds cleaned names to an existing list, skipping case-insensitive duplicates. */
export function mergeTags(existing: string[], add: string[]): string[] {
  const seen = new Set(existing.map((t) => t.toLowerCase()))
  const out = [...existing]
  for (const raw of add) {
    const t = cleanTag(raw)
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

/** Does a note carrying `noteTags` match filter tag `tag` (the tag itself or anything below it)? */
export function hasTag(noteTags: string[], tag: string): boolean {
  const t = tag.toLowerCase()
  return noteTags.some((x) => {
    const l = x.toLowerCase()
    return l === t || l.startsWith(t + '/')
  })
}

export interface TagRow {
  path: string
  label: string
  depth: number
  count: number
}

/** Flat, depth-indented rows for the tag tree. Parents are implied by 'a/b' and counted with their children. */
export function tagRows(names: string[], notes: { tags: string[] }[]): TagRow[] {
  const paths = new Map<string, string>() // lower -> display
  for (const name of names) {
    const parts = name.split('/')
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/')
      if (!paths.has(p.toLowerCase())) paths.set(p.toLowerCase(), p)
    }
  }
  const counts = new Map<string, number>()
  for (const n of notes) {
    const seen = new Set<string>()
    for (const tag of n.tags) {
      const parts = tag.toLowerCase().split('/')
      for (let i = 1; i <= parts.length; i++) seen.add(parts.slice(0, i).join('/'))
    }
    for (const p of seen) counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  const key = (p: string): string[] => p.toLowerCase().split('/')
  return [...paths.values()]
    .sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
        if (ka[i] !== kb[i]) return ka[i]! < kb[i]! ? -1 : 1
      }
      return ka.length - kb.length
    })
    .map((path) => ({
      path,
      label: path.slice(path.lastIndexOf('/') + 1),
      depth: path.split('/').length - 1,
      count: counts.get(path.toLowerCase()) ?? 0
    }))
}
