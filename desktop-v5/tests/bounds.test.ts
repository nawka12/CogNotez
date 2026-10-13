import { describe, expect, it } from 'vitest'
import { isVisible, parseWindowState } from '../src/main/bounds'

const screen = { x: 0, y: 0, width: 1920, height: 1080 }
const second = { x: 1920, y: 0, width: 1280, height: 1024 }

describe('window bounds', () => {
  it('accepts a window on a display', () => {
    expect(isVisible({ x: 100, y: 80, width: 1100, height: 760 }, [screen])).toBe(true)
    expect(isVisible({ x: 1900, y: 20, width: 1100, height: 760 }, [screen, second])).toBe(true) // straddles two
  })
  it('rejects a window left on a display that is gone, or only a sliver visible', () => {
    expect(isVisible({ x: 2000, y: 80, width: 1100, height: 760 }, [screen])).toBe(false)
    expect(isVisible({ x: 1850, y: 80, width: 1100, height: 760 }, [screen])).toBe(false)
    expect(isVisible({ x: 100, y: 1050, width: 1100, height: 760 }, [screen])).toBe(false)
    expect(isVisible({ x: 0, y: 0, width: 800, height: 600 }, [])).toBe(false)
  })
  it('parses only well-formed stored state', () => {
    expect(parseWindowState({ x: 1.4, y: 2, width: 900, height: 700, maximized: true })).toEqual({ x: 1, y: 2, width: 900, height: 700, maximized: true })
    expect(parseWindowState({ x: 0, y: 0, width: 900, height: 700 })?.maximized).toBe(false)
    for (const bad of [null, 'x', {}, { x: 0, y: 0, width: 10, height: 700 }, { x: NaN, y: 0, width: 900, height: 700 }, { x: '0', y: 0, width: 900, height: 700 }])
      expect(parseWindowState(bad)).toBeNull()
  })
})
