<script lang="ts">
  import { onMount } from 'svelte'
  import Confirm from './components/Confirm.svelte'
  import EmptyState from './components/EmptyState.svelte'
  import Icon from './components/Icon.svelte'
  import ImportSummary from './components/ImportSummary.svelte'
  import ModeSwitch from './components/ModeSwitch.svelte'
  import NoteView from './components/NoteView.svelte'
  import Palette from './components/Palette.svelte'
  import PasswordDialog from './components/PasswordDialog.svelte'
  import Prompt from './components/Prompt.svelte'
  import Settings from './components/Settings.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Sprite from './components/Sprite.svelte'
  import StatusBar from './components/StatusBar.svelte'
  import Tabs from './components/Tabs.svelte'
  import Toast from './components/Toast.svelte'
  import { t } from './i18n'
  import { notesChanged } from './state/actions'
  import { refresh } from './state/library.svelte'
  import { restoreSession, trackSession } from './state/session.svelte'
  import { flushAll, sealOpen, tabs } from './state/tabs.svelte'
  import { isTheme, setTheme, ui } from './state/ui.svelte'

  const doc = $derived(tabs.current)
  trackSession()

  function onKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      e.stopPropagation()
      ui.paletteOpen = !ui.paletteOpen
    } else if (e.key === 'Escape' && !ui.paletteOpen && !ui.confirm && !ui.prompt && !ui.passwordDialog) {
      if (ui.sideOpen) ui.sideOpen = false
      else if (ui.view === 'settings') ui.view = 'notes'
    }
  }

  onMount(() => {
    window.api.settings
      .get('ui.theme')
      .then((v) => setTheme(isTheme(v) ? v : 'system', false))
      .catch(() => setTheme('system', false))
    void refresh()
    void restoreSession()
    const offChanged = window.api.onNotesChanged(({ ids }) => notesChanged(ids))
    const offLocks = window.api.onLocksChanged(({ ids }) => sealOpen(ids))
    const offFlush = window.api.onFlushRequest(flushAll)
    const onBlur = (): void => void flushAll()
    const tick = setInterval(() => (ui.now = Date.now()), 30_000)
    window.addEventListener('blur', onBlur)
    // Capture phase: Mod-K must win even while CodeMirror has focus.
    window.addEventListener('keydown', onKey, true)
    return () => {
      offChanged()
      offLocks()
      offFlush()
      clearInterval(tick)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('keydown', onKey, true)
      void flushAll()
    }
  })
</script>

<Sprite />
<div class="app" class:side-open={ui.sideOpen}>
  <Sidebar />
  <main class="main">
    <div class="bar">
      <button class="icon-btn menu-btn" aria-label={t('sidebar.show')} onclick={() => (ui.sideOpen = !ui.sideOpen)}><Icon name="menu" /></button>
      <Tabs />
      {#if doc && ui.view === 'notes'}<div class="bar-tools"><ModeSwitch disabled={doc.readOnly} /></div>{/if}
    </div>
    {#if ui.view === 'settings'}<Settings />{:else if doc}<NoteView {doc} />{:else}<EmptyState />{/if}
  </main>
  <StatusBar />
  <Toast />
</div>
<Palette />
<Confirm />
<Prompt />
<PasswordDialog />
<ImportSummary />

<style>
  .app {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-columns: var(--side) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    background: var(--paper);
    overflow: hidden;
  }
  .main {
    grid-row: 1;
    grid-column: 2;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .bar {
    height: 44px;
    flex: none;
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid var(--rule);
  }
  .menu-btn {
    display: none;
    align-self: center;
    margin-left: 6px;
  }
  .bar-tools {
    margin-left: auto;
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
  }
  @media (max-width: 760px) {
    .app {
      --side: 0px;
    }
    .menu-btn {
      display: grid;
    }
  }
</style>
