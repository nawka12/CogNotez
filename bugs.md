Status information:
[New]: Newly discovered bug
[Broken]: Have tried to fix, but still not working
[Half-working]: Some aspect of it are fixed, but some are still broken
[Fixed]: Bugs has been squashed
[Wontfix]: Will not fix the bug.

[Wontfix] Notes toolbar: image/video buttons not present on initial render until RichMediaManager initializes; users may miss features or click targets shift when buttons inject after load.
[New] Preview toggle: find/replace highlight context can desync after switching modes; highlights rely on current DOM state and may not reflect selection accurately in preview mode.
[New] Undo/redo: history grows on every input including programmatic inserts (e.g., AI/Media), risking rapid history bloat; no debouncing/batching for large operations.
[Wontfix] Share button: `showShareOptions` requires `backendAPI`; if not initialized, clicking silently does nothing; needs disabled state or user feedback.
[Wontfix] Generate Tags: when no selection and empty note, button shows info toast but does not focus editor or provide guidance; minor UX gap.
[Wontfix] Password lock icon state: icon toggles via `updatePasswordLockIcon` only on note display or after dialog; state can be stale if protection changes elsewhere; needs broader refresh triggers.
[Wontfix] Toolbar button focus states: many inputs remove outlines; `.action-btn` lacks explicit focus-visible styling, reducing keyboard accessibility and visible focus.
[New] Toolbar overflow on narrow widths: `.editor-actions` wraps, but buttons have fixed min 40x40 and equal gaps, causing multi-line wrap that can push title/date; no overflow menu.
[Wontfix] Hover animation jump: `.action-btn:hover` uses translateY(-2px) and shadow; with wrap it jiggles layout, especially when buttons reflow; consider transform containment or reduced motion.
[New] Mixed icon sizes/contrast: icons rely on inherited font-size; no explicit icon size/color token for accessibility; low-contrast risk in some themes.
[New] Preview toggle active state: CSS defines `#preview-toggle-btn.active` but JS never toggles `.active`; visual state may not reflect mode.
[Fixed] Google Drive sync tags not readable: Tags show as IDs instead of names when syncing from another device. Root cause: (1) main.js missing `mergeTags: true` option when importing merged data during conflict resolution (line 1051), causing tag definitions to be dropped; (2) google-drive-sync.js `resolveConflicts()` not merging tags/note_tags/ai_conversations from remote data, only notes were merged. Fixed by adding merge options and implementing proper merging logic for all data types.