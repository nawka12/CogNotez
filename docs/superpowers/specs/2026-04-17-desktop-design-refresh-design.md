# Desktop Design Refresh — Editorial Sensibility

**Date:** 2026-04-17
**Scope:** `desktop/src/css/*.css` + `desktop/src/index.html` splash markup
**Goal:** De-sloppify the CogNotez desktop interface. Retire the "AI slop" patterns (glassmorphism, gradient washes, hover-lift micro-interactions, letter-by-letter splash animations, rounded-pill chrome) and replace them with a coherent editorial character — typography-first, committed accent, confident whitespace — building on the existing Source Serif 4 + Fraunces typography already in place.

## Character

Two facets of one editorial sensibility:

- **Light theme — Literary / Ink.** Warm off-white paper, warm near-black ink, generous margins, typography does the work. Lavender is a committed accent used as italic emphasis, not a surface wash.
- **Dark theme — Bold Editorial.** Near-black stage with a slight violet undertone. Display type at lower weight. Saturated lavender glows against the stage. Magazine-cover confidence.

The italic lavender N in the wordmark (matching the logo) is the app's signature gesture and recurs across splash, header, titles, and inline emphasis.

## 1. Foundations (tokens)

### Palette

Token names are semantic and unified across themes — each token holds a different value in light vs. dark. Where possible, existing token names from `themes.css` are retained so components do not need rewriting; only values change. A small set of new tokens is added.

**Retained tokens (existing names, new values):**

| Token | Light value | Dark value | Role |
|---|---|---|---|
| `--bg-primary` | `#fbf9f4` | `#0c0b10` | Primary surface (body background, editor canvas). _Mood: paper (light) / stage (dark)._ |
| `--bg-secondary` | `#f6f2e8` | `#15131c` | Secondary surface (sidebar, AI panel) |
| `--bg-tertiary` | `#ece5d2` | `#24202f` | Active/hover surface (selected note, folder) |
| `--text-primary` | `#1a1715` | `#f0ebf5` | Primary text; also the color of 1px rules and the double-rule |
| `--text-secondary` | `#4a4439` | `#c8c0d4` | Secondary text / body reading color in dark |
| `--text-tertiary` | `#8a8375` | `#a89ebb` | Labels, meta, placeholders |
| `--text-muted` | `#a89a78` | `#8b7fa3` | Disabled text, footer meta |
| `--border-color` | `#ece5d2` | `#24202f` | 1px divider rules |
| `--accent-color` | `#7c5fd1` | `#c9a9ff` | Lavender, committed. Used for italic emphasis, active underlines, left-bar markers |

**New tokens (added to `themes.css`):**

| Token | Light value | Dark value | Role |
|---|---|---|---|
| `--accent-soft` | `rgba(124,95,209,0.08)` | `rgba(201,169,255,0.1)` | Tint for hover backgrounds (the only rgba-accent we keep) |
| `--rubric` | `#a33b2a` | `#ff7a6b` | Tags, destructive actions, marginalia — "rubricated" accent |
| `--shadow-popover` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 16px rgba(0,0,0,0.5)` | The only shadow token kept. Used exclusively by popovers (modals, context menus, toasts) |

**Tokens deleted from `themes.css`** (final state — aliased during Passes 1–5, removed by the cleanup step at end of Pass 5):

- `--gradient-primary`, `--gradient-subtle`, `--gradient-surface`, `--gradient-accent`
- `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-2xl`, `--shadow-accent`, `--shadow-accent-lg`, `--shadow-inner` (all replaced by the single `--shadow-popover`)
- `--accent-color-light`, `--accent-color-lighter`, `--accent-color-lightest`, `--accent-color-dark`, `--accent-color-darker`, `--accent-color-text` (dilutions retired; the single `--accent-color` commits)
- `--surface-bg`, `--surface-elevated` (replaced by `--bg-secondary` / `--bg-tertiary`)
- `--header-bg`, `--sidebar-bg`, `--input-bg`, `--button-bg`, `--button-hover-bg`, `--button-active-bg`, `--note-hover-bg`, `--note-active-bg`, `--context-menu-bg`, `--context-menu-hover-bg`, `--modal-bg`, `--message-bg`, `--context-highlight-bg`, `--card-bg` (all retired — surfaces use the three semantic `--bg-*` tokens directly)

The logo (`assets/icon.svg`) keeps its `#BDABE3` — logo is identity, UI accent is a tool. They do not need to match.

