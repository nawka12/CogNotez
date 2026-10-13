<script lang="ts">
  import { renderMarkdown } from '../lib/markdown'
  import { throttle } from '../lib/throttle'

  /** An assistant message as sanitized Markdown. While `streaming`, it is re-rendered at most every 60 ms. */
  let { text, streaming = false }: { text: string; streaming?: boolean } = $props()

  let html = $state('')
  const draw = throttle((s: string) => (html = renderMarkdown(s)), 60)

  $effect(() => {
    const s = text
    if (streaming) draw(s)
    else {
      draw.cancel()
      html = renderMarkdown(s)
    }
  })
  $effect(() => () => draw.cancel())
</script>

<div class="prose bubble">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify in renderMarkdown -->
  {@html html}
</div>

<style>
  .bubble {
    font-size: 15px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .bubble :global(p:last-child) {
    margin-bottom: 0;
  }
  .bubble :global(h1),
  .bubble :global(h2),
  .bubble :global(h3) {
    font-size: 1em;
    margin: 1em 0 0.3em;
  }
</style>
