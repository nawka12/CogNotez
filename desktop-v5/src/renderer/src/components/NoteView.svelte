<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '../i18n'
  import { setTitle } from '../state/tabs.svelte'
  import type { Doc } from '../state/tabs.svelte'
  import { ui } from '../state/ui.svelte'
  import Editor from './Editor.svelte'
  import LockedPanel from './LockedPanel.svelte'
  import MetaLine from './MetaLine.svelte'
  import Preview from './Preview.svelte'
  import TrashBanner from './TrashBanner.svelte'

  let { doc }: { doc: Doc } = $props()

  let scroller: HTMLDivElement
  let titleEl: HTMLInputElement
  let lastDoc: Doc | undefined
  let restoring = false

  const trashed = $derived(doc.note.deletedAt !== null)
  const sealed = $derived(doc.sealed)
  const mode = $derived(doc.readOnly ? 'preview' : ui.mode)
  const split = $derived(mode === 'split')

  // Each tab remembers its scroll position. CodeMirror lays out lazily, so re-apply for two frames.
  $effect(() => {
    const d = doc
    untrack(() => {
      if (lastDoc === d) return
      lastDoc = d
      restoring = true
      const apply = (): void => {
        scroller.scrollTop = d.scroll
      }
      apply()
      requestAnimationFrame(() => {
        apply()
        requestAnimationFrame(() => {
          apply()
          restoring = false
        })
      })
    })
  })

  let seenFocus = ui.titleFocus
  $effect(() => {
    if (ui.titleFocus !== seenFocus) {
      seenFocus = ui.titleFocus
      untrack(() => titleEl.focus())
    }
  })

  function onTitleKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return
    e.preventDefault()
    doc.view?.focus()
  }
</script>

<div class="scroll" bind:this={scroller} onscroll={() => !restoring && (doc.scroll = scroller.scrollTop)}>
  <article class="canvas" class:split>
    {#if trashed}<TrashBanner {doc} />{/if}
    <input
      class="title"
      bind:this={titleEl}
      value={doc.title}
      readonly={doc.readOnly}
      maxlength="1000"
      spellcheck="false"
      aria-label={t('title.label')}
      placeholder={t('untitled')}
      oninput={(e) => setTitle(doc, e.currentTarget.value)}
      onkeydown={onTitleKey}
    />
    <MetaLine {doc} />
    {#if sealed}
      <LockedPanel {doc} />
    {:else}
      <div class="panes" class:split>
        {#if mode !== 'preview'}<Editor {doc} />{/if}
        {#if mode !== 'edit'}
          <div class="pane-preview" class:alone={mode === 'preview'}><Preview {doc} /></div>
        {/if}
      </div>
    {/if}
  </article>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .canvas {
    max-width: 42rem;
    margin: 0 auto;
    padding: 3rem 3.5rem 6rem;
  }
  .canvas.split {
    max-width: 78rem;
  }
  .title {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--ink);
    font: 500 clamp(1.75rem, 1.3rem + 1.5vw, 2.45rem) / 1.14 var(--display);
    letter-spacing: -0.012em;
    text-overflow: ellipsis;
  }
  .title::placeholder {
    color: var(--ink-3);
    opacity: 1;
  }
  .panes.split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 3rem;
  }
  .panes.split .pane-preview {
    border-left: 1px solid var(--rule);
    padding-left: 3rem;
  }
  @media (max-width: 900px) {
    .panes.split {
      grid-template-columns: minmax(0, 1fr);
    }
    .panes.split .pane-preview {
      border-left: 0;
      padding-left: 0;
      border-top: 1px solid var(--rule);
      padding-top: 2rem;
    }
  }
  @media (max-width: 760px) {
    .canvas {
      padding: 1.75rem 1.25rem 4rem;
    }
  }
</style>
