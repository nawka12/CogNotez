import { app, session, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { buildCsp, isAppSender, isAppUrl } from './guards'
import { log } from './log'

/** The app's own URL: Vite dev server in dev, the packaged index.html (file URL) otherwise. */
let target = ''
export const setAppTarget = (url: string): void => {
  target = url
}

/** Throws unless the IPC call comes from the top frame of our own page. */
export function assertSender(e: IpcMainInvokeEvent): void {
  if (!isAppSender(e.senderFrame, target)) {
    log.warn('rejected IPC from', e.senderFrame?.url ?? '(no frame)')
    throw new Error('forbidden sender')
  }
}

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function installSecurity(devUrl?: string): void {
  const csp = buildCsp(devUrl)

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', (e) => e.preventDefault())
    const guard = (e: { preventDefault(): void }, url: string): void => {
      if (!isAppUrl(url, target)) e.preventDefault()
    }
    wc.on('will-navigate', (e) => guard(e, e.url))
    wc.on('will-redirect', (e) => guard(e, e.url))
    wc.setWindowOpenHandler(({ url }) => {
      try {
        if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) void shell.openExternal(url)
      } catch {
        /* unparsable URL: just deny */
      }
      return { action: 'deny' }
    })
  })
}