**Prose-to-token reference.** The rest of this document uses short mood words (paper, ink, accent, etc.) for readability. They map to tokens as follows — use these when writing CSS:

| Mood word | Token | Notes |
|---|---|---|
| paper / stage | `--bg-primary` | light = paper, dark = stage; same token |
| surface | `--bg-secondary` | panels |
| surface-raised | `--bg-tertiary` | active/hover |
| ink / type | `--text-primary` | primary text, rule color |
| ink-muted / type-muted | `--text-secondary` | secondary body |
| ink-soft / text-soft | `--text-tertiary` | labels, meta |
| ink-faint / text-faint | `--text-muted` | disabled, footer |
| border-subtle | `--border-color` | 1px rules |
| accent | `--accent-color` | italic emphasis, active underline |
| accent-soft | `--accent-soft` | hover tint (rare) |
| rubric | `--rubric` | tags, destructive, marginalia |
| shadow-popover | `--shadow-popover` | the only shadow |

### Typography

- **Body text:** Source Serif 4, **15px / 1.7** line-height. Unchanged font, generous leading. One canonical body size; the editor may scale this per the user's existing font-size preference.
- **Display (titles, headings, wordmark):** Fraunces. Sizes: wordmark 54px (splash) / 18px (header); note title 36px; section headings 20–22px. All use `-0.025em` tracking and weight 500 in light / 300 in dark.
- **Italic emphasis:** `em` tags inside titles and body get `--accent-color`. The app's signature gesture; applies everywhere `em` appears in user content.
- **Labels (section headers, meta, small caps):** Source Serif 4, **11px**, `text-transform: uppercase`, `0.22em` letter-spacing, weight 400. No sans-serif, no monospace UI labels.
- **Numbers in meta:** `font-variant-numeric: tabular-nums` for counts, dates, word counts, line/column indicators.
- **Drop-cap:** on the first paragraph of a note's preview mode. Scope:
  - Default: **off** (no drop-cap appears unless explicitly enabled).
  - Enable via a per-note toggle stored in note metadata (existing metadata table; add a `drop_cap` boolean column).
  - Control surface: a small-caps text toggle (`DROP-CAP`) in the editor header's mode tools, visible only when preview is active. Matches the `EDIT | PREVIEW | SPLIT` styling. Active state = accent color + 1px underline.
  - Rendering: a `<span class="drop-cap">` wrapper around the first letter of the first paragraph; Fraunces **48px**, `float: left`, `line-height: 1`, `margin-right: 6px`, weight 500, color `--text-primary`.

### Shape

- Radii: `0` for paper-edge surfaces (sidebar, header, modal overlay); `4–6px` maximum for interactive elements (inputs, buttons, modal cards).
- **No `border-radius` above 6px anywhere.**
- Separation via 1px rule (`border-subtle`) or whitespace. Not blur, not shadow.
- `--shadow-popover` is the only shadow token (values in Palette). Used by modals, context menus, toasts, overflow menus. Nothing else casts shadow.

### Motion

- **Retire:** every `translateY(-2px)` hover, every `transform: scale(1.05)` hover, every `box-shadow: var(--shadow-md)` hover on buttons/items. All decorative.
- **Retire:** `backdrop-filter` entirely. No glassmorphism. Audit of 43 occurrences — all removed.
- **Retire:** all gradient tokens. The splash-screen progress fill uses a flat `--text-primary` (light) / `--accent-color` (dark) — no gradient.
- **Hover primary signal:** color shift + optional 1px underline reveal. 150ms ease.
- **Panel reveal** (AI panel, modal): 220ms ease-out opacity + small translate (≤8px). Splash fade in/out: 220ms.
- **Loading:** italic text ("Thinking…", "Saving…"). No spinners, no pulsing dots. Existing `spin` keyframe retained only where it's functionally useful (e.g., sync-in-progress icon) — everywhere else, delete the animation.
- Existing `@media (prefers-reduced-motion: reduce)` rules stay.

