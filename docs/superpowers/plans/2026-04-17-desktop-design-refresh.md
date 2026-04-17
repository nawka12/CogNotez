# Desktop Design Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CogNotez desktop interface's "AI slop" aesthetic (glassmorphism, gradient washes, hover lifts, letter-by-letter splash animations, rounded-pill chrome) with a coherent editorial character — typography-first, committed lavender accent, warm paper / near-black stage — across five sequenced passes that each leave the app runnable.

**Architecture:** Five CSS passes. Pass 1 rewrites `themes.css` tokens and aliases retired tokens so downstream files keep rendering. Passes 2–5 rewrite specific surfaces (splash, chrome, editor+AI panel, remaining surfaces). A cleanup step at end of Pass 5 deletes the aliases after grep confirms zero call sites. Pure CSS + HTML markup work; no JS refactor. One small DB column added (per-note `drop_cap` flag).

**Tech Stack:** Plain CSS (no build step), HTML, Electron. SQLite (better-sqlite3) for the new `drop_cap` column. Source Serif 4 + Fraunces already loaded.

**Spec:** `docs/superpowers/specs/2026-04-17-desktop-design-refresh-design.md` — every task references a section there for the "what". The plan gives the "how" (exact files, edits, commits, verifications).

**Preconditions:**
- Create a branch or worktree before starting: `git checkout -b design-refresh` or use the `using-git-worktrees` skill.
- `npm install` already run (assumed — no new dependencies).
- Run `npm start` in `desktop/` to smoke-test after each commit.

---

## File Structure

Files modified, grouped by pass:

**Pass 1 (Tokens) — foundation only, no visual completeness:**
- Modify: `desktop/src/css/themes.css` — rewrite token values, add new tokens, add alias tokens
- Modify: `desktop/src/css/base.css` — remove body gradient, hover lifts, glass utility, modal backdrop-filter
- Modify: `desktop/src/css/accessibility.css` — remove any backdrop-filter/transform-hover

**Pass 2 (Splash):**
- Modify: `desktop/src/index.html` — delete decorative splash DOM, change wordmark + version markup
- Modify: `desktop/src/css/modals.css` — rewrite splash block (lines ~419–930), delete particle/ring/glow keyframes

**Pass 3 (Chrome):**
- Modify: `desktop/src/index.html` — rewrite app-title to `Cog<em>N</em>otez`, update sidebar h2 markup, editor tabs/tools markup
- Modify: `desktop/src/css/header.css` — strip glass/shadow/gradient-clip; flat icon buttons
- Modify: `desktop/src/css/sidebar.css` — strip glass/shadow; new folder/note item treatment; small-caps labels
- Modify: `desktop/src/css/editor.css` — editor-header-only rules (tabs, mode tools); ~first 400 lines

**Pass 4 (Editor body + AI panel):**
- Modify: `desktop/src/css/editor.css` — body rules: canvas max-width, meta line, title, double-rule, drop-cap, colophon
- Modify: `desktop/src/css/ai-panel.css` — strip glass/shadow/gradient; rewrite header, messages, input
- Modify: `desktop/src/index.html` — rename "AI Assistant" to "Companion" in three places; add drop-cap control to editor header
- Modify: `desktop/src/locales/en.json`, `es.json`, `id.json`, `ja.json`, `jv.json` — rename `aiAssistant` / `ai.assistant` strings
- Modify: `desktop/src/js/app.js` — drop-cap toggle wiring + metadata read/write (small change)
- Create or modify: database migration adding `drop_cap` boolean column to notes table

**Pass 5 (Remaining + cleanup):**
- Modify: `desktop/src/css/modals.css` — backdrop, card, title, labels, inputs, buttons
- Modify: `desktop/src/css/search-features.css` — find/replace, search results
- Modify: `desktop/src/css/ai-generate.css` — dialog inherits modal rules
- Modify: `desktop/src/css/responsive.css` — audit/cleanup
- Modify: `desktop/src/css/themes.css` — delete the aliases once grep shows zero call sites
- Toast styles: locate in `modals.css` or wherever toasts live; modify in place

**Out of scope (do not touch):**
- `desktop/src/js/*.js` except the small drop-cap wiring in Pass 4
- `android/*` entirely
- Icon library (Font Awesome) — only the icon button _treatment_ changes

---

## Conventions Used in This Plan

- **"Verify visually"** means: run `npm start` in `desktop/`, open the relevant surface, confirm the described appearance in both light and dark theme (toggle via the existing theme button). No automated test harness exists.
- **"Grep verify"** means: run the exact grep command and confirm the expected result (zero matches, or matches only in approved locations).
- **Mood-word → token mapping** (used in this plan for readability, per spec §1): `paper/stage = --bg-primary`, `surface = --bg-secondary`, `surface-raised = --bg-tertiary`, `ink/type = --text-primary`, `ink-muted = --text-secondary`, `ink-soft = --text-tertiary`, `ink-faint = --text-muted`, `border-subtle = --border-color`, `accent = --accent-color`, `rubric = --rubric`, `shadow-popover = --shadow-popover`.
- **Commit cadence:** commit after each task, using the prefix `[Desktop] design:` for design-refresh commits.
- **TDD note:** pure CSS work has no practical unit-test layer. Each task's verification is either a grep check (for "did we remove this pattern?") or a visual smoke test. Treat the spec + grep checks as the test contract.

---

# Pass 1 — Tokens

Foundation rewrite. After this pass the app runs but looks mid-transition: surfaces are flat and hover lifts are gone, but component-specific details (splash particles, sidebar pills, AI-panel glass) still reference the old look via aliased tokens.

---

### Task 1.1: Rewrite retained-token values in `themes.css`

**Files:**
- Modify: `desktop/src/css/themes.css`

- [ ] **Step 1: Open `desktop/src/css/themes.css` and locate the `:root` block (starts at line 2)**

Read lines 2–129 to confirm current structure.

- [ ] **Step 2: Replace retained-token values in the `:root` block (light theme)**

Change the values of these existing tokens to the editorial light palette. Leave everything else in `:root` intact for now (we'll add aliases in Task 1.3 and delete tokens at end of Pass 5).

```css
:root {
  --bg-primary: #fbf9f4;
  --bg-secondary: #f6f2e8;
  --bg-tertiary: #ece5d2;
  --text-primary: #1a1715;
  --text-secondary: #4a4439;
  --text-tertiary: #8a8375;
  --text-muted: #a89a78;

  --border-color: #ece5d2;
  --border-color-light: #ece5d2;
  --border-color-subtle: #f6f2e8;

  --accent-color: #7c5fd1;

  /* ... remaining tokens stay for now — edited in Task 1.2 + 1.3 ... */
}
```

- [ ] **Step 3: Replace retained-token values in the `[data-theme="dark"]` block**

Starts around line 132. Change values:

```css
[data-theme="dark"] {
  --bg-primary: #0c0b10;
  --bg-secondary: #15131c;
  --bg-tertiary: #24202f;
  --text-primary: #f0ebf5;
  --text-secondary: #c8c0d4;
  --text-tertiary: #a89ebb;
  --text-muted: #8b7fa3;

  --border-color: #24202f;
  --border-color-light: #24202f;
  --border-color-subtle: #15131c;

  --accent-color: #c9a9ff;

  /* ... remaining tokens stay for now ... */
}
```

- [ ] **Step 4: Change typography tokens to canonical values**

Find the typography block near line 127 in `:root` and confirm:

```css
--font-family-base: 'Source Serif 4', Georgia, serif;
--font-family-display: 'Fraunces', Georgia, serif;
--font-size-base: 15px;
--line-height-normal: 1.7;
```

If `--font-size-base` is currently `14px`, change to `15px`. If `--line-height-normal` is `1.5`, change to `1.7`. Leave other font-size tokens unchanged for now.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/css/themes.css
git commit -m "[Desktop] design: repalette themes.css to editorial tokens"
```

---

### Task 1.2: Add the three new tokens

**Files:**
- Modify: `desktop/src/css/themes.css`

- [ ] **Step 1: Add `--accent-soft`, `--rubric`, `--shadow-popover` to both `:root` and `[data-theme="dark"]`**

Insert these lines near the end of the `:root` block (just before its closing `}`):

```css
  --accent-soft: rgba(124, 95, 209, 0.08);
  --rubric: #a33b2a;
  --shadow-popover: 0 4px 12px rgba(0, 0, 0, 0.08);
```

Insert at the corresponding location in `[data-theme="dark"]`:

```css
  --accent-soft: rgba(201, 169, 255, 0.1);
  --rubric: #ff7a6b;
  --shadow-popover: 0 4px 16px rgba(0, 0, 0, 0.5);
```

- [ ] **Step 2: Grep-verify new tokens exist**

Run:
```bash
grep -n -- "--accent-soft\|--rubric\|--shadow-popover" desktop/src/css/themes.css
```
Expected: 6 matches (3 tokens × 2 themes).

- [ ] **Step 3: Commit**

```bash
git add desktop/src/css/themes.css
git commit -m "[Desktop] design: add editorial accent-soft/rubric/shadow-popover tokens"
```

---

### Task 1.3: Alias the tokens that will be retired

Aliases keep downstream CSS rendering until Passes 2–5 migrate their references. Per spec §1 and §6, Pass 5 cleans these up.

**Files:**
- Modify: `desktop/src/css/themes.css`

- [ ] **Step 1: In `:root`, find and reassign accent-color dilutions**

Locate the existing `--accent-color-light`, `-lighter`, `-lightest`, `-dark`, `-darker`, `-text` tokens (lines ~19–24) and replace their values:

```css
--accent-color-light: var(--accent-soft);
--accent-color-lighter: var(--accent-soft);
--accent-color-lightest: transparent;
--accent-color-dark: var(--accent-color);
--accent-color-darker: var(--accent-color);
--accent-color-text: var(--accent-color);
```

Apply the identical aliases in `[data-theme="dark"]`.

- [ ] **Step 2: Alias the shadow scale**

Locate the shadow tokens (around line 50):

```css
--shadow-xs: none;
--shadow-sm: none;
--shadow-md: none;
--shadow-lg: var(--shadow-popover);
--shadow-xl: var(--shadow-popover);
--shadow-2xl: var(--shadow-popover);
--shadow-accent: none;
--shadow-accent-lg: none;
--shadow-inner: none;
```

Mirror in `[data-theme="dark"]`.

- [ ] **Step 3: Alias the gradient tokens**

Find the `--gradient-*` tokens (line ~27):

```css
--gradient-primary: var(--accent-color);
--gradient-subtle: var(--bg-primary);
--gradient-surface: var(--bg-primary);
--gradient-accent: var(--accent-soft);
```

Mirror in dark.

- [ ] **Step 4: Alias the surface-specific background tokens**

Find tokens in the "Modern Surface Colors" section (line ~33):

```css
--header-bg: var(--bg-primary);
--sidebar-bg: var(--bg-secondary);
--editor-bg: var(--bg-primary);
--input-bg: var(--bg-primary);
--button-bg: transparent;
--button-hover-bg: var(--bg-tertiary);
--button-active-bg: var(--accent-soft);
--note-hover-bg: var(--bg-tertiary);
--note-active-bg: var(--bg-tertiary);
--context-menu-bg: var(--bg-secondary);
--context-menu-hover-bg: var(--bg-tertiary);
--modal-bg: var(--bg-primary);
--message-bg: var(--bg-secondary);
--context-highlight-bg: var(--accent-soft);
--card-bg: var(--bg-secondary);
```

Find `--surface-bg` and `--surface-elevated` (line ~83):

```css
--surface-bg: var(--bg-secondary);
--surface-elevated: var(--bg-tertiary);
```

Mirror all in dark.

- [ ] **Step 5: Grep-verify aliases point at the new system**

Run:
```bash
grep -n -- "--header-bg: var(--bg-primary)" desktop/src/css/themes.css
```
Expected: 2 matches (light + dark).

- [ ] **Step 6: Start the app — no broken visuals**

Run in a separate terminal:
```bash
cd desktop && npm start
```
Visually: app launches. Surfaces look flat-ish but many components still look wrong (splash particles visible, sidebar pills visible, AI panel has glass). Confirm no console errors about missing CSS variables.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/css/themes.css
git commit -m "[Desktop] design: alias legacy tokens to new editorial system"
```

