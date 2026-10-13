<script lang="ts">
  import { t } from '../i18n'
  import type { Mode } from '../state/ui.svelte'
  import { ui } from '../state/ui.svelte'

  /** `disabled` is for read-only notes, which always show the preview. */
  let { disabled = false }: { disabled?: boolean } = $props()
  const modes: Mode[] = ['edit', 'split', 'preview']
</script>

<div class="seg" role="group" aria-label={t('mode.label')}>
  {#each modes as m (m)}
    <button {disabled} aria-pressed={(disabled ? 'preview' : ui.mode) === m} onclick={() => (ui.mode = m)}>{t(`mode.${m}`)}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--rule);
    border-radius: 7px;
    background: var(--panel);
  }
  button {
    padding: 3px 10px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--ink-3);
  }
  button:hover:not(:disabled) {
    color: var(--ink);
  }
  button[aria-pressed='true'] {
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--rule);
  }
  button:disabled {
    opacity: 0.5;
  }
  @media (max-width: 760px) {
    button {
      padding: 3px 7px;
    }
  }
</style>
