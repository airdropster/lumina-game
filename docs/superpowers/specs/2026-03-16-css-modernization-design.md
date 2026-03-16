# Spec D: CSS Modernization — Shadcn-Inspired Glass Design

**Date:** 2026-03-16
**Status:** Approved

## Overview

Full CSS reset replacing the retro arcade theme with a modern shadcn-inspired dark UI. Slate color palette, Inter font, heavy glass/frosted cards, flat UI chrome. All 5 screens restyled.

**Constraints:** Vanilla JS only (no React, no build tools). Single `style.css` file. Google Fonts loaded via `<link>` in `index.html`.

---

## A. Design Tokens (`:root`)

### Backgrounds — Slate scale

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#020617` | `body` background |
| `--bg-surface` | `#0f172a` | Panels, containers |
| `--bg-surface-raised` | `#1e293b` | Elevated panels, hover states |
| `--bg-overlay` | `rgba(15, 23, 42, 0.92)` | Modal overlays |

### Text

| Token | Value |
|-------|-------|
| `--text-primary` | `#f8fafc` |
| `--text-secondary` | `#94a3b8` |
| `--text-muted` | `#64748b` |

### Borders

| Token | Value |
|-------|-------|
| `--border-subtle` | `#1e293b` |
| `--border-default` | `#334155` |

### Card colors (unchanged hues, new application)

| Color | Hue | Glass bg | Glass border | Glow shadow |
|-------|-----|----------|-------------|-------------|
| Blue | `#60a5fa` | `rgba(96, 165, 250, 0.22)` | `rgba(96, 165, 250, 0.5)` | `rgba(96, 165, 250, 0.2)` |
| Violet | `#a78bfa` | `rgba(167, 139, 250, 0.22)` | `rgba(167, 139, 250, 0.5)` | `rgba(167, 139, 250, 0.2)` |
| Orange | `#fb923c` | `rgba(251, 146, 60, 0.22)` | `rgba(251, 146, 60, 0.5)` | `rgba(251, 146, 60, 0.2)` |
| Green | `#4ade80` | `rgba(74, 222, 128, 0.22)` | `rgba(74, 222, 128, 0.5)` | `rgba(74, 222, 128, 0.2)` |
| Multicolor | gradient | `linear-gradient(135deg, rgba(96,165,250,0.15), rgba(167,139,250,0.15), rgba(251,146,60,0.15), rgba(74,222,128,0.15))` | `rgba(148, 163, 184, 0.4)` | `rgba(148, 163, 184, 0.15)` |
| Neutral (15) | `#e2e8f0` | `rgba(226, 232, 240, 0.15)` | `rgba(226, 232, 240, 0.4)` | `rgba(226, 232, 240, 0.15)` |
| Face-down | — | `rgba(51, 65, 85, 0.3)` | `rgba(51, 65, 85, 0.5)` | none |

### Action button colors (unchanged)

| Token | Value |
|-------|-------|
| `--btn-construct` | `#60a5fa` |
| `--btn-attack` | `#ef4444` |
| `--btn-secure` | `#4ade80` |

### Prism & Immune (softened)

| Token | Value |
|-------|-------|
| `--prism-cyan` | `#22d3ee` |
| `--prism-glow` | `0 0 8px rgba(34, 211, 238, 0.4)` |
| `--immune-amber` | `#f59e0b` |
| `--immune-glow` | `0 0 8px rgba(245, 158, 11, 0.4)` |

### Typography

| Token | Value |
|-------|-------|
| `--font-sans` | `'Inter', system-ui, -apple-system, sans-serif` |

**Remove:** `--font-mono` variable. Replace all `font-family` references with `var(--font-sans)`.

**Keep as aliases** (for backward compatibility with inline JS styles in `ui.js`):

| Old Token | Points to |
|-----------|-----------|
| `--card-blue-border` | `#60a5fa` |
| `--card-violet-border` | `#a78bfa` |
| `--card-orange-border` | `#fb923c` |
| `--card-green-border` | `#4ade80` |

These are referenced in `ui.js` inline styles and must remain in `:root`.

### Spacing, card dimensions, transitions, z-index

Keep existing values unchanged — these are layout concerns, not theme.

---

## B. Reset & Base

### `index.html` change

Add Google Fonts link in `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### `body`

```css
body {
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg-deep);
  min-height: 100vh;
  line-height: 1.5;
  overflow-x: hidden;
}
```

**Remove:** `body::after` scanline overlay entirely.

### `button` base

```css
button {
  font-family: var(--font-sans);
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}
```

---

## C. Cards — Heavy Glass Treatment

### Base card

```css
.card {
  border-radius: 10px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 20px var(--card-glow), 0 8px 16px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  transition: transform 150ms ease, box-shadow 150ms ease;
}
```

Each color variant sets `--card-bg`, `--card-border`, `--card-glow` via its class (`.card-blue`, `.card-violet`, etc.) using the values from the token table above.

### Card hover (player grid only)

```css
.player-grid .card:not(.facedown):hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px var(--card-glow), 0 12px 20px rgba(0, 0, 0, 0.35);
}
```

### Face-down card

No glow shadow. Muted glass appearance. `?` centered in `--text-muted` color.

### Prism badge

Keep existing cyan diamond indicator but use `--prism-glow` (softened, no double-layer neon).

### Immune badge

Keep amber shield but use `--immune-glow` (softened).

### Card value typography

- Value: `font-size: 18px`, `font-weight: 700`, `color: #f8fafc`
- Color dot: `8px` circle in card's hue color, below value

