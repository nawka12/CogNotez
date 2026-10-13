<script lang="ts">
  import { tick } from 'svelte'
  import { t } from '../i18n'
  import { adopt } from '../state/tabs.svelte'
  import type { Doc } from '../state/tabs.svelte'
  import { errorText } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  let { doc }: { doc: Doc } = $props()

  let password = $state('')
  let busy = $state(false)
  let error = $state('')

  async function submit(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (busy || !password) return
    busy = true
    error = ''
    try {
      const note = await window.api.locks.unlock(doc.id, password)
      password = ''
      adopt(doc, note)
      await tick()
      doc.view?.focus()
    } catch (err) {
      const msg = errorText(err)
      error = /wrong password/i.test(msg) ? t('locked.wrong') : t('locked.failed', { message: msg })
    } finally {
      busy = false
    }
  }
</script>

<form class="locked" onsubmit={submit}>
  <h2><Icon name="lock" />{t('locked.title')}</h2>
  <p>{t('locked.body')}</p>
  <div class="row">
    <input
      type="password"
      bind:value={password}
      aria-label={t('locked.password')}
      aria-invalid={!!error}
      aria-describedby={error ? 'locked-error' : undefined}
      autocomplete="off"
      maxlength="1024"
      disabled={busy}
    />
    <button class="btn primary" type="submit" disabled={busy || !password}>{busy ? t('locked.unlocking') : t('locked.unlock')}</button>
  </div>
  <p id="locked-error" class="err" role="alert">{error}</p>
</form>

<style>
  .locked {
    max-width: 24rem;
    padding: 1.5rem 0;
    color: var(--ink-2);
    font-size: 14px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 0.4rem;
    font: 600 15px var(--ui);
    color: var(--ink);
  }
  p {
    margin: 0 0 0.9rem;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
  }
  input[aria-invalid='true'] {
    border-color: var(--rubric);
  }
  .err {
    min-height: 1.4em;
    margin: 0.5rem 0 0;
    color: var(--rubric);
  }
</style>
