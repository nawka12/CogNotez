<script lang="ts">
  import { onMount } from 'svelte'
  import type { AppInfo, BackupInfo } from '../../../shared/api'
  import { LANGS, isLangPref, t } from '../i18n'
  import type { Mode, Theme } from '../state/ui.svelte'
  import { askRestore, backupNow, exportAll, importFiles } from '../state/data'
  import { importFromFile, importFromV4 } from '../state/importer.svelte'
  import { FONT_SIZES, prefs, setDefaultMode, setFontSize, setLanguage, setSpellcheck } from '../state/prefs.svelte'
  import type { FontSize } from '../state/prefs.svelte'
  import { formatDateTime, formatSize } from '../lib/time'
  import { builtins, deleteTemplate, loadTemplates, templates } from '../state/templates.svelte'
  import { setTheme, ui } from '../state/ui.svelte'
  import Icon from './Icon.svelte'
  import Seg from './Seg.svelte'
  import SettingsAi from './SettingsAi.svelte'
  import SettingsSync from './SettingsSync.svelte'
  import SettingsUpdates from './SettingsUpdates.svelte'

  let backups = $state.raw<BackupInfo[]>([])
  let info = $state.raw<AppInfo | null>(null)
  let busy = $state(false)

  const themes: Theme[] = ['system', 'light', 'dark']
  const modes: Mode[] = ['edit', 'split', 'preview']

  async function reload(): Promise<void> {
    try {
      backups = await window.api.backups.list()
    } catch {
      backups = []
    }
  }

  async function backUp(): Promise<void> {
    busy = true
    await backupNow()
    await reload()
    busy = false
  }

  function askDelete(id: string, name: string): void {
    ui.confirm = {
      title: t('templates.deleteTitle'),
      message: t('templates.deleteMessage', { name }),
      confirmLabel: t('templates.delete'),
      run: () => void deleteTemplate(id)
    }
  }

  onMount(() => {
    void reload()
    void loadTemplates()
    window.api.app.info().then((i) => (info = i)).catch(() => undefined)
  })
</script>

