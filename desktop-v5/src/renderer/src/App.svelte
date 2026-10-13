<script lang="ts">
  import { onMount } from 'svelte'
  import Confirm from './components/Confirm.svelte'
  import EmptyState from './components/EmptyState.svelte'
  import Icon from './components/Icon.svelte'
  import ImportSummary from './components/ImportSummary.svelte'
  import ModeSwitch from './components/ModeSwitch.svelte'
  import NoteView from './components/NoteView.svelte'
  import Palette from './components/Palette.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Sprite from './components/Sprite.svelte'
  import StatusBar from './components/StatusBar.svelte'
  import Tabs from './components/Tabs.svelte'
  import Toast from './components/Toast.svelte'
  import { t } from './i18n'
  import { notesChanged } from './state/actions'
  import { refresh } from './state/library.svelte'
  import { flushAll, tabs } from './state/tabs.svelte'
  import { isTheme, setTheme, ui } from './state/ui.svelte'

  const doc = $derived(tabs.current)

  function onKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      e.stopPropagation()
      ui.paletteOpen = !ui.paletteOpen
    } else if (e.key === 'Escape' && ui.sideOpen && !ui.paletteOpen) {
      ui.sideOpen = false
    }
  }

  onMount(() => {
    window.api.settings
      .get('ui.theme')
      .then((v) => setTheme(isTheme(v) ? v : 'system', false))
      .catch(() => setTheme('system', false))
    void refresh()
    const offChanged = window.api.onNotesChanged(({ ids }) => notesChanged(ids))
    const offFlush = window.api.onFlushRequest(flushAll)
    const onBlur = (): void => void flushAll()
    const tick = setInterval(() => (ui.now = Date.now()), 30_000)
    window.addEventListener('blur', onBlur)
    // Capture phase: Mod-K must win even while CodeMirror has focus.
    window.addEventListener('keydown', onKey, true)
    return () => {
      offChanged()
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
      {#if doc}<div class="bar-tools"><ModeSwitch disabled={doc.readOnly} /></div>{/if}
    </div>
    {#if doc}<NoteView {doc} />{:else}<EmptyState />{/if}
  </main>
  <StatusBar />
  <Toast />
</div>
<Palette />
<Confirm />
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