---

### Task 1.4: Strip hover-lifts and glass from `base.css`

**Files:**
- Modify: `desktop/src/css/base.css`

Note: `base.css` is only 31 lines. The bulk of the "base" rules actually live in `themes.css`. Read both and apply the edits in whichever file holds the rule.

- [ ] **Step 1: Read `desktop/src/css/base.css` and `desktop/src/css/themes.css` entirely**

Identify and delete the following patterns wherever they appear in these two files:

- `background: var(--gradient-subtle)` on `#app`
- The `.theme-toggle`, `.action-btn`, `.search-button`, `.new-note-btn` hover rule block that contains `transform: translateY(-2px)` and `box-shadow: var(--shadow-md)`
- The corresponding `:active` rule with `transform: translateY(0)`
- `.glass` utility class and its `[data-theme="dark"] .glass` counterpart
- `backdrop-filter` on `.modal`
- The `.note-editor:focus` `box-shadow: inset 0 0 0 2px var(--accent-color-light)` rule

- [ ] **Step 2: Apply the deletions**

In `desktop/src/css/base.css` (31 lines), on line ~28, change:
```css
background: var(--gradient-subtle);
```
to:
```css
background: var(--bg-primary);
```

In `desktop/src/css/themes.css`, delete the hover-lift block (search for `translateY(-2px)`):
```css
/* DELETE */
.theme-toggle:hover,
.action-btn:hover,
.search-button:hover,
.new-note-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.theme-toggle:active,
.action-btn:active,
.search-button:active,
.new-note-btn:active {
  transform: translateY(0);
  transition-duration: 0.1s;
}
```

Replace the `.glass` class definitions with nothing (delete both blocks, ~lines 373–383).

Delete the `backdrop-filter` rule from `.modal` (around line 387):
```css
/* DELETE */
.modal {
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
}
```

Delete the `.note-editor:focus` editorial-interference rule (around line 494):
```css
/* DELETE */
.note-editor:focus {
  outline: none;
  background: var(--surface-elevated);
  box-shadow: inset 0 0 0 2px var(--accent-color-light);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 3: Grep-verify**

Run:
```bash
grep -n "translateY(-2px)\|\.glass[ {]\|backdrop-filter" desktop/src/css/base.css desktop/src/css/themes.css
```
Expected: zero matches.

- [ ] **Step 4: Smoke test**

Restart the app (`npm start`). Hover any header or sidebar button — buttons must not lift or grow a shadow. Modal should still function (no backdrop-filter blur, just the ink overlay from existing backdrop rules).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/css/base.css desktop/src/css/themes.css
git commit -m "[Desktop] design: strip hover-lifts, glass, and gradient body-bg"
```

---

### Task 1.5: Audit `accessibility.css` for glass/transform patterns

**Files:**
- Modify: `desktop/src/css/accessibility.css`

- [ ] **Step 1: Grep for sloppy patterns in the file**

Run:
```bash
grep -n "backdrop-filter\|translateY(-\|scale(1\." desktop/src/css/accessibility.css
```

- [ ] **Step 2: Delete every matching rule**

For each match, delete the full property line. If a rule block becomes empty as a result, delete the block. Accessibility styles must not reintroduce slop.

- [ ] **Step 3: Grep-verify**

Re-run the grep from Step 1. Expected: zero matches.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/css/accessibility.css
git commit -m "[Desktop] design: remove glass/transform rules from accessibility.css"
```

---

### Task 1.6: Pass 1 smoke test

- [ ] **Step 1: Start the app, exercise both themes**

```bash
cd desktop && npm start
```

Visually check:
- Toggle light/dark — both use the new palette
- No `translateY` lifts on button hover
- No glassmorphism on header, sidebar, AI panel (may still look "wrong" — that's expected; later passes fix structure)
- Splash screen still runs (with particles/rings — Pass 2 removes them)

- [ ] **Step 2: Console check**

Open DevTools. No `Unknown CSS variable` warnings. If any appear, add an alias in `themes.css` and recommit.

- [ ] **Step 3: Final grep across Pass 1 scope**

```bash
grep -rn "backdrop-filter" desktop/src/css/base.css desktop/src/css/themes.css desktop/src/css/accessibility.css
grep -rn "translateY(-2px)\|transform: scale(1\." desktop/src/css/base.css desktop/src/css/themes.css desktop/src/css/accessibility.css
```

Expected: zero matches in either.

- [ ] **Step 4: Tag the Pass 1 checkpoint (no commit needed — this is just a mental checkpoint)**

---

# Pass 2 — Splash Screen

Replace the decorative splash (6 particles, 3 rings, icon glow, letter-by-letter title, progress glow, pulsing dot) with the quiet typographic composition in spec §2.

---

### Task 2.1: Delete decorative splash DOM

**Files:**
- Modify: `desktop/src/index.html`

- [ ] **Step 1: Open `desktop/src/index.html` and locate the splash block (lines ~37–90)**

The current structure contains: `.splash-bg > .splash-gradient`, `.splash-particles > 6×.particle`, `.splash-rings > 3×.ring`, `.splash-logo > .splash-icon-wrapper > .splash-icon-glow`, title with `.title-letter` spans.

- [ ] **Step 2: Replace the whole splash block with the editorial composition**

Delete lines 37–90 and insert in their place:

```html
    <!-- Splash Screen -->
    <div id="splash-screen" class="splash-screen">
        <div class="splash-content">
            <h1 class="splash-wordmark">Cog<em>N</em>otez</h1>
            <div class="splash-rule" aria-hidden="true"></div>
            <p class="splash-tagline" data-i18n="splash.tagline">A Notebook for Thinking</p>

            <div class="splash-progress">
                <div class="progress-bar">
                    <div class="progress-fill" id="progress-fill"></div>
                </div>
            </div>
            <p class="splash-status" id="progress-text" data-i18n="splash.startingUp">Starting up…</p>

            <p class="splash-version" id="splash-version" data-i18n="splash.version">Version</p>
        </div>
    </div>
```

Note: IDs `progress-fill`, `progress-text`, `splash-version` are preserved so existing JS continues to drive them. `#progress-percent` and `.status-dot` are removed — if any JS writes to `#progress-percent`, we'll handle that in Step 4.

- [ ] **Step 3: Find and neutralize any JS that writes to removed elements**

```bash
grep -rn "progress-percent\|status-dot\|splash-rings\|splash-particles" desktop/src/js desktop/main.js
```

For each match:
- If the code writes a value to `#progress-percent`, delete that write (we're dropping the numeric display).
- If the code adds/removes classes on `.status-dot`, delete that write.
- Leave `#progress-fill` and `#progress-text` writes intact.

- [ ] **Step 4: Smoke test**

```bash
cd desktop && npm start
```

App launches. Splash shows no particles, no rings, no icon glow, no letter-by-letter title. Progress still advances. Status text still updates. Splash still completes and hides normally.

Current styling will be wrong (old splash CSS still applies to the new markup); Task 2.3 fixes that.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/index.html desktop/src/js desktop/main.js
git commit -m "[Desktop] design: replace decorative splash DOM with editorial markup"
```

---

### Task 2.2: Add `splash.tagline` to locale files

**Files:**
- Modify: `desktop/src/locales/en.json`, `es.json`, `id.json`, `ja.json`, `jv.json`

- [ ] **Step 1: Add `tagline` key under the `splash` section in each locale**

Open each locale file. Find the existing `splash` object (e.g. in `en.json`, near where `startingUp` lives). Add:

```json
"splash": {
  "tagline": "A Notebook for Thinking",
  /* ...existing keys... */
}
```

For non-English locales, translate the tagline — e.g. `es.json`: "Un Cuaderno para Pensar"; `id.json`: "Buku Catatan untuk Berpikir"; `ja.json`: "思考のためのノート"; `jv.json`: "Buku Cathetan kanggo Mikir".

- [ ] **Step 2: Grep-verify**

```bash
grep -l "\"tagline\"" desktop/src/locales/*.json
```
Expected: all 5 locale files match.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/locales/
git commit -m "[Desktop] design: add splash tagline translations"
```

---

### Task 2.3: Rewrite splash CSS in `modals.css`

**Files:**
- Modify: `desktop/src/css/modals.css` (splash block is around lines 419–930)

- [ ] **Step 1: Open `desktop/src/css/modals.css` and read the splash block**

Read from line 419 to the end of the splash region (around line 930 — find the last `.splash-*` or `@keyframes` related to splash).

- [ ] **Step 2: Delete the entire old splash block**

Delete every rule whose selector starts with `.splash-`, `.particle`, `.ring`, `.splash-icon-glow`, `.progress-glow`, `.progress-percent`, `.status-dot`, `.splash-logo`, `.splash-icon`, `.splash-title`, `.splash-subtitle`, `.splash-footer`, `.splash-version` (the old version block).

Delete these `@keyframes`: `particleFloat`, `ringExpand`, and any keyframe referenced only by splash rules (e.g. icon glow pulse, letter reveal). Keep `spin` — it's used elsewhere.

- [ ] **Step 3: Insert the new editorial splash CSS**

Insert the new block in the same location (around line 419):

```css
/* Editorial Splash Screen */
.splash-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  opacity: 1;
  transition: opacity 220ms ease;
}

.splash-screen.hiding {
  opacity: 0;
  pointer-events: none;
}

.splash-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  width: 100%;
  max-width: 360px;
  padding: 48px 32px;
}

.splash-wordmark {
  font-family: var(--font-family-display);
  font-size: 54px;
  font-weight: 400;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--text-primary);
  margin: 0 0 16px 0;
}

.splash-wordmark em {
  font-style: italic;
  color: var(--accent-color);
  font-weight: 400;
}

