<script lang="ts">
  import { onMount } from 'svelte'
  import type { SyncTransportKind } from '../../../shared/api'
  import { t } from '../i18n'
  import { syncChip, syncedWhen } from '../lib/syncChip'
  import { formatDateTime } from '../lib/time'
  import { loadGoogle, loadSync, sync } from '../state/sync.svelte'
  import { errorText, showToast, ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  const MIN_PASSPHRASE = 8

  const status = $derived(sync.status)
  const google = $derived(sync.google)
  const chip = $derived(syncChip(status, ui.now))

  let busy = $state(false)
  let connecting = $state(false)
  let choice = $state<SyncTransportKind>('folder')
  let encrypt = $state(false)
  let pass = $state('')
  let pass2 = $state('')
  let unlockPass = $state('')
  let unlockError = $state('')
  let setupError = $state('')
  let device = $state('')

  const passError = $derived(
    !encrypt ? '' : pass.length < MIN_PASSPHRASE ? t('sync.passphraseShort') : pass !== pass2 ? t('sync.passphraseMismatch') : ''
  )
  const canSetup = $derived(!busy && (choice !== 'gdrive' || !!google?.connected) && !(encrypt && passError))

  let editingDevice = false
  $effect(() => {
    const name = status?.deviceName ?? ''
    if (!editingDevice) device = name // a status event must not overwrite what is being typed
  })

  onMount(() => {
    void loadSync()
    void loadGoogle()
  })

  const fail = (e: unknown): void => showToast(t('toast.error', { message: errorText(e) }))

  async function connect(): Promise<void> {
    connecting = true
    try {
      await window.api.google.connect()
    } catch (e) {
      fail(e)
    }
    connecting = false
    await loadGoogle()
  }

  function askDisconnect(): void {
    const run = (): void =>
      void window.api.google.disconnect().catch(fail).finally(() => void Promise.all([loadGoogle(), loadSync()]))
    if (status?.configured && status.transport === 'gdrive') {
      ui.confirm = { title: t('google.disconnectTitle'), message: t('google.disconnectMessage'), confirmLabel: t('google.disconnect'), run }
    } else run()
  }

  async function importClient(): Promise<void> {
    try {
      if (await window.api.google.importClient()) showToast(t('google.imported'))
    } catch (e) {
      fail(e)
    }
    await loadGoogle()
  }

  async function setup(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (!canSetup) return
    busy = true
    setupError = ''
    try {
      const s = await window.api.sync.setup({ transport: choice, ...(encrypt ? { passphrase: pass } : {}) })
      if (s) {
        sync.status = s
        pass = pass2 = ''
        encrypt = false
      }
    } catch (err) {
      setupError = errorText(err)
    }
    busy = false
    await loadSync()
  }

  async function unlock(e: SubmitEvent): Promise<void> {
    e.preventDefault()
    if (busy || !unlockPass) return
    busy = true
    unlockError = ''
    try {
      sync.status = await window.api.sync.unlock(unlockPass)
      unlockPass = ''
    } catch (err) {
      const m = errorText(err)
      unlockError = /wrong passphrase/i.test(m) ? t('sync.wrongPassphrase') : m
    }
    busy = false
  }

  async function syncNow(): Promise<void> {
    try {
      sync.status = await window.api.sync.now()
    } catch (e) {
      fail(e)
      await loadSync()
    }
  }

  function askDisable(): void {
    ui.confirm = {
      title: t('sync.disableTitle'),
      message: t('sync.disableNote'),
      confirmLabel: t('sync.disableOk'),
      run: () =>
        void window.api.sync
          .disable()
          .then(() => showToast(t('sync.disabled')))
          .catch(fail)
          .finally(() => void loadSync())
    }
  }

  async function saveDevice(): Promise<void> {
    editingDevice = false
    const name = device.trim()
    if (!name || name === status?.deviceName) {
      device = status?.deviceName ?? ''
      return
    }
    try {
      await window.api.sync.setDeviceName(name)
    } catch (e) {
      fail(e)
    }
    await loadSync()
  }

  // Until the first round of a launch the service has no transport yet, hence no target for Drive.
  const target = $derived(status?.target ?? (status?.transport === 'gdrive' ? google?.email : null))
  const where = $derived(target ? `${t(status?.transport === 'gdrive' ? 'sync.drive' : 'sync.folder')} · ${target}` : '')
</script>

<section aria-labelledby="h-sync">
  <h2 id="h-sync">{t('settings.sync')}</h2>

  {#if status?.configured}
    <dl>
      <dt>{t('sync.state')}</dt>
      <dd class:bad={chip.tone === 'bad' || chip.tone === 'warn'}>{chip.text}</dd>
      <dt>{t('sync.lastSynced')}</dt>
      <dd title={status.lastSyncAt ? formatDateTime(status.lastSyncAt) : ''}>{status.lastSyncAt ? syncedWhen(status.lastSyncAt, ui.now) : t('sync.never')}</dd>
      <dt>{t('sync.location')}</dt>
      <dd class="path">{where}</dd>
      <dt>{t('sync.encryption')}</dt>
      <dd>{status.encrypted ? t('sync.encrypted') : t('sync.notEncrypted')}</dd>
    </dl>
    {#if status.lastError}<p class="err" role="alert">{status.lastError}</p>{/if}
    {#if status.conflicts}<p class="help">{t('sync.conflicts', { n: status.conflicts })}</p>{/if}

    {#if status.needsPassphrase}
      <form class="unlock" onsubmit={unlock}>
        <h3>{t('sync.unlockTitle')}</h3>
        <p class="help">{t('sync.unlockHelp')}</p>
        <div class="grp">
          <input
            type="password"
            bind:value={unlockPass}
            aria-label={t('sync.passphraseLabel')}
            aria-invalid={!!unlockError}
            aria-describedby={unlockError ? 'sync-unlock-error' : undefined}
            autocomplete="off"
            maxlength="1024"
            disabled={busy}
          />
          <button class="btn primary" type="submit" disabled={busy || !unlockPass}>{busy ? t('sync.unlocking') : t('sync.unlock')}</button>
        </div>
        <p class="err" id="sync-unlock-error" role="alert">{unlockError}</p>
      </form>
    {/if}

    <div class="row">
      <label class="lab" for="sync-device">{t('sync.device')}</label>
      <input
        id="sync-device"
        type="text"
        class="wide"
        maxlength="64"
        spellcheck="false"
        bind:value={device}
        oninput={() => (editingDevice = true)}
        onchange={() => void saveDevice()}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
    <p class="help">{t('sync.deviceHelp')}</p>

    <div class="acts">
      <button class="btn primary" disabled={status.state === 'syncing' || status.needsPassphrase} onclick={() => void syncNow()}>
        <Icon name="refresh" />{t('sync.now')}
      </button>
      <button class="btn danger" onclick={askDisable}>{t('sync.disable')}</button>
    </div>
    <p class="help">{t('sync.disableNote')}</p>
  {:else}
    <form onsubmit={setup}>
      <fieldset>
        <legend class="lab">{t('sync.choose')}</legend>
        <label class="choice">
          <input type="radio" name="sync-kind" value="folder" bind:group={choice} />
          <span><strong>{t('sync.folder')}</strong><span class="help">{t('sync.folderHelp')}</span></span>
        </label>
        <label class="choice">
          <input type="radio" name="sync-kind" value="gdrive" bind:group={choice} />
          <span>
            <strong>{t('sync.drive')}</strong>
            <span class="help">{google?.connected ? t('sync.driveHelp') : t('sync.driveNeedsAccount')}</span>
          </span>
        </label>
      </fieldset>

      <div class="row">
        <label class="lab" for="sync-encrypt">{t('sync.encryptOption')}</label>
        <input id="sync-encrypt" type="checkbox" bind:checked={encrypt} />
      </div>
      <p class="help">{t('sync.encryptHelp')}</p>
      {#if encrypt}
        <div class="row">
          <label class="lab" for="sync-pass">{t('sync.passphraseLabel')}</label>
          <input id="sync-pass" type="password" class="wide" autocomplete="new-password" maxlength="1024" bind:value={pass} />
        </div>
        <div class="row">
          <label class="lab" for="sync-pass2">{t('sync.passphraseConfirm')}</label>
          <input id="sync-pass2" type="password" class="wide" autocomplete="new-password" maxlength="1024" bind:value={pass2} />
        </div>
        <p class="help warn">{t('sync.passphraseWarning')}</p>
        {#if passError && (pass || pass2)}<p class="err" role="alert">{passError}</p>{/if}
      {/if}
      {#if setupError}<p class="err" role="alert">{setupError}</p>{/if}
      <div class="acts">
        <button class="btn primary" type="submit" disabled={!canSetup}>{busy ? t('sync.settingUp') : t('sync.setup')}</button>
      </div>
    </form>
  {/if}

  <h3>{t('google.title')}</h3>
  {#if google?.connected}
    <div class="row">
      <span class="ok">{google.email ? t('google.connected', { email: google.email }) : t('google.connectedNoEmail')}</span>
      <button class="btn" onclick={askDisconnect}>{t('google.disconnect')}</button>
    </div>
  {:else}
    <div class="acts">
      <button class="btn" disabled={connecting || google?.clientConfigured === false} onclick={() => void connect()}>
        {connecting ? t('google.connecting') : t('google.connect')}
      </button>
    </div>
  {/if}
  {#if google && !google.clientConfigured}
    <p class="help">{t('google.noClient')}</p>
    <div class="acts">
      <button class="btn" onclick={() => void importClient()}>{t('google.import')}</button>
    </div>
    <p class="help">{t('google.importHelp')}</p>
  {/if}

  <p class="foot">{t('sync.android')}</p>
</section>

<style>
  section {
    padding: 1.1rem 0 1.4rem;
    border-top: 1px solid var(--rule);
  }
  h2 {
    margin: 0 0 0.8rem;
    font: 600 15px var(--ui);
  }
  h3 {
    margin: 1.2rem 0 0.4rem;
    font: 600 13px var(--ui);
    color: var(--ink-2);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 20px;
    margin: 0 0 0.6rem;
    font-size: 14px;
  }
  dt {
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  dd.bad {
    color: var(--rubric);
  }
  .path {
    font: 13px var(--mono);
    overflow-wrap: anywhere;
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
  .grp {
    display: flex;
    gap: 8px;
  }
  input[type='text'],
  input[type='password'] {
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
    color: var(--ink);
    font-size: 14px;
  }
  .unlock input {
    flex: 1;
    min-width: 0;
    max-width: 20rem;
  }
  input.wide {
    width: min(20rem, 52vw);
  }
  input[type='checkbox'],
  input[type='radio'] {
    width: 18px;
    height: 18px;
    flex: none;
    accent-color: var(--accent);
  }
  fieldset {
    margin: 0 0 0.6rem;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 0.4rem;
    padding: 0;
  }
  .choice {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px 0;
  }
  .choice input {
    margin-top: 2px;
  }
  .choice strong {
    display: block;
    font-weight: 600;
    font-size: 14px;
  }
  .help {
    display: block;
    margin: 0.2rem 0 0.8rem;
    color: var(--ink-3);
    font-size: 13px;
    max-width: 34rem;
  }
  .choice .help {
    margin: 0.1rem 0 0;
  }
  .help.warn,
  .err {
    color: var(--rubric);
  }
  .err {
    margin: 0.3rem 0 0.6rem;
    min-height: 1.2em;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .ok {
    color: var(--ok);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0.4rem 0 0.6rem;
  }
  .acts :global(.i) {
    width: 14px;
    height: 14px;
    margin-right: 6px;
    vertical-align: -2px;
  }
  .foot {
    margin: 1.4rem 0 0;
    color: var(--ink-3);
    font-size: 13px;
  }
</style>