<div class="scroll">
  <div class="page">
    <header>
      <h1>{t('settings.title')}</h1>
      <button class="btn" onclick={() => (ui.view = 'notes')}><Icon name="back" />{t('settings.back')}</button>
    </header>

    <section aria-labelledby="h-general">
      <h2 id="h-general">{t('settings.general')}</h2>
      <div class="row">
        <span class="lab">{t('settings.theme')}</span>
        <Seg label={t('settings.theme')} options={themes.map((v) => ({ value: v, label: t(`theme.${v}`) }))} value={ui.theme} onpick={(v) => setTheme(v)} />
      </div>
      <div class="row">
        <label class="lab" for="lang">{t('settings.language')}</label>
        <select id="lang" value={prefs.language} onchange={(e) => isLangPref(e.currentTarget.value) && setLanguage(e.currentTarget.value)}>
          <option value="system">{t('settings.languageSystem')}</option>
          {#each LANGS as l (l.code)}<option value={l.code} lang={l.code}>{l.name}</option>{/each}
        </select>
      </div>
    </section>

    <section aria-labelledby="h-editor">
      <h2 id="h-editor">{t('settings.editor')}</h2>
      <div class="row">
        <span class="lab">{t('settings.fontSize')}</span>
        <Seg
          label={t('settings.fontSize')}
          options={FONT_SIZES.map((v) => ({ value: v, label: t(`settings.size.${v}`) }))}
          value={prefs.fontSize}
          onpick={(v: FontSize) => setFontSize(v)}
        />
      </div>
      <div class="row">
        <label class="lab" for="spell">{t('settings.spellcheck')}</label>
        <input id="spell" type="checkbox" checked={prefs.spellcheck} onchange={(e) => setSpellcheck(e.currentTarget.checked)} />
      </div>
      <p class="help">{t('settings.spellcheckHelp')}</p>
      <div class="row">
        <span class="lab">{t('settings.defaultView')}</span>
        <Seg
          label={t('settings.defaultView')}
          options={modes.map((v) => ({ value: v, label: t(`mode.${v}`) }))}
          value={prefs.defaultMode}
          onpick={(v) => {
            setDefaultMode(v)
            ui.mode = v
          }}
        />
      </div>
    </section>

    <SettingsAi />

    <SettingsSync />

    <section aria-labelledby="h-templates">
      <h2 id="h-templates">{t('settings.templates')}</h2>
      <p class="help">{t('templates.help')}</p>
      <h3>{t('templates.yours')}</h3>
      {#if templates.custom.length}
        <ul class="list">
          {#each templates.custom as tpl (tpl.id)}
            <li>
              <span class="name">{tpl.name}</span>
              <button class="btn danger" onclick={() => askDelete(tpl.id, tpl.name)}>{t('templates.delete')}</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="help">{t('templates.none')}</p>
      {/if}
      <h3>{t('templates.builtin')}</h3>
      <ul class="list">
        {#each builtins as tpl (tpl.id)}<li><span class="name">{tpl.name}</span></li>{/each}
      </ul>
    </section>

    <section aria-labelledby="h-data">
      <h2 id="h-data">{t('settings.data')}</h2>
      <p class="help">{t('backups.help')}</p>
      <div class="acts">
        <button class="btn primary" disabled={busy} onclick={() => void backUp()}>{t('backups.now')}</button>
        <button class="btn" onclick={() => void window.api.backups.reveal().catch(() => undefined)}>{t('backups.reveal')}</button>
      </div>
      {#if backups.length}
        <ul class="list">
          {#each backups as b (b.id)}
            <li>
              <span class="name">{formatDateTime(b.createdAt)}</span>
              <span class="meta">{b.auto ? t('backups.auto') : t('backups.manual')} · {formatSize(b.bytes)}</span>
              <button class="btn" onclick={() => askRestore(b)}>{t('backups.restore')}</button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="help">{t('backups.none')}</p>
      {/if}
      <h3>{t('settings.moveData')}</h3>
      <div class="acts">
        <button class="btn" onclick={() => void exportAll()}>{t('data.exportAll')}</button>
        <button class="btn" onclick={() => void importFiles()}>{t('data.importFiles')}</button>
        <button class="btn" onclick={() => void importFromV4()}>{t('data.importV4')}</button>
        <button class="btn" onclick={() => void importFromFile()}>{t('palette.importFile')}</button>
      </div>
    </section>

    <section aria-labelledby="h-about">
      <h2 id="h-about">{t('settings.about')}</h2>
      <dl>
        <dt>{t('about.version')}</dt><dd>{info?.version ?? ''}</dd>
        <dt>{t('about.electron')}</dt><dd>{info?.electron ?? ''}</dd>
        <dt>{t('about.dataFolder')}</dt><dd class="path">{info?.userData ?? ''}</dd>
      </dl>
      <SettingsUpdates />
    </section>
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .page {
    max-width: 42rem;
    margin: 0 auto;
    padding: 2.5rem 3.5rem 6rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 1.5rem;
  }
  h1 {
    margin: 0;
    font: 500 1.9rem/1.15 var(--display);
    letter-spacing: -0.012em;
  }
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
  select {
    height: 30px;
    max-width: 100%;
    padding: 0 8px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
    color: var(--ink);
    font-size: 14px;
  }
  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }
  .help {
    margin: 0.2rem 0 0.8rem;
    color: var(--ink-3);
    font-size: 13px;
    max-width: 34rem;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 0.8rem;
  }
  .list {
    list-style: none;
    margin: 0 0 0.6rem;
    padding: 0;
    border: 1px solid var(--rule);
    border-radius: 8px;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 6px 6px 12px;
    min-height: 40px;
  }
  .list li + li {
    border-top: 1px solid var(--rule);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 20px;
    margin: 0;
    font-size: 14px;
  }
  dt {
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .path {
    font: 13px var(--mono);
    overflow-wrap: anywhere;
    user-select: all;
  }
  @media (max-width: 760px) {
    .page {
      padding: 1.5rem 1.25rem 4rem;
    }
  }
</style>
