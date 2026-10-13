export type NoteWidth = 'narrow' | 'wide' | 'full'
export const DEFAULT_WIDTH: NoteWidth = 'wide'

/** Max width of the whole note column (padding included), as the CSS length behind --note-max. */
export const WIDTH_CSS: Record<NoteWidth, string> = { narrow: '42rem', wide: '63rem', full: 'none' }
export const NOTE_WIDTHS = Object.keys(WIDTH_CSS) as NoteWidth[]
export const isNoteWidth = (v: unknown): v is NoteWidth => typeof v === 'string' && v in WIDTH_CSS
