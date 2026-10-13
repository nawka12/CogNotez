<script lang="ts">
  import { onMount } from 'svelte'
  import type { AiProvider, AiStatus, SecretName } from '../../../shared/api'
  import { t } from '../i18n'
  import { ai, loadAiConfig, loadModels, patchAiConfig } from '../state/ai.svelte'
  import { errorText, showToast } from '../state/ui.svelte'
  import Icon from './Icon.svelte'

  const providers: AiProvider[] = ['ollama', 'lmstudio', 'llamacpp', 'openrouter', 'custom']

  let baseUrl = $state('')
  let model = $state('')
  let contextTokens = $state(8192)
  let searxng = $state('')
  let keyInput = $state('')
  let keySaved = $state(false)
  let replacing = $state(false)
  let secure = $state(true)
  let testing = $state(false)
  let result = $state.raw<AiStatus | null>(null)
  let loadingModels = $state(false)

  const cfg = $derived(ai.config)
  const secret = $derived<SecretName>(cfg?.provider === 'openrouter' ? 'openrouter_api_key' : 'ai_api_key')

  /** Copies the saved config into the form fields (after load, provider change, or a failed save). */
  function fill(): void {
    if (!cfg) return
    baseUrl = cfg.baseUrl
    model = cfg.model
    contextTokens = cfg.contextTokens
    searxng = cfg.searxngUrl
  }
  async function loadKey(): Promise<void> {
    try {
      keySaved = await window.api.secrets.has(secret)
    } catch {
      keySaved = false
    }
    replacing = false
    keyInput = ''
  }

  onMount(() => {
    void loadAiConfig().then(() => {
      fill()
      loadModels().catch(() => undefined) // fills the model suggestions; a dead server just leaves them empty
    })
    window.api.secrets.status().then((s) => (secure = s.secure)).catch(() => undefined)
  })
  $effect(() => {
    void secret
    void loadKey()
  })

  async function save(patch: Parameters<typeof patchAiConfig>[0]): Promise<void> {
    try {
      await patchAiConfig(patch)
      result = null
    } catch (e) {
      showToast(t('toast.error', { message: errorText(e) }))
    }
    fill()
    loadModels().catch(() => undefined) // the new provider or address may list different models
  }

  async function refreshModels(): Promise<void> {
    loadingModels = true
    try {
      await loadModels()
    } catch (e) {
      showToast(t('ai.modelsFailed', { message: errorText(e) }))
    }
    loadingModels = false
  }

  async function saveKey(): Promise<void> {
    const v = keyInput.trim()
    if (!v) return
    try {
      await window.api.secrets.set(secret, v)
    } catch (e) {
      return void showToast(t('toast.error', { message: errorText(e) }))
    }
    await loadKey()
  }
  async function removeKey(): Promise<void> {
    try {
      await window.api.secrets.delete(secret)
    } catch (e) {
      return void showToast(t('toast.error', { message: errorText(e) }))
    }
    await loadKey()
  }

  async function test(): Promise<void> {
    testing = true
    result = null
    try {
      result = await window.api.ai.test()
      ai.status = result
    } catch (e) {
      result = { ok: false, provider: cfg?.provider ?? 'custom', model, local: true, error: errorText(e) }
    }
    testing = false
  }

  const where = (s: AiStatus): string => t(s.local ? 'ai.settings.onThisComputer' : 'ai.settings.overInternet')
</script>

