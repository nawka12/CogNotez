// Pure template helpers. Built-ins are Markdown files whose first line is "# Title"; custom ones are {id,name,body}.
export interface Template {
  id: string
  name: string
  body: string
}

export interface TemplateNote {
  title: string
  body: string
}

/** The setting holds at most 64 KB; leave room for the JSON around the text. */
export const MAX_CUSTOM_BYTES = 60_000

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** `{{date}}` becomes today's date (YYYY-MM-DD, local time). */
export const fillDate = (text: string, d: Date = new Date()): string => text.replaceAll('{{date}}', ymd(d))

/** "# Daily journal {{date}}\n\nbody" -> a template named "Daily journal" whose body is the whole file. */
export function parseBuiltin(id: string, raw: string): Template {
  const first = raw.split('\n', 1)[0] ?? ''
  const name = first.replace(/^#\s+/, '').replace('{{date}}', '').trim()
  return { id, name: name || id, body: raw }
}

/** What a new note from this template starts as: built-ins carry their title in the first line. */
export function noteFrom(tpl: Template, builtin: boolean, d: Date = new Date()): TemplateNote {
  const text = fillDate(tpl.body, d)
  if (!builtin) return { title: tpl.name, body: text }
  const m = /^#[ \t]+(.*)\n?\n?/.exec(text)
  return m ? { title: m[1]!.trim(), body: text.slice(m[0].length) } : { title: tpl.name, body: text }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Reads `[{id,name,body}]` defensively; anything malformed is dropped. */
export function parseCustom(v: unknown): Template[] {
  if (!Array.isArray(v)) return []
  const out: Template[] = []
  for (const t of v) {
    if (isRecord(t) && typeof t['id'] === 'string' && typeof t['name'] === 'string' && typeof t['body'] === 'string' && t['name'].trim()) {
      out.push({ id: t['id'], name: t['name'], body: t['body'] })
    }
  }
  return out
}

/** v4 stored custom templates as {id, name, description, icon, content}. Keeps only what fits the setting size. */
export function fromV4(v: unknown): Template[] {
  if (!Array.isArray(v)) return []
  const out: Template[] = []
  let size = 2
  for (const t of v) {
    if (!isRecord(t) || typeof t['name'] !== 'string' || !t['name'].trim()) continue
    const tpl: Template = { id: `v4-${String(t['id'] ?? out.length)}`, name: t['name'].trim(), body: typeof t['content'] === 'string' ? t['content'] : '' }
    size += JSON.stringify(tpl).length + 1
    if (size > MAX_CUSTOM_BYTES) break
    out.push(tpl)
  }
  return out
}

export interface Seeded {
  templates: Template[]
  /** True when the list came from the v4 import and should now be saved as the user's own. */
  seeded: boolean
}

/** `custom` is setting templates.custom (null if never set); `v4` is setting import.v4_templates. */
export function seedCustom(custom: unknown, v4: unknown): Seeded {
  if (custom !== null && custom !== undefined) return { templates: parseCustom(custom), seeded: false }
  const templates = fromV4(v4)
  return { templates, seeded: templates.length > 0 }
}

export const newId = (): string => `custom-${crypto.randomUUID()}`
