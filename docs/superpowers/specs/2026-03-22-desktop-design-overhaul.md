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

**Implementation strategy:** Token swap + targeted edits — add new CSS custom properties in `themes.css` so changes cascade automatically, then make structural edits only to files that need layout changes.

---

## 1. Typography

**Decision:** Fraunces (display) + Source Serif 4 (body)

**`index.html`:** Replace the existing Inter `<link>` tag with:
```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Source+Serif+4:ital,opsz,wght@0,8..60,200..900;1,8..60,200..900&display=swap" rel="stylesheet">
```

**`themes.css`:** Add two new tokens (these do not yet exist — add them to the `:root` block):
```css
--font-family-base: 'Source Serif 4', Georgia, serif;
--font-family-display: 'Fraunces', Georgia, serif;
```
These same token names must be added in the `[data-theme="dark"]` block as well (same values — fonts don't change per theme).

**`base.css`:** The `body` rule has a hardcoded `font-family: 'Inter', 'SF Pro Display', -apple-system, ...` that will override the token if left unchanged. Update it to:
```css
body {
  font-family: var(--font-family-base);
  /* all other properties unchanged */
}
```

**Display font usage** (applies across multiple files — use `font-family: var(--font-family-display)` on):
- `.app-title` (header.css)
- `.sidebar-header h2` (sidebar.css)
- `.note-item-title` (sidebar.css) — 12px, weight 600
- `.note-title-input` (the editor title input — see Section 5)
- `.note-tab` (layout.css — tab chips)

**Monospace:** No changes. Monaco/Menlo already used for code blocks.

---

## 2. Gradient Text Overuse — Reduction

Currently `-webkit-background-clip: text` with `--gradient-primary` is applied to three selectors:
- `.app-title` in `header.css` — **keep** as the single brand moment
- `.sidebar-header h2` in `sidebar.css` — **remove**
- `.ai-panel-header h3` in `ai-panel.css` — **remove**

For the two removed cases, replace the gradient clip block with:
```css
/* remove: background, -webkit-background-clip, -webkit-text-fill-color, background-clip */
color: var(--accent-color);
```

Note: this is a direct edit to `sidebar.css` and `ai-panel.css`, not a token-only change.

---

## 3. Note Cards → Dense List

**Current:** Rounded 16px cards with hover-lift, drop shadow, card background.

**New:** Dense list rows with left-border accent.

**`sidebar.css` — `.note-item`:** Replace existing rules with:
```css
.note-item {
  padding: 7px 8px;
  border-radius: 6px;
  border-left: 2px solid transparent;
  background: transparent;
  box-shadow: none;
  gap: 3px;
  /* remove: min-height, card-bg background, border: 1px solid transparent */
}

.note-item:hover {
  background: rgba(189, 171, 227, 0.07);
  border-left-color: rgba(189, 171, 227, 0.35);
  transform: none;
  box-shadow: none;
}

.note-item.active {
  background: rgba(189, 171, 227, 0.12);
  border-left-color: var(--accent-color);
  border: none;            /* remove the full 1px border; left border is via border-left only */
  border-left: 2px solid var(--accent-color);
  box-shadow: none;
}
```

**`.notes-list`:** Change `gap: 12px` → `gap: 1px`.

**`.note-item-title`:** Apply `font-family: var(--font-family-display)`, `font-size: 12px`, `font-weight: 600`. (12px is authoritative; ignore any earlier reference to 13px.)

**`.note-item-preview`:** Source Serif 4 (body font), `font-size: 10px`. Change `-webkit-line-clamp` from 2 to 1.

**`.note-item-date`:** Add `font-style: italic`.

**Pinned notes:** Remove `border-top: 2px solid var(--accent-color)` from `.note-item.pinned`. Pin state is communicated solely by the pin button state.

**Applies to both light and dark themes** — these are structural changes, not palette changes, so no separate dark-mode handling is needed.

---

## 4. Tab Bar → Pill Chips

**Current:** Standard browser-tab row. `.note-tabs-container` has `align-items: flex-end` and `margin-bottom: -1px` (browser-tab bottom-border trick). `.note-tab` has `cursor: grab` and drag-to-reorder states.

**New:** Horizontal row of pill-shaped chips. Drag-to-reorder is retained (cursor and drag states are unchanged). The unsaved-dot indicator (`.note-tab::before` amber dot) is retained and coexists with the dot indicator — see below.

**`layout.css` — `.note-tabs-bar`:**
```css
.note-tabs-bar {
  height: 38px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 14px;
  gap: 6px;
  align-items: center;   /* ensure vertical centering */
}
```

**`layout.css` — `.note-tabs-container`:**
```css
.note-tabs-container {
  align-items: center;    /* was: flex-end */
  margin-bottom: 0;       /* was: -1px */
}
```

**`layout.css` — `.note-tab`:**
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
  /* retain: cursor: grab, transition, white-space: nowrap */
  /* remove: border-radius values that make it rectangular, bottom-border alignment styles */
}

