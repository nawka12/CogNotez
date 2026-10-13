<script lang="ts">
  import { t } from '../i18n'
  import { renderMarkdown } from '../lib/markdown'
  import type { Doc } from '../state/tabs.svelte'

  let { doc }: { doc: Doc } = $props()

  let html = $state('')
  let shown: Doc | undefined

  // First render of a doc is immediate; later edits are rendered 150 ms after the last keystroke.
  $effect(() => {
    const d = doc
    void d.rev
    const draw = (): void => {
      shown = d
      html = renderMarkdown(d.cm.doc.toString())
    }
    if (shown !== d) {
      draw()
      return
    }
    const timer = setTimeout(draw, 150)
    return () => clearTimeout(timer)
  })

  /** In-page anchors have nothing to scroll to; everything else is handled by main. */
  function onclick(e: MouseEvent): void {
    const a = (e.target as Element).closest('a')
    if (a?.getAttribute('href')?.startsWith('#')) e.preventDefault()
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<div class="prose" aria-label={t('preview.label')} role="document" {onclick}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify in renderMarkdown -->
  {@html html}
</div>
