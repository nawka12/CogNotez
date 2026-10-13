export interface Filterable {
  group: string
  label: string
  hint?: string
}

/** Every whitespace-separated word of the query must appear in "group label hint". */
export function filterItems<T extends Filterable>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return items
  return items.filter((it) => {
    const hay = `${it.group} ${it.label} ${it.hint ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