### Color variant class example

```css
.card-blue {
  --card-bg: rgba(96, 165, 250, 0.22);
  --card-border: rgba(96, 165, 250, 0.5);
  --card-glow: rgba(96, 165, 250, 0.2);
}
```

Same pattern for `.card-violet`, `.card-orange`, `.card-green`, `.card-multi`, `.card-neutral`.

### `backdrop-filter` fallback

```css
@supports not (backdrop-filter: blur(1px)) {
  .card {
    background: var(--card-bg-solid, rgba(30, 41, 59, 0.85));
  }
}
```

Each color variant also sets a `--card-bg-solid` with higher opacity (e.g., `rgba(96, 165, 250, 0.35)`) for non-blur-capable browsers. Bot-zone cards use `blur(8px)` instead of `blur(16px)` to reduce compositing cost (72 cards on screen simultaneously).

---

## D. Buttons — Flat Shadcn Style

### Primary button

```css
.btn-primary {
  background: #f8fafc;
  color: #0f172a;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-size: 0.875rem;
  transition: background 150ms ease;
}
.btn-primary:hover {
  background: #e2e8f0;
}
```

### Ghost/secondary button

```css
.btn-ghost {
  background: transparent;
  color: #f8fafc;
  border: 1px solid #334155;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 150ms ease;
}
.btn-ghost:hover {
  background: rgba(51, 65, 85, 0.5);
}
```

### Action buttons (construct/attack/secure)

Ghost style with colored border and text:

```css
.action-btn {
  padding: 8px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  transition: all 150ms ease;
}

.action-btn.btn-construct {
  border-color: rgba(96, 165, 250, 0.4);
  color: #60a5fa;
}
.action-btn.btn-construct:hover {
  background: rgba(96, 165, 250, 0.1);
}

.action-btn.btn-attack {
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}
.action-btn.btn-attack:hover {
  background: rgba(239, 68, 68, 0.1);
}

.action-btn.btn-secure {
  border-color: rgba(74, 222, 128, 0.4);
  color: #4ade80;
}
.action-btn.btn-secure:hover {
  background: rgba(74, 222, 128, 0.1);
}
```

### Action button selected state

Fill with color at 25% opacity, white text, thicker border:

```css
.action-btn.selected {
  border-width: 2px;
  color: #fff;
}
.action-btn.btn-construct.selected {
  background: rgba(96, 165, 250, 0.25);
  border-color: #60a5fa;
}
/* Same pattern for attack and secure */
```

### Disabled state

```css
.action-btn:disabled {
  opacity: 0.5;
  pointer-events: none;
}
```

---

## E. Surfaces & Panels

### Standard panel

```css
.panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 16px;
}
```

No box-shadows on panels. Shadows are reserved for glass cards only.

### Applied to existing elements

- `.scoreboard` → panel style
- `.bot-zone`, `.bot-tab` → panel style
- `.action-log` → panel style with `max-height` scroll
- `.action-bar` → flat bar, `border-top: 1px solid var(--border-subtle)`
- `.action-guide` → panel style with colored left border

---

## F. Screen-Specific Changes

### Setup screen

- Clean centered card layout
- Heading: `font-size: 1.5rem`, `font-weight: 700`, `color: var(--text-primary)`
- Form inputs: flat with `1px solid var(--border-default)`, `bg: var(--bg-surface-raised)`, `border-radius: 6px`
- Bot config cards: flat panels, not glass
- Start button: `btn-primary` style

### Game screen

- Same spatial layout, new styles applied
- Turn banner: flat pill with text, no neon glow
- Deck/discard: glass card treatment
- Player grid: glass cards
- Bot zone: flat tabs with glass cards inside

### Round-end screen

- Grid panels: flat panel borders (already built in Spec 1)
- Cards inside grids: glass treatment
- Score breakdown: clean Inter typography
- Bonus highlights: keep cyan/amber borders (subtle, 2px)

### Game-end screen

- Flat summary panel
- Winner announcement: large Inter bold, no text-shadow
- Score table: clean rows with `border-bottom: 1px solid var(--border-subtle)`

### History screen

- Flat table rows
- Clean typography

### LUMINA flash — modernized

Replace the neon text-shadow effect with a clean, modern full-screen overlay:

