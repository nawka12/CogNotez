# v5 status / handoff

*Updated 2026-10-13, about 11:30 WIB. The branch is `v5`; code lives in `desktop-v5/`. v4 in `desktop/` is untouched.*

## Done (committed)
| Commit | Milestone |
|---|---|
| `829ad1a` | Audit, redesign plan, approved interface sample |
| `60efd63` | M1: foundation (Electron 44, Svelte 5, sandbox/CSP/validated IPC), SQLite + FTS5 store, v4 importer, new UI with CodeMirror |
| `4a18489` | M2: locked notes (v4 → v5 upgrade), backups/restore, export/import, settings, templates, AppImage `5.0.0-alpha.1` |
| `97d63f2` | M3: AI Companion: streaming, inline merge review, research mode with SSRF guard |
| `fb37196` | Sync v2 spec (`docs/v5/sync-v2.md`) + `sync.*`/`google.*` bridge contract |

The AppImage at `desktop-v5/dist/` was built at M2, so it has no AI or sync yet.

## In progress (uncommitted, in the working tree): M4 Sync v2
Both build agents hit the session limit mid-task. The partial work is on disk and NOT committed.

**Engine (deep-reasoning agent).**
- Written: `src/main/sync/{format,crypto,graph,merge,engine,folder,memory,local,service}.ts`, migration 2, store and guard changes.
- Tests: `tests/sync-{format,scenarios,property}.test.ts`, `sync-harness.ts`, `sync-objects.ts`.
- Still to do:
  - Fix the typecheck errors: `merge.ts:150` implicit any, plus `body`/`title` on a narrowed type in `sync-property.test.ts:164-165` and `sync-scenarios.test.ts:30`.
  - Fix 1 failing test: `sync-format › a merge rev sorts after all of its parents, and never nests`.
  - Confirm the scenario and property tests run green.
  - Generate `docs/v5/sync-v2-fixtures/`; none exist yet.
  - Write `tests/sync-transport-conformance.ts` (`runConformance`).
  - Wire the service in `index.ts`.
  - Run the two-instance folder e2e on ports 9341/9342.

**Drive, sign-in and UI (standard agent).**
- Written: `src/main/sync/{drive,google-auth}.ts`, `src/main/env.d.ts`.
- Renderer: `SettingsSync`, `ConflictBanner`, `syncChip`, `state/sync.svelte.ts`, plus status bar, list, palette and settings changes.
- Tests: `tests/drive-{transport,conformance,oauth}.test.ts`.
- It reported "Google sign-in works end to end in Electron" just before stopping.
- Still to do: gdrive wiring into the engine's `transports.gdrive`, the two-instance Drive e2e on ports 9343/9344, and screenshots.

**Last check:** lint is clean and svelte-check passes. `tsc` has 4 errors and vitest is at 309/310.

**Resume:** continue both agents from their transcripts with the original briefs, fix the items above, run the full gate, then commit M4.

## Next after M4
- **M5, ship:**
  - i18n port of the v4 locales, pruning the 179 unused keys;
  - code signing and notarization;
  - auto-update channel;
  - rebuild the AppImage;
  - decide the final userData path (currently `~/.config/cognotez-v5`);
  - optionally import the v1 Drive blob.
- **Android:** audit, then port Sync v2 against the fixtures.

## Follow-up list (small)
- **Unsaved text in locked notes:** closing a tab whose locked note re-locked with unsaved text discards that text. Warn before closing.
- **Settings view:** the tab bar still highlights the current tab while Settings is open.
- **`importer.files()`:** files it skips (oversize or unreadable) aren't reported to the user.
- **Note info line:** it wraps when the Companion is open (narrow editor column).
- **Research fetch:** DNS-rebinding gap. Pin the resolved address (it's marked with a `ponytail:` comment in `research.ts`).
- **AI review shortcuts:** Esc and Mod-Enter only work while the editor has focus. The buttons always work.
- **Stuck shell:** a stale `cat` from the M1 importer agent (PID 321023). It's harmless; `kill -9 321023 321068`.