[data-theme="dark"] .splash-wordmark {
  font-weight: 300;
  color: #ffffff;
}

.splash-rule {
  width: 120px;
  height: 3px;
  background: var(--text-primary);
  position: relative;
  margin-bottom: 18px;
}
.splash-rule::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 5px;
  height: 1px;
  background: var(--text-primary);
}

.splash-tagline {
  font-family: var(--font-family-base);
  font-size: 11px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 0 0 36px 0;
  font-weight: 400;
}

.splash-progress {
  width: 240px;
  margin-bottom: 12px;
}

.splash-screen .progress-bar {
  width: 100%;
  height: 1px;
  background: var(--bg-tertiary);
  position: relative;
  overflow: hidden;
}

.splash-screen .progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 0;
  background: var(--text-primary);
  transition: width 300ms ease;
}

[data-theme="dark"] .splash-screen .progress-fill {
  background: var(--accent-color);
}

.splash-status {
  font-family: var(--font-family-base);
  font-size: 11px;
  font-style: italic;
  color: var(--text-tertiary);
  margin: 0;
  letter-spacing: 0.05em;
}

.splash-version {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  font-family: var(--font-family-base);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.1em;
  margin: 0;
}
```

- [ ] **Step 4: Grep-verify old splash remnants are gone**

```bash
grep -n "particleFloat\|ringExpand\|splash-particles\|\.particle:nth-child\|splash-icon-glow\|progress-glow\|\.status-dot" desktop/src/css/modals.css
```
Expected: zero matches.

- [ ] **Step 5: Smoke test both themes**

Start the app. Splash shows wordmark `CogNotez` with italic lavender N, a 120px double-rule, the tagline in small caps, a hairline progress bar, italic status text, and `Version 3.0.0` in the corner. Dark mode inverts cleanly — wordmark is light weight, lavender glows.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/css/modals.css
git commit -m "[Desktop] design: rewrite splash to editorial typographic composition"
```

---

### Task 2.4: Update the version-string renderer

The existing JS likely writes `v3.0.0` or similar into `#splash-version`. Per spec, it should render `Version 3.0.0` (plain).

**Files:**
- Modify: `desktop/src/js/app.js` or wherever splash version rendering happens

- [ ] **Step 1: Locate the splash-version renderer**

```bash
grep -rn "splash-version\|getVersion\|app.getVersion" desktop/src/js desktop/main.js
```

- [ ] **Step 2: Ensure the rendered text is `Version {x.y.z}`**

Whatever function sets the text of `#splash-version`, make it output `` `Version ${version}` ``. If the current format differs, fix it.

- [ ] **Step 3: Smoke-test**

Launch app. Splash version reads `Version 3.0.0` (or current version).

- [ ] **Step 4: Commit** (only if a change was needed)

```bash
git add desktop/src/js desktop/main.js
git commit -m "[Desktop] design: render splash version as plain 'Version x.y.z'"
```

---

### Task 2.5: Pass 2 verification

- [ ] **Step 1: Full splash-screen grep sweep**

```bash
grep -rn "particle\|splash-rings\|splash-icon-glow\|progress-glow\|status-dot\|title-letter" desktop/src/index.html desktop/src/css
```
Expected: zero matches.

- [ ] **Step 2: Reduced-motion check**

Enable `prefers-reduced-motion: reduce` in DevTools (Rendering pane). Restart app. Splash still fades but respects motion prefs.

---

# Pass 3 — Chrome (Header + Sidebar + Editor Header)

Flatten and typographically restyle the chrome. Icons in the top-right toolbar retained per user preference — treatment only changes.

---

### Task 3.1: Strip slop from header — backdrop-filter, shadow, gradient-clip

**Files:**
- Modify: `desktop/src/css/header.css`

- [ ] **Step 1: Open `desktop/src/css/header.css` (517 lines total)**

- [ ] **Step 2: In `.app-header` (line 2), remove slop**

```css
.app-header {
    height: 44px;                    /* was 64px */
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-xl);
    background: var(--bg-primary);   /* was var(--header-bg) */
    /* DELETE backdrop-filter + webkit-backdrop-filter */
    border-bottom: 1px solid var(--border-color);
    /* DELETE box-shadow: var(--shadow-sm) */
    position: relative;
    z-index: 100;
    gap: var(--spacing-lg);
}
```

- [ ] **Step 3: Remove `.app-logo:hover` scale transform (lines ~42–44)**

Delete:
```css
.app-logo:hover {
    transform: scale(1.05);
}
```

Leave the `transition` on `.app-logo` in place — it's harmless once there's nothing to transition to.

- [ ] **Step 4: Rewrite `.app-title` (lines ~46–57) — drop gradient clip**

Replace the block with:

```css
.app-title {
    font-size: 18px;
    font-weight: 400;
    font-family: var(--font-family-display);
    color: var(--text-primary);
    letter-spacing: -0.02em;
    line-height: 1;
    margin: 0;
}

.app-title em {
    font-style: italic;
    color: var(--accent-color);
    font-weight: 400;
}

[data-theme="dark"] .app-title {
    font-weight: 300;
    color: #ffffff;
}
```

- [ ] **Step 5: Grep-verify slop removed from this file**

```bash
grep -n "backdrop-filter\|scale(1\.05\|-webkit-text-fill-color" desktop/src/css/header.css
```
Expected: zero matches (except possibly `scale(1.05)` elsewhere — if found, delete those too).

- [ ] **Step 6: Commit**

```bash
git add desktop/src/css/header.css
git commit -m "[Desktop] design: flatten header — drop glass, shadow, gradient-clip"
```

---

### Task 3.2: Update wordmark markup in `index.html`

**Files:**
- Modify: `desktop/src/index.html`

- [ ] **Step 1: Locate the app-title element (around line 101)**

Current:
```html
<h1 class="app-title">CogNotez</h1>
```

- [ ] **Step 2: Replace with italic-N markup**

```html
<h1 class="app-title">Cog<em>N</em>otez</h1>
```

- [ ] **Step 3: Smoke-test**

Launch app. Header wordmark reads `CogNotez` with an italic lavender `N` matching the logo and splash.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/index.html
git commit -m "[Desktop] design: wordmark in header now matches splash (italic N)"
```

---

### Task 3.3: Rewrite search input styling

**Files:**
- Modify: `desktop/src/css/header.css`

- [ ] **Step 1: Locate the `.search-input-wrapper` block (around lines 69–80)**

Current uses: `border-radius: var(--radius-full)`, `box-shadow: var(--shadow-sm)`, pill shape.

- [ ] **Step 2: Replace the block**

```css
.search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    transition: border-color 150ms ease;
    overflow: hidden;
}

.search-input-wrapper:focus-within {
    border-color: var(--accent-color);
}
```

- [ ] **Step 3: Find `.search-input` styles and add italic placeholder**

Search for `.search-input` in the same file. Add or modify:

```css
.search-input {
    border: none;
    outline: none;
    background: transparent;
    font-family: var(--font-family-base);
    font-size: 13px;
    color: var(--text-primary);
    padding: 6px 10px;
    width: 100%;
}

.search-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
}
```

- [ ] **Step 4: Restyle `.search-shortcut` (Ctrl+K label)**

Find `.search-shortcut` and replace with:

```css
.search-shortcut {
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    padding: 0 10px;
    white-space: nowrap;
}
```

- [ ] **Step 5: Commit**

```bash
git add desktop/src/css/header.css
git commit -m "[Desktop] design: flat editorial search input with italic placeholder"
```

---

### Task 3.4: Flatten header toolbar icon buttons

**Files:**
- Modify: `desktop/src/css/header.css`

- [ ] **Step 1: Find the `.header-toolbar-btn` rules**

```bash
grep -n "header-toolbar-btn\|header-action-btn" desktop/src/css/header.css
```

- [ ] **Step 2: Rewrite the button baseline**

Replace the `.header-toolbar-btn` and any `.header-action-btn` rule blocks (and their `:hover`, `.active`, `.hidden` variants) with:

```css
.header-toolbar-btn,
.header-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 0;
    font-size: 14px;
    transition: color 150ms ease, background-color 150ms ease;
}

.header-toolbar-btn:hover,
.header-action-btn:hover {
    color: var(--text-primary);
    background: transparent;
}

.header-toolbar-btn.active,
.header-action-btn.active {
    color: var(--accent-color);
}

.header-toolbar-btn.hidden {
    display: none;
}

.toolbar-btn-label {
    display: none;
}
```

- [ ] **Step 3: Audit for button-group and icon-sizing rules**

```bash
grep -n "header-btn-group\|new-note-btn-primary\|sync-btn\|theme-toggle" desktop/src/css/header.css
```

Update any of these rules that still have `box-shadow`, `transform`, `gradient`, or pill radii. Apply the same baseline: transparent bg, no shadow, color-shift on hover. For `.new-note-btn-primary` (if it's the prominent "+" new-note button), it may warrant a different treatment — an `ink`-filled button. Check its current style and if it's the primary CTA, give it:

```css
.new-note-btn-primary {
    background: var(--text-primary);
    color: var(--bg-primary);
    border: none;
    padding: 6px 14px;
    border-radius: 4px;
    font-family: var(--font-family-base);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background-color 150ms ease;
}

.new-note-btn-primary:hover {
    background: var(--accent-color);
}
```

Otherwise treat it like a flat icon button.

- [ ] **Step 4: Smoke test**

Hover icons in the top-right toolbar. They change color, not background. No lift, no shadow, no scaling.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/css/header.css
git commit -m "[Desktop] design: flat icon buttons in header toolbar"
```

---

### Task 3.5: Strip slop from sidebar

**Files:**
- Modify: `desktop/src/css/sidebar.css`

- [ ] **Step 1: Rewrite `.sidebar` (lines ~10–24)**

```css
.sidebar {
    width: 280px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 50;
    flex-shrink: 0;
    transition: width 220ms ease;
}
```

Deleted: `backdrop-filter`, `-webkit-backdrop-filter`, `box-shadow`.

- [ ] **Step 2: Remove `.sidebar-toggle:hover` scale**

Find and delete `transform: scale(1.05)` from any sidebar hover rule.

- [ ] **Step 3: Grep-verify**

