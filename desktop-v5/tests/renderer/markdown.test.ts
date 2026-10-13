// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../src/renderer/src/lib/markdown'

const hash = 'a'.repeat(64)

describe('markdown sanitizer', () => {
  it('strips event handlers and srcless images', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n\nhello')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
    expect(html).toContain('hello')
  })
  it('strips javascript: links but keeps the text', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    expect(html).not.toContain('javascript')
    expect(html).toContain('click')
  })
  it('strips scripts and styles', () => {
    const html = renderMarkdown('<script>alert(1)</script><style>*{}</style>ok')
    expect(html).not.toContain('script')
    expect(html).not.toContain('<style')
  })
  it('keeps cognotez-media images', () => {
    expect(renderMarkdown(`![pic](cognotez-media://${hash})`)).toContain(`src="cognotez-media://${hash}"`)
  })
  it('opens web links in a new window, but not in-page anchors', () => {
    const html = renderMarkdown('[a](https://example.com) [b](#top) [c](mailto:x@y.z)')
    expect(html).toMatch(/<a href="https:\/\/example.com" target="_blank" rel="noopener">a<\/a>/)
    expect(html).toContain('<a href="#top">b</a>')
    expect(html).toContain('href="mailto:x@y.z"')
  })
  it('drops other schemes and relative links', () => {
    const html = renderMarkdown('[f](file:///etc/passwd) [d](data:text/html,x) [r](../x)')
    expect(html).not.toMatch(/href=/)
  })
  it('renders headings and read-only task checkboxes', () => {
    const html = renderMarkdown('## Title\n\n- [ ] open\n- [x] done')
    expect(html).toContain('<h2>Title</h2>')
    expect(html).toContain('aria-checked="false"')
    expect(html).toContain('aria-checked="true"')
    expect(html).not.toContain('<input')
  })
})
