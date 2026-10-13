<script lang="ts">
  import { t } from '../i18n'
  import { parseTagInput } from '../lib/tags'
  import { readingMinutes } from '../lib/text'
  import { relativeTime } from '../lib/time'
  import { addTags, lockNow, removeTag, togglePin, trashNote } from '../state/actions'
  import type { Doc } from '../state/tabs.svelte'
  import { ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  let { doc }: { doc: Doc } = $props()

  const note = $derived(doc.note)
  const trashed = $derived(note.deletedAt !== null)
  let adding = $state(false)
  let draft = $state('')

  function focusOnMount(node: HTMLInputElement): void {
    node.focus()
  }

  function commit(text: string): void {
    const names = parseTagInput(text)
    if (names.length) void addTags(doc, names)
  }
  /** A comma commits what came before it and keeps typing the rest. */
  function oninput(): void {
    const i = draft.lastIndexOf(',')
    if (i < 0) return
    commit(draft.slice(0, i))
    draft = draft.slice(i + 1)
  }
  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit(draft)
      draft = ''
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      draft = ''
      adding = false
    }
  }
  function onblur(): void {
    commit(draft)
    draft = ''
    adding = false
  }
</script>

<div class="meta">
  {#each note.tags as tag (tag)}
    <span class="tagw">
      <button class="tagl" onclick={() => (ui.filter = { kind: 'tag', tag })} title={t('meta.filterTag', { tag })}>#{tag}</button>
      {#if !trashed}
        <button class="tagx" aria-label={t('meta.removeTag', { tag })} onclick={() => void removeTag(doc, tag)}><Icon name="x" /></button>
      {/if}
    </span>
  {/each}
  {#if !trashed}
    {#if adding}
      <input
        class="taginput"
        aria-label={t('meta.tagInput')}
        placeholder={t('meta.tagPlaceholder')}
        bind:value={draft}
        {oninput}
        {onkeydown}
        {onblur}
        use:focusOnMount
      />
    {:else}
      <button class="addtag" aria-label={t('meta.addTag')} onclick={() => (adding = true)}><Icon name="plus" /><span class="lo2">{t('meta.addTag')}</span></button>
    {/if}
  {/if}
  <span class="stats">
    <span class="sep">·</span>
    <span>{t('meta.edited', { time: relativeTime(note.updatedAt, ui.now) })}</span>
    {#if doc.sealed}
      <span class="sep">·</span><span>{t('meta.locked')}</span>
    {:else}
      <span class="sep lo2">·</span><span class="lo2">{t('meta.words', { n: doc.words })}</span>
      <span class="sep lo">·</span><span class="lo">{t('meta.minutes', { n: readingMinutes(doc.words) })}</span>
      {#if note.locked && !trashed}<span class="sep lo2">·</span><span class="lo2">{t('meta.unlocked')}</span>{/if}
    {/if}
  </span>
  {#if note.locked && !trashed && !doc.sealed}
    <button class="btn lock-now" onclick={() => void lockNow(doc)}><Icon name="lock" />{t('meta.lockNow')}</button>
  {/if}
  {#if !trashed}
    <span class="actions">
      <button class="icon-btn" aria-pressed={note.pinned} aria-label={note.pinned ? t('note.unpin') : t('note.pin')} title={note.pinned ? t('note.unpin') : t('note.pin')} onclick={() => void togglePin(doc)}>
        <Icon name="pin" class={note.pinned ? 'on' : ''} />
      </button>
      <button class="icon-btn" aria-label={t('note.trash')} title={t('note.trash')} onclick={() => void trashNote(doc.id)}><Icon name="trash" /></button>
    </span>
  {/if}
</div>

<style>
  .meta {
    container-type: inline-size;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    margin: 0.75rem 0 1.75rem;
    padding-bottom: 1.1rem;
    border-bottom: 1px solid var(--rule);
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .sep {
    opacity: 0.6;
  }
  /* Basis is small so the line shrinks this block before it wraps; whatever still doesn't fit ends in an ellipsis. */
  .stats {
    flex: 1 1 8rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stats > * + * {
    margin-left: 10px;
  }
  /* Narrow column (Companion open): drop the low-priority bits before the line wraps. */
  @container (max-width: 33rem) {
    .lo {
      display: none;
    }
  }
  @container (max-width: 26rem) {
    .lo2 {
      display: none;
    }
  }
  .tagw {
    display: inline-flex;
    align-items: center;
  }
  .tagl {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
  }
  .tagl:hover {
    text-decoration: underline;
  }
  .tagx {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    margin-left: 2px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ink-3);
    opacity: 0;
  }
  .tagw:hover .tagx,
  .tagx:focus-visible {
    opacity: 1;
  }
  .tagx:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .tagx :global(.i) {
    width: 12px;
    height: 12px;
  }
  .addtag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-3);
  }
  .addtag:hover {
    color: var(--ink);
  }
  .addtag :global(.i) {
    width: 13px;
    height: 13px;
  }
  .taginput {
    width: 11rem;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--rule);
    border-radius: 5px;
    background: var(--paper);
  }
  .lock-now {
    height: 24px;
    padding: 0 8px;
    gap: 5px;
  }
  .lock-now :global(.i) {
    width: 13px;
    height: 13px;
  }
  .actions {
    margin-left: auto;
    display: inline-flex;
    gap: 2px;
  }
  .actions .icon-btn {
    width: 28px;
    height: 28px;
  }
  .actions :global(.i.on) {
    fill: currentColor;
    color: var(--accent);
  }
</style>