```bash
grep -n "backdrop-filter\|scale(1\." desktop/src/css/sidebar.css
```
Expected: zero matches.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/css/sidebar.css
git commit -m "[Desktop] design: flatten sidebar — drop glass, shadow, scale-hover"
```

---

### Task 3.6: Rewrite sidebar section headers

**Files:**
- Modify: `desktop/src/css/sidebar.css` and possibly `desktop/src/index.html`

- [ ] **Step 1: Find `.sidebar-header h2` styling (lines ~50–57)**

Current uses `color: var(--accent-color)`, `font-weight: 700`, 20px. We're turning these into small-caps section labels.

- [ ] **Step 2: Rewrite**

```css
.sidebar-header h2 {
    font-family: var(--font-family-base);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    color: var(--text-tertiary);
    margin: 0;
}
```

- [ ] **Step 3: Find `.folders-divider` styling (line ~206)**

It's already uppercase-letterspaced, but uses weight 700. Adjust to match:

```css
.folders-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 12px 8px 12px;
    margin-top: 4px;
    font-family: var(--font-family-base);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    color: var(--text-tertiary);
    cursor: pointer;
    user-select: none;
}
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/css/sidebar.css
git commit -m "[Desktop] design: sidebar section labels in editorial small caps"
```

---

### Task 3.7: Rewrite folder-item active/hover to left-bar pattern

**Files:**
- Modify: `desktop/src/css/sidebar.css`

- [ ] **Step 1: Find `.folder-item` and its states (lines ~141–205)**

- [ ] **Step 2: Replace `.folder-item` baseline + states**

```css
.folder-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 8px 14px;
    border-radius: 0;
    border-left: 2px solid transparent;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease;
    color: var(--text-secondary);
    font-family: var(--font-family-base);
    font-size: 14px;
    margin: 0;
    background: transparent;
}

.folder-item:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.folder-item.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-left-color: var(--accent-color);
    font-weight: 400;
}

.folder-item.active .folder-icon,
.folder-item:hover .folder-icon {
    color: var(--text-primary);
    transform: none;
}

.folder-icon {
    font-size: 14px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
    color: var(--text-tertiary);
    transition: color 150ms ease;
}
```

Deleted: `border-radius: 12px`, `transform: scale(1.1)` on icon, `box-shadow`, `font-weight: 600`.

- [ ] **Step 3: Replace `.folder-count` styling (line ~189)**

```css
.folder-count {
    font-family: var(--font-family-base);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-weight: 400;
    background: transparent;
    padding: 0;
    border-radius: 0;
    min-width: 20px;
    text-align: right;
}

.folder-item.active .folder-count {
    color: var(--text-tertiary);
    background: transparent;
}
```

- [ ] **Step 4: Smoke test**

Click through folders in the sidebar. Active folder shows a left 2px lavender bar, raised background. Counts are plain numerals, not colored pills.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/css/sidebar.css
git commit -m "[Desktop] design: folder items use left-bar active pattern"
```

---

### Task 3.8: Rewrite note-item list styling

**Files:**
- Modify: `desktop/src/css/sidebar.css`

- [ ] **Step 1: Locate `.note-item` and its variants**

```bash
grep -n "\.note-item[ :{,.]" desktop/src/css/sidebar.css
```

- [ ] **Step 2: Replace baseline + states**

```css
.note-item {
    padding: 10px 14px 10px 16px;
    border-radius: 0;
    border-left: 2px solid transparent;
    cursor: pointer;
    transition: background-color 150ms ease;
    background: transparent;
    margin: 0;
    position: relative;
    overflow: hidden;
}

.note-item:hover {
    background: var(--bg-tertiary);
    transform: none;
}

.note-item.active {
    background: var(--bg-tertiary);
    border-left-color: var(--accent-color);
}

.note-item .note-title {
    font-family: var(--font-family-display);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin: 0 0 2px 0;
    line-height: 1.2;
    letter-spacing: -0.01em;
}

.note-item .note-title em {
    font-style: italic;
    color: var(--accent-color);
}

.note-item .note-meta {
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
}

.note-item .note-meta .tag {
    color: var(--rubric);
    font-style: italic;
}
```

Deleted: `transform: translateX(4px)` hover; `::before` decorative bars; `border-radius`; shadows.

- [ ] **Step 3: Smoke test**

Open sidebar. Note list shows each note with Fraunces title, meta in small caps. Active note has left lavender bar.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/css/sidebar.css
git commit -m "[Desktop] design: note items in editorial left-bar style"
```

---

### Task 3.9: Rewrite editor-header tabs and mode tools

**Files:**
- Modify: `desktop/src/css/editor.css` (scoped to editor-header rules only)

- [ ] **Step 1: Locate editor-header, tabs, mode-toggle rules**

```bash
grep -n "editor-header\|note-tabs-bar\|\.note-tab\|editor-toggle\|\.action-btn\|header-toolbar" desktop/src/css/editor.css
```

- [ ] **Step 2: Rewrite `.editor-header`**

Find its rule block and replace with:

```css
.editor-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 24px;
    height: 40px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-primary);
    flex-shrink: 0;
}
```

Drop: any backdrop-filter, shadow, gradient.

- [ ] **Step 3: Rewrite `.note-tab` to underline-style**

```css
.note-tabs-bar {
    display: flex;
    align-items: center;
    gap: 18px;
    flex: 1;
    overflow: hidden;
}

.note-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-family-base);
    font-size: 12px;
    color: var(--text-tertiary);
    padding: 4px 0;
    border: none;
    border-bottom: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    transition: color 150ms ease, border-color 150ms ease;
    white-space: nowrap;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 0;
}

.note-tab:hover {
    color: var(--text-primary);
}

.note-tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
}

.note-tab em {
    font-style: italic;
    color: var(--accent-color);
}

.note-tab .tab-close {
    opacity: 0;
    transition: opacity 150ms ease;
    color: var(--text-tertiary);
    font-size: 10px;
    margin-left: 4px;
}

.note-tab:hover .tab-close {
    opacity: 1;
}
```

- [ ] **Step 4: Rewrite mode-tool buttons (Edit/Preview/Split, Find, Share)**

Find the existing mode-toggle / action-btn rules in `editor.css` that apply to the editor header's right-side tools. Replace their styling with:

```css
.editor-mode-tool,
.editor-header .action-btn {
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    padding: 4px 0;
    cursor: pointer;
    transition: color 150ms ease, border-color 150ms ease;
    border-bottom: 1px solid transparent;
    border-radius: 0;
    min-width: 0;
    height: auto;
}

.editor-mode-tool:hover,
.editor-header .action-btn:hover {
    color: var(--text-primary);
    background: transparent;
    transform: none;
    box-shadow: none;
}

.editor-mode-tool.active,
.editor-header .action-btn.active {
    color: var(--accent-color);
    border-bottom-color: var(--accent-color);
}
```

The class names `.editor-mode-tool` and `.editor-header .action-btn` should cover current buttons — if the actual class names differ, adjust to match what `index.html` uses around the preview/split/find/share buttons.

- [ ] **Step 5: Smoke test**

Tabs show as underlined text (no pill). Active tab has 1px underline. Preview / Split toggles show in small caps; active mode is lavender + underlined.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/css/editor.css
git commit -m "[Desktop] design: editor header — underlined tabs + small-caps mode tools"
```

---

### Task 3.10: Pass 3 smoke and grep sweep

- [ ] **Step 1: Full launch**

```bash
cd desktop && npm start
```

Walk through both themes. Header + sidebar + editor header should feel flat, tight, typographic. No glass, no hover lifts, no rounded pills. Icons still in the top-right. Sidebar active states show left-bar.

- [ ] **Step 2: Grep sweep over Pass 3 files**

```bash
grep -rn "backdrop-filter\|translateY(-2px)\|transform: scale(1\.0" desktop/src/css/header.css desktop/src/css/sidebar.css
grep -n "backdrop-filter" desktop/src/css/editor.css
```

Expected: zero matches in header/sidebar. `editor.css` may still have backdrop-filter in body rules — Pass 4 cleans those.

---

# Pass 4 — Editor Body + AI Panel

The writing surface and its Companion. The most important pass — this is what the user looks at while working.

---

### Task 4.1: Add `drop_cap` column to notes table

**Files:**
- Modify: `desktop/src/js/database.js` (or wherever schema lives — grep to find)

- [ ] **Step 1: Locate the database schema**

```bash
grep -rn "CREATE TABLE\|CREATE_NOTES_TABLE\|notes\s*(" desktop/src/js desktop/main.js
```

Typical locations: `desktop/src/js/database.js` or `desktop/src/js/db/schema.js`.

- [ ] **Step 2: Add migration / ALTER statement**

If the project uses a migration-style pattern, add a new migration that runs `ALTER TABLE notes ADD COLUMN drop_cap INTEGER DEFAULT 0`. If there's a simpler `CREATE TABLE IF NOT EXISTS` with later `ALTER`s chained, add:

```js
// After existing schema creation, add:
try {
    db.prepare('ALTER TABLE notes ADD COLUMN drop_cap INTEGER DEFAULT 0').run();
} catch (e) {
    // Column already exists — ignore "duplicate column" errors
    if (!/duplicate column/i.test(e.message)) throw e;
}
```

Place this alongside any existing ALTER TABLE chain in the same file so it follows the project pattern.

- [ ] **Step 3: Add get/set helpers**

Find the note-read and note-write paths. In whichever helper builds the notes INSERT/UPDATE, include `drop_cap` alongside other columns. In the notes SELECT, include `drop_cap` in the returned object.

- [ ] **Step 4: Smoke test**