<section aria-labelledby="h-ai">
  <h2 id="h-ai">{t('settings.ai')}</h2>
  {#if !cfg}
    <p class="help">{t('ai.settings.unavailable')}</p>
  {:else}
    <div class="row">
      <label class="lab" for="ai-provider">{t('ai.settings.provider')}</label>
      <select id="ai-provider" value={cfg.provider} onchange={(e) => void save({ provider: e.currentTarget.value as AiProvider, model: '' })}>
        {#each providers as p (p)}<option value={p}>{t(`ai.provider.${p}`)}</option>{/each}
      </select>
    </div>
    <div class="row">
      <label class="lab" for="ai-url">{t('ai.settings.baseUrl')}</label>
      <input id="ai-url" class="wide" type="text" spellcheck="false" bind:value={baseUrl} onchange={() => void save({ baseUrl: baseUrl.trim() })} />
    </div>
    <div class="row">
      <label class="lab" for="ai-model">{t('ai.settings.model')}</label>
      <span class="grp">
        <input id="ai-model" class="wide" type="text" spellcheck="false" list="ai-models" bind:value={model} onchange={() => void save({ model: model.trim() })} onfocus={() => !ai.models.length && void loadModels().catch(() => undefined)} />
        <datalist id="ai-models">{#each ai.models as m (m.id)}<option value={m.id}></option>{/each}</datalist>
        <button class="icon-btn" aria-label={t('ai.settings.refreshModels')} title={t('ai.settings.refreshModels')} disabled={loadingModels} onclick={() => void refreshModels()}><Icon name="refresh" /></button>
      </span>
    </div>
    <div class="row">
      <label class="lab" for="ai-key">{t('ai.settings.apiKey')}</label>
      {#if keySaved && !replacing}
        <span class="grp">
          <span class="ok">{t('ai.settings.keySaved')}</span>
          <button class="btn" onclick={() => (replacing = true)}>{t('ai.settings.replace')}</button>
          <button class="btn danger" onclick={() => void removeKey()}>{t('ai.settings.remove')}</button>
        </span>
      {:else}
        <span class="grp">
          <input id="ai-key" class="wide" type="password" autocomplete="off" spellcheck="false" placeholder={t('ai.settings.keyPlaceholder')} bind:value={keyInput} />
          <button class="btn" disabled={!keyInput.trim()} onclick={() => void saveKey()}>{t('ai.settings.saveKey')}</button>
          {#if replacing}<button class="btn" onclick={() => void loadKey()}>{t('confirm.cancel')}</button>{/if}
        </span>
      {/if}
    </div>
    {#if !secure}<p class="help warn">{t('ai.settings.insecure')}</p>{/if}
    <div class="row">
      <label class="lab" for="ai-ctx">{t('ai.settings.context')}</label>
      <input id="ai-ctx" type="number" min="512" step="512" bind:value={contextTokens} onchange={() => void save({ contextTokens: Math.max(512, Math.round(Number(contextTokens) || 0)) })} />
    </div>
    <div class="row">
      <label class="lab" for="ai-searx">{t('ai.settings.searxng')}</label>
      <input id="ai-searx" class="wide" type="text" spellcheck="false" placeholder="http://localhost:8080" bind:value={searxng} onchange={() => void save({ searxngUrl: searxng.trim() })} />
    </div>
    <p class="help">{t('ai.settings.searxngHelp')}</p>
    <div class="acts">
      <button class="btn" disabled={testing} onclick={() => void test()}>{testing ? t('ai.settings.testing') : t('ai.settings.test')}</button>
      {#if result}
        <span class="res" class:bad={!result.ok} role="status">
          {result.ok ? t('ai.settings.testOk', { model: result.model, where: where(result) }) : t('ai.settings.testBad', { message: result.error ?? '' })}
        </span>
      {/if}
    </div>
    <p class="help">{t('ai.settings.privacy')}</p>
  {/if}
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
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 38px;
  }
  .lab {
    font-size: 14px;
  }
  .grp {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  input,
  select {
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--rule);
    border-radius: 6px;
    background: var(--paper);
    color: var(--ink);
    font-size: 14px;
  }
  input.wide {
    width: min(20rem, 52vw);
  }
  input[type='number'] {
    width: 8rem;
  }
  .help {
    margin: 0.2rem 0 0.8rem;
    color: var(--ink-3);
    font-size: 13px;
    max-width: 34rem;
  }
  .help.warn {
    color: var(--rubric);
  }
  .ok {
    color: var(--ok);
    font-size: 13px;
  }
  .acts {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin: 0.6rem 0;
  }
  .res {
    color: var(--ok);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .res.bad {
    color: var(--rubric);
  }
  @media (max-width: 760px) {
    .row {
      flex-wrap: wrap;
    }
  }
</style>
