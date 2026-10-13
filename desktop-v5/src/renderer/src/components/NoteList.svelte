<script lang="ts">
  import type { NoteSummary } from '../../../shared/api'
  import { t } from '../i18n'
  import { relativeTime } from '../lib/time'
  import { ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  let {
    notes,
    currentId,
    empty,
    onopen
  }: { notes: NoteSummary[]; currentId: string | null; empty: string; onopen: (id: string) => void } = $props()

  /** Up/Down move focus between rows; Home/End jump. */
  function onkeydown(e: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const rows = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.row')]
    const i = rows.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    rows[to]?.focus()
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<ul class="list" {onkeydown}>
  {#each notes as n (n.id)}
    <li>
      <button class="row" aria-current={n.id === currentId} onclick={() => onopen(n.id)}>
        <span class="row-title">
          {#if n.locked}<Icon name="lock" /><span class="sr">{t('row.locked')}</span>
          {:else if n.pinned}<Icon name="pin" /><span class="sr">{t('row.pinned')}</span>{/if}
          <span>{n.title || t('untitled')}</span>
        </span>
        <span class="row-snip">{n.locked ? t('row.lockedSnippet') : n.snippet || t('row.empty')}</span>
        <span class="row-meta">{relativeTime(n.updatedAt, ui.now)}{n.tags[0] ? ` · #${n.tags[0]}` : ''}</span>
      </button>
    </li>
  {:else}
    <li class="list-empty">{empty}</li>
  {/each}
</ul>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0 8px 12px;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  .row {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    text-align: left;
  }
  .row:hover {
    background: var(--hover);
  }
  .row[aria-current='true'] {
    background: var(--sunk);
  }
  .row:focus-visible {
    outline-offset: -2px;
  }
  .row-title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 13.5px;
    font-weight: 600;
  }
  .row-title > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-title :global(.i) {
    width: 14px;
    height: 14px;
    color: var(--ink-3);
  }
  .row-snip {
    color: var(--ink-3);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .row-meta {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .list-empty {
    padding: 16px 10px;
    color: var(--ink-3);
  }
</style>