Launch the app. Open DevTools → Application → whichever local store the DB lives in, or simply check that the app starts without a schema error.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/js desktop/main.js
git commit -m "[Desktop] design: add drop_cap column to notes for per-note toggle"
```

---

### Task 4.2: Rename "AI Assistant" to "Companion" in locale files

**Files:**
- Modify: `desktop/src/locales/en.json`, `es.json`, `id.json`, `ja.json`, `jv.json`

- [ ] **Step 1: Grep for the existing keys**

```bash
grep -n "aiAssistant\|\"assistant\":" desktop/src/locales/*.json
```

Expected matches include `header.aiAssistant`, `ai.assistant` (both map to "AI Assistant").

- [ ] **Step 2: Update English strings**

In `desktop/src/locales/en.json`:
- Find `"aiAssistant": "AI Assistant"` under `header` → change to `"aiAssistant": "Companion"`
- Find `"assistant": "AI Assistant"` under `ai` → change to `"assistant": "Companion"`

- [ ] **Step 3: Update other languages**

Translate "Companion" per locale:
- `es.json`: `"Compañero"`
- `id.json`: `"Pendamping"`
- `ja.json`: `"伴走者"`
- `jv.json`: `"Kanca"`

Apply to both keys in each file.

- [ ] **Step 4: Grep-verify**

```bash
grep -n "Companion\|Compañero\|Pendamping\|伴走者\|Kanca" desktop/src/locales/*.json
```
Expected: at least 2 matches per file.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/locales/
git commit -m "[Desktop] design: rename AI Assistant → Companion in locales"
```

---

### Task 4.3: Update "AI Assistant" markup fallbacks in `index.html`

**Files:**
- Modify: `desktop/src/index.html`

- [ ] **Step 1: Find fallback text occurrences**

```bash
grep -n "AI Assistant" desktop/src/index.html
```
Expected matches (from earlier grep): lines around 129 (toggle button title), 163 (mobile toggle), 339 (ai-panel header), 376 (ai-dialog title).

- [ ] **Step 2: Replace each occurrence with "Companion"**

Specifically:
- Line 129: `title="Toggle AI Assistant"` → `title="Toggle Companion"`
- Line 163: `title="AI Assistant"` → `title="Companion"`, and the inner `<span data-i18n="header.aiAssistant">AI Assistant</span>` → `<span data-i18n="header.aiAssistant">Companion</span>`
- Line 339: `<h3 data-i18n="ai.assistant">AI Assistant</h3>` → `<h3 data-i18n="ai.assistant">Companion</h3>`
- Line 376: `<h3 id="ai-dialog-title" data-i18n="ai.assistant">AI Assistant</h3>` → `<h3 id="ai-dialog-title" data-i18n="ai.assistant">Companion</h3>`

The `data-i18n` attributes are unchanged (keys stay the same); only the fallback text changes.

- [ ] **Step 3: Smoke test**

Launch app. Open AI panel via the icon. Header reads "Companion" in every language.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/index.html
git commit -m "[Desktop] design: rename AI Assistant → Companion in markup"
```

---

### Task 4.4: Strip slop from AI panel CSS

**Files:**
- Modify: `desktop/src/css/ai-panel.css`

- [ ] **Step 1: Rewrite `.ai-panel` (lines ~2–13)**

```css
.ai-panel {
    width: 320px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 40;
}

.ai-panel.hidden {
    display: none;
}
```

Deleted: `backdrop-filter`, `-webkit-backdrop-filter`, `box-shadow`.

- [ ] **Step 2: Grep-verify**

```bash
grep -n "backdrop-filter\|scale(1\." desktop/src/css/ai-panel.css
```
Expected: zero matches.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/css/ai-panel.css
git commit -m "[Desktop] design: flatten AI panel base — 320px, no glass, no shadow"
```

---

### Task 4.5: Rewrite AI panel header

**Files:**
- Modify: `desktop/src/css/ai-panel.css`

- [ ] **Step 1: Rewrite `.ai-panel-header` and `.ai-panel-header h3` (lines ~15–33)**

```css
.ai-panel-header {
    padding: 14px 18px;
    background: transparent;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.ai-panel-header h3 {
    font-family: var(--font-family-base);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    color: var(--text-secondary);
    margin: 0;
}
```

- [ ] **Step 2: Rewrite `.ai-reset-btn, .ai-panel-close` (lines ~40–63)**

```css
.ai-reset-btn,
.ai-panel-close {
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 0;
    font-size: 13px;
    color: var(--text-tertiary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color 150ms ease;
    padding: 0;
}

.ai-reset-btn:hover,
.ai-panel-close:hover {
    color: var(--text-primary);
    background: transparent;
    transform: none;
    box-shadow: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add desktop/src/css/ai-panel.css
git commit -m "[Desktop] design: AI panel header — small-caps COMPANION label, flat icons"
```

---

### Task 4.6: Rewrite AI panel message treatment (no bubbles)

**Files:**
- Modify: `desktop/src/css/ai-panel.css`

- [ ] **Step 1: Locate and replace `.ai-panel-content` and `.ai-messages` block (lines ~65–)**

```css
.ai-panel-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0;
    background: transparent;
    min-height: 0;
    overflow: hidden;
}

.ai-messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 18px;
    font-family: var(--font-family-base);
    font-size: 13px;
    line-height: 1.65;
    color: var(--text-primary);
}
```

- [ ] **Step 2: Grep for existing message-bubble classes**

```bash
grep -n "\.message\|\.ai-message\|user-message\|assistant-message\|message-content\|message-bubble" desktop/src/css/ai-panel.css
```

- [ ] **Step 3: Replace message-bubble styles with editorial no-bubble pattern**

Delete the existing user/assistant bubble rules. Insert:

```css
.user-message,
.message.user {
    margin-bottom: 14px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0;
}

.user-message .message-content,
.message.user .message-content {
    font-style: italic;
    color: var(--text-primary);
    position: relative;
    padding-left: 16px;
}

.user-message .message-content::before,
.message.user .message-content::before {
    content: '"';
    position: absolute;
    left: 0;
    top: -4px;
    font-family: var(--font-family-display);
    font-size: 22px;
    font-style: italic;
    color: var(--accent-color);
    line-height: 1;
}

.assistant-message,
.message.assistant {
    margin-bottom: 18px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0;
}

.assistant-message::before,
.message.assistant::before {
    content: 'Reply';
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-family-base);
    font-size: 9px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-top: 10px;
    margin-bottom: 6px;
}

.assistant-message::after,
.message.assistant::after {
    content: '';
    display: block;
    height: 1px;
    background: var(--border-color);
    flex: 1;
    /* Note: this creates a visual rule after the REPLY label; if the flex
       model above doesn't position the rule next to the label, we use a
       wrapper approach. See Step 4. */
}

.assistant-message .message-content,
.message.assistant .message-content {
    color: var(--text-primary);
}

.assistant-message em,
.message.assistant em {
    font-style: italic;
    color: var(--accent-color);
}
```

- [ ] **Step 4: Fix the REPLY + horizontal-rule layout**

The flex-based pseudo-element approach in Step 3 won't inline the label with a rule because pseudo-elements don't stack in flex layouts the way siblings would. Replace the `::before` + `::after` approach with a single `::before` that uses a background gradient trick:

```css
.assistant-message::before,
.message.assistant::before {
    content: 'Reply';
    display: block;
    font-family: var(--font-family-base);
    font-size: 9px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 8px;
    padding-right: 16px;
    background-image: linear-gradient(to right, transparent 42px, var(--border-color) 42px, var(--border-color) 100%);
    background-size: 100% 1px;
    background-position: 0 50%;
    background-repeat: no-repeat;
}

.assistant-message::after,
.message.assistant::after {
    content: none;
}
```

(This paints a rule to the right of the "Reply" label using a horizontal gradient with a hard stop, so the label + rule appear on one line.)

- [ ] **Step 5: Smoke test**

Open the Companion. Send a message. User prompt renders in italic with a lavender quote-mark. Assistant reply renders with a small-caps `REPLY` label and a thin line to its right, followed by the answer.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/css/ai-panel.css
git commit -m "[Desktop] design: AI panel messages — italic user, REPLY-labelled assistant"
```

---

### Task 4.7: Rewrite AI panel input + bottom bar

**Files:**
- Modify: `desktop/src/css/ai-panel.css`

- [ ] **Step 1: Locate the input section**

```bash
grep -n "\.ai-input\|ai-input-container\|ai-input-actions\|ai-send" desktop/src/css/ai-panel.css
```

- [ ] **Step 2: Replace input and actions styles**

```css
.ai-input-container {
    border-top: 1px solid var(--border-color);
    padding: 12px 18px;
    background: transparent;
}

.ai-input,
textarea.ai-input {
    width: 100%;
    border: none;
    background: transparent;
    font-family: var(--font-family-base);
    font-size: 13px;
    font-style: italic;
    line-height: 1.6;
    color: var(--text-primary);
    resize: none;
    outline: none;
    min-height: 46px;
    padding: 0;
}

.ai-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
}

.ai-input-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
}

.ai-model-label {
    font-family: var(--font-family-base);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}

.ai-send-btn {
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--accent-color);
    background: transparent;
    border: none;
    padding: 4px 0;
    cursor: pointer;
    transition: opacity 150ms ease;
}

.ai-send-btn:hover {
    opacity: 0.7;
    background: transparent;
    transform: none;
    box-shadow: none;
}

.ai-send-btn:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 1;
}
```

Note: the existing markup may have the send button written differently. Use the Inspector to confirm which class name carries the send action and adjust the selector if needed. Ensure the button is rendered with its text content as the word "Send" (or `Send ⏎`). If it currently uses an icon-only paper-plane, update the button's inner markup in `index.html`:

```html
<button id="ai-send-btn" class="ai-send-btn" data-i18n="ai.send">Send ⏎</button>
```

And ensure `ai.send` key exists in locale files (`en.json`: `"send": "Send ⏎"`, etc.).

- [ ] **Step 3: Commit**

```bash
git add desktop/src/css/ai-panel.css desktop/src/index.html desktop/src/locales/
git commit -m "[Desktop] design: AI panel input — italic textarea + small-caps SEND"
```

---

### Task 4.8: Replace Companion loading state

**Files:**
- Modify: `desktop/src/css/ai-panel.css` and possibly `desktop/src/js/app.js`

- [ ] **Step 1: Grep for current loading indicator**

```bash
grep -rn "ai-loading\|loading-spinner\|thinking\|typing-indicator" desktop/src/css/ai-panel.css desktop/src/js desktop/src/index.html
```

- [ ] **Step 2: Replace whatever is rendered during loading with an italic "Thinking…" text node**

In whichever JS function manages the loading state (likely in `app.js` where the AI panel handles send), ensure the placeholder inserted into `.ai-messages` is:

```html
<div class="ai-thinking">Thinking…</div>
```

- [ ] **Step 3: Add CSS for the placeholder**

```css
.ai-thinking {
    font-family: var(--font-family-base);
    font-size: 13px;
    font-style: italic;
    color: var(--text-tertiary);
    margin: 10px 0 14px 0;
    padding-left: 16px;
}
```

- [ ] **Step 4: Delete or hide any pulsing/spinner CSS used for the loading state in this panel**

If there's a `.loading-spinner` or typing-dots rule specifically in the AI context, delete it.

- [ ] **Step 5: Smoke test**

Send a message to the Companion. During the wait, `Thinking…` in italic appears. When the reply lands, the placeholder is replaced by the REPLY-labelled answer.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/css/ai-panel.css desktop/src/js desktop/src/index.html
git commit -m "[Desktop] design: replace AI loading spinner with italic Thinking…"
```

---

### Task 4.9: Editor canvas — max-width 640px centered

**Files:**
- Modify: `desktop/src/css/editor.css`

- [ ] **Step 1: Locate `.editor-wrapper`, `.note-editor`, `.markdown-preview`**

```bash
grep -n "\.editor-wrapper\|\.note-editor\|\.markdown-preview" desktop/src/css/editor.css
```

- [ ] **Step 2: Add a canvas container rule**

Identify the element that actually wraps the title + body in the editor. Usually `.editor-wrapper`. Add a `.editor-canvas` inner class (in both HTML and CSS) that centers at 640px.

Approach: if `.editor-wrapper` already exists as the outer flex/scroll container, add a new inner wrapper in `index.html`:

```html
<div class="editor-wrapper">
  <div class="editor-canvas">
    <!-- existing title input + body editor go here -->
  </div>
</div>
```

Then in CSS:

```css
.editor-wrapper {
    padding: 32px 40px;
    overflow-y: auto;
    flex: 1;
}