.note-tab.active {
  background: var(--accent-color);
  color: #1a1225;          /* dark text — NOT white. #bdabe3 is light lavender; white fails contrast */
  border-color: var(--accent-color);
}
```

**Dot indicator:** Implement via `::before` pseudo-element — no HTML or JS changes needed:
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
.note-tab.active::before { opacity: 1; }
```

**Unsaved dot coexistence:** The existing `.note-tab.unsaved::before` pseudo-element (amber dot, `position: absolute`) will need `left` positioning adjusted now that padding has changed from the old rectangular style to `padding-left: 12px`. Verify visually after implementation and adjust `left` offset if needed. No removal — the unsaved indicator is kept.

**Close button:** Use the existing `<i class="fas fa-times">` already present in each tab. No HTML changes needed for the close button.

---

## 5. Editor — Open Page, Typography-First

**`editor.css` — `.note-title-input`** (the `<input id="note-title">` element):

The existing rule already has `border: none !important`, `background: transparent !important`, `padding: 0`, and `outline: none !important` — those properties are already correct and need no change. The only additions are:

```css
.note-title-input {
  /* ADD these — not present in existing rule: */
  font-family: var(--font-family-display);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
  /* all existing properties (border, background, padding, outline, etc.) remain unchanged */
}
```

Note: CSS custom properties (tokens) defined in `themes.css` resolve at paint time regardless of stylesheet load order, so the fact that `themes.css` loads after `editor.css` does not affect token resolution.

**`.editor-wrapper`** (the container wrapping `#note-editor` and `#markdown-preview`):
```css
padding: 36px 64px;
/* was: 16-20px */
```

**`.editor-header-meta`** (the div containing `#note-tags-display` and `#note-date`):
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
}
```

**Important — two existing hide rules to preserve:**

1. `.note-tags-display:empty { display: none }` — child element rule, hides the tag container when empty. Unaffected by adding `display: flex` to the parent. Do not remove.

2. `.editor-header-meta:not(:has(.note-tag)):not(:has(.note-date:not(:empty))) { display: none }` — parent-level rule that hides the entire meta row (including its `border-bottom`) when there are no tags and no date. This is the correct behavior: the separator line should only appear when there is metadata to separate. Do not remove or override this rule. The new `border-bottom` will naturally be hidden along with the row when this condition triggers.

**`.note-editor` textarea:**
```css
.note-editor {
  font-family: var(--font-family-base);
  font-size: 15px;
  line-height: 1.9;
  /* all other properties unchanged */
}
```

---

## 6. Dark Mode — Deeper Atmosphere

Update the `[data-theme="dark"]` block in `themes.css`. Only these tokens change — all others remain unchanged:

| Token | Old value | New value |
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

Tokens unchanged: all `--text-*`, `--accent-*`, `--success-*`, `--warning-*`, `--error-*`, `--shadow-*`, `--scrollbar-*`, `--code-*`, `--link-*`.

---

## 7. Performance Fix — Scope the `*` Transition

**Remove** this rule from `themes.css`:
```css
* {
  transition: background-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Replace** with a targeted rule covering only the visible surfaces that animate during theme toggle:
```css
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

---

## 8. Files Modified

| File | Changes |
|---|---|
| `desktop/src/index.html` | Replace Google Fonts `<link>` (Inter → Fraunces + Source Serif 4) |
| `desktop/src/css/themes.css` | Add `--font-family-base/display` tokens; update dark mode palette; remove `*` transition; replace targeted transition rule |
| `desktop/src/css/base.css` | Update `body { font-family }` to use `var(--font-family-base)` |
| `desktop/src/css/sidebar.css` | Note card → dense list; `.sidebar-header h2` gradient text → plain accent color; `.note-item-title` display font |
| `desktop/src/css/layout.css` | Tab bar → pill chips; `.note-tabs-container` alignment fix |
| `desktop/src/css/editor.css` | `.note-title-input` display font + size; `.editor-wrapper` padding; `.editor-header-meta` styling; `.note-editor` font + line-height |
| `desktop/src/css/ai-panel.css` | `.ai-panel-header h3` gradient text → plain accent color |
| `desktop/src/css/header.css` | `.app-title` display font (token cascades; verify no hardcoded font-family override) |

---

## Out of Scope

- JavaScript changes
- Splash screen redesign
- Modal/dialog styling
- Empty state placeholder redesign
- Mobile/responsive breakpoints
- AI panel chat bubble layout
- Settings screens
- Advanced search panel
