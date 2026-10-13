/** The tab to highlight: none while Settings covers the notes. */
export const activeTabId = (view: 'notes' | 'settings', currentId: string | null): string | null => (view === 'settings' ? null : currentId)

/** Which tab to drop when the limit is hit: never the new or current one, and prefer one that holds no unsaved locked-note text. */
export function pickVictim<T extends { id: string; unsaved: string | null }>(list: T[], keep: T, currentId: string | null): T {
  const others = list.filter((d) => d !== keep && d.id !== currentId)
  return others.find((d) => d.unsaved === null) ?? others[0] ?? list[0]!
}
