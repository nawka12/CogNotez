import { describe, expect, it } from 'vitest'
import { reviewKey } from '../../src/renderer/src/lib/reviewKey'
import { activeTabId, pickVictim } from '../../src/renderer/src/lib/tabs'

const ev = (key: string, over: Partial<Parameters<typeof reviewKey>[0]> = {}) =>
  reviewKey({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, isComposing: false, ...over })

describe('AI review keys', () => {
  it('maps Esc to reject and Mod-Enter to accept', () => {
    expect(ev('Escape')).toBe('reject')
    expect(ev('Enter', { ctrlKey: true })).toBe('accept')
    expect(ev('Enter', { metaKey: true })).toBe('accept')
  })
  it('ignores plain Enter, modified Esc, composition and keys somebody already handled', () => {
    expect(ev('Enter')).toBeNull()
    expect(ev('Escape', { ctrlKey: true })).toBeNull()
    expect(ev('Enter', { ctrlKey: true, shiftKey: true })).toBeNull()
    expect(ev('Escape', { isComposing: true })).toBeNull()
    expect(ev('Escape', { defaultPrevented: true })).toBeNull()
    expect(ev('a', { ctrlKey: true })).toBeNull()
  })
})

describe('tabs', () => {
  it('highlights no tab while Settings is open', () => {
    expect(activeTabId('notes', 'a')).toBe('a')
    expect(activeTabId('settings', 'a')).toBeNull()
  })
  const d = (id: string, unsaved: string | null = null) => ({ id, unsaved })
  it('evicts a tab without unsaved locked text first, never the new or current one', () => {
    const [a, b, c, n] = [d('a', 'typed'), d('b'), d('c', 'typed'), d('n')]
    expect(pickVictim([a, b, c, n], n, 'b')).toBe(a) // b is current, a and c both hold text
    expect(pickVictim([a, b, c, n], n, 'a')).toBe(b)
    expect(pickVictim([a, c, n], n, 'a')).toBe(c)
    expect(pickVictim([a, n], n, 'a')).toBe(a) // nothing else to drop
  })
})