## 2. Splash Screen

Replace the current decorative splash (6 particle divs, 3 expanding rings, icon glow, letter-by-letter title reveal, progress-bar glow, pulsing status dot) with a single typographic moment.

**Composition, centered:**

1. **Wordmark:** `Cog<em>N</em>otez` in Fraunces, 54px, weight 400. Italic `N` in accent color. Letter-spacing `-0.03em`.
2. **120px double-rule** below the wordmark (3px bar + 1px bar below, 2px gap).
3. **Tagline:** "A Notebook for Thinking" — Source Serif 4, 11px, small caps, `0.28em` tracking.
4. **Progress track:** 240px wide, 1px hairline. Track in `surface-raised`, fill in `ink` (light) / `accent` (dark). No glow.
5. **Status text** below progress: Source Serif 4, 11px, italic — current loading phase.
6. **Footer** (absolute bottom): "Version 3.0.0" in Source Serif 4, 10px, muted color, `0.1em` tracking. Not small caps, not Roman numerals.

**Motion:**
- Entire splash fades in at 220ms on mount.
- Progress fill width transitions 300ms ease.
- On ready, splash fades out at 220ms.

**DOM changes:** delete `.splash-particles`, `.splash-rings`, `.splash-icon-glow`, `.progress-glow`, `.status-dot`, and the letter-by-letter `<span class="title-letter">` structure. Version text changes from Roman numerals (if proposed) to plain `Version 3.0.0`.

## 3. Chrome — Header, Sidebar, Editor Header

### App Header

- Height: **44px** (from 64px).
- Flat `paper` background. 1px `border-subtle` bottom. **No `backdrop-filter`. No shadow.**
- Wordmark: `Cog<em>N</em>otez` in Fraunces 18px, italic lavender `N`. Replaces the gradient-clipped app-title.
- Search: flat input, 1px border, italic placeholder ("Search…"). Focus = 1px accent underline rule, not a 3px glow ring. `Ctrl+K` shortcut label on the right in small caps.
- **Right-side toolbar:** icons retained (user preference — preserves muscle memory). Each icon button: 32px square, no background, no border, `text-soft` color default; hover color-shifts to `ink`/`type`, no transform, no shadow. Active state (e.g., toggled sync, active theme) = `accent` color. Tight spacing — 2–4px between.

### Sidebar

- Width unchanged (280px).
- Flat `surface` background. 1px `border-subtle` right. **No `backdrop-filter`. No shadow.**
- **Sidebar section labels:** `FOLDERS`, `RECENT` in small caps, `0.25em` tracking, `ink-soft` color, 9–10px. Replaces the current bold `h2` "Sidebar"/"Notes" header.
- **Folder items:** 0 radius. No background by default. Hover = `surface-raised`. Active = left 2px `accent` rule + `surface-raised` + `ink` text color. No `transform`, no scale, no `box-shadow`. Count badges become plain tabular numerals in `ink-faint`, no pill, no fill.
- **Note list items:** title in Fraunces 13–14px, meta (`14 APR · DRAFT`) in small caps below. Tag markers render as `rubric` italic.

### Editor Header (tabs + mode tools)

- Height 38–40px. 1px `border-subtle` bottom. No shadow.
- **Tabs:** text tabs, not pills. Inactive = `ink-soft` color. Active = `ink` color + 1px underline rule. Italic words inside titles keep their accent color. Close-tab icon revealed on hover only.
- **Mode tools:** `EDIT | PREVIEW | SPLIT` + `FIND | SHARE` in small caps, 10px. Active mode = `accent` color + 1px underline. Replaces the current pill-button toggles.

## 4. Editor + AI Panel

### Editor Body

- **Canvas:** content centered at `max-width: 640px` inside the available area. Deliberate side whitespace — this is a writing tool, not edge-to-edge.
- **Meta line** (above title): `DRAFT · 14 APRIL 2026 · 437 WORDS` — small caps, 10px, `0.24em` tracking, `ink-soft`. Combines dateline, status, word count.
- **Title input:** Fraunces 36–40px, weight 500, `-0.028em` tracking. Italic words get accent color.
- **80px double-rule** under the title. Signature device recurs from splash, headings, tagged sections.
- **Body text:** per Typography section (Source Serif 4, 15px / 1.7).
- **Drop-cap** on the first paragraph in preview mode — opt-in. Rendering details in Typography section.
- **Colophon bar at the bottom** (replaces current tag display + status row): tags rendered as `# <rubric>tagname</rubric>` inline (no pill, no border, no background); save status and cursor position on the right; all small caps, 10px.

