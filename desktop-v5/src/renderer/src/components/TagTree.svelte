<script lang="ts">
  import { t } from '../i18n'
  import { tagRows } from '../lib/tags'
  import { library } from '../state/library.svelte'
  import { ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  const rows = $derived(
    tagRows(
      library.tags.map((x) => x.name),
      library.all
    )
  )
  const active = $derived(ui.filter.kind === 'tag' ? ui.filter.tag.toLowerCase() : null)
</script>

<details class="tags" open>
  <summary>{t('tags.title')} <Icon name="chev" /></summary>
  <ul>
    {#each rows as r (r.path)}
      <li>
        <button
          class="tag-btn"
          style:padding-left="{8 + r.depth * 20}px"
          aria-pressed={active === r.path.toLowerCase()}
          onclick={() => (ui.filter = { kind: 'tag', tag: r.path })}
        >
          <Icon name="hash" />{r.label}<span class="n">{r.count}</span>
        </button>
      </li>
    {:else}
      <li class="none">{t('tags.none')}</li>
    {/each}
  </ul>
</details>

<style>
  .tags {
    flex: none;
    max-height: 30%;
    overflow: auto;
    padding: 0 8px 8px;
    border-bottom: 1px solid var(--rule);
  }
  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    list-style: none;
    color: var(--ink-3);
    font-weight: 600;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary :global(.i) {
    transition: transform 0.15s;
  }
  .tags[open] summary :global(.i) {
    transform: rotate(90deg);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .tag-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 4px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-2);
    text-align: left;
  }
  .tag-btn :global(.i) {
    width: 14px;
    height: 14px;
    color: var(--ink-3);
  }
  .n {
    margin-left: auto;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .tag-btn:hover {
    background: var(--hover);
  }
  .tag-btn[aria-pressed='true'] {
    background: var(--sunk);
    color: var(--ink);
  }
  .tag-btn:focus-visible,
  summary:focus-visible {
    outline-offset: -2px;
  }
  .none {
    padding: 4px 8px;
    color: var(--ink-3);
  }
</style>
