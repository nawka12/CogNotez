// Per-note revision DAG built from file names alone (docs/v5/sync-v2.md §7.3, §8). Pure and deterministic.
import type { ObjectName } from './format'

export class NoteGraph {
  /** Known revs (a file exists) and their parents. A parent that is not a key here is "unknown". */
  readonly parents = new Map<string, string[]>()
  /** rev -> file name. */
  readonly names = new Map<string, string>()

  add(rev: string, parents: readonly string[], name?: string): void {
    // Two names for one rev should never happen; if it does, the union of parents keeps the graph deterministic.
    const cur = this.parents.get(rev)
    this.parents.set(rev, cur ? [...new Set([...cur, ...parents])].sort() : [...parents])
    if (name && (!this.names.has(rev) || name < this.names.get(rev)!)) this.names.set(rev, name)
  }

  /** Known or referenced as a parent. */
  has(rev: string): boolean {
    if (this.parents.has(rev)) return true
    for (const ps of this.parents.values()) if (ps.includes(rev)) return true
    return false
  }

  /** Revs that no other rev names as a parent, sorted ascending. */
  heads(): string[] {
    const named = new Set<string>()
    for (const ps of this.parents.values()) for (const p of ps) named.add(p)
    return [...this.parents.keys()].filter((r) => !named.has(r)).sort()
  }

  /** Strict ancestors, following known edges; unknown parents are included but have no parents of their own. */
  ancestors(rev: string, into = new Set<string>()): Set<string> {
    const stack = [...(this.parents.get(rev) ?? [])]
    while (stack.length) {
      const r = stack.pop()!
      if (into.has(r)) continue
      into.add(r)
      stack.push(...(this.parents.get(r) ?? []))
    }
    return into
  }

  /**
   * Base candidates: the common ancestors (each side counts as its own ancestor) that are not ancestors of another
   * common ancestor, greatest rev first. More than one means a criss-cross; the base is then their virtual merge
   * (merge.ts resolveBase, §8).
   */
  lcaCandidates(a: string, b: string): string[] {
    const A = this.ancestors(a).add(a)
    const B = this.ancestors(b).add(b)
    const common = [...A].filter((r) => B.has(r))
    const dominated = new Set<string>()
    for (const c of common) if (!dominated.has(c)) this.ancestors(c, dominated)
    return common.filter((c) => !dominated.has(c)).sort().reverse()
  }

}

export function buildGraphs(names: Iterable<ObjectName>): Map<string, NoteGraph> {
  const out = new Map<string, NoteGraph>()
  for (const n of names) {
    let g = out.get(n.id)
    if (!g) out.set(n.id, (g = new NoteGraph()))
    g.add(n.rev, n.parents, n.name)
  }
  return out
}
