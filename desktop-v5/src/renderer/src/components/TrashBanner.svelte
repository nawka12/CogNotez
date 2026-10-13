<script lang="ts">
  import { t } from '../i18n'
  import { askDeleteForever, restoreNote } from '../state/actions'
  import type { Doc } from '../state/tabs.svelte'
  import Icon from './Icon.svelte'

  let { doc }: { doc: Doc } = $props()
</script>

<div class="banner" role="region" aria-label={t('trash.banner')}>
  <Icon name="trash" />
  <div>
    <strong>{t('trash.title')}</strong>
    {t('trash.body')}
    <div class="acts">
      <button class="btn" onclick={() => void restoreNote(doc.id)}>{t('trash.restore')}</button>
      <button class="btn danger" onclick={() => askDeleteForever(doc.id, doc.title)}>{t('trash.delete')}</button>
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
  .banner :global(.i) {
    margin-top: 2px;
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
</style>
