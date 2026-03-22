# CogNotez Desktop — Design Overhaul Spec
**Date:** 2026-03-22
**Status:** Approved
**Scope:** `desktop/src/css/` and `desktop/src/index.html`

---

## Overview

A comprehensive design overhaul of the CogNotez Electron desktop app, targeting five root issues:
1. Generic "AI slop" typography (Inter)
2. Overuse of gradient text
3. Generic note card layout
4. Browser-like tab bar
5. Flat, uninspired dark mode

**One firm constraint:** The lavender accent color `#bdabe3` is unchanged throughout.

**Implementation strategy:** Token swap + targeted edits — update CSS custom properties in `themes.css` so changes cascade automatically, then make structural edits only to files that need layout changes.

---

## 1. Typography

**Decision:** Fraunces (display) + Source Serif 4 (body)

**Google Fonts URL to replace in `index.html`:**
```
Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900
Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900
```
Remove the existing Inter import.

**Application:**
- `font-family` base (body): `'Source Serif 4', Georgia, serif`
- Display elements (app title, sidebar heading, note titles in list, large editor title, tab chips): `'Fraunces', Georgia, serif`
- No changes to monospace (Monaco/Menlo already used for code blocks)

**CSS token changes in `themes.css`:**
```css
--font-family-base: 'Source Serif 4', Georgia, serif;
--font-family-display: 'Fraunces', Georgia, serif;
```

**Editor title:** The `#note-title` input gets `font-family: var(--font-family-display)` at `font-size: 32px`, `font-weight: 700`, `letter-spacing: -0.03em`. This is the highest-impact single change — the large Fraunces title transforms the editor.

**Note list:** `.note-item-title` uses `font-family: var(--font-family-display)`, size 13px weight 600.

**Sidebar heading:** `.sidebar-header h2` uses `font-family: var(--font-family-display)` — remove the `-webkit-background-clip: text` gradient treatment here.

---

## 2. Gradient Text Overuse — Reduction

Currently `-webkit-background-clip: text` with `--gradient-primary` is applied to:
- `.app-title` in header
- `.sidebar-header h2`
- `.ai-panel-header h3`

**Change:** Remove gradient text from sidebar heading and AI panel heading. Keep it only on `.app-title` (the "CogNotez" logo in the header) as the single intentional brand moment.

Both `.sidebar-header h2` and `.ai-panel-header h3` switch to plain `color: var(--accent-color)`.

---

## 3. Note Cards → Dense List

**Current:** Rounded 16px cards with hover-lift, drop shadow, card background — generic card grid feel.

**New:** Dense list rows with a left-border accent treatment.

**Structural changes to `sidebar.css` — `.note-item`:**
```css
.note-item {
  padding: 8px 8px;
  border-radius: 6px;
  border-left: 2px solid transparent;
  background: transparent;
  box-shadow: none;
  gap: 3px;
}

.note-item:hover {
  background: rgba(189, 171, 227, 0.07);
  border-left-color: rgba(189, 171, 227, 0.35);
  transform: none;        /* remove hover lift */
  box-shadow: none;
}

.note-item.active {
  background: rgba(189, 171, 227, 0.12);
  border-left-color: var(--accent-color);
  border-color: transparent;  /* remove full border */
  box-shadow: none;
}
```

**`.notes-list`:** Remove `gap: 12px`, set `gap: 1px`.

**`.note-item-title`:** Apply `font-family: var(--font-family-display)`, size 12px, weight 600.

**`.note-item-preview`:** Stays as Source Serif 4 (body font), size 10px, single line (clamp to 1 line via `-webkit-line-clamp: 1`).

**`.note-item-date`:** Add `font-style: italic`.

**Pinned notes:** Remove `border-top: 2px solid var(--accent-color)`. Pin state is communicated by the pin button state alone (already implemented).

---

## 4. Tab Bar → Pill Chips

**Current:** Standard browser tab row with rectangular tabs, active tab differentiated by background.

**New:** Horizontal row of pill-shaped chips. Each chip shows a small dot indicator + note title + close icon.

**Structural changes to `layout.css` — `.note-tabs-bar` and tab items:**

```css
.note-tabs-bar {
  height: 38px;
  background: var(--bg-secondary);    /* one step darker than header */
  border-bottom: 1px solid var(--border-color);
  padding: 0 14px;
  gap: 6px;
}
```

