<script lang="ts">
  import { t } from '../i18n'
  import { saveStatus, tabs } from '../state/tabs.svelte'
  import { cycleTheme, ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  const status = $derived(saveStatus())
  const doc = $derived(tabs.current)
  const themeLabel = $derived(t(`theme.${ui.theme}`))
</script>

<footer class="status">
  <span class="state" class:saving={status === 'saving'} class:failed={status === 'failed'}>
    <span class="dot"></span>
    <span>{status === 'saving' ? t('save.saving') : status === 'failed' ? t('save.failed') : t('save.saved')}</span>
  </span>
  <span class="sync wide"><Icon name="cloud" />{t('sync.off')}</span>
  {#if doc && !doc.note.locked}<span>{t('meta.words', { n: doc.words })}</span>{/if}
  <span class="grow"></span>
  <button onclick={cycleTheme} title={t('theme.cycle')}>{t('theme.label', { name: themeLabel })}</button>
</footer>

<style>
  .status {
    grid-row: 2;
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 16px;
    height: 30px;
    padding: 0 10px 0 14px;
    border-top: 1px solid var(--rule);
    background: var(--panel);
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    font-variant-numeric: tabular-nums;
  }
  .grow {
    margin-left: auto;
  }
  button {
    padding: 2px 6px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: inherit;
  }
  button:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ok);
  }
  .saving .dot {
    background: var(--ink-3);
  }
  .failed {
    color: var(--rubric);
  }
  .failed .dot {
    background: var(--rubric);
  }
  .sync {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sync :global(.i) {
    width: 14px;
    height: 14px;
  }
  @media (max-width: 760px) {
    .wide {
      display: none;
    }
  }
</style>
