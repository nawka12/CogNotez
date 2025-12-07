# Desktop TODO – Technical Debt

- Harden markdown rendering: add HTML sanitization before any `innerHTML` usage (note previews, AI chat bubbles) to close renderer XSS risk. [Done]
- Fix decryption passphrase modal template: remove embedded `const t = ...` inside HTML string and centralize modal templating to avoid inline JS leakage. [Done]
- Split monolithic `src/js/app.js` (~9.6k LOC): separate concerns (UI, sync, encryption, AI/chat, notes rendering) into modules; remove duplicated legacy `renderNotesList` path vs notesManager to prevent drift.
- Centralize i18n helper: provide a shared `t()` wrapper to replace scattered inline definitions and ensure consistent translations.
- Reduce `innerHTML` templating + event rebind churn: prefer DOM construction helpers or templating with listener cleanup to lower XSS surface and memory leaks when dialogs/lists are rebuilt.
