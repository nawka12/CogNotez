<script lang="ts">
  import { t } from '../i18n'
  import { createNote } from '../state/actions'
  import { detect } from '../state/importer.svelte'
  import { library } from '../state/library.svelte'
  import { MOD } from '../state/ui.svelte'
  import Icon from './Icon.svelte'
  import ImportPanel from './ImportPanel.svelte'

  const none = $derived(library.loaded && library.all.length === 0)

  $effect(() => {
    if (none) void detect()
  })
</script>

<div class="scroll">
  <div class="empty">
    {#if none}
      <ImportPanel />
      <p class="empty-title">{t('empty.none.title')}</p>
      <p>{t('empty.none.body', { mod: MOD })}</p>
    {:else}
      <p class="empty-title">{t('empty.pick.title')}</p>
      <p>{t('empty.pick.body', { mod: MOD })}</p>
    {/if}
    <button class="btn" onclick={() => void createNote()}><Icon name="plus" />{t('note.new')}</button>
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .empty {
    max-width: 26rem;
    margin: 14vh auto 0;
    padding: 0 1.5rem;
    color: var(--ink-2);
    font-size: 14px;
  }
  .empty-title {
    font: 500 1.6rem/1.2 var(--display);
    color: var(--ink);
    margin: 0 0 0.4rem;
  }
</style>
