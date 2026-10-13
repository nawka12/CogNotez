<script lang="ts">
  import { t } from '../i18n'
  import { ai, openModelList } from '../state/ai.svelte'
  import { syncChip } from '../lib/syncChip'
  import { openSyncSettings, sync } from '../state/sync.svelte'
  import { saveStatus, tabs } from '../state/tabs.svelte'
  import { cycleTheme, ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  const status = $derived(saveStatus())
  const doc = $derived(tabs.current)
  const themeLabel = $derived(t(`theme.${ui.theme}`))
  // ui.now ticks every 30 s, so "Synced 2 min ago" stays fresh without its own timer.
  const chip = $derived(syncChip(sync.status, ui.now))
</script>

<footer class="status">
  <span class="state" class:saving={status === 'saving'} class:failed={status === 'failed'}>
    <span class="dot"></span>
    <span>{status === 'saving' ? t('save.saving') : status === 'failed' ? t('save.failed') : t('save.saved')}</span>
  </span>
  <button class="sync wide {chip.tone}" title={chip.title} onclick={openSyncSettings}>
    <Icon name="cloud" /><span>{chip.text}</span>
  </button>
  {#if doc && !doc.sealed}<span>{t('meta.words', { n: doc.words })}</span>{/if}
  {#if ai.working > 0}<span class="working" role="status"><span class="spin"></span>{t('ai.working')}</span>{/if}
  <span class="grow"></span>
  {#if ai.config?.model}
    <button class="wide" onclick={openModelList} title={t('ai.switchModel')}>
      {t(ai.local ? 'ai.chip.local' : 'ai.chip.remote', { model: ai.config.model })}
    </button>
  {/if}
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
  .working {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--accent);
  }
  .spin {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
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
  .sync.bad,
  .sync.warn {
    color: var(--rubric);
  }
  .sync.busy {
    color: var(--accent);
  }
  @media (max-width: 760px) {
    .wide {
      display: none;
    }
  }
</style>
