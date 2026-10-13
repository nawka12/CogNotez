import type { NoteSummary, Tag } from '../../../shared/api'
import { hasTag } from '../lib/tags'
import { ui } from './ui.svelte'

const same = (a: NoteSummary, b: NoteSummary): boolean =>
  a.title === b.title &&
  a.snippet === b.snippet &&
  a.updatedAt === b.updatedAt &&
  a.pinned === b.pinned &&
  a.locked === b.locked &&
  a.tags.length === b.tags.length &&
  a.tags.every((t, i) => t === b.tags[i])

/** Keeps the old object when nothing changed, so an unchanged row never re-renders. */
function reconcile(old: NoteSummary[], next: NoteSummary[]): NoteSummary[] {
  const byId = new Map(old.map((n) => [n.id, n]))
  return next.map((n) => {
    const prev = byId.get(n.id)
    return prev && same(prev, n) ? prev : n
  })
}

/** A cache of main's data: every live note, the trash, and the tag list. */
class Library {
  all = $state.raw<NoteSummary[]>([])
  trash = $state.raw<NoteSummary[]>([])
  tags = $state.raw<Tag[]>([])
  loaded = $state(false)
  /** The notes the sidebar shows for the current filter. */
  get visible(): NoteSummary[] {
    const f = ui.filter
    if (f.kind === 'trash') return this.trash
    if (f.kind === 'pinned') return this.all.filter((n) => n.pinned)
    if (f.kind === 'tag') return this.all.filter((n) => hasTag(n.tags, f.tag))
    return this.all
  }
}
export const library = new Library()

let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined

export async function refresh(): Promise<void> {
  const mine = ++seq
  try {
    const [all, trash, tags] = await Promise.all([
      window.api.notes.list({ kind: 'all' }),
      window.api.notes.list({ kind: 'trash' }),
      window.api.tags.list()
    ])
    if (mine !== seq) return
    library.all = reconcile(library.all, all)
    library.trash = reconcile(library.trash, trash)
    library.tags = tags
    library.loaded = true
  } catch {
    /* keep the old lists; the next change event retries */
  }
}

/** Coalesces bursts of change events into one fetch. */
export function scheduleRefresh(): void {
  clearTimeout(timer)
  timer = setTimeout(() => void refresh(), 80)
}
