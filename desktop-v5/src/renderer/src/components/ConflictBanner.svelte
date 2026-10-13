<script lang="ts">
  import { t } from '../i18n'
  import { trashNote } from '../state/actions'
  import { library, refresh } from '../state/library.svelte'
  import { openNote, saveMeta } from '../state/tabs.svelte'
  import type { Doc } from '../state/tabs.svelte'
  import { showToast } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  let { doc }: { doc: Doc } = $props()

  const originalId = $derived(doc.note.conflictOf ?? null)
  // The original may be gone (deleted forever, or never synced to this device): then there is nothing to open.
  const original = $derived(originalId ? [...library.all, ...library.trash].find((n) => n.id === originalId) : undefined)

  async function keepBoth(): Promise<void> {
    if (await saveMeta(doc, { conflictOf: null })) {
      showToast(t('conflict.kept'))
      void refresh()
    }
  }
</script>

<div class="banner conflict" role="region" aria-label={t('conflict.banner')}>
  <Icon name="copy" />
  <div>
    <strong>{t('conflict.title')}</strong>
    {original ? t('conflict.body', { title: original.title || t('untitled') }) : t('conflict.bodyGone')}
    <div class="acts">
      {#if original}<button class="btn" onclick={() => void openNote(original.id)}>{t('conflict.open')}</button>{/if}
      <button class="btn" onclick={() => void keepBoth()}>{t('conflict.keep')}</button>
      <button class="btn" onclick={() => void trashNote(doc.id, t('conflict.trashed'))}><Icon name="trash" />{t('conflict.trash')}</button>
    </div>
  </div>
</div>

<style>
  .banner {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 1.6rem;
    padding: 12px 14px;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: var(--panel);
    font-size: 13.5px;
    color: var(--ink-2);
  }
  .banner > :global(.i) {
    margin-top: 2px;
    color: var(--rubric);
  }
  strong {
    color: var(--ink);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .acts :global(.i) {
    width: 14px;
    height: 14px;
    margin-right: 6px;
    vertical-align: -2px;
  }
</style>