.editor-canvas {
    max-width: 640px;
    margin: 0 auto;
}
```

If `.editor-wrapper` is already the scrollable centered container, just add the max-width + margin auto directly to it instead of wrapping.

- [ ] **Step 3: Smoke test**

Editor content is centered in the available horizontal space with generous side margins, not edge-to-edge.

- [ ] **Step 4: Commit**

```bash
git add desktop/src/css/editor.css desktop/src/index.html
git commit -m "[Desktop] design: center editor canvas at 640px max-width"
```

---

### Task 4.10: Editor title + meta line + double-rule

**Files:**
- Modify: `desktop/src/css/editor.css`, `desktop/src/index.html`

- [ ] **Step 1: Locate the current title input**

```bash
grep -n "note-title-input\|editor-title" desktop/src/css/editor.css desktop/src/index.html
```

- [ ] **Step 2: Add a meta line + double-rule to the editor markup**

In `index.html`, find the editor canvas area. Just above the title input, add:

```html
<div class="editor-meta" id="editor-meta">
  <span class="meta-status" data-i18n="editor.draft">DRAFT</span>
  <span class="meta-sep">·</span>
  <span class="meta-date" id="meta-date"></span>
  <span class="meta-sep">·</span>
  <span class="meta-wordcount" id="meta-wordcount">0 WORDS</span>
</div>
```

Just below the title input, add:

```html
<div class="editor-rule" aria-hidden="true"></div>
```

- [ ] **Step 3: Rewrite `.note-title-input` styling**

```css
.note-title-input {
    font-family: var(--font-family-display);
    font-size: 36px;
    font-weight: 500;
    line-height: 1.05;
    letter-spacing: -0.028em;
    color: var(--text-primary);
    border: none;
    outline: none;
    background: transparent;
    width: 100%;
    padding: 0;
    margin: 4px 0 0 0;
}

[data-theme="dark"] .note-title-input {
    font-weight: 300;
}

.note-title-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
}
```

- [ ] **Step 4: Style `.editor-meta` and `.editor-rule`**

```css
.editor-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 6px;
}

.editor-meta .meta-sep {
    color: var(--text-muted);
    letter-spacing: 0;
}

.editor-rule {
    width: 80px;
    height: 3px;
    background: var(--text-primary);
    position: relative;
    margin: 14px 0 18px 0;
}

.editor-rule::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 5px;
    height: 1px;
    background: var(--text-primary);
}
```

- [ ] **Step 5: Wire up `#meta-date` and `#meta-wordcount` updates**

Find the existing note-load and note-change handlers in `desktop/src/js/app.js`. On note load, set:
```js
document.getElementById('meta-date').textContent = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(note.updated_at)).toUpperCase();
```
On editor input, update word count:
```js
const words = editor.value.trim().split(/\s+/).filter(Boolean).length;
document.getElementById('meta-wordcount').textContent = `${words} WORDS`;
```
Use whatever editor reference the existing code already uses.

- [ ] **Step 6: Smoke test**

Open a note. Above the title: `DRAFT · 14 APR 2026 · 437 WORDS`. Title in Fraunces 36px. Below title: 80px double-rule.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/css/editor.css desktop/src/index.html desktop/src/js
git commit -m "[Desktop] design: editor title + meta line + editorial double-rule"
```

---

### Task 4.11: Drop-cap toggle + rendering

**Files:**
- Modify: `desktop/src/css/editor.css`, `desktop/src/index.html`, `desktop/src/js/app.js`, locale files

- [ ] **Step 1: Add the DROP-CAP toggle control to the editor header**

In `index.html`, next to the existing Edit/Preview/Split toggle, add:

```html
<button id="drop-cap-toggle" class="editor-mode-tool drop-cap-only" data-i18n="editor.dropCap">DROP-CAP</button>
```

The `.drop-cap-only` class will hide the button when preview mode is not active.

- [ ] **Step 2: Add locale entries**

Add `"dropCap": "DROP-CAP"` (en), `"MAYÚSCULA DECORATIVA"` (es), `"KAPITAL HIAS"` (id), `"ドロップキャップ"` (ja), `"AKSARA GEDHE"` (jv) under the `editor` object in each locale JSON.

- [ ] **Step 3: CSS to hide the button unless preview mode is active**

```css
.editor-mode-tool.drop-cap-only {
    display: none;
}

body.preview-active .editor-mode-tool.drop-cap-only {
    display: inline-block;
}
```

If the app already sets a class on `body` or a parent when preview is active, use that class. Otherwise, toggle `body.preview-active` from the preview-mode setter in `app.js`.

- [ ] **Step 4: Wire the toggle to the per-note metadata**

In `desktop/src/js/app.js`:
- On note-load: read `note.drop_cap` and set `document.getElementById('drop-cap-toggle').classList.toggle('active', note.drop_cap === 1)` and toggle a `body.note-drop-cap` class on the root.
- On toggle click: flip the `note.drop_cap` value, persist via the existing update-note DB call (reusing the helper added in Task 4.1), update the DOM classes.

Exact snippet for the click handler:

```js
document.getElementById('drop-cap-toggle').addEventListener('click', () => {
    const note = getCurrentNote();  // whatever accessor exists
    const next = note.drop_cap ? 0 : 1;
    updateNote(note.id, { drop_cap: next });   // existing note-update helper
    note.drop_cap = next;
    document.getElementById('drop-cap-toggle').classList.toggle('active', next === 1);
    document.body.classList.toggle('note-drop-cap', next === 1);
});
```

Adjust function names to match the existing app's accessor + updater.

- [ ] **Step 5: Add drop-cap rendering in preview mode**

The rendered preview HTML goes into `.markdown-preview`. The first paragraph needs its first letter wrapped. Simplest: in the markdown-render pipeline, after HTML is generated, find the first `<p>...</p>` and wrap its first character in a span, but only if `body.note-drop-cap` is set and preview is active.

```js
function applyDropCapIfEnabled(previewEl) {
    if (!document.body.classList.contains('note-drop-cap')) return;
    const firstP = previewEl.querySelector('p');
    if (!firstP) return;
    const text = firstP.textContent;
    if (!text) return;
    const first = text.charAt(0);
    const rest = text.slice(1);
    firstP.innerHTML = `<span class="drop-cap">${first}</span>${rest}${firstP.innerHTML.slice(firstP.textContent.length)}`;
    // Note: the slice preserves any inline HTML after the first text character.
    // Simpler alternative: re-walk the DOM. See Step 6 fallback.
}
```

Call `applyDropCapIfEnabled(previewElement)` at the end of the existing preview-render function.

- [ ] **Step 6: Simpler fallback with CSS `::first-letter`**

If the DOM walking above is brittle (markdown renderer injects inline nodes first), use pure CSS instead and skip the JS DOM walk. Add:

```css
body.note-drop-cap .markdown-preview > p:first-child::first-letter {
    font-family: var(--font-family-display);
    font-size: 48px;
    font-weight: 500;
    line-height: 1;
    float: left;
    margin: 0 6px 0 0;
    color: var(--text-primary);
}
```

This is the preferred approach — no JS DOM mutation needed. Use this and delete the `applyDropCapIfEnabled` function from Step 5 if it was already added.

- [ ] **Step 7: Smoke test**

Open a note. Switch to preview. Click DROP-CAP. First paragraph's first letter renders in large Fraunces, floated left. Click DROP-CAP again: reverts. Switch notes: the setting persists per-note.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/css desktop/src/index.html desktop/src/js desktop/src/locales
git commit -m "[Desktop] design: per-note drop-cap toggle with CSS ::first-letter"
```

---

### Task 4.12: Editor body — typography, spacing, colophon

**Files:**
- Modify: `desktop/src/css/editor.css`, `desktop/src/index.html`

- [ ] **Step 1: Rewrite `.note-editor` baseline**

```css
.note-editor {
    font-family: var(--font-family-base);
    font-size: 15px;
    line-height: 1.7;
    color: var(--text-primary);
    border: none;
    outline: none;
    background: transparent;
    width: 100%;
    resize: none;
    padding: 0;
    min-height: 400px;
}

.note-editor:focus {
    outline: none;
    background: transparent;
    box-shadow: none;
}

.note-editor em {
    font-style: italic;
    color: var(--accent-color);
}
```

- [ ] **Step 2: Rewrite `.markdown-preview` typography**

```css
.markdown-preview {
    font-family: var(--font-family-base);
    font-size: 15px;
    line-height: 1.7;
    color: var(--text-primary);
}

.markdown-preview p {
    margin: 0 0 14px 0;
}

.markdown-preview em {
    font-style: italic;
    color: var(--accent-color);
}

.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3 {
    font-family: var(--font-family-display);
    font-weight: 500;
    letter-spacing: -0.02em;
    margin: 28px 0 10px 0;
}

.markdown-preview h1 em,
.markdown-preview h2 em,
.markdown-preview h3 em {
    font-style: italic;
    color: var(--accent-color);
    font-weight: 500;
}
```

- [ ] **Step 3: Add the colophon bar**

In `index.html`, below `.editor-wrapper`, add:

```html
<div class="editor-colophon" id="editor-colophon">
  <div class="colophon-tags" id="colophon-tags"><!-- injected by JS --></div>
  <span class="colophon-spacer"></span>
  <span class="colophon-status" id="colophon-status" data-i18n="editor.saved">SAVED</span>
  <span class="colophon-sep">·</span>
  <span class="colophon-position" id="colophon-position">LN 1 · COL 1</span>
</div>
```

- [ ] **Step 4: Style the colophon**

```css
.editor-colophon {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 40px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-primary);
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
}

.colophon-tags {
    display: inline-flex;
    gap: 14px;
}

.colophon-tags .tag {
    color: var(--text-tertiary);
    letter-spacing: 0.18em;
}

.colophon-tags .tag .tag-name {
    color: var(--rubric);
    font-style: italic;
    letter-spacing: 0.05em;
    text-transform: lowercase;
}

.colophon-spacer {
    flex: 1;
}

.colophon-sep {
    color: var(--text-muted);
    letter-spacing: 0;
}
```

- [ ] **Step 5: Wire tag rendering and cursor position**

Replace the existing tag-display renderer in `app.js` so it outputs the colophon format:

```js
const tagsEl = document.getElementById('colophon-tags');
tagsEl.innerHTML = (note.tags || []).map(t => `<span class="tag"># <span class="tag-name">${escapeHtml(t)}</span></span>`).join('');
```

For cursor position, attach a listener to the editor that updates `#colophon-position` on `input`/`selectionchange`:

```js
editor.addEventListener('input', updatePosition);
editor.addEventListener('click', updatePosition);
editor.addEventListener('keyup', updatePosition);

function updatePosition() {
    const pos = editor.selectionStart;
    const before = editor.value.substring(0, pos);
    const line = before.split('\n').length;
    const col = before.length - before.lastIndexOf('\n');
    document.getElementById('colophon-position').textContent = `LN ${line} · COL ${col}`;
}
```

- [ ] **Step 6: Remove the old tag display rendering**

The previous tag display (likely a row of pill elements above or below the editor) is replaced by the colophon. Remove the element from `index.html` if it's separate, and remove the corresponding CSS block in `editor.css`.

- [ ] **Step 7: Smoke test**

Open a note with tags. Below the editor: `# tagone   # tagtwo` in editorial style; then `SAVED · LN 1 · COL 1` updating as you type.

- [ ] **Step 8: Add `editor.saved` locale key**

Add `"saved": "SAVED"` (en), `"GUARDADO"` (es), `"TERSIMPAN"` (id), `"保存済み"` (ja), `"WIS DISIMPEN"` (jv) under the `editor` object in each locale file.

