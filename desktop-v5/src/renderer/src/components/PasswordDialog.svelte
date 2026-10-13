<script lang="ts">
  import { tick } from 'svelte'
  import { t } from '../i18n'
  import { flush, adopt, tabs } from '../state/tabs.svelte'
  import { errorText, showToast, ui } from '../state/ui.svelte'

  const MIN = 8

  let dlg: HTMLDialogElement
  let first = $state<HTMLInputElement>()
  let password = $state('')
  let confirm = $state('')
  let error = $state('')
  let busy = $state(false)
  let opener: Element | null = null

  const data = $derived(ui.passwordDialog)
  const doc = $derived(data ? (tabs.list.find((d) => d.id === data.docId) ?? null) : null)

  $effect(() => {
    if (data && doc && !dlg.open) {
      opener = document.activeElement
      password = confirm = error = ''
      dlg.showModal()
      void tick().then(() => first?.focus())
    } else if (!data && dlg.open) dlg.close()
  })

  function onclose(): void {
    password = confirm = error = ''
    ui.passwordDialog = null
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    opener = null
  }

  async function submit(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (busy || !data || !doc) return
    error = password.length < MIN ? t('pw.tooShort') : password !== confirm ? t('pw.mismatch') : ''
    if (error) return
    busy = true
    try {
      if (data.mode === 'set') await flush(doc) // main encrypts what is stored, so store the latest text first
      await window.api.locks.setPassword(doc.id, password)
      adopt(doc, await window.api.notes.get(doc.id))
      showToast(data.mode === 'set' ? t('toast.lockSet') : t('toast.passwordChanged'))
      ui.passwordDialog = null
    } catch (err) {
      error = t('pw.failed', { message: errorText(err) })
    } finally {
      busy = false
    }
  }
</script>

<dialog bind:this={dlg} class="modal" aria-labelledby="pw-title" {onclose}>
  {#if data}
    <form class="body" onsubmit={submit}>
      <h2 id="pw-title">{data.mode === 'set' ? t('pw.setTitle') : t('pw.changeTitle')}</h2>
      <p class="warn">{t('pw.warning')}</p>
      <label>
        {t('pw.password')}
        <input bind:this={first} type="password" bind:value={password} autocomplete="new-password" maxlength="1024" disabled={busy} aria-describedby="pw-hint" />
      </label>
      <p id="pw-hint" class="hint">{t('pw.hint')}</p>
      <label>
        {t('pw.confirm')}
        <input type="password" bind:value={confirm} autocomplete="new-password" maxlength="1024" disabled={busy} />
      </label>
      <p class="err" role="alert">{error}</p>
      <div class="acts">
        <button class="btn" type="button" disabled={busy} onclick={() => dlg.close()}>{t('pw.cancel')}</button>
        <button class="btn primary" type="submit" disabled={busy}>
          {busy ? t('pw.working') : data.mode === 'set' ? t('pw.setOk') : t('pw.changeOk')}
        </button>
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
    font-size: 14px;
  }
  h2 {
    margin: 0 0 0.4rem;
    font: 600 15px var(--ui);
  }
  p {
    margin: 0;
  }
  .warn {
    margin-bottom: 0.9rem;
    color: var(--ink-2);
  }
  label {
    display: block;
    margin-top: 0.7rem;
    color: var(--ink-2);
  }
  input {
    display: block;
    width: 100%;
    height: 30px;
    margin-top: 4px;
    padding: 0 10px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
  }
  .hint {
    margin-top: 4px;
    color: var(--ink-3);
  }
  .err {
    min-height: 1.4em;
    margin-top: 0.6rem;
    color: var(--rubric);
  }
  .acts {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
</style>
