// Two-instance Drive e2e for CogNotez v5 sync. Usage: node tests/e2e/sync-drive.mjs <workdir> [folder|plain|enc]; <workdir>/app must hold a copy of out/ + package.json.
// Phases: folder (screens), plain (connect, create->receive, concurrent edit conflict, delete-vs-edit), enc (encrypted remote + join).
// Each phase uses a fresh fake Drive server and fresh XDG_CONFIG_HOME dirs. Ports: 9343 (A), 9344 (B), fake server 11999.
import { start } from '../fixtures/fake-drive-server.mjs'
import { launch, connectCdp, sleep, until } from './cdp.mjs'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const log = (...a) => process.stdout.write(`${a.join(' ')}\n`)
const SP = process.argv[2]
const SHOTS = join(SP, 'screens')
mkdirSync(SHOTS, { recursive: true })
const results = []
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) process.exitCode = 1 }
const procs = []
const PNG = `Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))`
const imgOk = (c, url) => c.ev(`new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth === 1); i.onerror = () => res(false); i.src = ${JSON.stringify(url)} })`)
const driveEnv = (srv, extra = {}) => ({ COGNOTEZ_OAUTH_BASE: srv.oauth, COGNOTEZ_TEST_OAUTH_AUTO: '1', MAIN_VITE_GOOGLE_CLIENT_ID: 'fake-client', COGNOTEZ_DRIVE_BASE: srv.url, ...extra })

async function app(port, env) {
  const p = launch({ appDir: join(SP, 'app'), port, env })
  procs.push(p)
  const c = await connectCdp(port)
  await until(() => c.ev('!!window.api && document.body.innerText.includes("Sync")'), 'app ready')
  c.proc = p
  return c
}
const api = (c, expr) => c.ev(`(async () => { const api = window.api; return await (${expr}) })()`)
const settings = async (c) => {
  if (!(await c.text()).includes('Back to notes')) await c.clickSel('button[aria-label="Settings"]')
  await until(() => c.ev('!!document.getElementById("h-sync")'), 'settings page')
  await c.ev('document.getElementById("h-sync").scrollIntoView({ block: "start" })')
  await sleep(250)
}
const theme = async (c, name) => { await settings(c); await c.clickText(name, 'button,[role=radio],label'); await sleep(300) }
const setTheme = async (c, v) => { await c.ev(`(async () => { await window.api.settings.set('ui.theme', ${JSON.stringify(v)}) })()`).catch(() => {}); await theme(c, v[0].toUpperCase() + v.slice(1)); await settings(c) }
const shot = async (c, name, clip) => { await sleep(300); const f = join(SHOTS, name + '.png'); await c.shot(f, clip); log('  shot', f) }
const now = (c) => api(c, 'api.sync.now()')
const notes = async (c) => api(c, '(async () => { const l = await api.notes.list({ kind: "all" }); return Promise.all(l.map((n) => api.notes.get(n.id))) })()')
const byTitle = (list, t) => list.find((n) => n.title === t)
const connectGoogle = async (c) => {
  await settings(c)
  ok(`${c.port}: Connect button present`, await c.clickText('Connect Google account'))
  await until(async () => (await c.text()).includes('Connected as tester@example.test'), 'google connected in UI')
}
const turnOn = async (c, { enc } = {}) => {
  await settings(c)
  await c.clickSel('input[name=sync-kind][value=gdrive]')
  if (enc) {
    await c.clickSel('#sync-encrypt'); await sleep(150)
    await c.setValue('#sync-pass', enc); await c.setValue('#sync-pass2', enc)
  }
  await sleep(150)
  ok(`${c.port}: Turn on sync clickable`, await c.clickText('Turn on sync'))
  await until(async () => (await api(c, 'api.sync.status()')).configured, 'sync configured', 20000)
}
const settle = async (a, b, n = 3) => { for (let i = 0; i < n; i++) { await now(a); await now(b) } }
const kinds = (srv) => {
  const byId = new Map(srv.files().map((f) => [f.id, f]))
  const full = (f) => (byId.get(f.parents[0]) ? full(byId.get(f.parents[0])) + '/' : '') + f.name
  return srv.files().filter((f) => f.mimeType !== 'application/vnd.google-apps.folder' && !f.trashed).map((f) => ({ path: full(f), f }))
}
const REV = '\\d{13}-[0-9a-z]{4}-[a-z0-9]{8,32}(?:~[0-9a-f]{8})?' // same as src/main/sync/format.ts
const objRe = (ext) => new RegExp(`^CogNotez Sync/objects/n\\.[A-Za-z0-9_-]{8,64}\\.${REV}\\.(0|${REV}(?:\\+${REV})*)\\.${ext}$`)
const stopAll = async (...srv) => { for (const p of procs.splice(0)) p.kill(); await sleep(1200); for (const s of srv) await s.close() }

