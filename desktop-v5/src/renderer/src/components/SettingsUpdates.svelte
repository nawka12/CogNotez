<script lang="ts">
  import { t } from '../i18n'
  import { checkForUpdates, downloadUpdate, installUpdate, setAutoCheck, updates } from '../state/updates.svelte'

  const s = $derived(updates.status)
  const line = $derived.by(() => {
    if (!s) return ''
    switch (s.state) {
      case 'checking': return t('updates.checking')
      case 'none': return t('updates.none')
      case 'available': return t('updates.available', { version: s.version ?? '' })
      case 'downloading': return t('updates.downloading', { version: s.version ?? '', percent: s.percent ?? 0 })
      case 'ready': return t('updates.ready', { version: s.version ?? '' })
      case 'error': return t('updates.error', { message: s.error ?? '' })
      case 'unsupported': return t('updates.unsupported')
      default: return t('updates.idle')
    }
  })
</script>

{#if s}
  <div class="upd">
    <div class="row">
      <span class="lab">{t('updates.title')}</span>
      <span class="line" class:bad={s.state === 'error'} class:ok={s.state === 'available' || s.state === 'ready'} role="status">{line}</span>
    </div>
    {#if s.state !== 'unsupported'}
      <div class="acts">
        {#if s.state === 'available'}
          <button class="btn primary" onclick={() => void downloadUpdate()}>{t('updates.download')}</button>
        {:else if s.state === 'ready'}
          <button class="btn primary" onclick={() => void installUpdate()}>{t('updates.restart')}</button>
        {/if}
        <button class="btn" disabled={s.state === 'checking' || s.state === 'downloading' || s.state === 'ready'} onclick={() => void checkForUpdates()}>
          {t('updates.check')}
        </button>
      </div>
      <div class="row">
        <label class="lab" for="upd-auto">{t('updates.auto')}</label>
        <input id="upd-auto" type="checkbox" checked={updates.auto} onchange={(e) => void setAutoCheck(e.currentTarget.checked)} />
      </div>
      <p class="help">{t('updates.autoHelp')}</p>
    {/if}
  </div>
{/if}

<style>
  .upd {
    margin-top: 1rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 16px;
    min-height: 38px;
  }
  .lab {
    color: var(--ink);
    font-size: 14px;
  }
  .line {
    color: var(--ink-2);
    font-size: 14px;
    text-align: right;
    overflow-wrap: anywhere;
  }
  .line.ok {
    color: var(--ok);
  }
  .line.bad {
    color: var(--rubric);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0.2rem 0 0.4rem;
  }
  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  .help {
    margin: 0.2rem 0 0.4rem;
    color: var(--ink-3);
    font-size: 13px;
    max-width: 34rem;
  }
</style>