**Individual tab chips** (currently `.note-tab`):
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
}

.note-tab.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}
```

Add a small dot indicator element (`.tab-dot`, 5×5px circle) inside each tab before the title. Use the existing close button `<i class="fas fa-times">` already in each tab.

---

## 5. Editor — Open Page, Typography-First

**Current:** Plain `<input>` title with no strong typographic presence; editor blends into background.

**New:** Large Fraunces title dominates; a meta line (tags + date) separates it from body; generous padding creates a reading/writing surface.

**Changes to editor layout:**

**`.note-title-input` (the title input):**
```css
font-family: var(--font-family-display);
font-size: 32px;
font-weight: 700;
letter-spacing: -0.03em;
line-height: 1.15;
border: none;
background: transparent;
padding: 0;
```

**`.editor-wrapper` / `.editor-content` area:**
```css
padding: 36px 64px;
```
(increase from current 16-20px to give the editor breathing room)

**`.editor-header-meta`** (containing tags and date):
```css
display: flex;
align-items: center;
gap: 10px;
padding-bottom: 18px;
margin-bottom: 18px;
border-bottom: 1px solid var(--border-color);
font-style: italic;
font-size: 11px;
color: var(--text-tertiary);
```

**`.note-editor` textarea:**
```css
font-family: var(--font-family-base);
font-size: 15px;
line-height: 1.9;
```

---

## 6. Dark Mode — Deeper Atmosphere

**Current:** Slate blue palette (`#0f172a`, `#1e293b`, `#334155`) — Tailwind dark mode defaults.

**New:** Near-black with ink undertones. Replaces the `[data-theme="dark"]` block in `themes.css`.

| Token | Old | New |
|---|---|---|
| `--bg-primary` | `#0f172a` | `#0d1117` |
| `--bg-secondary` | `#1e293b` | `#0a0e16` |
| `--bg-tertiary` | `#334155` | `#141c28` |
| `--border-color` | `#334155` | `#1a2332` |
| `--border-color-light` | `#475569` | `#1e2d40` |
| `--header-bg` | `rgba(15,23,42,0.92)` | `rgba(9,12,18,0.96)` |
| `--sidebar-bg` | `rgba(30,41,59,0.85)` | `rgba(10,14,22,0.95)` |
| `--editor-bg` | `#0f172a` | `#0d1117` |
| `--input-bg` | `rgba(30,41,59,0.9)` | `rgba(20,28,40,0.9)` |

All other dark tokens (`--text-*`, `--accent-*`, `--success-*`, shadow values) remain unchanged.

---

## 7. Performance Fix — Scope the `*` Transition

**Current:** `themes.css` applies `transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s` to every element via `*` selector. This forces the browser to animate potentially thousands of elements on theme toggle.

**Fix:** Remove the `* { transition: ... }` rule. Instead, apply targeted transitions only to the specific elements that are visible during theme switching:

```css
.app-header, .sidebar, .editor-area, .ai-panel,
.note-item, .folder-item, .note-tabs-bar, .note-tab,
.modal, .context-menu, .header-toolbar-btn {
  transition: background-color 0.25s ease, color 0.25s ease,
              border-color 0.25s ease;
}
```

---

## 8. Files Modified

| File | Type of change |
|---|---|
| `desktop/src/index.html` | Replace Google Fonts URL (Inter → Fraunces + Source Serif 4) |
| `desktop/src/css/themes.css` | Font tokens, dark mode palette, remove `*` transition, reduce gradient-text |
| `desktop/src/css/sidebar.css` | Note card → dense list, `.sidebar-header h2` gradient text removal |
| `desktop/src/css/header.css` | No structural changes (tokens cascade) |
| `desktop/src/css/layout.css` | Tab bar → pill chips |
| `desktop/src/css/editor.css` | Title font/size, padding, meta line styling |
| `desktop/src/css/ai-panel.css` | `.ai-panel-header h3` gradient text removal |

---

## Out of Scope

- Any JavaScript changes
- Splash screen redesign
- Modal/dialog styling
- Empty state placeholder
- Mobile/responsive breakpoints
- AI panel chat bubble layout
- Settings screens
