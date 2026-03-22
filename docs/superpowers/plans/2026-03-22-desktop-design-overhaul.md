# Desktop Design Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic Inter/lavender-gradient "AI slop" aesthetic with a distinctive Fraunces + Source Serif 4 typographic identity, dense note list, pill chip tabs, and a deeper dark mode — without touching any JavaScript.

**Architecture:** Pure CSS/HTML changes. Strategy is token-first: new font tokens in `themes.css` cascade automatically to most elements; structural changes to individual CSS files handle layout-level redesigns. All 7 tasks are independent after Task 1 sets up the tokens, but Tasks 2–7 should run after Task 1 completes.

**Tech Stack:** Electron (CSS rendered in Chromium), Google Fonts CDN, Font Awesome 6.4.0 (existing). No build step — changes take effect on app reload. Run the app with `cd desktop && npm run dev`.

**Visual verification:** This plan has no unit tests — changes are CSS-only. Each task ends with a visual checklist. Launch the app once after Task 1 and keep it open; subsequent tasks can be verified by pressing `Ctrl+R` to reload the renderer.

---

## File Map

| File | What changes |
|---|---|
| `desktop/src/index.html` | Replace Google Fonts link (Inter → Fraunces + Source Serif 4) |
| `desktop/src/css/themes.css` | Add font tokens; update dark palette; remove `*` transition; add targeted transition |
| `desktop/src/css/base.css` | Update `body { font-family }` to use token |
| `desktop/src/css/header.css` | Apply display font to `.app-title` |
| `desktop/src/css/sidebar.css` | Display font on heading + note titles; remove gradient text; dense list layout |
| `desktop/src/css/layout.css` | Tab bar → pill chips |
| `desktop/src/css/editor.css` | Title font/size; wrapper padding; meta line; textarea font |
| `desktop/src/css/ai-panel.css` | Remove gradient text from panel heading |

---

## Task 1: Typography Foundation

**Files:**
- Modify: `desktop/src/index.html` (line 21 — the Google Fonts `<link>` tag)
- Modify: `desktop/src/css/themes.css` (`:root` block and `[data-theme="dark"]` block)
- Modify: `desktop/src/css/base.css` (line 10 — `body { font-family }`)

- [ ] **Step 1: Replace the Google Fonts link in `index.html`**

  Find line 21 (the Inter `<link>` tag):
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  ```
  Replace with:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&display=swap" rel="stylesheet">
  ```

- [ ] **Step 2: Add font tokens to `themes.css` `:root` block**

  In the `:root` block (after the last existing token, before the closing `}`), add:
  ```css
  /* Typography */
  --font-family-base: 'Source Serif 4', Georgia, serif;
  --font-family-display: 'Fraunces', Georgia, serif;
  ```

