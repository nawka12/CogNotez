// Builders for revision objects in sync unit tests and fixtures.
import type { NoteRev, Tombstone } from '../src/main/sync/format'

export const NOTE = 'note-0000-aaaa'
export const DEV_A = 'devaaaaaaaa'
export const DEV_B = 'devbbbbbbbb'

/** An edit rev: ms offset, counter, device. */
export const rev = (ms: number, dev = DEV_A, counter = 0): string =>
  `${String(1791860000000 + ms).padStart(13, '0')}-${counter.toString(36).padStart(4, '0')}-${dev}`

export function note(r: string, parents: string[], fields: Partial<NoteRev> = {}): NoteRev {
  const device = r.split('-')[2].split('~')[0]
  return {
    v: 2, id: NOTE, rev: r, parents: [...parents].sort(), device, deviceName: device, deleted: false,
    title: 'Title', body: 'Body', tags: ['a'], pinned: false, archived: false, trashedAt: null,
    createdAt: 1791860000000, updatedAt: 1791860000000 + Number(r.slice(9, 13)),
    locked: false, cipher: null, cipherFormat: null, media: [], conflictOf: null,
    ...fields
  }
}

export const tomb = (r: string, parents: string[]): Tombstone => {
  const device = r.split('-')[2]
  return { v: 2, id: NOTE, rev: r, parents: [...parents].sort(), device, deviceName: device, deleted: true }
}
