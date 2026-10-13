<script lang="ts">
  import { t } from '../i18n'
  import { ui } from '../state/ui.svelte'

  let dlg: HTMLDialogElement

  $effect(() => {
    if (ui.confirm && !dlg.open) dlg.showModal()
    else if (!ui.confirm && dlg.open) dlg.close()
  })

  function ok(): void {
    const run = ui.confirm?.run
    ui.confirm = null
    run?.()
  }
</script>

<dialog bind:this={dlg} class="modal" aria-labelledby="confirm-title" onclose={() => (ui.confirm = null)}>
  {#if ui.confirm}
    <div class="body">
      <h2 id="confirm-title">{ui.confirm.title}</h2>
      <p>{ui.confirm.message}</p>
      <div class="acts">
        <!-- svelte-ignore a11y_autofocus -->
        <button class="btn" autofocus onclick={() => (ui.confirm = null)}>{t('confirm.cancel')}</button>
        <button class="btn primary" onclick={ok}>{ui.confirm.confirmLabel}</button>
      </div>
    </div>
  {/if}
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 32px));
  }
  .body {
    padding: 18px 20px;
  }
  h2 {
    margin: 0 0 0.4rem;
    font: 600 15px var(--ui);
  }
  p {
    margin: 0;
    color: var(--ink-2);
    font-size: 14px;
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
</style>