- [ ] **Step 9: Commit**

```bash
git add desktop/src/css/editor.css desktop/src/index.html desktop/src/js desktop/src/locales
git commit -m "[Desktop] design: editor body — editorial typography and colophon bar"
```

---

### Task 4.13: Pass 4 smoke + grep

- [ ] **Step 1: Full launch**

```bash
cd desktop && npm start
```

Walk through: open existing note → read preview → edit → switch to split → toggle drop-cap → open Companion → send a prompt → see italic user + REPLY-labelled assistant + italic Thinking…

- [ ] **Step 2: Grep sweep**

```bash
grep -rn "backdrop-filter\|transform: scale(1\|translateY(-2px)" desktop/src/css/editor.css desktop/src/css/ai-panel.css
grep -rn "AI Assistant" desktop/src/index.html desktop/src/locales desktop/src/js
```

Expected: zero matches in both.

---

# Pass 5 — Remaining Surfaces + Cleanup

Modals, context menus, find/replace, toasts, AI-generate dialog, responsive. Finally, delete the alias tokens.

---

### Task 5.1: Modal backdrop and card

**Files:**
- Modify: `desktop/src/css/modals.css`

- [ ] **Step 1: Locate `.modal-overlay` and `.modal-content` rules**

```bash
grep -n "\.modal-overlay\|\.modal[^-]\|\.modal-content\|\.modal-header\|\.modal-body" desktop/src/css/modals.css
```

- [ ] **Step 2: Rewrite backdrop**

```css
.modal-overlay,
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(26, 23, 21, 0.6);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    animation: modalFadeIn 220ms ease-out;
}

[data-theme="dark"] .modal-overlay,
[data-theme="dark"] .modal-backdrop {
    background: rgba(12, 11, 16, 0.8);
}

@keyframes modalFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
```

- [ ] **Step 3: Rewrite modal card**

```css
.modal-content {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    box-shadow: var(--shadow-popover);
    max-width: 520px;
    width: 100%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.modal-header {
    padding: 18px 22px 12px 22px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.modal-header h3,
.modal-header h2 {
    font-family: var(--font-family-display);
    font-size: 22px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    margin: 0;
}

.modal-header h3 em,
.modal-header h2 em {
    font-style: italic;
    color: var(--accent-color);
}

.modal-close {
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 0;
    transition: color 150ms ease;
}

.modal-close:hover {
    color: var(--text-primary);
    background: transparent;
    transform: none;
    box-shadow: none;
}

.modal-body {
    padding: 18px 22px 22px 22px;
    overflow-y: auto;
}
```

- [ ] **Step 4: Rewrite section labels inside modals (h4/h5)**

```css
.modal-body h4,
.modal-body h5,
.tag-manager-section h4,
.tag-manager-section h5 {
    font-family: var(--font-family-base);
    font-size: 11px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--text-tertiary);
    margin: 18px 0 8px 0;
}

.modal-body h4:first-child,
.modal-body h5:first-child {
    margin-top: 0;
}
```

- [ ] **Step 5: Grep verify**

```bash
grep -n "backdrop-filter: blur\|box-shadow: var(--shadow-lg\|box-shadow: var(--shadow-xl" desktop/src/css/modals.css
```
Expected: zero matches on `blur(` after the modal changes.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/css/modals.css
git commit -m "[Desktop] design: modals — flat card, editorial title, small-caps labels"
```

---

### Task 5.2: Modal form inputs + buttons

**Files:**
- Modify: `desktop/src/css/modals.css`

- [ ] **Step 1: Locate modal input rules**

```bash
grep -n "modal-body input\|modal-body textarea\|modal-body select" desktop/src/css/modals.css
```

- [ ] **Step 2: Rewrite input baseline**

```css
.modal-body input[type="text"],
.modal-body input[type="email"],
.modal-body input[type="password"],
.modal-body input[type="number"],
.modal-body input[type="search"],
.modal-body textarea,
.modal-body select {
    font-family: var(--font-family-base);
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 8px 10px;
    outline: none;
    width: 100%;
    transition: border-color 150ms ease;
}

.modal-body input::placeholder,
.modal-body textarea::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
}

.modal-body input:focus,
.modal-body textarea:focus,
.modal-body select:focus {
    border-color: var(--accent-color);
    box-shadow: none;
}
```

- [ ] **Step 3: Find and rewrite primary/secondary button styles inside modals**

```bash
grep -n "modal-actions\|btn-primary\|btn-secondary\|modal-footer" desktop/src/css/modals.css
```

Replace with:

```css
.modal-footer,
.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 22px;
    border-top: 1px solid var(--border-color);
}

.btn-primary {
    font-family: var(--font-family-base);
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--bg-primary);
    background: var(--text-primary);
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 150ms ease;
}

.btn-primary:hover {
    background: var(--accent-color);
    transform: none;
    box-shadow: none;
}

.btn-primary:disabled {
    background: var(--text-muted);
    cursor: not-allowed;
}

.btn-secondary,
.btn-cancel {
    font-family: var(--font-family-base);
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    padding: 8px 12px;
    cursor: pointer;
    transition: color 150ms ease;
}

.btn-secondary:hover,
.btn-cancel:hover {
    color: var(--text-primary);
    background: transparent;
}
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/css/modals.css
git commit -m "[Desktop] design: modal inputs + editorial buttons"
```

---

### Task 5.3: Tag manager existing pill chips

**Files:**
- Modify: `desktop/src/css/editor.css` (tag-manager-content lives here per earlier Read)

- [ ] **Step 1: Rewrite `.tag-item` and `.tag-remove`**

Located at `editor.css` lines ~33–58. Replace:

```css
.current-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    min-height: 30px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-primary);
}

.tag-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    background: transparent;
    color: var(--text-primary);
    border: none;
    border-radius: 0;
    font-family: var(--font-family-base);
    font-size: 12px;
    font-variant-numeric: normal;
}

.tag-item::before {
    content: '#';
    color: var(--text-tertiary);
    margin-right: 2px;
}

.tag-item .tag-name {
    color: var(--rubric);
    font-style: italic;
}

.tag-remove {
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    font-size: 11px;
    padding: 0 2px;
    width: auto;
    height: auto;
    border-radius: 0;
    transition: color 150ms ease;
}

.tag-remove:hover {
    color: var(--rubric);
}
```

- [ ] **Step 2: Commit**

```bash
git add desktop/src/css/editor.css
git commit -m "[Desktop] design: tag chips as editorial # marks"
```

---

### Task 5.4: Context menus

**Files:**
- Modify: the file holding `.context-menu` rules (grep to locate)

- [ ] **Step 1: Locate**

```bash
grep -rn "\.context-menu[ {,.]" desktop/src/css
```

- [ ] **Step 2: Replace context-menu baseline + items**

```css
.context-menu {
    position: absolute;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    box-shadow: var(--shadow-popover);
    min-width: 220px;
    padding: 6px 0;
    z-index: 2000;
    animation: slideDown 150ms ease-out;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

.context-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px 6px 14px;
    border: none;
    border-left: 2px solid transparent;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-family-base);
    font-size: 13px;
    cursor: pointer;
    transition: background-color 150ms ease;
    border-radius: 0;
    width: 100%;
    text-align: left;
}

.context-menu-item:hover {
    background: var(--bg-tertiary);
    border-left-color: var(--accent-color);
}

.context-menu-item .item-icon {
    width: 14px;
    font-size: 13px;
    color: var(--text-tertiary);
}

.context-menu-item:hover .item-icon {
    color: var(--text-primary);
}

.context-menu-item .item-shortcut {
    margin-left: auto;
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-tertiary);
}

.context-menu-item.destructive {
    color: var(--rubric);
}

.context-menu-item.destructive .item-icon {
    color: var(--rubric);
}

.context-menu-divider {
    height: 1px;
    background: var(--border-color);
    margin: 4px 0;
}
```

Adjust class names in the selector list to match the actual markup (confirm `.item-icon`, `.item-shortcut`, `.context-menu-divider` — if different names are used in the project, substitute).

- [ ] **Step 3: Commit**

```bash
git add desktop/src/css
git commit -m "[Desktop] design: context menus — left-bar hover, editorial type"
```

---

### Task 5.5: Find / Replace bar

**Files:**
- Modify: `desktop/src/css/search-features.css`

- [ ] **Step 1: Locate find/replace rules**

```bash
grep -n "\.find-\|\.replace-\|find-input\|replace-input\|find-replace-bar" desktop/src/css/search-features.css
```

- [ ] **Step 2: Rewrite inputs to match main search treatment**

```css
.find-input,
.replace-input,
.search-field-input {
    font-family: var(--font-family-base);
    font-size: 13px;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 6px 10px;
    outline: none;
    transition: border-color 150ms ease;
}

.find-input:focus,
.replace-input:focus,
.search-field-input:focus {
    border-color: var(--accent-color);
    box-shadow: none;
}

.find-input::placeholder,
.replace-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
}
```

- [ ] **Step 3: Rewrite action-buttons + match count**

```css
.find-replace-actions button,
.find-count {
    font-family: var(--font-family-base);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    transition: color 150ms ease;
    font-variant-numeric: tabular-nums;
}

.find-replace-actions button:hover {
    color: var(--text-primary);
    background: transparent;
    transform: none;
    box-shadow: none;
}

.find-count {
    color: var(--text-tertiary);
    cursor: default;
}

.find-count:hover {
    color: var(--text-tertiary);
}
```

- [ ] **Step 4: Commit**

```bash
git add desktop/src/css/search-features.css
git commit -m "[Desktop] design: find/replace — editorial inputs, small-caps actions"
```

---

### Task 5.6: Toasts / notifications

**Files:**
- Modify: whichever CSS file holds toast styles (grep)

- [ ] **Step 1: Locate**

```bash
grep -rn "\.toast\|\.notification[ :{,.]\|\.notify" desktop/src/css
```

- [ ] **Step 2: Rewrite**

If toasts exist, replace their styling with:

```css
.toast,
.notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-left: 2px solid var(--text-primary);
    border-radius: 4px;
    padding: 10px 16px 10px 14px;
    box-shadow: var(--shadow-popover);
    font-family: var(--font-family-base);
    font-size: 12px;
    color: var(--text-primary);
    min-width: 240px;
    max-width: 360px;
    animation: toastSlideIn 220ms ease-out;
    z-index: 3000;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}

.toast.info,
.notification.info {
    border-left-color: var(--accent-color);
}

.toast.error,
.notification.error {
    border-left-color: var(--rubric);
}

.toast .toast-label,
.notification .notification-label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 2px;
}

