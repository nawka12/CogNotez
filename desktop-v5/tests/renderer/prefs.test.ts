import { describe, expect, it } from 'vitest'
import { DEFAULT_WIDTH, NOTE_WIDTHS, WIDTH_CSS, isNoteWidth } from '../../src/renderer/src/lib/noteWidth'

describe('note width', () => {
  it("wide is the default; narrow is today's 42rem column; full has no cap", () => {
    expect(DEFAULT_WIDTH).toBe('wide')
    expect(NOTE_WIDTHS).toEqual(['narrow', 'wide', 'full'])
    expect(WIDTH_CSS).toEqual({ narrow: '42rem', wide: '63rem', full: 'none' })
  })
  it('a stored value that is not a width (junk, null) is rejected, so loadPrefs falls back to the default', () => {
    expect(isNoteWidth('full') && isNoteWidth('narrow')).toBe(true)
    expect(isNoteWidth('huge') || isNoteWidth(null) || isNoteWidth(undefined)).toBe(false)
  })
})
