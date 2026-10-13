// Tiny CDP client + app launcher for the Drive e2e. Node >= 22 (global WebSocket / fetch).
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function until(fn, what, ms = 20000, step = 150) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v } catch (e) { last = e }
    await sleep(step)
  }
  throw new Error(`timeout waiting for ${what}${last ? `: ${last}` : ''}`)
}

export async function connectCdp(port) {
  const target = await until(async () => {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    return list.find((t) => t.type === 'page' && t.url.includes('index.html'))
  }, `CDP page on ${port}`, 30000)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); if (d.error) rej(new Error(d.error.message)); else res(d.result) }
  }
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Runtime.enable')
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  return {
    port, ev, send,
    async shot(path, clip) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })
      writeFileSync(path, Buffer.from(r.data, 'base64'))
      return path
    },
    // DOM helpers (run in the page).
    clickText: (text, sel = 'button, [role=tab], a, label') => ev(`(() => { const t = ${JSON.stringify(text)}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(t) && !e.disabled); if (!el) return false; el.click(); return true })()`),
    clickSel: (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || el.disabled) return false; el.click(); return true })()`),
    text: () => ev('document.body.innerText'),
    setValue: (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`),
    close: () => ws.close()
  }
}

/** Spawns the packaged-out copy of the app with its own XDG dirs. */
export function launch({ appDir, port, env }) {
  const cfg = mkdtempSync(join(tmpdir(), `cogn-e2e-${port}-`))
  const child = spawn(fileURLToPath(new URL('../../node_modules/.bin/electron', import.meta.url)), [appDir, `--remote-debugging-port=${port}`], {
    env: { ...process.env, XDG_CONFIG_HOME: cfg, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  })
  const log = []
  child.stdout.on('data', (d) => log.push(String(d)))
  child.stderr.on('data', (d) => log.push(String(d)))
  return { child, cfg, log, kill: () => { try { process.kill(-child.pid, 'SIGTERM') } catch { /* already gone */ } } }
}