```css
.lumina-flash {
  position: fixed;
  inset: 0;
  z-index: var(--z-flash);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 6, 23, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: luminaFlash 1.5s ease forwards;
}

.lumina-flash::before {
  content: 'LUMINA';
  font-family: var(--font-sans);
  font-size: 4rem;
  font-weight: 700;
  color: #f8fafc;
  letter-spacing: 0.2em;
}

@keyframes luminaFlash {
  0% { opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
}
```

No text-shadow, no neon glow. Clean white text on frosted dark overlay, fades in and out.

---

## F2. Animation Disposition

| Animation | Disposition | Notes |
|-----------|------------|-------|
| `cardFlip` | KEEP | Core gameplay — card reveal |
| `cardSwap` | KEEP | Core gameplay — attack swap |
| `cardDeal` | KEEP | Round start deal |
| `prismDrop` | KEEP | Prism placement |
| `prism-glow` | KEEP (modify) | Soften glow values to match `--prism-glow` |
| `prism-pulse` | KEEP (modify) | Soften to subtle pulse |
| `immune-glow` | KEEP (modify) | Soften glow values to match `--immune-glow` |
| `luminaFlash` | KEEP (rewrite) | See LUMINA flash section above |
| `fadeIn` | KEEP | Screen transitions |
| `fadeOut` | KEEP | Screen transitions |
| `scoreCountup` | KEEP | Score display |
| `shake` | KEEP | Error/invalid action feedback |
| `action-highlight-fade` | KEEP | Action guide highlight |
| `pulse-border` | KEEP | Active bot tab highlight |
| `pulse-border-amber` | KEEP | Immune indicator |
| `rainbow-rotate` | REMOVE | Retro multicolor effect — replace with static gradient |
| `rainbow-rotate-fallback` | REMOVE | Fallback for above |
| `winnerGlow` | REMOVE | Neon glow on winner — replace with clean bold text |
| `pulse-glow` | REMOVE | Attack target neon glow — replace with subtle border highlight |

---

## G. What Gets Removed

1. `body::after` scanline overlay
2. All `text-shadow` neon effects
3. `--font-mono` / monospace font references
4. Purple gradient background (`linear-gradient(160deg, ...)`)
5. Heavy multi-layer `box-shadow` glows on non-card elements
6. `::before` pseudo-element overlays on buttons
7. `@keyframes` pulse/glow animations (except prism/immune indicators on cards)
8. `.action-btn::before` overlay effect
9. `.action-btn:active { transform: scale(0.95) }` — replaced with background transition
10. Retro arcade comment headers (replace with clean section headers)

## H. What Gets Added

1. Google Fonts `<link>` for Inter (400, 500, 600, 700) in `index.html`
2. `--font-sans` custom property
3. Glass card custom properties per color (`--card-bg`, `--card-border`, `--card-glow`)
4. `-webkit-backdrop-filter` prefix for Safari support
5. `.btn-primary` and `.btn-ghost` utility classes

### Button class mapping

| Existing class | New class | Screen |
|---------------|-----------|--------|
| `.btn-start-game` | `btn-primary` | Setup |
| `.btn-view-history` (setup) | `btn-ghost` | Setup |
| `.btn-next-round` | `btn-primary` | Round-end |
| `.btn-play-again` | `btn-primary` | Game-end |
| `.btn-view-history` (game-end) | `btn-ghost` | Game-end |
| `.btn-back` | `btn-ghost` | History |

---

## Files Touched

| File | Change |
|------|--------|
| `public/index.html` | Add Google Fonts `<link>` tags |
| `public/style.css` | Full rewrite of design tokens, base styles, card styles, button styles, panel styles, screen styles. Remove scanlines, neon effects, monospace. |
| `public/ui.js` | Required inline style fixes (see below) |

### `ui.js` inline style changes required

| Line | Current | Change to |
|------|---------|-----------|
| 166 | `var(--font-mono)` | `var(--font-sans)` |
| 162 | `rgba(96, 165, 250, 0.3)` | `rgba(96, 165, 250, 0.25)` (match new token) |
| 176 | `rgba(96, 165, 250, 0.3)` | `rgba(96, 165, 250, 0.25)` |

All other inline `style.*` references use `--sp-*`, `--bg-surface-raised`, `--border-default`, `--text-*` tokens which remain unchanged. The `--card-blue-border` references at lines 163/177 are safe because alias tokens are preserved (see Section A).

---

## Execution Notes

- Primarily CSS changes + one `<link>` in HTML + 3 inline style fixes in `ui.js`.
- All existing tests should pass unchanged (tests don't test CSS).
- Preserve the existing `@media (prefers-reduced-motion: reduce)` block — update it to disable the modernized animations (same pattern, new animation names).
- Mobile responsive breakpoints: keep existing breakpoint values, update styles within them to match new design. Key adjustments:
  - Bot-zone cards: `backdrop-filter: blur(8px)` (already specified for performance)
  - At 639px breakpoint: card font sizes scale down, Inter handles small sizes well
  - At 379px breakpoint: consider `backdrop-filter: blur(4px)` for lowest-end devices
  - Preserve existing card dimension overrides (`--card-w`, `--card-h`) at each breakpoint