@keyframes toastSlideIn {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
}
```

If no toast system exists, skip this task.

- [ ] **Step 3: Commit (if a change was made)**

```bash
git add desktop/src/css
git commit -m "[Desktop] design: toasts — flat card, left accent rule, small-caps label"
```

---

### Task 5.7: AI-Generate dialog inherits modal rules

**Files:**
- Modify: `desktop/src/css/ai-generate.css`

- [ ] **Step 1: Read the file**

It's 173 lines. Identify any style that duplicates the modal treatment and delete it (modals.css now provides it). Keep only styles specific to AI-Generate — e.g., the prompt input box.

- [ ] **Step 2: Make the prompt input italic multi-line**

Find the prompt textarea selector and ensure:

```css
.ai-generate-prompt textarea,
#ai-generate-input {
    font-family: var(--font-family-base);
    font-size: 13px;
    font-style: italic;
    line-height: 1.65;
    color: var(--text-primary);
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 10px 12px;
    min-height: 80px;
    resize: vertical;
    outline: none;
    transition: border-color 150ms ease;
    width: 100%;
}

.ai-generate-prompt textarea::placeholder,
#ai-generate-input::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
}

.ai-generate-prompt textarea:focus,
#ai-generate-input:focus {
    border-color: var(--accent-color);
}
```

- [ ] **Step 3: Ensure the generated-output area uses the REPLY treatment**

If the dialog renders the generated output, the output container should match the Companion's assistant-message style. Add (or replace existing rules for) the output container:

```css
.ai-generate-output {
    position: relative;
    padding: 12px 0 0 0;
    margin-top: 16px;
    font-family: var(--font-family-base);
    font-size: 13px;
    line-height: 1.65;
    color: var(--text-primary);
}

.ai-generate-output::before {
    content: 'Reply';
    display: block;
    font-family: var(--font-family-base);
    font-size: 9px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    margin-bottom: 8px;
    background-image: linear-gradient(to right, transparent 42px, var(--border-color) 42px, var(--border-color) 100%);
    background-size: 100% 1px;
    background-position: 0 50%;
    background-repeat: no-repeat;
}
```

- [ ] **Step 4: Grep-verify**

```bash
grep -n "backdrop-filter\|transform: scale\|translateY(-2px)" desktop/src/css/ai-generate.css
```
Expected: zero matches.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/css/ai-generate.css
git commit -m "[Desktop] design: AI-generate dialog inherits editorial modal + REPLY output"
```

---

### Task 5.8: Responsive.css audit

**Files:**
- Modify: `desktop/src/css/responsive.css`

- [ ] **Step 1: Grep for slop inside responsive breakpoints**

```bash
grep -n "backdrop-filter\|translateY(-2px)\|translateY(-1px)\|transform: scale(1\." desktop/src/css/responsive.css
```

- [ ] **Step 2: Delete every match**

Each match deletes the entire property line. Empty rule blocks are also deleted.

- [ ] **Step 3: Audit surface-width breakpoints**

Check that breakpoints match the new sizes: AI panel is now 320px (down from 380); canvas is 640px max-width; header is 44px (down from 64px). Where responsive rules override these values, update them:

- Find `width: 380px` in AI panel rules → change to `width: 320px`
- Find `width: 360px` or `width: 400px` etc. → update to match new 320px
- Find `.ai-panel` width overrides in `@media` queries — ensure they use values proportional to 320px
- Find `.app-header` height overrides → update the 64px references to 44px where applicable
- Find `.editor-wrapper` max-width / padding → preserve the 640px canvas behavior

- [ ] **Step 4: Smoke-test at multiple widths**

Resize the window from 1920 → 1366 → 1280 → 1100 → 900. Layout scales sensibly; no horizontal overflow; tabs truncate, don't wrap to a new row; Companion panel collapses under min widths (existing behavior).

- [ ] **Step 5: Commit**

```bash
git add desktop/src/css/responsive.css
git commit -m "[Desktop] design: responsive audit — remove slop, update widths"
```

---

### Task 5.9: Delete the alias tokens

**Files:**
- Modify: `desktop/src/css/themes.css`

- [ ] **Step 1: Grep for any remaining references to aliased tokens**

Run each of these grep commands. If any returns matches in `desktop/src/css/*.css` (excluding `themes.css` itself), the matched rule must be migrated to the canonical token **before** proceeding:

```bash
grep -rn "var(--accent-color-light)\|var(--accent-color-lighter)\|var(--accent-color-lightest)\|var(--accent-color-dark)\|var(--accent-color-darker)\|var(--accent-color-text)" desktop/src/css | grep -v themes.css
grep -rn "var(--shadow-xs)\|var(--shadow-sm)\|var(--shadow-md)\|var(--shadow-accent)\|var(--shadow-accent-lg)\|var(--shadow-inner)\|var(--shadow-2xl)\|var(--shadow-xl)\|var(--shadow-lg)" desktop/src/css | grep -v themes.css
grep -rn "var(--gradient-" desktop/src/css | grep -v themes.css
grep -rn "var(--header-bg)\|var(--sidebar-bg)\|var(--editor-bg)\|var(--input-bg)\|var(--button-bg)\|var(--button-hover-bg)\|var(--button-active-bg)\|var(--note-hover-bg)\|var(--note-active-bg)\|var(--context-menu-bg)\|var(--context-menu-hover-bg)\|var(--modal-bg)\|var(--message-bg)\|var(--context-highlight-bg)\|var(--card-bg)\|var(--surface-bg)\|var(--surface-elevated)" desktop/src/css | grep -v themes.css
```

- [ ] **Step 2: Migrate remaining references**

For each match in Step 1, open the file at the match line and replace the aliased token with the canonical one per this mapping (same mapping used in Pass 1 Task 1.3):

- `--accent-color-light` → `--accent-soft`
- `--accent-color-lighter` → `--accent-soft`
- `--accent-color-lightest` → `transparent`
- `--accent-color-dark` / `--accent-color-darker` / `--accent-color-text` → `--accent-color`
- `--shadow-xs` / `--shadow-sm` / `--shadow-md` / `--shadow-accent` / `--shadow-accent-lg` / `--shadow-inner` → remove the property entirely (no shadow)
- `--shadow-lg` / `--shadow-xl` / `--shadow-2xl` → `--shadow-popover` (only if the surface is actually a popover — otherwise remove the shadow property)
- `--gradient-primary` → `--accent-color`
- `--gradient-subtle` / `--gradient-surface` → `--bg-primary`
- `--gradient-accent` → `--accent-soft`
- `--header-bg` / `--editor-bg` / `--input-bg` / `--modal-bg` → `--bg-primary`
- `--sidebar-bg` / `--context-menu-bg` / `--message-bg` / `--card-bg` / `--surface-bg` → `--bg-secondary`
- `--surface-elevated` / `--button-hover-bg` / `--note-hover-bg` / `--note-active-bg` / `--context-menu-hover-bg` → `--bg-tertiary`
- `--button-bg` → `transparent`
- `--button-active-bg` / `--context-highlight-bg` → `--accent-soft`

Commit each file's migration separately if there are many:

```bash
git add desktop/src/css/<file>.css
git commit -m "[Desktop] design: migrate <file>.css off alias tokens"
```

- [ ] **Step 3: Re-run the Step 1 greps**

All four must return zero matches (outside `themes.css`). If not, repeat Step 2.

- [ ] **Step 4: Delete the aliases from `themes.css`**

Open `desktop/src/css/themes.css`. Delete these lines in both `:root` and `[data-theme="dark"]`:

- Every `--accent-color-light`, `-lighter`, `-lightest`, `-dark`, `-darker`, `-text` declaration
- Every `--shadow-xs`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl`, `-accent`, `-accent-lg`, `-inner` declaration
- Every `--gradient-primary`, `-subtle`, `-surface`, `-accent` declaration
- Every `--header-bg`, `--sidebar-bg`, `--editor-bg`, `--input-bg`, `--button-bg`, `--button-hover-bg`, `--button-active-bg`, `--note-hover-bg`, `--note-active-bg`, `--context-menu-bg`, `--context-menu-hover-bg`, `--modal-bg`, `--message-bg`, `--context-highlight-bg`, `--card-bg`, `--surface-bg`, `--surface-elevated` declaration

- [ ] **Step 5: Grep-verify**

```bash
grep -n -- "--accent-color-light\|--shadow-md\|--gradient-primary\|--header-bg\|--surface-elevated" desktop/src/css/themes.css
```
Expected: zero matches.

- [ ] **Step 6: Smoke test**

Launch the app. No undefined-CSS-variable warnings in DevTools. All surfaces render correctly in both themes.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/css/themes.css
git commit -m "[Desktop] design: remove legacy alias tokens from themes.css"
```

---

### Task 5.10: Final sloppy-pattern grep sweep

- [ ] **Step 1: Zero-match grep across all CSS**

```bash
grep -rn "backdrop-filter" desktop/src/css
grep -rn "translateY(-2px)\|translateY(-1px)\|transform: scale(1\." desktop/src/css
grep -rn "box-shadow: var(--shadow-accent\|--shadow-accent-lg" desktop/src/css
grep -rn "\.glass[ {]" desktop/src/css
grep -rn "particleFloat\|ringExpand" desktop/src/css
```

Each must return zero matches.

- [ ] **Step 2: Sanity: shadow-popover is the only shadow**

```bash
grep -rn "box-shadow:" desktop/src/css
```

Review matches. Every non-zero shadow should be either `var(--shadow-popover)` or `none`. If any literal shadow value (`0 Xpx Ypx...`) remains in non-popover rules, delete it.

- [ ] **Step 3: Confirm AI Assistant is gone from user-facing strings**

```bash
grep -rn "AI Assistant" desktop/src/locales desktop/src/index.html
```

Expected: zero matches.

- [ ] **Step 4: Full app smoke test**

Walk through: splash → main app → sidebar folders + notes → open a note → read/edit/preview/split → Companion panel → send a prompt → settings modal → tag manager → find/replace → context menu (right-click in editor) → AI-generate → export. Each surface is coherent in both themes.

- [ ] **Step 5: Commit the sweep (if any last fixes were needed)**

```bash
git add -A desktop/src/css
git commit -m "[Desktop] design: final cleanup sweep — zero slop patterns remaining"
```

---

## Self-Review (completed — issues fixed inline during writing)

Coverage check against spec sections:

- §1 Foundations (tokens) → Tasks 1.1–1.3
- §1 Typography → Tasks 1.1 (canonical sizes), 4.10 (title), 4.12 (body)
- §1 Shape → surfaced via file-by-file 0-radius replacements (Tasks 3.7, 3.8, 5.1, 5.4)
- §1 Motion → Tasks 1.4 (hover lifts), 1.5 (transforms), 5.1 (modal fade), 5.6 (toast slide)
- §2 Splash → Tasks 2.1–2.5
- §3 Chrome → Tasks 3.1–3.9
- §4 Editor body → Tasks 4.9–4.12
- §4 AI panel + Companion rename → Tasks 4.2–4.8
- §5 Modals → 5.1, 5.2, 5.3
- §5 Context menus → 5.4
- §5 Find/Replace → 5.5
- §5 Toasts → 5.6
- §5 AI-Generate → 5.7
- §6 Pass 5 cleanup (alias removal + final grep) → 5.9, 5.10

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-desktop-design-refresh.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
