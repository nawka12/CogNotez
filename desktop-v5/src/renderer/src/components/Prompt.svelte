<script lang="ts">
  import { tick } from 'svelte'
  import { t } from '../i18n'
  import { ui } from '../state/ui.svelte'

  let dlg: HTMLDialogElement
  let input = $state<HTMLInputElement>()
  let value = $state('')

  $effect(() => {
    if (ui.prompt && !dlg.open) {
      value = ui.prompt.initial
      dlg.showModal()
      void tick().then(() => {
        input?.focus()
        input?.select()
      })
    } else if (!ui.prompt && dlg.open) dlg.close()
  })

  function submit(e: SubmitEvent): void {
    e.preventDefault()
    const run = ui.prompt?.run
    const name = value.trim()
    if (!name) return
    ui.prompt = null
    run?.(name)
  }
</script>

<dialog bind:this={dlg} class="modal" aria-labelledby="prompt-title" onclose={() => (ui.prompt = null)}>
  {#if ui.prompt}
    <form class="body" onsubmit={submit}>
      <h2 id="prompt-title">{ui.prompt.title}</h2>
      <label>
        <span>{ui.prompt.label}</span>
        <input bind:this={input} bind:value type="text" maxlength="120" autocomplete="off" />
      </label>
      <div class="acts">
        <button type="button" class="btn" onclick={() => (ui.prompt = null)}>{t('confirm.cancel')}</button>
        <button type="submit" class="btn primary" disabled={!value.trim()}>{ui.prompt.confirmLabel}</button>
      </div>
    </form>
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
    margin: 0 0 0.8rem;
    font: 600 15px var(--ui);
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
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
</style>