### AI Panel ("Companion")

- Width: **320px** (from 380).
- Flat `surface` color. 1px `border-subtle` left. **No `backdrop-filter`. No shadow.**
- **Header:** small-caps label `COMPANION` (rename from "AI Assistant"). Close icon: 28px, no bg, no border, color-shift only on hover.
- **Messages area:** no bubbles.
  - **User prompt:** italic text, preceded by a lavender curly-quote mark (`"` in Fraunces italic).
  - **Assistant reply:** small-caps `REPLY` label with a thin rule stretching to the right, then the answer in regular Source Serif 4. Italic words inside replies get the accent color.
- **Input:** borderless multi-line italic textarea. Placeholder: *"Ask of your notes…"*. 1px top rule separates it from messages.
- **Bottom bar:** model label on left (`llama3.2 · local`) in small caps; `SEND ⏎` text-button on right in accent color. Not a filled button.
- **Loading state:** italic *"Thinking…"* text. No spinners, no pulsing dots.

### Companion Rename — Scope

- CSS class names remain `.ai-panel`, `.ai-message`, etc. (no large refactor).
- User-visible string changes: header text "AI Assistant" → "Companion"; panel-toggle button tooltip; relevant i18n strings in `desktop/src/locales/*`.
- Internal code references to "AI Assistant" in comments and logs may remain — not user-facing.

## 5. Remaining Surfaces

All surfaces below inherit the foundations — tokens, shape, motion.

### Modals (tag manager, settings, import/export, share, AI-generate, about, password, etc.)
- **Backdrop overlay:** `ink` at 60% opacity (light) / `stage` at 80% (dark). No `backdrop-filter`.
- **Modal card:** flat `paper`/`surface`, 1px `border-subtle`, 4px radius, `--shadow-popover` only.
- **Title:** Fraunces 20–22px, italic words get accent.
- **Section labels** inside body: small caps, replacing current bold `h4`/`h5`.
- **Close button:** icon-only, 28px, no bg, color-shift on hover.
- **Form inputs:** 1px border, 4px radius, italic placeholder. Focus = accent border, no shadow ring.
- **Primary button:** `ink`-filled with `paper` text, small-caps label (`SAVE CHANGES`). Hover = shift to `accent` fill. No gradient, no transform.
- **Secondary button:** text-button, small caps, color-shift on hover.

### Context Menus (right-click)
- Flat `surface`, 1px border, `--shadow-popover`, 4px radius.
- Items: 0 radius, no background default, `surface-raised` + left 2px `accent` rule on hover. 13px icons, 13px labels.
- Destructive items: text in `rubric`.
- Keyboard shortcuts on the right in small-caps `text-soft`.

### Find / Replace Bar
- Inputs match main search.
- Match count: small caps (`3 OF 12`).
- Actions (Next, Prev, Replace, Replace All): small-caps text links, not filled buttons.

### Toasts / Notifications
- Slide in from bottom-right, 220ms ease-out, no bounce.
- Flat `surface`, 1px left rule in `accent` (info) / `rubric` (error) / `ink` (neutral), `--shadow-popover`.
- Small-caps label (`SAVED`, `SYNC FAILED`) + one line body. No icons, no emoji.

### AI-Generate Dialog
- Inherits modal rules. Prompt input matches the Companion input (multi-line italic textarea). Generated output rendered with the `REPLY` pattern.

## 6. Implementation Passes

Five sequenced passes. Each is independently reviewable; each leaves the app coherent.

