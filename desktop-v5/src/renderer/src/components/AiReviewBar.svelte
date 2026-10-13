<script lang="ts">
  import { t } from '../i18n'
  import { acceptAll, edit, rejectAll } from '../state/aiedit.svelte'
  import { MOD } from '../state/ui.svelte'

  let { docId }: { docId: string } = $props()
  const active = $derived(edit.cur?.docId === docId && edit.cur.phase === 'review' ? edit.cur : null)
</script>

{#if active}
  <div class="review" role="group" aria-label={t('ai.suggestion')}>
    <span class="head">{t('ai.suggestion')}</span>
    <span class="d">{active.label}</span>
    <span class="grow"></span>
    <button class="btn primary" onclick={acceptAll}>{t('ai.acceptAll')} <kbd>{MOD} ↵</kbd></button>
    <button class="btn" onclick={rejectAll}>{t('ai.rejectAll')} <kbd>Esc</kbd></button>
  </div>
{/if}

<style>
  .review {
    position: sticky;
    top: 8px;
    z-index: 6;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: 0 -1rem 1rem;
    padding: 0.6rem 1rem;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: var(--shadow);
    font: 13px var(--ui);
  }
  .head {
    font-weight: 600;
    color: var(--ink-2);
  }
  .d {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }
  .grow {
    flex: 1;
  }
  .btn kbd {
    background: color-mix(in srgb, currentColor 14%, transparent);
    color: inherit;
  }
</style>
