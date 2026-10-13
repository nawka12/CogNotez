import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangeSet, Text } from '@codemirror/state'
import { mapRange } from '../../src/renderer/src/lib/aiRange'
import { deltaLabel, fitResult, hintKeys, isLocalUrl, parseTags, remoteName, wordDelta } from '../../src/renderer/src/lib/aiText'
import { throttle } from '../../src/renderer/src/lib/throttle'

const start = 'one two three four'
const range = { from: 4, to: 13, original: 'two three' }
/** Applies a change set built against `start` and maps the range through it. */
const run = (spec: { from: number; to?: number; insert?: string }) => {
  const changes = ChangeSet.of(spec, start.length)
  return mapRange(range, changes, Text.of([changes.apply(Text.of([start])).toString()]))
}

describe('range tracking while the Companion works', () => {
  it('shifts the range when text is added before it', () => {
    expect(run({ from: 0, insert: 'zero ' })).toMatchObject({ from: 9, to: 18, changed: false })
  })
  it('keeps the range when text is added after it', () => {
    expect(run({ from: 18, insert: ' five' })).toMatchObject({ from: 4, to: 13, changed: false })
  })
  it('does not grow the range when typing at either edge', () => {
    expect(run({ from: 4, insert: 'X' })).toMatchObject({ from: 5, to: 14, changed: false })
    expect(run({ from: 13, insert: 'X' })).toMatchObject({ from: 4, to: 13, changed: false })
  })
  it('flags an edit inside the range', () => {
    expect(run({ from: 6, insert: 'X' }).changed).toBe(true)
    expect(run({ from: 5, to: 8 }).changed).toBe(true)
  })
  it('flags a deletion that swallows the range', () => {
    const r = run({ from: 0, to: 14 })
    expect(r.changed).toBe(true)
    expect(r.from).toBeLessThanOrEqual(r.to)
  })
  it('never flags an empty range (continue writing)', () => {
    const here = { from: 3, to: 3, original: '' }
    const changes = ChangeSet.of({ from: 0, insert: 'abc' }, start.length)
    expect(mapRange(here, changes, Text.of([changes.apply(Text.of([start])).toString()]))).toMatchObject({ from: 6, to: 6, changed: false })
  })
})

describe('tag suggestions', () => {
  it('reads a JSON array', () => {
    expect(parseTags('["Work", "ideas/new", "to do"]')).toEqual(['Work', 'ideas/new', 'to-do'])
  })
  it('reads a messy list', () => {
    expect(parseTags('Suggested tags:\n1. work\n- #ideas\n* "to do"\nwork,\n  Reading list.')).toEqual(['work', 'ideas', 'to-do', 'Reading-list'])
  })
  it('finds a JSON array inside prose', () => {
    expect(parseTags('Sure! Here are some tags for your note: ["a", "b"]. Hope this helps [1].')).toEqual(['a', 'b'])
  })
  it('skips brackets that are not tag arrays and falls back to commas', () => {
    expect(parseTags('see [1]: alpha, beta')).toEqual(['alpha', 'beta'])
  })
  it('gives nothing for nothing', () => {
    expect(parseTags('')).toEqual([])
  })
})

describe('word delta text', () => {
  it('counts words, not characters', () => {
    expect(wordDelta('a b c d e', 'a b')).toBe(-3)
    expect(wordDelta('a', 'a b c')).toBe(2)
  })
  it('words the delta', () => {
    expect(deltaLabel(-3)).toBe('3 fewer words')
    expect(deltaLabel(-1)).toBe('1 fewer word')
    expect(deltaLabel(2)).toBe('2 more words')
    expect(deltaLabel(1)).toBe('1 more word')
    expect(deltaLabel(0)).toBe('Same word count')
  })
})

describe('hint text', () => {
  it('local, no research', () => expect(hintKeys(false, false)).toEqual(['ai.hint.local']))
  it('remote', () => expect(hintKeys(true, false)).toEqual(['ai.hint.remote']))
  it('local research does not claim nothing leaves the computer', () => expect(hintKeys(false, true)).toEqual(['ai.hint.research']))
  it('remote research says both', () => expect(hintKeys(true, true)).toEqual(['ai.hint.remote', 'ai.hint.research']))
  it('tells local from remote servers', () => {
    expect(isLocalUrl('http://localhost:11434/v1')).toBe(true)
    expect(isLocalUrl('http://127.0.0.1:11999/v1')).toBe(true)
    expect(isLocalUrl('http://[::1]:8080')).toBe(true)
    expect(isLocalUrl('https://openrouter.ai/api/v1')).toBe(false)
    expect(isLocalUrl('http://192.168.1.5:1234')).toBe(false)
    expect(isLocalUrl('not a url')).toBe(false)
    expect(remoteName('openrouter', 'https://openrouter.ai/api/v1')).toBe('OpenRouter')
    expect(remoteName('custom', 'https://llm.example.com/v1')).toBe('llm.example.com')
  })
})

describe('fitting an answer into the note', () => {
  it('keeps the selection\'s own edge whitespace', () => {
    expect(fitResult('rewrite', ' old text\n', '', '\nnew text\n\n')).toBe(' new text\n')
  })
  it('separates a continuation from the word before it', () => {
    expect(fitResult('continue', '', 'The fox', 'jumps over\n')).toBe(' jumps over')
    expect(fitResult('continue', '', 'The fox ', 'jumps')).toBe('jumps')
  })
})

describe('throttle', () => {
  afterEach(() => vi.useRealTimers())
  it('runs at once, then at most once per interval with the latest value', () => {
    vi.useFakeTimers()
    const seen: number[] = []
    const f = throttle((n: number) => seen.push(n), 60)
    f(1)
    f(2)
    f(3)
    expect(seen).toEqual([1])
    vi.advanceTimersByTime(59)
    expect(seen).toEqual([1])
    vi.advanceTimersByTime(1)
    expect(seen).toEqual([1, 3])
    vi.advanceTimersByTime(500)
    f(4)
    expect(seen).toEqual([1, 3, 4])
  })
  it('cancel drops the pending call', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const f = throttle(fn, 60)
    f()
    f()
    f.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