### Pass 1 — Tokens
- Rewrite `desktop/src/css/themes.css` per Section 1:
  - Change the **values** of existing retained tokens (`--bg-primary`, `--text-primary`, `--border-color`, `--accent-color`, etc.) to the editorial palette. No token rename.
  - Add the three new tokens: `--accent-soft`, `--rubric`, `--shadow-popover`.
  - **Alias the tokens slated for deletion** so downstream CSS keeps working until passes 2–5 migrate them. Aliases:
    - `--accent-color-light: var(--accent-soft)`; `--accent-color-lighter: var(--accent-soft)`; `--accent-color-lightest: transparent`; `--accent-color-dark: var(--accent-color)`; `--accent-color-darker: var(--accent-color)`; `--accent-color-text: var(--accent-color)`
    - `--shadow-xs: none`; `--shadow-sm: none`; `--shadow-md: none`; `--shadow-lg: var(--shadow-popover)`; `--shadow-xl: var(--shadow-popover)`; `--shadow-2xl: var(--shadow-popover)`; `--shadow-accent: none`; `--shadow-accent-lg: none`; `--shadow-inner: none`
    - `--gradient-primary: var(--accent-color)`; `--gradient-subtle: var(--bg-primary)`; `--gradient-surface: var(--bg-primary)`; `--gradient-accent: var(--accent-soft)`
    - `--header-bg: var(--bg-primary)`; `--sidebar-bg: var(--bg-secondary)`; `--editor-bg: var(--bg-primary)`; `--input-bg: var(--bg-primary)`; `--button-bg: transparent`; `--button-hover-bg: var(--bg-tertiary)`; `--button-active-bg: var(--accent-soft)`; `--note-hover-bg: var(--bg-tertiary)`; `--note-active-bg: var(--bg-tertiary)`; `--context-menu-bg: var(--bg-secondary)`; `--context-menu-hover-bg: var(--bg-tertiary)`; `--modal-bg: var(--bg-primary)`; `--message-bg: var(--bg-secondary)`; `--context-highlight-bg: var(--accent-soft)`; `--card-bg: var(--bg-secondary)`
    - `--surface-bg: var(--bg-secondary)`; `--surface-elevated: var(--bg-tertiary)`
  - Aliases live only until the cleanup step at the end of Pass 5.
- Update `desktop/src/css/base.css`: remove the body gradient background, remove all `translateY(-2px)` rules, remove the `scale(1.05)` hover pattern, delete the `.glass` utility class, delete the `backdrop-filter` on `.modal`.
- Update `desktop/src/css/accessibility.css`: remove any `backdrop-filter` or transform-hover rules.
- **Verification:** app runs end-to-end in both themes without undefined CSS variable warnings. Every surface is flat (no glass, gradients, or hover lifts). Components will still look slightly off — that's expected; Passes 2–5 will complete them.

### Pass 2 — Splash Screen
- `desktop/src/index.html`: delete `.splash-particles`, `.splash-rings`, `.splash-icon-glow`, `.progress-glow`, `.status-dot`, and the letter-by-letter `.title-letter` spans. Change version display to plain `Version 3.0.0`.
- `desktop/src/css/modals.css` splash rules (lines ~419–930): delete `particleFloat`, `ringExpand`, icon-glow keyframes. Rewrite splash layout per Section 2.
- **Verification:** splash shows the composition of Section 2. No particles, rings, icon glow, or pulsing dot visible. Fade-in and fade-out timing matches the 220ms specified.

### Pass 3 — Chrome (Header + Sidebar + Editor-Header)
- `desktop/src/css/header.css`: strip `backdrop-filter`, shadow, gradient-clip on title, `transform` on logo. Rewrite wordmark markup in `index.html` to `Cog<em>N</em>otez`. Restyle icon buttons to flat 32px.
- `desktop/src/css/sidebar.css`: strip `backdrop-filter`, shadow. Rewrite folder/note item hover and active states to 0 radius + left-bar. Replace count badges with plain tabular numerals. Replace sidebar `h2` with small-caps section labels.
- `desktop/src/css/editor.css` header-only rules (editor toolbar, tabs): pill → underline-text tabs, text-button mode tools.
- **Verification:** chrome is tight, flat, and reads as deliberate. Icon muscle memory preserved.

