<script lang="ts">
  import { t } from '../i18n'
  import { createNote } from '../state/actions'
  import { library } from '../state/library.svelte'
  import { openNote, tabs } from '../state/tabs.svelte'
  import { MOD, ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'
  import NoteList from './NoteList.svelte'
  import TagTree from './TagTree.svelte'

  const filters = ['all', 'pinned', 'trash'] as const
  const counts = $derived({
    all: library.all.length,
    pinned: library.all.filter((n) => n.pinned).length,
    trash: library.trash.length
  })
  const heading = $derived(ui.filter.kind === 'tag' ? `#${ui.filter.tag}` : t(`filter.${ui.filter.kind}.title`))
  const visible = $derived(library.visible)
</script>

<aside class="side" aria-label={t('sidebar.label')}>
  <div class="brand">
    <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="6" /><path d="M8 7v10M16 7v10M8 7l8 10" /></svg>
    <span class="wordmark">CogNotez</span>
    <button class="icon-btn" aria-label={t('note.new')} title={t('note.new')} onclick={() => void createNote()}><Icon name="plus" /></button>
  </div>
  <button class="search" onclick={() => (ui.paletteOpen = true)}>
    <Icon name="search" /><span>{t('search.placeholder')}</span><kbd>{MOD} K</kbd>
  </button>
  <div class="filters" role="group" aria-label={t('filter.label')}>
    {#each filters as f (f)}
      <button aria-pressed={ui.filter.kind === f} onclick={() => (ui.filter = { kind: f })}>
        {t(`filter.${f}`)} <span class="n">{counts[f]}</span>
      </button>
    {/each}
  </div>
  <TagTree />
  <div class="list-head"><span>{heading}</span><span class="n">{visible.length}</span></div>
  <NoteList notes={visible} currentId={tabs.currentId} empty={ui.filter.kind === 'trash' ? t('list.trashEmpty') : t('list.empty')} onopen={(id) => void openNote(id)} />
</aside>

<style>
  .side {
    grid-row: 1;
    grid-column: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--panel);
    border-right: 1px solid var(--rule);
  }
  .brand {
    height: 44px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 0 14px;
    border-bottom: 1px solid var(--rule);
  }
  .mark {
    width: 20px;
    height: 20px;
  }
  .mark rect {
    fill: var(--tile);
  }
  .mark path {
    stroke: var(--mark);
    fill: none;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .wordmark {
    font: 500 16px/1 var(--display);
    letter-spacing: -0.01em;
    margin-right: auto;
  }
  .search {
    margin: 12px 12px 8px;
    height: 32px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 10px;
    border: 1px solid var(--rule);
    border-radius: 7px;
    background: var(--paper);
    color: var(--ink-3);
    text-align: left;
  }
  .search span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .search:hover {
    border-color: var(--ink-3);
  }
  .filters {
    display: flex;
    gap: 2px;
    padding: 0 12px 8px;
    flex: none;
  }
  .filters button {
    flex: 1;
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 5px 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-2);
  }
  .filters button:hover {
    background: var(--hover);
  }
  .filters button[aria-pressed='true'] {
    background: var(--sunk);
    color: var(--ink);
    font-weight: 600;
  }
  .filters button:focus-visible {
    outline-offset: -2px;
  }
  .n {
    color: var(--ink-3);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .list-head {
    flex: none;
    display: flex;
    justify-content: space-between;
    padding: 10px 14px 6px;
    color: var(--ink-3);
    font-weight: 600;
  }

  @media (max-width: 760px) {
    .side {
      position: absolute;
      z-index: 11;
      top: 0;
      left: 0;
      bottom: 30px;
      width: min(300px, 88%);
      transform: translateX(-102%);
      transition: transform 0.18s ease;
      box-shadow: var(--shadow);
      visibility: hidden;
    }
    :global(.app.side-open) .side {
      transform: none;
      visibility: visible;
    }
  }
</style>
