<script lang="ts">
  import { t } from '../i18n'
  import { ui } from '../state/ui.svelte'

  let dlg: HTMLDialogElement
  const s = $derived(ui.importSummary)

  $effect(() => {
    if (s && !dlg.open) dlg.showModal()
    else if (!s && dlg.open) dlg.close()
  })
</script>

<dialog bind:this={dlg} class="modal" aria-labelledby="imp-title" onclose={() => (ui.importSummary = null)}>
  {#if s}
    <div class="body">
      <h2 id="imp-title">{t('import.done')}</h2>
      <dl>
        <dt>{t('import.notes')}</dt><dd>{s.notes}</dd>
        <dt>{t('import.media')}</dt><dd>{s.media}</dd>
        <dt>{t('import.locked')}</dt><dd>{s.locked}</dd>
        {#if s.skippedExisting}<dt>{t('import.skipped')}</dt><dd>{s.skippedExisting}</dd>{/if}
      </dl>
      {#if s.warnings.length}
        <details>
          <summary>{t('import.warnings', { n: s.warnings.length })}</summary>
          <ul>{#each s.warnings as w, i (i)}<li>{w}</li>{/each}</ul>
        </details>
      {/if}
      <div class="acts">
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn primary" autofocus onclick={() => (ui.importSummary = null)}>{t('import.close')}</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(460px, calc(100vw - 32px));
  }
  .body {
    padding: 18px 20px;
  }
  h2 {
    margin: 0 0 0.6rem;
    font: 600 15px var(--ui);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 16px;
    margin: 0;
    color: var(--ink-2);
    font-size: 14px;
  }
  dd {
    margin: 0;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  details {
    margin-top: 12px;
    color: var(--ink-2);
  }
  summary {
    cursor: pointer;
  }
  ul {
    max-height: 30vh;
    overflow: auto;
    margin: 6px 0 0;
    padding-left: 1.2em;
    overflow-wrap: anywhere;
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
  }
</style>
