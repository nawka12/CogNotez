<script lang="ts">
  import { tick } from 'svelte'
  import type { NoteSummary } from '../../../shared/api'
  import { t } from '../i18n'
  import type { Key } from '../i18n'
  import { filterItems } from '../lib/palette'
  import { ai, loadModels, setModel, toggleCompanion } from '../state/ai.svelte'
  import { aiReady, askEdit, suggestTags } from '../state/aiedit.svelte'
  import { askClearHistory, runQuick } from '../state/companion.svelte'
  import { askPassword, askRemoveLock, createNote, lockNow, togglePin, trashNote } from '../state/actions'
  import { backupNow, exportAll, exportNote, importFiles, openSettings } from '../state/data'
  import { importFromFile, importFromV4 } from '../state/importer.svelte'
  import { library } from '../state/library.svelte'
  import { openNote, tabs } from '../state/tabs.svelte'
  import { addTemplate, builtins, loadTemplates, newFromTemplate, templates } from '../state/templates.svelte'
  import { errorText, setTheme, showToast, ui } from '../state/ui.svelte'
  import type { Mode, Theme } from '../state/ui.svelte'
  import type { Doc } from '../state/tabs.svelte'

  interface Item {
    id: string
    group: string
    label: string
    hint?: string
    run: () => void
    /** Stay open after running (used to step into a sub-list). */
    keep?: boolean
  }

  let dlg: HTMLDialogElement
  let input: HTMLInputElement
  let query = $state('')
  let index = $state(0)
  let hits = $state.raw<NoteSummary[]>([])
  /** A sub-list replaces the normal results: the template picker, the model list, the Companion's edit actions. */
  let sub = $state<'templates' | 'models' | 'edits' | null>(null)

  const recent = $derived([...library.all].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8))

  // Note results: recent notes for an empty query, otherwise the search index (debounced 120 ms).
  let seq = 0
  $effect(() => {
    if (!ui.paletteOpen) return
    const q = query.trim()
    if (!q) {
      hits = recent
      return
    }
    const mine = ++seq
    const timer = setTimeout(async () => {
      try {
        const found = await window.api.search(q)
        if (mine === seq) hits = found.slice(0, 30)
      } catch {
        if (mine === seq) hits = []
      }
    }, 120)
    return () => clearTimeout(timer)
  })

  const modes: Mode[] = ['edit', 'split', 'preview']
  const themes: Theme[] = ['system', 'light', 'dark']

  function actions(): Item[] {
    const doc = tabs.current
    const live = doc && doc.note.deletedAt === null ? doc : null
    const a = (id: string, label: string, run: () => void, group: Key = 'palette.actions'): Item => ({ id, group: t(group), label, run })
    return [
      a('new', t('note.new'), () => void createNote()),
      ...modes.map((m) => a(`mode-${m}`, t(`mode.${m}.view`), () => (ui.mode = m))),
      a('all', t('palette.showAll'), () => (ui.filter = { kind: 'all' })),
      a('pinned', t('palette.showPinned'), () => (ui.filter = { kind: 'pinned' })),
      a('trash', t('palette.openTrash'), () => (ui.filter = { kind: 'trash' })),
      a('settings', t('palette.settings'), openSettings),
      { ...a('from-template', t('palette.newFromTemplate'), openTemplates), keep: true },
      ...(live ? [a('save-template', t('palette.saveAsTemplate'), () => askTemplateName(live))] : []),
      ...(doc && !doc.note.locked
        ? [
            a('export-md', t('palette.exportMd'), () => void exportNote(doc, 'md')),
            a('export-txt', t('palette.exportTxt'), () => void exportNote(doc, 'txt')),
            a('export-pdf', t('palette.exportPdf'), () => void exportNote(doc, 'pdf'))
          ]
        : []),
      a('export-all', t('palette.exportAll'), () => void exportAll()),
      a('import-files', t('palette.importFiles'), () => void importFiles()),
      a('backup-now', t('palette.backupNow'), () => void backupNow()),
      ...(live ? [a('pin', live.note.pinned ? t('palette.unpinCurrent') : t('palette.pinCurrent'), () => void togglePin(live))] : []),
      ...(live ? [a('trash-current', t('palette.trashCurrent'), () => void trashNote(live.id))] : []),
      ...(live && !live.note.locked ? [a('lock', t('palette.lockNote'), () => askPassword(live))] : []),
      ...(live?.note.locked && !live.sealed
        ? [
            a('lock-now', t('palette.lockNow'), () => void lockNow(live)),
            a('change-password', t('palette.changePassword'), () => askPassword(live)),
            a('remove-lock', t('palette.removeLock'), () => askRemoveLock(live))
          ]
        : []),
      a('companion', t(ai.open ? 'palette.hideCompanion' : 'palette.showCompanion'), toggleCompanion, 'palette.companion'),
      { ...a('switch-model', t('palette.switchModel'), () => openSub('models'), 'palette.companion'), keep: true },
      ...(aiReady(live) ? editItems().map((it) => ({ ...it, group: t('palette.companion') })) : []),
      ...(aiReady(live)
        ? [
            a('ai-summarize', t('palette.summarize'), () => summarize(live), 'palette.companion'),
            a('ai-tags', t('palette.suggestTags'), () => void suggestTags(), 'palette.companion'),
            a('ai-clear', t('palette.clearHistory'), () => askClearHistory(live.id), 'palette.companion')
          ]
        : []),
      ...themes.map((th) => a(`theme-${th}`, t('theme.label', { name: t(`theme.${th}`) }), () => setTheme(th), 'palette.theme')),
      a('import-v4', t('palette.importV4'), () => void importFromV4(), 'palette.import'),
      a('import-file', t('palette.importFile'), () => void importFromFile(), 'palette.import')
    ]
  }

  function openTemplates(): void {
    openSub('templates')
    void loadTemplates()
  }

  function openSub(name: 'templates' | 'models' | 'edits'): void {
    sub = name
    query = ''
    if (name === 'models') loadModels().catch((e) => showToast(t('ai.modelsFailed', { message: errorText(e) })))
    void tick().then(() => input.focus())
  }

  function summarize(doc: Doc): void {
    if (!ai.open) toggleCompanion()
    void runQuick(doc, 'summarize')
  }

  /** The inline edit actions; also the Mod-Shift-E menu. */
  function editItems(): Item[] {
    const item = (id: string, label: string, run: () => void): Item => ({ id, group: t('palette.companion'), label, run })
    return [
      item('ai-rewrite', t('palette.rewrite'), () => askEdit('rewrite')),
      item('ai-fix', t('palette.fix'), () => askEdit('fix')),
      item('ai-translate', t('palette.translate'), () => askEdit('translate')),
      item('ai-continue', t('palette.continue'), () => askEdit('continue'))
    ]
  }

  function modelItems(): Item[] {
    return ai.models.map((m) => ({
      id: `model-${m.id}`,
      group: t('palette.models'),
      label: m.id,
      hint: m.id === ai.config?.model ? t('palette.current') : '',
      run: () => void setModel(m.id)
    }))
  }

  function askTemplateName(doc: Doc): void {
    ui.prompt = {
      title: t('templates.nameTitle'),
      label: t('templates.nameLabel'),
      initial: doc.title,
      confirmLabel: t('templates.nameOk'),
      run: (name) => void addTemplate(name, doc.cm.doc.toString())
    }
  }

  function templateItems(): Item[] {
    const mine = templates.custom.map((tpl) => ({ tpl, builtin: false }))
    const all = [...mine, ...builtins.map((tpl) => ({ tpl, builtin: true }))]
    return all.map(({ tpl, builtin }) => ({
      id: `tpl-${tpl.id}`,
      group: t(builtin ? 'templates.builtin' : 'templates.yours'),
      label: tpl.name,
      run: () => void newFromTemplate(tpl, builtin)
    }))
  }

  const items = $derived.by<Item[]>(() => {
    if (sub === 'templates') return filterItems(templateItems(), query)
    if (sub === 'models') return filterItems(modelItems(), query)
    if (sub === 'edits') return filterItems(editItems(), query)
    const notes: Item[] = hits.map((n) => ({
      id: `note-${n.id}`,
      group: t('palette.notes'),
      label: n.title || t('untitled'),
      hint: n.locked ? '' : n.snippet.replace(/\s+/g, ' '),
      run: () => void openNote(n.id)
    }))
    // Note rows come from the search index already; only actions are filtered locally.
    return [...notes, ...filterItems(actions(), query)]
  })

  $effect(() => {
    void items
    index = 0
  })

  $effect(() => {
    if (ui.paletteOpen && !dlg.open) {
      query = ''
      sub = null
      dlg.showModal()
      const want = ui.paletteSub
      ui.paletteSub = null
      if (want) openSub(want)
      void tick().then(() => input.focus())
    } else if (!ui.paletteOpen && dlg.open) dlg.close()
  })

  function run(i: number): void {
    const it = items[i]
    if (!it) return
    if (!it.keep) ui.paletteOpen = false
    it.run()
  }

  function onkeydown(e: KeyboardEvent): void {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
      e.preventDefault()
      index = (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      void tick().then(() => document.getElementById(`pal-${index}`)?.scrollIntoView({ block: 'nearest' }))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(index)
    } else if (e.key === 'Backspace' && sub && !query) {
      e.preventDefault()
      sub = null
    }
  }

  function groupStart(i: number): boolean {
    return i === 0 || items[i - 1]!.group !== items[i]!.group
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<dialog bind:this={dlg} class="modal" aria-label={t('palette.label')} onclose={() => (ui.paletteOpen = false)} onclick={(e) => e.target === dlg && (ui.paletteOpen = false)}>
  <input
    bind:this={input}
    bind:value={query}
    id="pal-input"
    type="text"
    role="combobox"
    aria-expanded="true"
    aria-controls="pal-list"
    aria-autocomplete="list"
    aria-activedescendant={items.length ? `pal-${index}` : undefined}
    placeholder={sub === 'models' ? t('palette.pickModel') : sub === 'edits' ? t('palette.pickEdit') : sub ? t('templates.pick') : t('palette.placeholder')}
    autocomplete="off"
    spellcheck="false"
    {onkeydown}
  />
  <ul id="pal-list" role="listbox" aria-label={t('palette.results')}>
    {#each items as it, i (it.id)}
      {#if groupStart(i)}<li class="pal-group" role="presentation">{it.group}</li>{/if}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <li
        class="pal-item"
        id="pal-{i}"
        role="option"
        aria-selected={i === index}
        onclick={() => run(i)}
        onmousemove={() => index !== i && (index = i)}
      >
        <span class="label">{it.label}</span>{#if it.hint}<span class="h">{it.hint}</span>{/if}
      </li>
    {:else}
      <li class="pal-empty" role="presentation">{sub === 'models' ? t('palette.noModels') : sub ? t('templates.empty') : t('palette.empty')}</li>
    {/each}
  </ul>
  <div class="pal-foot">
    <span><kbd>↑</kbd> <kbd>↓</kbd> {t('palette.move')}</span>
    <span><kbd>↵</kbd> {t('palette.run')}</span>
    <span><kbd>Esc</kbd> {t('palette.close')}</span>
  </div>
  <div class="pal-syntax">{t('palette.syntax')} <code>tag:work is:pinned before:2026-01-01</code></div>
</dialog>

<style>
  #pal-input {
    width: 100%;
    padding: 14px 16px;
    border: 0;
    border-bottom: 1px solid var(--rule);
    background: transparent;
    font-size: 15px;
    outline: none;
  }
  #pal-input:focus-visible {
    border-bottom-color: var(--accent);
  }
  #pal-list {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: min(52vh, 420px);
    overflow: auto;
  }
  .pal-group {
    padding: 10px 10px 4px;
    color: var(--ink-3);
    font-weight: 600;
  }
  .pal-item {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border-radius: 7px;
    font-size: 14px;
    cursor: pointer;
  }
  .label {
    flex: none;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .h {
    min-width: 0;
    color: var(--ink-3);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pal-item[aria-selected='true'] {
    background: var(--accent-soft);
  }
  .pal-empty {
    padding: 14px 10px;
    color: var(--ink-3);
  }
  .pal-foot {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    padding: 8px 14px 4px;
    border-top: 1px solid var(--rule);
    color: var(--ink-3);
  }
  .pal-syntax {
    padding: 0 14px 8px;
    color: var(--ink-3);
  }
  code {
    font: 12px var(--mono);
    color: var(--ink-2);
  }
</style>
