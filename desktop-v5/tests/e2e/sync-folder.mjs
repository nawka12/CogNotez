// Two-instance Sync v2 end-to-end over a shared folder, in the real Electron app, driven over CDP (no extra deps).
// Usage (from desktop-v5/, after `npm run build`): node tests/e2e/sync-folder.mjs [appDir]
// appDir defaults to a fresh copy of out/ in a temp dir, so a concurrent rebuild can't swap files under the running app.
// Every instance gets its own temp XDG_CONFIG_HOME; ports 9341/9342. Prints one line per check, exits non-zero on failure.
import { spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const here = resolve(import.meta.dirname, '../..')
const made = []
const tmp = (p) => {
  const d = mkdtempSync(join(tmpdir(), `cognotez-e2e-${p}-`))
  made.push(d)
  return d
}
let app = process.argv[2]
if (!app) {
  app = tmp('app')
  cpSync(join(here, 'out'), join(app, 'out'), { recursive: true })
  writeFileSync(join(app, 'package.json'), readFileSync(join(here, 'package.json')))
  symlinkSync(join(here, 'node_modules'), join(app, 'node_modules'))
}
const electron = join(here, 'node_modules/.bin/electron')
const log = (line) => process.stdout.write(`${line}\n`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const procs = []
let failures = 0
const check = (ok, what, detail = '') => {
  if (!ok) failures++
  log(`${ok ? 'PASS' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`)
}

async function launch(name, port, folder) {
  const config = tmp(`cfg-${name}`)
  const env = { ...process.env, XDG_CONFIG_HOME: config, COGNOTEZ_TEST_SYNC_FOLDER: folder }
  delete env.ELECTRON_RENDERER_URL
  const p = spawn(electron, [app, `--remote-debugging-port=${port}`, '--password-store=basic'], { env, stdio: ['ignore', 'ignore', 'pipe'] })
  procs.push(p)
  p.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(`[${name}] ${d}`))
  let target
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(200)
    target = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).then((ts) => ts.find((t) => t.type === 'page')).catch(() => undefined)
  }
  if (!target) throw new Error(`${name}: no CDP page on ${port}`)
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    pending.get(msg.id)?.(msg)
    pending.delete(msg.id)
  }
  /** Evaluates `window.api` code in the renderer; returns its (awaited) JSON value or throws its error message. */
  const ev = (expr) =>
    new Promise((res, rej) => {
      const n = ++id
      pending.set(n, (msg) => {
        const r = msg.result
        if (msg.error || r?.exceptionDetails) rej(new Error(r?.exceptionDetails?.exception?.description?.split('\n')[0] ?? JSON.stringify(msg.error)))
        else res(r.result.value)
      })
      ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: `(async () => { const api = window.api; ${expr} })()`, awaitPromise: true, returnByValue: true } }))
    })
  for (let i = 0; i < 50; i++) {
    if (await ev('return !!api').catch(() => false)) break
    await sleep(200)
  }
  return {
    name, ev,
    notes: () => ev(`const s = await api.notes.list({ kind: 'all' }); const t = await api.notes.list({ kind: 'trash' });
      return Promise.all([...s, ...t].map((n) => api.notes.get(n.id))).then((ns) => ns.map((n) => ({ id: n.id, title: n.title, body: n.body, pinned: n.pinned, tags: n.tags, conflictOf: n.conflictOf, deletedAt: n.deletedAt })).sort((a, b) => a.id < b.id ? -1 : 1))`),
    sync: () => ev('return api.sync.now()'),
    close: () => ws.close()
  }
}

const both = async (a, b) => {
  for (const d of [a, b, a, b]) await d.sync()
}
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)

