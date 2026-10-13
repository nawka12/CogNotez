// Prints HTML to a PDF in a hidden, locked-down window: no JavaScript, sandboxed, no preload.
// It uses the default session on purpose, so cognotez-media:// images resolve.
import { BrowserWindow } from 'electron'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The bundled Fraunces woff2 (hashed name in the renderer's assets), if this build has one. */
export function fraunces(): string | undefined {
  const dir = join(__dirname, '../renderer/assets')
  try {
    const f = readdirSync(dir).find((n) => /^fraunces-latin-opsz-normal.*\.woff2$/.test(n))
    return f ? pathToFileURL(join(dir, f)).href : undefined
  } catch {
    return undefined
  }
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const tmp = mkdtempSync(join(tmpdir(), 'cognotez-pdf-'))
  const win = new BrowserWindow({
    show: false,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
  })
  try {
    const file = join(tmp, 'note.html')
    writeFileSync(file, html)
    await win.loadFile(file)
    await new Promise((r) => setTimeout(r, 150)) // lazy @font-face loads can finish just after the load event
    return await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
  } finally {
    win.destroy()
    rmSync(tmp, { recursive: true, force: true })
  }
}
