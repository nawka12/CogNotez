# v5 status / handoff

*Updated 2026-10-13, about 13:40 WIB. The branch is `v5`; code lives in `desktop-v5/`. v4 in `desktop/` is untouched.*

## Done (committed)
| Commit | Milestone |
|---|---|
| `829ad1a` | Audit, redesign plan, approved interface sample |
| `60efd63` | M1: foundation (Electron 44, Svelte 5, sandbox/CSP/validated IPC), SQLite + FTS5 store, v4 importer, new UI with CodeMirror |
| `4a18489` | M2: locked notes (v4 → v5 upgrade), backups/restore, export/import, settings, templates, AppImage `5.0.0-alpha.1` |
| `97d63f2` | M3: AI Companion: streaming, inline merge review, research mode with SSRF guard |
| `fb37196` | Sync v2 spec (`docs/v5/sync-v2.md`) + `sync.*`/`google.*` bridge contract |
| `e82c340` | M4: Sync v2: engine, folder + Google Drive transports, E2EE, conflict UI, fixtures |
| `74628d1`, `9778157` | M5: translations, auto-update, release pipeline, v4 Drive import, sync hardening, fixes |

The AppImage at `desktop-v5/dist/` is rebuilt at M5.

## M4: Sync v2 (what shipped)
- **Engine** (`src/main/sync/`): format, crypto, graph, merge, engine, local, service; transports folder, memory, Google Drive. Spec: `docs/v5/sync-v2.md`.
- **Google sign-in:** loopback + PKCE + `state`, scope `drive.file`. No app-owned client is baked in yet (no `.env`), so users import their own OAuth client JSON in Settings → Sync.
- **UI:** Settings → Sync, status-bar chip, conflict banner (Open original / Keep both / Move copy to Trash), conflicted-copy marker in the list.
- **Fixtures for Android:** `docs/v5/sync-v2-fixtures/` (crypto, names, merge-*), see its README. `tests/sync-fixtures.test.ts` re-derives them; regenerate with `UPDATE_SYNC_FIXTURES=1`.
- **Tests:** scenarios, a 50-seed property test (every §8 situation is asserted to occur), the shared transport contract `tests/sync-transport-conformance.ts` run against memory, folder and Drive.
- **E2E (two real Electron instances, scratch `XDG_CONFIG_HOME`):**
  - Folder: `npm run build && TMPDIR=<scratch> node tests/e2e/sync-folder.mjs` (CDP ports 9341/9342).
  - Drive (fake Drive + fake OAuth): `npm run build`, copy `out/` and `package.json` to `<work>/app/`, then `node tests/e2e/sync-drive.mjs <work> [folder|plain|enc]` (CDP ports 9343/9344, fake server 11999). It also writes screenshots to `<work>/screens/`.
  - Covered: create/receive, concurrent body edits → identical conflicted copy on both sides, metadata-only merge without a copy, delete vs edit (edit wins), media, encrypted remote (wrong passphrase rejected, no plaintext on the remote), `meta.json` missing → stops, expired Google sign-in.

**Spec changes made during M4** (`sync-v2.md`):
- §2 merge rev: never nests (a merge over a merge prefixes the HLC successor), max 60 chars.
- §3 at most 2 parents (binary merges) so names stay under 255 bytes.
- §4 meta race: read back, every device adopts the oldest candidate; nobody deletes `meta.json`.
- §5 byte format: sorted keys, no whitespace.
- §8 criss-cross base is the recursive virtual merge of the candidates. The old "greatest rev" rule lost edits (fixture `merge-base.json` › criss-cross).
- §8 `conflictOf` merges as a scalar; tag normalization, media and conflicted-copy fields are fully specified; one merge revision per fold step.
- §3/§8 "same name = same content" now holds only for devices that see the same graph; the first file created wins.

## M5: ship polish (what shipped)
- **Translations:** es, id, ja, jv alongside en (`src/renderer/src/i18n/`), reusing v4's terminology. Settings → General → Language (System by default), switches live without losing editor text. Dates and sizes follow the language. Tests keep every locale in step with en and flag unreachable keys. Only 2 en keys were actually unused (the "179" was v4 keys never ported).
- **Auto-update:** electron-updater from GitHub Releases, nothing downloads until the user chooses (Settings → About, status-bar item). One background check a minute after start, opt-out toggle. Builds that can't replace themselves (dev, Linux outside an AppImage, unsigned macOS) say so; electron-updater is only loaded when an update is possible.
- **Release pipeline:** `.github/workflows/release-v5.yml` on `v5.*` tags: draft → Linux/Windows/macOS (universal) → publish; versions with `-` publish as prereleases and never become "latest", so v4 users don't get them. v4's `release.yml` skips `v5.*`. Signing and notarization turn on only when the secrets exist. See `docs/v5/RELEASING.md`.
- **Import:** the v4 Google Drive sync file (`cognotez_sync_backup.json`, plain or passphrase-encrypted) via Settings → Data, the palette or the empty state; `importer.files()` reports skipped files.
- **Sync hardening:** the engine always applies what the remote holds (fixes the Drive duplicate-name race); the HLC caps other devices' far-future revs at wall + 24 h and edit revs stay below 9e12 ms. Spec §2/§7.5/§10 updated.
- **Fixes:** research fetch pins the vetted DNS answer (DNS rebinding closed); closing a tab whose locked note holds unsaved text asks first; no tab looks active while Settings is open; the note info line no longer wraps next to the Companion; AI review Esc/Mod-Enter work anywhere in the note view.
- **Data folder decision:** v5 keeps `~/.config/cognotez-v5`. Sharing v4's folder would let v5's Chromium open v4's Local Storage in place, risking the rollback and import source.

## Needs the user (before a public release)
- Register the Google OAuth client and add `MAIN_VITE_GOOGLE_CLIENT_ID/SECRET` as GitHub secrets (steps in `RELEASING.md`). Until then users import their own client JSON.
- Optional signing secrets (Windows, macOS + notarization).
- Decide when to publish the first non-prerelease v5: it auto-updates v4 desktop users, and their desktop↔Android sync stops until Android speaks Sync v2.

## Next
- **Android:** audit, then port Sync v2 against `docs/v5/sync-v2-fixtures/`.

## Follow-up list (small)
- **Main-process strings are English:** sync/Google error messages, file-dialog filter names, the default Electron menu, "Untitled" in exports. The conflicted-copy title suffix is written into synced data, so translating it is a protocol decision.
- **Locked note, unsaved text on quit:** the close-tab warning exists, but quitting the app while a re-locked note holds unsaved text still drops it (memory only).
- **Markdown re-import** is not idempotent: importing the same `.md` twice makes two notes.
- **Sync, startup clock corner:** at startup the store receives only the greatest rev; this device's own far-future revs from a past wrong clock are received at the first round.
- **Untested here:** the macOS and Windows release jobs, notarization, `quitAndInstall`, and Drive 429/5xx/storage-full in the real app (unit-tested only).
- **Meta line:** with many tags the stats can start a new row with a stray "·"; at es 1100 px the pin/trash icons wrap.
- **Research rebinding test** dials a real public IP for up to 700 ms (TEST-NET ranges are blocked by the guard, by design).