// ---------------------------------------------------------------- phase 0: folder mode + not connected
async function folderPhase() {
  log('== phase folder')
  const srv = await start(11999)
  const dir = mkdtempSync(join(tmpdir(), 'cogn-e2e-folder-'))
  const a = await app(9343, driveEnv(srv, { COGNOTEZ_TEST_SYNC_FOLDER: dir }))
  try {
    await settings(a)
    await shot(a, '01-settings-sync-not-connected')
    ok('folder: setup via UI', await a.clickText('Turn on sync'))
    await until(async () => (await api(a, 'api.sync.status()')).configured, 'folder configured')
    await api(a, 'api.notes.create({ title: "Folder note", body: "hello folder" })')
    await now(a)
    await settings(a)
    await shot(a, '03-settings-sync-folder-mode')
    const st = await api(a, 'api.sync.status()')
    ok('folder: target is the folder', st.transport === 'folder' && st.target === dir, st.target)
  } finally { await stopAll(srv) }
}

// ---------------------------------------------------------------- phase 1: plain Drive remote
async function plainPhase() {
  log('== phase plain')
  const srv = await start(11999)
  const env = driveEnv(srv)
  const a = await app(9343, env)
  const b = await app(9344, env)
  try {
    await connectGoogle(a)
    await shot(a, '02a-settings-sync-google-connected-not-synced')
    await connectGoogle(b)
    await turnOn(a)
    await turnOn(b)
    for (const c of [a, b]) {
      const st = await api(c, 'api.sync.status()')
      ok(`${c.port}: configured gdrive, target = account email`, st.transport === 'gdrive' && st.target === 'tester@example.test' || st.target === null, JSON.stringify([st.transport, st.target, st.state, st.lastError]))
    }

    // S1: A creates, B receives.
    const n1 = await api(a, 'api.notes.create({ title: "Alpha", body: "one\\ntwo\\nthree" })')
    await settle(a, b)
    let bl = await notes(b)
    ok('S1: B received Alpha with the same body', byTitle(bl, 'Alpha')?.body === 'one\ntwo\nthree', JSON.stringify(bl.map((n) => n.title)))
    const sa = await api(a, 'api.sync.status()'); const sb = await api(b, 'api.sync.status()')
    ok('S1: both idle without error after sync', sa.state === 'idle' && sb.state === 'idle' && !sa.lastError && !sb.lastError, JSON.stringify([sa.state, sa.lastError, sb.state, sb.lastError]))
    ok('S1: status target shows the account email after a round', sa.target === 'tester@example.test' && sb.target === 'tester@example.test', `${sa.target} / ${sb.target}`)

    // S2: concurrent body edits.
    await Promise.all([
      api(a, `api.notes.save({ id: ${JSON.stringify(n1.id)}, body: "A-edit\\ntwo\\nthree" })`),
      api(b, `api.notes.save({ id: ${JSON.stringify(n1.id)}, body: "one\\ntwo\\nB-edit" })`)
    ])
    await settle(a, b, 4)
    const la = await notes(a); const lb = await notes(b)
    const view = (l) => l.map((n) => [n.id, n.title, n.body, n.conflictOf ?? null]).sort((x, y) => x[0].localeCompare(y[0]))
    ok('S2: both sides hold the same notes (ids, titles, bodies, conflictOf)', JSON.stringify(view(la)) === JSON.stringify(view(lb)), JSON.stringify(view(la)))
    const copiesA = la.filter((n) => n.conflictOf === n1.id)
    ok('S2: exactly one conflicted copy on each side, with the same id', copiesA.length === 1 && lb.filter((n) => n.conflictOf === n1.id).length === 1 && copiesA[0].id === lb.find((n) => n.conflictOf === n1.id)?.id)
    ok('S2: original and copy carry the two different edits', new Set([byTitle(la, 'Alpha')?.body, copiesA[0]?.body]).size === 2 && [byTitle(la, 'Alpha')?.body, copiesA[0]?.body].sort().join('|').includes('A-edit') && [byTitle(la, 'Alpha')?.body, copiesA[0]?.body].join('|').includes('B-edit'), `${JSON.stringify(byTitle(la, 'Alpha')?.body)} / ${JSON.stringify(copiesA[0]?.body)}`)
    ok('S2: conflicted copy title', copiesA[0]?.title === 'Alpha (conflicted copy)', copiesA[0]?.title)
    const stc = await api(a, 'api.sync.status()')
    ok('S2: status reports conflicts = 1', stc.conflicts === 1, String(stc.conflicts))
    // banner on both instances
    for (const c of [a, b]) {
      await c.clickSel('button[aria-label="Back to notes"], button.back').catch(() => {})
      await c.clickText('Back to notes')
      await sleep(300)
      const opened = await c.ev(`(() => { const el = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Alpha \\(conflicted copy\\)/.test(e.textContent)).pop(); if (!el) return false; (el.closest('button, [role=option], li, a') ?? el).click(); return true })()`)
      ok(`${c.port}: opened conflicted copy`, opened)
      const banner = await until(() => c.ev('!!document.querySelector(\'[role=region][aria-label]\') && document.body.innerText.includes("conflicted")'), 'conflict banner')
      ok(`${c.port}: conflict banner visible`, banner)
    }
    await theme(a, 'Light').catch(() => {})
    await c_back(a)
    await openConflict(a)
    await shot(a, '05a-conflict-banner-light')
    await c_theme(a, 'Dark')
    await openConflict(a)
    await shot(a, '05b-conflict-banner-dark')
    // Keep both on A -> clears conflictOf, syncs
    ok('S2: "Keep both" on A', await a.clickText('Keep both'))
    await sleep(600)
    await settle(a, b, 2)
    const kb = await api(b, `api.notes.get(${JSON.stringify(copiesA[0].id)})`)
    ok('S2: Keep both propagates to B (conflictOf cleared)', !kb.conflictOf, String(kb.conflictOf))

    // S3: delete vs edit.
    const n2 = await api(a, 'api.notes.create({ title: "Beta", body: "to be deleted" })')
    await settle(a, b, 2)
    await Promise.all([
      api(a, `api.notes.save({ id: ${JSON.stringify(n2.id)}, body: "edited on A" })`),
      api(b, `(async () => { await api.notes.trash(${JSON.stringify(n2.id)}); await api.notes.deleteForever(${JSON.stringify(n2.id)}) })()`)
    ])
    await settle(a, b, 4)
    const ea = await api(a, `api.notes.get(${JSON.stringify(n2.id)}).catch(() => null)`)
    const eb = await api(b, `api.notes.get(${JSON.stringify(n2.id)}).catch(() => null)`)
    ok('S3: edit wins over delete on both sides', ea?.body === 'edited on A' && eb?.body === 'edited on A' && !ea?.deletedAt && !eb?.deletedAt, JSON.stringify([ea?.body, eb?.body]))

    // S4: media travels with the note.
    const mref = await api(a, `api.media.importBytes(${PNG}, 'image/png')`)
    await api(a, `api.notes.create({ title: "Pic", body: "![](" + ${JSON.stringify(mref.url)} + ")" })`)
    await settle(a, b, 2)
    ok('S4: B received the note with its media reference', (await notes(b)).some((n) => n.title === 'Pic' && n.body.includes(mref.hash)))
    ok('S4: media image loads on B through the protocol', await imgOk(b, mref.url))
    // server checks
    const files = kinds(srv)
    log(files.map((f) => `   ${f.path} (${f.f.bytes.length}B)`).join('\n'))
    ok('server: media name m.<sha256>', files.some((f) => f.path === `CogNotez Sync/media/m.${mref.hash}`))
    ok('server: root layout meta.json + objects/', files.some((f) => f.path === 'CogNotez Sync/meta.json') && files.every((f) => f.path === 'CogNotez Sync/meta.json' || /^CogNotez Sync\/(objects|media)\//.test(f.path)))
    const objs = files.filter((f) => f.path.includes('/objects/'))
    ok('server: object names match spec §3 (n.<id>.<rev>.<parents>.json)', objs.length > 0 && objs.every((f) => objRe('json').test(f.path)), objs.map((f) => f.path).join(' ').slice(0, 200))
    ok('server: no duplicate names', new Set(files.map((f) => f.path)).size === files.length)
    ok('server: never saw an update (PATCH/PUT) to a file', !srv.state.requests.some((r) => /^(PATCH|PUT) /.test(r)), srv.state.requests.filter((r) => /^(PATCH|PUT|DELETE) /.test(r)).join(','))
    ok('server: uploads == created files', srv.state.uploads === files.length, `${srv.state.uploads} vs ${files.length}`)
    const txt = files.map((f) => f.f.bytes.toString()).join('\n')
    ok('server: plaintext remote holds bodies as JSON (sanity)', txt.includes('A-edit') && txt.includes('B-edit'))
  } finally { await stopAll(srv) }
}
const c_back = async (c) => { await c.clickText('Back to notes'); await sleep(300) }
const c_theme = async (c, name) => { await settings(c); await c.clickText(name, 'button,[role=radio],label'); await sleep(300); await c_back(c) }
const openConflict = async (c) => {
  await c_back(c)
  await c.ev(`(() => { const el = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Alpha \\(conflicted copy\\)/.test(e.textContent)).pop(); (el.closest('button, [role=option], li, a') ?? el).click() })()`)
  await until(() => c.ev('document.body.innerText.includes("Keep both")'), 'banner')
}

// ---------------------------------------------------------------- phase 2: encrypted remote
async function encPhase() {
  log('== phase enc')
  const srv = await start(11999)
  const env = driveEnv(srv)
  const a = await app(9343, env)
  const b = await app(9344, env)
  const PASS = 'correct horse battery'
  const SECRET = 'SECRET-BODY-9f3a'
  try {
    await connectGoogle(a)
    await connectGoogle(b)
    await turnOn(a, { enc: PASS })
    const mref = await api(a, `api.media.importBytes(${PNG}, 'image/png')`)
    await api(a, `api.notes.create({ title: "Vault", body: ${JSON.stringify(SECRET)} + "\\n![](" + ${JSON.stringify(mref.url)} + ")" })`)
    await now(a)
    // B joins without a passphrase -> needs it
    await turnOn(b)
    let sb = await api(b, 'api.sync.status()')
    ok('enc: B joins and asks for the passphrase', sb.encrypted && sb.needsPassphrase, JSON.stringify(sb))
    await settings(b)
    await shot(b, '06-settings-sync-needs-passphrase')
    await b.setValue('.unlock input[type=password]', 'wrong wrong wrong')
    await b.clickText('Unlock')
    await until(async () => (await b.text()).includes('wrong') || (await b.text()).includes('Wrong'), 'wrong-passphrase message', 15000).catch(() => {})
    await shot(b, '06b-settings-sync-wrong-passphrase')
    await b.setValue('.unlock input[type=password]', PASS)
    await b.clickText('Unlock')
    await until(async () => !(await api(b, 'api.sync.status()')).needsPassphrase, 'unlocked')
    await settle(a, b, 2)
    const bl = await notes(b)
    ok('enc: B decrypts Vault', byTitle(bl, 'Vault')?.body.startsWith(SECRET), JSON.stringify(bl.map((n) => n.title)))
    ok('enc: media decrypted on B', await imgOk(b, mref.url))
    // edits both ways still sync
    await api(b, `api.notes.save({ id: ${JSON.stringify(byTitle(bl, 'Vault').id)}, body: "from B" })`)
    await settle(a, b, 2)
    ok('enc: B edit reaches A', (await notes(a)).find((n) => n.title === 'Vault')?.body === 'from B')
    const files = kinds(srv)
    log(files.map((f) => `   ${f.path} (${f.f.bytes.length}B)`).join('\n'))
    const all = files.map((f) => f.f.bytes.toString('latin1')).join('\n') + files.map((f) => f.path).join('\n')
    ok('server: no plaintext body/title in encrypted mode', !all.includes(SECRET) && !all.includes('from B') && !all.includes('Vault'))
    const objs = files.filter((f) => f.path.includes('/objects/'))
    ok('server: encrypted objects are .bin with spec names', objs.length > 0 && objs.every((f) => objRe('bin').test(f.path)), objs.map((f) => f.path).join(' ').slice(0, 200))
    const meta = files.find((f) => f.path.endsWith('/meta.json'))
    const m = JSON.parse(meta.f.bytes.toString())
    const media = files.filter((f) => f.path.includes('/media/'))
    ok('server: encrypted media is m.<hmac>.bin, hash not exposed', media.length === 1 && /^CogNotez Sync\/media\/m\.[0-9a-f]{64}\.bin$/.test(media[0].path) && !media[0].path.includes(mref.hash), media.map((f) => f.path).join(','))
    ok('server: meta.json has enc block and no passphrase', !!m.enc && !JSON.stringify(m).includes(PASS), Object.keys(m).join(','))
    ok('server: no PATCH/PUT on any file', !srv.state.requests.some((r) => /^(PATCH|PUT) /.test(r)))
    ok('server: uploads == created files', srv.state.uploads === files.length, `${srv.state.uploads} vs ${files.length}`)
    // screenshots
    await settings(a); await shot(a, '04a-settings-sync-drive-encrypted-dark')
    await setTheme(a, 'light'); await settings(a); await shot(a, '04b-settings-sync-drive-encrypted-light')
    await c_back(a)
    await shot(a, '07-statusbar-sync-chip', { x: 0, y: 690, width: 1100, height: 41 })
    await shot(a, '07b-full-window-after-sync')
    // error chip: expire the refresh token, wait for refresh failure
    srv.state.refreshInvalid = true; srv.expireAccessTokens()
    await api(a, 'api.sync.now().catch(() => null)')
    await sleep(400)
    const se = await api(a, 'api.sync.status()')
    log('  status after expired sign-in:', se.state, se.lastError)
    ok('expired sign-in surfaces as a sync error with the Reconnect message', se.state === 'error' && /Google sign-in expired\. Reconnect in Settings\./.test(se.lastError ?? ''), String(se.lastError))
    await shot(a, '08-statusbar-sync-chip-error', { x: 0, y: 690, width: 1100, height: 41 })
    await settings(a); await shot(a, '08b-settings-sync-error')
  } finally { await stopAll(srv) }
}

const only = process.argv[3]
try {
  if (!only || only === 'folder') await folderPhase()
  if (!only || only === 'plain') await plainPhase()
  if (!only || only === 'enc') await encPhase()
} catch (e) {
  console.error('FATAL', e)
  process.exitCode = 1
  for (const p of procs) log(p.log.join('').slice(-1500))
  await stopAll()
}
log('\n' + results.map((r) => r.join(' ')).join('\n'))
process.exit(process.exitCode ?? 0)