- [ ] **Step 3: Add the same font tokens to the `[data-theme="dark"]` block**

  Add at the end of the `[data-theme="dark"]` block (same values — fonts don't change per theme):
  ```css
  --font-family-base: 'Source Serif 4', Georgia, serif;
  --font-family-display: 'Fraunces', Georgia, serif;
  ```

- [ ] **Step 4: Update `base.css` body font-family**

  Find the `body` rule (around line 9). Change the `font-family` line from:
  ```css
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  ```
  To:
  ```css
  font-family: var(--font-family-base);
  ```
  All other `body` properties remain unchanged.

- [ ] **Step 5: Launch the app and verify fonts loaded**

  ```bash
  cd desktop && npm run dev
  ```
  Open DevTools (`Ctrl+Shift+I`), run in console:
  ```js
  getComputedStyle(document.body).fontFamily
  ```
  Expected: contains `"Source Serif 4"` (not Inter).

  Also check: `document.fonts.check('16px Fraunces')` → should return `true`.

- [ ] **Step 6: Commit**

  ```bash
  git add desktop/src/index.html desktop/src/css/themes.css desktop/src/css/base.css
  git commit -m "feat(design): add Fraunces + Source Serif 4 typography tokens"
  ```

---

## Task 2: Apply Display Font + Remove Gradient Text Overuse

**Files:**
- Modify: `desktop/src/css/header.css` (`.app-title` rule, ~line 46)
- Modify: `desktop/src/css/sidebar.css` (`.sidebar-header h2`, ~line 51; `.note-item-title`, ~line 484)
- Modify: `desktop/src/css/ai-panel.css` (`.ai-panel-header h3`, ~line 25)

- [ ] **Step 1: Apply display font to `.app-title` in `header.css`**

  Find the `.app-title` rule. Add `font-family: var(--font-family-display);` to it. The existing `background: var(--gradient-primary)` gradient clip is **kept** — this is the one allowed gradient text instance.

- [ ] **Step 2: Fix `.sidebar-header h2` in `sidebar.css`**

  Find the `.sidebar-header h2` rule (~line 51). It currently has:
  ```css
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  ```
  Remove those 4 lines entirely. Replace with:
  ```css
  font-family: var(--font-family-display);
  color: var(--accent-color);
  ```

- [ ] **Step 3: Fix `.ai-panel-header h3` in `ai-panel.css`**

  Find the `.ai-panel-header h3` rule (~line 25). It currently has:
  ```css
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  ```
  Remove those 4 lines entirely. Replace with:
  ```css
  color: var(--accent-color);
  ```

- [ ] **Step 4: Apply display font to `.note-item-title` in `sidebar.css`**

  Find the `.note-item-title` rule (~line 484). Add or update:
  ```css
  font-family: var(--font-family-display);
  font-size: 12px;
  font-weight: 600;
  ```

- [ ] **Step 5: Verify visually** (`Ctrl+R` in app)

  - [ ] Header "CogNotez" title: should render in Fraunces, with lavender gradient (kept)
  - [ ] Sidebar "Notes" heading: should be lavender color, Fraunces, no gradient clip effect
  - [ ] AI panel heading: should be lavender color, no gradient clip effect
  - [ ] Note titles in the sidebar list: should render in Fraunces

- [ ] **Step 6: Commit**

  ```bash
  git add desktop/src/css/header.css desktop/src/css/sidebar.css desktop/src/css/ai-panel.css
  git commit -m "feat(design): apply display font, reduce gradient text overuse"
  ```

---

## Task 3: Dark Mode — Deeper Atmosphere

**Files:**
- Modify: `desktop/src/css/themes.css` (`[data-theme="dark"]` block)

- [ ] **Step 1: Update the 9 dark palette tokens in `themes.css`**

  In the `[data-theme="dark"]` block, update these tokens (leave all others unchanged):

  | Token | New value |
  |---|---|
  | `--bg-primary` | `#0d1117` |
  | `--bg-secondary` | `#0a0e16` |
  | `--bg-tertiary` | `#141c28` |
  | `--border-color` | `#1a2332` |
  | `--border-color-light` | `#1e2d40` |
  | `--header-bg` | `rgba(9, 12, 18, 0.96)` |
  | `--sidebar-bg` | `rgba(10, 14, 22, 0.95)` |
  | `--editor-bg` | `#0d1117` |
  | `--input-bg` | `rgba(20, 28, 40, 0.9)` |

- [ ] **Step 2: Verify dark mode visually**

  Toggle to dark mode in the app. Check:
  - [ ] App background is near-black (not slate blue)
  - [ ] Sidebar has a distinct, slightly different black from the editor area
  - [ ] Borders are visible but subtle (dark navy, not invisible)
  - [ ] No colors have changed other than backgrounds/borders (text, accent, status colors unchanged)

- [ ] **Step 3: Commit**

  ```bash
  git add desktop/src/css/themes.css
  git commit -m "feat(design): deepen dark mode palette"
  ```

---

## Task 4: Performance — Scope Theme Transition

**Files:**
- Modify: `desktop/src/css/themes.css` (the `* { transition }` rule, ~line 220)

- [ ] **Step 1: Remove the wildcard transition rule**

  Find and delete this entire rule block in `themes.css`:
  ```css
  * {
    transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  ```

- [ ] **Step 2: Add targeted transition rule in its place**

  ```css
  /* Targeted theme transition — applied only to visible surfaces */
  .app-header,
  .sidebar,
  .editor-area,
  .ai-panel,
  .note-item,
  .folder-item,
  .note-tabs-bar,
  .note-tab,
  .modal,
  .context-menu,
  .header-toolbar-btn {
    transition: background-color 0.25s ease,
                color 0.25s ease,
                border-color 0.25s ease;
  }
  ```

- [ ] **Step 3: Verify theme toggle still animates smoothly**

  Toggle theme a few times. The transition should still be visible on the header, sidebar, and editor — just no longer applied to every element in the DOM.

- [ ] **Step 4: Commit**

  ```bash
  git add desktop/src/css/themes.css
  git commit -m "perf(design): scope theme transition from * to specific surfaces"
  ```

---

## Task 5: Note Cards → Dense List

**Files:**
- Modify: `desktop/src/css/sidebar.css` (`.note-item`, `.notes-list`, `.note-item-preview`, `.note-item-date`, `.note-item.pinned`)

- [ ] **Step 1: Update `.notes-list` gap**

  Find `.notes-list` and change `gap: 12px` to `gap: 1px`.

- [ ] **Step 2: Replace `.note-item` base styles**

  Find the `.note-item` rule and update these properties:
  ```css
  .note-item {
    padding: 7px 8px;
    border-radius: 6px;
    border-left: 2px solid transparent;
    background: transparent;
    box-shadow: none;
    gap: 3px;
    /* remove: min-height, border: 1px solid transparent (replaced by border-left only) */
  }
  ```
  Remove any `border: 1px solid transparent` that conflicts with the new `border-left` approach.

- [ ] **Step 3: Update `.note-item:hover`**

  ```css
  .note-item:hover {
    background: rgba(189, 171, 227, 0.07);
    border-left-color: rgba(189, 171, 227, 0.35);
    transform: none;
    box-shadow: none;
  }
  ```

- [ ] **Step 4: Update `.note-item.active`**

  ```css
  .note-item.active {
    background: rgba(189, 171, 227, 0.12);
    border: none;                              /* clears all borders first */
    border-left: 2px solid var(--accent-color); /* then sets only the left border */
    box-shadow: none;
  }
  ```
  Note: `border: none` must come before `border-left` so the shorthand reset doesn't clobber the left border.

- [ ] **Step 5: Update `.note-item-preview` font size and line clamp**

  Find `.note-item-preview` and update:
  ```css
  font-size: 10px;
  -webkit-line-clamp: 1;   /* was: 2 */
  line-clamp: 1;           /* was: 2, if present */
  ```

- [ ] **Step 6: Add italic to `.note-item-date`**

  Find `.note-item-date` and add `font-style: italic;`.

- [ ] **Step 7: Remove top border from pinned notes**

  Find `.note-item.pinned` and remove the line `border-top: 2px solid var(--accent-color);`.

- [ ] **Step 8: Verify visually**

  Create/have at least 5 notes visible. Check:
  - [ ] Notes are compact rows, not cards — no card shadow or background
  - [ ] Hover shows a subtle lavender-tinted background + left border accent
  - [ ] Active note shows solid lavender left border
  - [ ] Preview text is 10px and shows only 1 line (truncated with ellipsis)
  - [ ] Dates are italic
  - [ ] Pinned notes no longer have a top border (pin state shown only by button)

- [ ] **Step 9: Commit**

  ```bash
  git add desktop/src/css/sidebar.css
  git commit -m "feat(design): note cards → compact dense list with left-border accent"
  ```

---

## Task 6: Tab Bar → Pill Chips

**Files:**
- Modify: `desktop/src/css/layout.css` (`.note-tabs-bar`, `.note-tabs-container`, `.note-tab`, `.note-tab.active`)

- [ ] **Step 1: Update `.note-tabs-bar`**

  Find `.note-tabs-bar` and update/add:
  ```css
  .note-tabs-bar {
    height: 38px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    padding: 0 14px;
    gap: 6px;
    align-items: center;
  }
  ```

- [ ] **Step 2: Fix `.note-tabs-container` alignment**

  Find `.note-tabs-container`. Change:
  - `align-items: flex-end` → `align-items: center`
  - `margin-bottom: -1px` → `margin-bottom: 0`

- [ ] **Step 3: Redesign `.note-tab` as pill chip**

  Find the `.note-tab` rule. Keep `cursor: grab`, existing drag state rules, and `transition`. Update the visual properties:
  ```css
  .note-tab {
    height: 26px;
    padding: 0 10px 0 12px;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    font-family: var(--font-family-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    color: var(--text-secondary);
    /* retain: cursor: grab, white-space: nowrap, max-width, transition, overflow: hidden */
  }
  ```
  Remove any properties that created the old rectangular browser-tab shape (e.g. `border-bottom: none`, `border-radius` applied only to top corners).

- [ ] **Step 4: Update `.note-tab.active`**

  ```css
  .note-tab.active {
    background: var(--accent-color);
    color: #1a1225;
    border-color: var(--accent-color);
  }
  ```
  Note: `color: #1a1225` (dark, not white) — white on `#bdabe3` fails WCAG contrast.

- [ ] **Step 5: Add dot indicator via `::before`**

  Add a new rule:
  ```css
  .note-tab::before {
    content: '';
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.4;
    flex-shrink: 0;
  }

  .note-tab.active::before {
    opacity: 1;
  }
  ```

- [ ] **Step 6: Check unsaved dot coexistence**

  The existing `.note-tab.unsaved::before` rule uses `position: absolute` for an amber dot. Open an unsaved note and check that the amber unsaved indicator still appears correctly. If the `left` offset looks off, adjust it — the new padding is `padding-left: 12px`, so the absolute-positioned dot may need `left` updated from its previous value.

- [ ] **Step 7: Verify visually**

  Open 2–3 notes so multiple tabs appear. Check:
  - [ ] Tabs render as rounded pill chips, not rectangular browser tabs
  - [ ] Active tab has solid lavender background with dark text (readable)
  - [ ] Inactive tabs are transparent with border
  - [ ] Small dot appears before each tab title
  - [ ] Close button (×) still works
  - [ ] Tabs are vertically centered in the bar (not bottom-aligned)
  - [ ] Drag-to-reorder still works if applicable

- [ ] **Step 8: Commit**

  ```bash
  git add desktop/src/css/layout.css
  git commit -m "feat(design): tab bar → pill chip design"
  ```

---

## Task 7: Editor — Open Page

**Files:**
- Modify: `desktop/src/css/editor.css` (`.note-title-input`, `.editor-wrapper`, `.editor-header-meta`, `.note-editor`)

- [ ] **Step 1: Upgrade `.note-title-input` typography**

  Find the `.note-title-input` rule. The existing rule already has `border: none !important`, `background: transparent !important`, `padding: 0`, `outline: none !important` — do not touch those. Only add these new properties:
  ```css
  font-family: var(--font-family-display);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
  ```
  These will override the existing `font-size: var(--font-size-2xl)` (24px), `font-weight: var(--font-weight-bold)`, and `letter-spacing: var(--letter-spacing-tight)` that are currently in the rule.

- [ ] **Step 2: Increase `.editor-wrapper` padding**

  Find `.editor-wrapper` and update its `padding`. Change whatever the current value is to:
  ```css
  padding: 36px 64px;
  ```

- [ ] **Step 3: Style `.editor-header-meta`**

  Find the `.editor-header-meta` rule. Add or update these properties:
  ```css
  .editor-header-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 18px;
    margin-bottom: 18px;
    border-bottom: 1px solid var(--border-color);
    font-style: italic;
    font-size: 11px;
    color: var(--text-tertiary);
    /* retain all existing properties not listed here */
  }
  ```

  **Do not remove** these two existing rules (they must coexist):
  1. `.note-tags-display:empty { display: none }` — hides the tag container when empty
  2. `.editor-header-meta:not(:has(.note-tag)):not(:has(.note-date:not(:empty))) { display: none }` — hides the entire meta row when there are no tags and no date (this also hides the border-bottom, which is correct behavior)

- [ ] **Step 4: Upgrade `.note-editor` (textarea) typography**

  Find the `.note-editor` rule. Add or update:
  ```css
  font-family: var(--font-family-base);
  font-size: 15px;
  line-height: 1.9;
  ```

- [ ] **Step 5: Verify visually**

  Open a note with content. Check:
  - [ ] Note title renders large (32px), in Fraunces, tight letter-spacing — dominant presence
  - [ ] Tags and date appear below the title, separated by a thin border
  - [ ] Editor body text is Source Serif 4, 15px, generous line spacing
  - [ ] The editor content has comfortable horizontal margins (64px each side)
  - [ ] On a note with no tags and no date: the meta separator line does not appear
  - [ ] Markdown preview mode (toggle with Preview button): body text should also use Source Serif 4 — check `.markdown-preview` inherits the font; if not, add `font-family: var(--font-family-base)` to `.markdown-preview`

- [ ] **Step 6: Commit**

  ```bash
  git add desktop/src/css/editor.css
  git commit -m "feat(design): editor open-page treatment — large title, generous spacing"
  ```

---

## Final Verification

After all 7 tasks are committed, do a full pass through both themes:

**Light mode:**
- [ ] Header: Fraunces "CogNotez" with lavender gradient (only gradient text instance)
- [ ] Sidebar heading "Notes": Fraunces, plain lavender, no gradient clip
- [ ] Note list: compact rows with left-border accent, Fraunces titles
- [ ] Tab bar: pill chips, vertically centered
- [ ] Editor: large Fraunces title, Source Serif 4 body at 15px/1.9
- [ ] AI panel heading: plain lavender, no gradient clip

**Dark mode (toggle with theme button):**
- [ ] Background is near-black, not slate blue
- [ ] Sidebar, header, editor each have a slightly different shade of near-black
- [ ] All lavender accents and text colors unchanged

**Theme toggle animation:**
- [ ] Switching themes still shows a smooth crossfade on the main surfaces
- [ ] No janky "flash" or thousands of elements animating

```bash
git log --oneline -7
```
Expected: 7 commits from this plan, each scoped and well-described.