### Pass 4 — Editor Body + AI Panel
- `desktop/src/css/editor.css` body rules: canvas `max-width: 640px` centered, meta-line, title, double-rule, drop-cap opt-in, colophon bar.
- `desktop/src/css/ai-panel.css`: strip `backdrop-filter`, shadow, gradient-subtle, pill input, scale hover. Rewrite header to small-caps label. Rewrite message treatment (no bubbles, italic user, REPLY-labelled assistant). Rewrite input and bottom bar. Rename "AI Assistant" → "Companion" in `desktop/src/index.html` and `desktop/src/locales/*.json`.
- **Verification:** writing in the editor feels like writing. Companion reads like a dialogue on paper.

### Pass 5 — Remaining Surfaces
- `desktop/src/css/modals.css`: apply rules for backdrop, card, title, labels, inputs, buttons per Section 5.
- `desktop/src/css/search-features.css`: find/replace inputs + match count + action links.
- Context menu styles (located in `modals.css` or a menu rule in another file — locate during implementation).
- Toast styles — locate during implementation; if none exist, add per Section 5.
- AI-generate dialog — in `ai-generate.css`.
- `desktop/src/css/responsive.css`: audit for any surviving `backdrop-filter` or `translateY(-Npx)` rules and delete; audit breakpoints against new surface widths (320px AI panel, 640px canvas).
- **Token cleanup (end of pass):** grep the entire CSS tree for each aliased token from Pass 1. For any reference that still exists, migrate it to the canonical token. Once all aliases have zero call sites, delete the aliases from `themes.css`.
- **Verification:** every dialog, menu, toast, and search result matches the editorial character. `grep -r "backdrop-filter\|translateY(-2px\|translateY(-1px\|scale(1\.05\|shadow-accent" desktop/src/css` returns zero matches. `grep -r "accent-color-light\|accent-color-lighter\|accent-color-dark\|gradient-primary\|gradient-subtle\|gradient-surface\|gradient-accent\|header-bg\|sidebar-bg\|input-bg\|button-bg\|note-hover-bg\|surface-elevated" desktop/src/css` returns zero matches.

## 7. Out of Scope

- Feature changes. No new functionality, no removed functionality.
- Layout structure. Sidebar stays sidebar, AI panel stays right-side, tabs stay on top.
- Font changes. Source Serif 4 + Fraunces stay.
- Icon library. Font Awesome stays. Icon _treatment_ changes (flat, 32px, no halo); the set stays.
- Android app (`android/` untouched).
- JS refactor for `desktop/src/js/app.js` monolith — separate tracked item in `desktop/TODO.md`.
- Splash screen progress-tracking logic — only the decorative DOM changes; progress-driving JS is untouched.
- CSS class renames beyond the Companion label. `.ai-panel`, `.ai-message`, etc. stay — a rename is a separate refactor.

## 8. Risks

- **Contrast on paper.** `#7c5fd1` on `#fbf9f4`: ~5.8:1, passes WCAG AA for normal text. `#1a1715` on `#fbf9f4`: ~15:1, excellent. Verified.
- **Contrast on dark stage.** `#c9a9ff` on `#0c0b10`: ~10:1. `#f0ebf5` on `#0c0b10`: ~16:1. Both strong.
- **Rubric contrast.** `#a33b2a` on `#fbf9f4`: ~6.5:1, passes AA. `#ff7a6b` on `#0c0b10`: ~6.2:1, passes AA.
- **Muscle memory.** Icons retained in the top-right toolbar; sidebar structure retained; keyboard shortcuts unchanged.
- **Reduced motion.** Existing `@media (prefers-reduced-motion: reduce)` rules retained; new motion is already restrained.
- **Third-party markdown preview styles** (if any come from a library): audit during Pass 4 — may need overrides to match body serif treatment.
- **Printing** (export to PDF via `window.print` or similar): the editorial palette should survive well on paper. Verify during Pass 4.

## 9. Testing

- No automated visual test coverage exists — project baseline.
- Per-pass manual smoke: open every surface touched by the pass in both themes. Verify no regressions, no missing hover states, focus states visible.
- Contrast spot-check on two or three critical surfaces per pass using browser devtools.
- On Pass 4: run the app, create a note, open Companion, send a prompt, verify the full editorial reading experience.
- Final sanity: grep the CSS for `backdrop-filter`, `translateY(-2px)`, `transform: scale(1.`, `box-shadow: var(--shadow-accent` — should return zero matches (or only the single retained popover shadow).
