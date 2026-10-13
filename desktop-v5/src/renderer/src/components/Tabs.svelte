<script lang="ts">
  import { t } from '../i18n'
  import { activeTabId } from '../lib/tabs'
  import { closeTab, openNote, tabs } from '../state/tabs.svelte'
  import { ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  // No tab looks selected while Settings is shown; the current one keeps tabindex 0 so the list stays reachable.
  const active = $derived(activeTabId(ui.view, tabs.currentId))

  /** Left/Right move between tabs, as a tablist should. */
  function onkey(e: KeyboardEvent, i: number): void {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    const next = tabs.list[(i + step + tabs.list.length) % tabs.list.length]
    if (!next) return
    e.preventDefault()
    void openNote(next.id)
    queueMicrotask(() => document.getElementById(`tab-${next.id}`)?.focus())
  }
</script>

<div class="tabs" role="tablist" aria-label={t('tabs.label')}>
  {#each tabs.list as d, i (d.id)}
    {@const title = d.title || t('untitled')}
    <div class="tab">
      <button
        class="tab-open"
        id="tab-{d.id}"
        role="tab"
        aria-selected={d.id === active}
        tabindex={d.id === tabs.currentId ? 0 : -1}
        onclick={() => void openNote(d.id)}
        onkeydown={(e) => onkey(e, i)}
      >
        {#if d.note.locked}<Icon name="lock" />{/if}<span>{title}</span>
      </button>
      <button class="tab-x" aria-label={t('tabs.close', { title })} onclick={() => closeTab(d.id)}><Icon name="x" /></button>
    </div>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    max-width: 210px;
    flex: none;
    border-right: 1px solid var(--rule);
  }
  .tab-open {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 100%;
    padding: 0 4px 0 14px;
    border: 0;
    background: transparent;
    color: var(--ink-3);
  }
  .tab-open span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab-open :global(.i) {
    width: 14px;
    height: 14px;
  }
  .tab-open[aria-selected='true'] {
    color: var(--ink);
  }
  .tab:has([aria-selected='true'])::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background: var(--accent);
  }
  .tab-x {
    width: 22px;
    height: 22px;
    margin-right: 6px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink-3);
    opacity: 0;
  }
  .tab:hover .tab-x,
  .tab:has([aria-selected='true']) .tab-x,
  .tab-x:focus-visible {
    opacity: 1;
  }
  .tab-x:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .tab-x :global(.i) {
    width: 13px;
    height: 13px;
  }
  .tab-open:focus-visible,
  .tab-x:focus-visible {
    outline-offset: -2px;
  }
</style>
