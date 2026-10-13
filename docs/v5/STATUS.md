# v5 status / handoff

*Updated 2026-10-13, about 12:45 WIB. The branch is `v5`; code lives in `desktop-v5/`. v4 in `desktop/` is untouched.*

## Done (committed)
| Commit | Milestone |
|---|---|
| `829ad1a` | Audit, redesign plan, approved interface sample |
| `60efd63` | M1: foundation (Electron 44, Svelte 5, sandbox/CSP/validated IPC), SQLite + FTS5 store, v4 importer, new UI with CodeMirror |
| `4a18489` | M2: locked notes (v4 → v5 upgrade), backups/restore, export/import, settings, templates, AppImage `5.0.0-alpha.1` |
| `97d63f2` | M3: AI Companion: streaming, inline merge review, research mode with SSRF guard |
| `fb37196` | Sync v2 spec (`docs/v5/sync-v2.md`) + `sync.*`/`google.*` bridge contract |
| `882dda5` | M4: Sync v2: engine, folder + Google Drive transports, E2EE, conflict UI, fixtures |

The AppImage at `desktop-v5/dist/` is rebuilt at M4 (AI + sync included).

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

## Next: M5, ship
- i18n port of the v4 locales, pruning the 179 unused keys;
- register the app-owned Google OAuth client (`MAIN_VITE_GOOGLE_CLIENT_ID/SECRET` at build time) and confirm `drive.file` brand verification;
- code signing and notarization;
- auto-update channel;
- decide the final userData path (currently `~/.config/cognotez-v5`);
- optionally import the v1 Drive blob.
- **Then Android:** audit, then port Sync v2 against the fixtures.

## Follow-up list (small)
- **Sync, Drive duplicate-name race:** a device whose `create` returned `created` trusts its own merge object, while Drive readers use the oldest of two same-name files. Two devices merging the same note concurrently with different graphs can then show different scalar fields until the next edit. No body is lost. Fix: read back after creating merge writes on Drive.
- **Sync, HLC ceiling:** a remote rev with a far-future ms moves every device's clock forward permanently (no drift cap). Year-2286 overflow throws in `objectName`.
- **Sync, faults in the real app:** Drive 429/5xx/storage-full are unit-tested only; the persisted incremental cursor across an app restart was not exercised end to end.
- **Unsaved text in locked notes:** closing a tab whose locked note re-locked with unsaved text discards that text. Warn before closing.
- **Settings view:** the tab bar still highlights the current tab while Settings is open.
- **`importer.files()`:** files it skips (oversize or unreadable) aren't reported to the user.
- **Note info line:** it wraps when the Companion is open (narrow editor column).
- **Research fetch:** DNS-rebinding gap. Pin the resolved address (it's marked with a `ponytail:` comment in `research.ts`).
- **AI review shortcuts:** Esc and Mod-Enter only work while the editor has focus. The buttons always work.
