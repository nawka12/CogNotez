import { Marked } from 'marked'
import DOMPurify from 'dompurify'

/** Links may only go to web pages, mail, our own media store, or a spot on the same page. */
export const ALLOWED_URI_REGEXP = /^(?:https?:|mailto:|cognotez-media:|#)/i

type Purifier = typeof DOMPurify

/** Builds `markdown -> safe HTML`. The purifier is a parameter so tests can hand in a jsdom one. */
export function createRenderer(purify: Purifier): (src: string) => string {
  const md = new Marked({
    gfm: true,
    async: false,
    renderer: {
      // Read-only checkbox: a span, so it keeps full contrast (a disabled <input> greys out).
      checkbox({ checked }: { checked: boolean }) {
        return `<span class="box${checked ? ' done' : ''}" role="checkbox" aria-checked="${checked}" aria-readonly="true">${checked ? '✓' : ''}</span>`
      }
    }
  })

  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href') && !node.getAttribute('href')?.startsWith('#')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener')
    }
    if (node.tagName === 'IMG' && !node.hasAttribute('src')) node.remove()
  })

  return (src) =>
    purify.sanitize(md.parse(src, { async: false }), {
      ALLOWED_URI_REGEXP,
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
      ADD_ATTR: ['target']
    })
}

let render: ((src: string) => string) | undefined
/** Renders with the page's own DOMPurify instance (created on first use). */
export function renderMarkdown(src: string): string {
  render ??= createRenderer(DOMPurify)
  return render(src)
}