try {
  // ---- plaintext remote --------------------------------------------------------------------
  const shared = tmp('folder')
  const A = await launch('A', 9341, shared)
  const B = await launch('B', 9342, shared)
  const sa = await A.ev("return api.sync.setup({ transport: 'folder' })")
  check(sa?.configured && sa.target === shared, 'A sets up the folder', JSON.stringify(sa?.lastError))
  const n = await A.ev("return api.notes.create({ title: 'From A', body: 'e2e plain body', tags: ['e2e'] })")
  await A.sync()
  const sb = await B.ev("return api.sync.setup({ transport: 'folder' })")
  check(sb?.configured && !sb.encrypted, 'B joins the same folder')
  await B.sync()
  const gotB = (await B.notes()).find((x) => x.id === n.id)
  check(gotB?.body === 'e2e plain body' && gotB?.title === 'From A', 'B receives the note created on A')

  // Concurrent body edits: merged note + one identical conflicted copy on both sides.
  await A.ev(`return api.notes.save({ id: '${n.id}', body: 'A offline edit' })`)
  await B.ev(`return api.notes.save({ id: '${n.id}', body: 'B offline edit' })`)
  await both(A, B)
  const [na, nb] = [await A.notes(), await B.notes()]
  const copiesA = na.filter((x) => x.conflictOf === n.id)
  check(same(na, nb), 'both devices converge after a body conflict', `${na.length} notes each`)
  check(copiesA.length === 1, 'exactly one conflicted copy', copiesA.map((c) => `${c.id} "${c.title}"`).join(', '))
  check(same(na.map((x) => x.body).filter((x) => x.includes('offline')).sort(), ['A offline edit', 'B offline edit']), 'neither body is lost')

  // Metadata-only concurrent edits: no copy.
  await A.ev(`return api.notes.save({ id: '${n.id}', pinned: true })`)
  await B.ev(`return api.notes.save({ id: '${n.id}', title: 'Renamed on B', tags: ['e2e', 'b'] })`)
  await both(A, B)
  const [ma, mb] = [await A.notes(), await B.notes()]
  const m = ma.find((x) => x.id === n.id)
  check(same(ma, mb) && m.pinned && m.title === 'Renamed on B' && same(m.tags, ['b', 'e2e']), 'metadata edits merge', JSON.stringify(m))
  check(ma.filter((x) => x.conflictOf === n.id).length === 1, 'no new conflicted copy for metadata edits')

  // Delete on A vs edit on B: the edit wins.
  await A.ev(`await api.notes.trash('${n.id}'); return api.notes.deleteForever('${n.id}')`)
  await B.ev(`return api.notes.save({ id: '${n.id}', body: 'B kept writing' })`)
  await both(A, B)
  const [da, db] = [await A.notes(), await B.notes()]
  check(same(da, db) && da.find((x) => x.id === n.id)?.body === 'B kept writing', 'delete vs edit: the edit wins on both')

  // meta.json disappears.
  rmSync(join(shared, 'meta.json'))
  const gone = await A.sync()
  check(gone.state === 'error' && gone.lastError === 'The sync location looks empty or was replaced.', 'meta.json missing stops with GONE', gone.lastError)
  check(!readdirSync(shared).includes('meta.json'), 'meta.json is not re-created')
  log(`plain: A ${da.length} notes, B ${db.length} notes; copy ids A=${copiesA.map((c) => c.id)} B=${nb.filter((x) => x.conflictOf === n.id).map((c) => c.id)}`)
  A.close()
  B.close()
  for (const p of procs.splice(0)) p.kill()
  await sleep(1000)

  // ---- encrypted remote --------------------------------------------------------------------
  const secret = tmp('folder-enc')
  const C = await launch('C', 9341, secret)
  const D = await launch('D', 9342, secret)
  const sc = await C.ev("return api.sync.setup({ transport: 'folder', passphrase: 'correct horse battery' })")
  check(sc?.encrypted && !sc.needsPassphrase, 'C creates an encrypted remote', JSON.stringify(sc))
  const e = await C.ev("return api.notes.create({ title: 'Quokkatitle', body: 'zebracorn secret body', tags: ['ocelotag'] })")
  await C.sync()
  const sd = await D.ev("return api.sync.setup({ transport: 'folder' })")
  check(sd?.encrypted && sd.needsPassphrase, 'D joins and is asked for the passphrase')
  const wrong = await D.ev("return api.sync.unlock('wrong horse battery').then(() => 'accepted', (e) => e.message)")
  check(/wrong passphrase/.test(wrong), 'a wrong passphrase is rejected', wrong)
  await D.ev("return api.sync.unlock('correct horse battery')")
  await D.sync()
  const gotD = (await D.notes()).find((x) => x.id === e.id)
  check(gotD?.body === 'zebracorn secret body', 'D decrypts the note after unlocking', JSON.stringify(await D.ev('return api.sync.status()')))
  const files = []
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((f) => (f.isDirectory() ? walk(join(d, f.name)) : files.push(join(d, f.name))))
  walk(secret)
  const leaks = files.filter((f) => /zebracorn|Quokkatitle|ocelotag/.test(readFileSync(f, 'latin1')))
  check(leaks.length === 0, 'no plaintext in the encrypted folder', `${files.length} files scanned`)
  check(files.every((f) => f.endsWith('meta.json') || f.endsWith('.bin')), 'every remote file but meta.json is .bin')
  C.close()
  D.close()
} catch (err) {
  failures++
  log(`FAIL driver: ${err.stack ?? err}`)
} finally {
  for (const p of procs) p.kill()
  await sleep(500)
  if (!process.env.E2E_KEEP) for (const d of made) rmSync(d, { recursive: true, force: true })
  log(failures ? `${failures} check(s) failed` : 'all e2e checks passed')
  process.exit(failures ? 1 : 0)
}
