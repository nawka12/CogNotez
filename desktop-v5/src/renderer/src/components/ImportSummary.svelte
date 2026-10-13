<script lang="ts">
  import { tick } from 'svelte'
  import { t } from '../i18n'
  import { importer, importFromFile } from '../state/importer.svelte'
  import { ui } from '../state/ui.svelte'

  let dlg: HTMLDialogElement
  let pdlg: HTMLDialogElement
  let pinput = $state<HTMLInputElement>()
  let pass = $state('')
  const s = $derived(ui.importSummary)
  const f = $derived(importer.files)
  const ask = $derived(importer.ask)

  $effect(() => {
    if ((s || f) && !dlg.open) dlg.showModal()
    else if (!s && !f && dlg.open) dlg.close()
  })

  $effect(() => {
    if (ask && !pdlg.open) {
      pass = ''
      pdlg.showModal()
    } else if (!ask && pdlg.open) pdlg.close()
    if (ask) void tick().then(() => pinput?.focus()) // again after a wrong try: the form is re-enabled
  })

  function submit(e: SubmitEvent): void {
    e.preventDefault()
    if (!pass || importer.running) return
    const p = pass
    pass = ''
    void importFromFile(p)
  }
</script>

<dialog bind:this={dlg} class="modal" aria-labelledby="imp-title" onclose={() => ((ui.importSummary = null), (importer.files = null))}>
  {#if f}
    <div class="body">
      <h2 id="imp-title">{t('import.done')}</h2>
      <p class="lead">{t('toast.importedFiles', { n: f.notes })}</p>
      <details open>
        <summary>{t('import.filesSkipped', { n: f.skipped.length })}</summary>
        <ul>{#each f.skipped as k, i (i)}<li><span class="name">{k.name}</span> <span class="why">{k.reason}</span></li>{/each}</ul>
      </details>
      <div class="acts">
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn primary" autofocus onclick={() => (importer.files = null)}>{t('import.close')}</button>
      </div>
    </div>
  {:else if s}
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

<dialog bind:this={pdlg} class="modal" aria-labelledby="imp-pass-title" onclose={() => (importer.ask = null)}>
  {#if ask}
    <form class="body" onsubmit={submit}>
      <h2 id="imp-pass-title">{t('import.passTitle')}</h2>
      <p class="lead">{t('import.passBody')}</p>
      <label>
        <span>{t('import.passLabel')}</span>
        <input bind:this={pinput} bind:value={pass} type="password" maxlength="1024" autocomplete="off" disabled={importer.running} />
      </label>
      <p class="err" role="alert">{ask.wrong ? t('import.passWrong') : ''}</p>
      <div class="acts">
        <button type="button" class="btn" onclick={() => (importer.ask = null)}>{t('confirm.cancel')}</button>
        <button type="submit" class="btn primary" disabled={!pass || importer.running}>{importer.running ? t('import.running') : t('import.button')}</button>
      </div>
    </form>
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
  .lead {
    margin: 0 0 0.6rem;
    color: var(--ink-2);
  }
  .name {
    color: var(--ink);
  }
  .why {
    color: var(--ink-2);
  }
  .why::before {
    content: '· ';
  }
  label {
    display: grid;
    gap: 6px;
    color: var(--ink-2);
  }
  input {
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
    color: var(--ink);
    font-size: 14px;
  }
  .err {
    min-height: 1.3em;
    margin: 6px 0 0;
    color: var(--rubric);
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    margin-top: 18px;
  }
</style>
