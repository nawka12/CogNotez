// Shared Companion state: config, event routing, and the few things every AI surface needs.
import { SvelteMap } from 'svelte/reactivity'
import type { AiConfig, AiEvent, AiModel, AiRequest, AiStatus } from '../../../shared/api'
import { t } from '../i18n'
import { isLocalUrl } from '../lib/aiText'
import { errorText, showToast, ui } from './ui.svelte'

class AiState {
  config = $state.raw<AiConfig | null>(null)
  /** Result of the last connection test; cleared whenever the config changes. */
  status = $state.raw<AiStatus | null>(null)
  models = $state.raw<AiModel[]>([])
  /** Is the Companion drawer open? (setting ui.companion) */
  open = $state(false)
  /** Requests in flight, for the status bar. */
  working = $state(0)
  get local(): boolean {
    return this.status?.local ?? (this.config ? isLocalUrl(this.config.baseUrl) : true)
  }
}
export const ai = new AiState()

// ---------- config ----------

export async function loadAiConfig(): Promise<void> {
  try {
    ai.config = await window.api.ai.getConfig()
  } catch {
    ai.config = null // backend unavailable; the UI shows "no model"
  }
}

/** Saves a change, then re-reads the config because main fills in provider presets. */
export async function patchAiConfig(patch: Partial<AiConfig>): Promise<AiConfig> {
  await window.api.ai.setConfig(patch)
  ai.status = null
  ai.config = await window.api.ai.getConfig()
  return ai.config
}

export async function loadModels(): Promise<AiModel[]> {
  try {
    ai.models = await window.api.ai.models()
  } catch (e) {
    ai.models = []
    throw e
  }
  return ai.models
}

export async function setModel(id: string): Promise<void> {
  try {
    await patchAiConfig({ model: id })
    showToast(t('ai.modelSet', { model: id }))
  } catch (e) {
    showToast(t('toast.error', { message: errorText(e) }))
  }
}

// ---------- drawer ----------

export function setCompanionOpen(open: boolean, persist = true): void {
  ai.open = open
  if (persist) window.api.settings.set('ui.companion', open).catch(() => undefined)
}
export const toggleCompanion = (): void => setCompanionOpen(!ai.open)

export function openModelList(): void {
  ui.paletteSub = 'models'
  ui.paletteOpen = true
}
export function openEditMenu(): void {
  ui.paletteSub = 'edits'
  ui.paletteOpen = true
}

// ---------- requests and events ----------

type Handler = (e: AiEvent) => void
const handlers = new SvelteMap<string, Handler>()
/** Events can beat the `run()` reply; hold them until their handler is registered. */
const early = new SvelteMap<string, AiEvent[]>()

function dispatch(e: AiEvent): void {
  const h = handlers.get(e.requestId)
  if (!h) {
    early.set(e.requestId, [...(early.get(e.requestId) ?? []), e])
    if (early.size > 20) early.delete(early.keys().next().value!)
    return
  }
  if (e.type !== 'chunk') forget(e.requestId)
  h(e)
}

/** Subscribes once, from App. */
export const startAiEvents = (): (() => void) => window.api.onAiEvent(dispatch)

/** Starts a request and routes its events to `onEvent`. Rejects with the backend's message. */
export async function runAi(req: AiRequest, onEvent: Handler): Promise<string> {
  const { requestId } = await window.api.ai.run(req)
  handlers.set(requestId, onEvent)
  ai.working = handlers.size
  for (const e of early.get(requestId) ?? []) dispatch(e)
  early.delete(requestId)
  return requestId
}

/** Stops listening to a request (it finished, or the caller gave up). */
export function forget(requestId: string): void {
  handlers.delete(requestId)
  ai.working = handlers.size
}

export function abortRun(requestId: string): void {
  forget(requestId)
  window.api.ai.abort(requestId).catch(() => undefined)
}
