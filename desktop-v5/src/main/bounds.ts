// Pure helpers for remembering the window's size and position. No Electron imports.
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}
export interface WindowState extends Bounds {
  maximized: boolean
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validates what was stored in `sys.window`; anything off-shape means "use the defaults". */
export function parseWindowState(v: unknown): WindowState | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (!num(o['x']) || !num(o['y']) || !num(o['width']) || !num(o['height'])) return null
  if (o['width'] < 400 || o['height'] < 300 || o['width'] > 20_000 || o['height'] > 20_000) return null
  return { x: Math.round(o['x']), y: Math.round(o['y']), width: Math.round(o['width']), height: Math.round(o['height']), maximized: o['maximized'] === true }
}

/** True when enough of the window overlaps some display that the user can still grab it. */
export function isVisible(b: Bounds, areas: readonly Bounds[]): boolean {
  return areas.some((a) => {
    const w = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x)
    const h = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y)
    return w >= 120 && h >= 60
  })
}
