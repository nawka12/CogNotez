import { t } from '../i18n'
import { newId, noteFrom, parseBuiltin, seedCustom } from '../lib/templates'
import type { Template } from '../lib/templates'
import { openNote } from './tabs.svelte'
import { refresh } from './library.svelte'
import { errorText, showToast, ui } from './ui.svelte'

const files = import.meta.glob('../templates/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Built-in templates, read-only, in a fixed order. */
export const builtins: Template[] = Object.entries(files)
  .map(([path, raw]) => parseBuiltin(path.replace(/^.*\/|\.md$/g, ''), raw))
  .sort((a, b) => a.name.localeCompare(b.name))

class Templates {
  custom = $state.raw<Template[]>([])
  loaded = false
}
export const templates = new Templates()

/** First read seeds from the CogNotez 4 import, once. */
export async function loadTemplates(): Promise<void> {
  if (templates.loaded) return
  try {
    const [custom, v4] = await Promise.all([window.api.settings.get('templates.custom'), window.api.settings.get('import.v4_templates')])
    const s = seedCustom(custom, v4)
    templates.custom = s.templates
    templates.loaded = true
    if (s.seeded) await window.api.settings.set('templates.custom', s.templates)
  } catch {
    templates.loaded = true
  }
}

async function saveCustom(next: Template[]): Promise<boolean> {
  try {
    await window.api.settings.set('templates.custom', next)
    templates.custom = next
    return true
  } catch (e) {
    showToast(t('toast.error', { message: errorText(e) }))
    return false
  }
}

export async function addTemplate(name: string, body: string): Promise<void> {
  if (await saveCustom([...templates.custom, { id: newId(), name: name.trim(), body }])) showToast(t('templates.saved', { name: name.trim() }))
}

export async function deleteTemplate(id: string): Promise<void> {
  await saveCustom(templates.custom.filter((x) => x.id !== id))
}

export async function newFromTemplate(tpl: Template, builtin: boolean): Promise<void> {
  try {
    const { title, body } = noteFrom(tpl, builtin)
    const note = await window.api.notes.create({ title, body })
    if (ui.filter.kind === 'trash') ui.filter = { kind: 'all' }
    await openNote(note.id, note)
    void refresh()
  } catch (e) {
    showToast(t('toast.error', { message: errorText(e) }))
  }
}
