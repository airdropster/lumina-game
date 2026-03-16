# CSS Modernization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the retro arcade CSS theme with a modern shadcn-inspired glass design — slate palette, Inter font, heavy glass cards, flat UI chrome.

**Architecture:** Full rewrite of `public/style.css` (2142 lines → ~1800 lines), Google Fonts link in `index.html`, and 3 inline style fixes in `ui.js`. The CSS is rewritten section by section, preserving the existing section numbering and class names so no JS logic changes are needed beyond the 3 documented fixes. All animations are preserved or softened per the spec's disposition table.

**Tech Stack:** Vanilla CSS, Google Fonts (Inter), no build tools

**Spec:** `docs/superpowers/specs/2026-03-16-css-modernization-design.md`

---

## Chunk 1: File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/index.html` | Modify | Add Google Fonts `<link>` tags |
| `public/style.css` | Full rewrite | All design tokens, base styles, card styles, button styles, panel styles, screen styles, animations, responsive |
| `public/ui.js` | Modify (3 lines) | Fix `--font-mono` → `--font-sans`, update rgba opacity values |

**Important:** Class names in the CSS must remain identical to existing ones since `ui.js` and `app.js` reference them. The rewrite changes ONLY visual properties (colors, fonts, shadows, borders), not class names or selectors.

---

## Chunk 2: Task 1 — Google Fonts + Design Tokens + Base

### Task 1: Add Inter font, rewrite design tokens and base styles

**Files:**
- Modify: `public/index.html:4` (add font links before `</head>`)
- Modify: `public/style.css:1-200` (sections 1-3: tokens, reset, screen system)

- [ ] **Step 1: Add Google Fonts link to index.html**

In `public/index.html`, add these lines after line 5 (`<title>LUMINA</title>`), before the `<link rel="stylesheet">`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Rewrite CSS Section 1 — Design Tokens**

Replace the entire `:root` block (lines 9-105) with:

```css
:root {
  /* Backgrounds — Slate scale */
  --bg-deep: #020617;
  --bg-surface: #0f172a;
  --bg-surface-raised: #1e293b;
  --bg-overlay: rgba(15, 23, 42, 0.92);

  /* Card Colors — Blue */
  --card-blue-border: #60a5fa;

  /* Card Colors — Violet */
  --card-violet-border: #a78bfa;

  /* Card Colors — Orange */
  --card-orange-border: #fb923c;

  /* Card Colors — Green */
  --card-green-border: #4ade80;

  /* Card Colors — Neutral (15) */
  --card-neutral-border: #e2e8f0;

  /* Face-down card */
  --card-facedown-border: #334155;

  /* Prism */
  --prism-cyan: #22d3ee;
  --prism-glow: 0 0 8px rgba(34, 211, 238, 0.4);

  /* Immune */
  --immune-amber: #f59e0b;
  --immune-glow: 0 0 8px rgba(245, 158, 11, 0.4);

  /* Action Buttons */
  --btn-construct: #60a5fa;
  --btn-attack: #ef4444;
  --btn-secure: #4ade80;

  /* Text */
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  /* Borders */
  --border-subtle: #1e293b;
  --border-default: #334155;

  /* Typography */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;

  /* Spacing */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;
  --sp-12: 48px;
  --sp-16: 64px;

  /* Card Dimensions */
  --card-w: 60px;
  --card-h: 84px;
  --card-radius: 10px;
  --card-bot-w: 45px;
  --card-bot-h: 63px;

  /* Transitions */
  --t-fast: 150ms ease;
  --t-normal: 300ms ease;
  --t-slow: 500ms ease;

  /* Z-index layers */
  --z-base: 1;
  --z-cards: 10;
  --z-overlay: 100;
  --z-modal: 200;
  --z-flash: 300;
}
```

Key changes: `--bg-deep` is now `#020617` (slate-900), removed `--bg-space`, removed all `--card-*-bg` / `--card-*-glow` globals (glass treatment uses scoped variables per card class), removed `--font-mono`, removed `--text-accent`, `--card-radius` is now `10px`. All `--card-*-border` aliases kept for `ui.js` compatibility.

- [ ] **Step 3: Rewrite CSS Section 2 — Reset & Base**

Replace the entire reset block (lines 107-182) with:

```css
/* -- 2. RESET & BASE -- */
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--bg-deep);
  min-height: 100vh;
  line-height: 1.5;
  overflow-x: hidden;
}

a {
  color: var(--prism-cyan);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

button {
  font-family: var(--font-sans);
  cursor: pointer;
  border: none;
  background: none;
  color: inherit;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg-surface); }
::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
```

Key changes: removed `body::after` scanline overlay, removed purple gradient background, `font-family` uses `--font-sans`.

- [ ] **Step 4: Keep Section 3 unchanged**

The screen container system (`.screen`, `.screen.active`) stays exactly as-is.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: ALL 120 PASS (CSS changes don't affect tests)

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat(css): rewrite design tokens and base — slate palette, Inter font, remove scanlines"
```

---

## Chunk 3: Task 2 — Setup Screen + Game Screen Chrome

### Task 2: Rewrite setup screen and game screen panel styles

**Files:**
- Modify: `public/style.css` (sections 4-5: setup screen, game screen)

- [ ] **Step 1: Rewrite Section 4 — Setup Screen**

Replace the setup screen section (currently lines ~198-330) with flat shadcn styling:

```css
/* -- 4. SETUP SCREEN -- */
#setup-screen {
  align-items: center;
  justify-content: center;
  padding: var(--sp-8);
}

.setup-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: var(--sp-10) var(--sp-8);
  max-width: 480px;
  width: 100%;
  text-align: center;
}

.setup-card h1 {
  font-size: 2rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-primary);
  font-weight: 700;
  margin-bottom: var(--sp-8);
}

.setup-card h2 {
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: var(--sp-6);
  font-weight: 600;
}

.setup-field {
  margin-bottom: var(--sp-6);
  text-align: left;
}

.setup-field label {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: var(--sp-2);
  font-weight: 500;
}

.setup-field select,
.setup-field input {
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 0.875rem;
  transition: border-color var(--t-fast);
}

.setup-field select:focus,
.setup-field input:focus {
  outline: none;
  border-color: var(--card-blue-border);
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15);
}

.bot-config {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-bottom: var(--sp-6);
}

.bot-config-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  background: var(--bg-surface-raised);
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}

.bot-config-row .bot-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  min-width: 60px;
  font-weight: 500;
}

.bot-config-row select {
  flex: 1;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 0.8rem;
}

.btn-start {
  width: 100%;
  padding: var(--sp-4) var(--sp-6);
  background: #f8fafc;
  color: #0f172a;
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border-radius: 6px;
  transition: background var(--t-fast);
  margin-top: var(--sp-4);
}

.btn-start:hover {
  background: #e2e8f0;
}
```

Key changes: removed `text-shadow` from h1, removed `box-shadow` glow from setup card, start button is now flat white `btn-primary` style (no gradient, no glow, no transform on hover), all `font-family: var(--font-mono)` → `var(--font-sans)`.

- [ ] **Step 2: Rewrite Section 5 — Game Screen Chrome**

Replace the game screen section (currently ~lines 331-720) keeping all class names but updating visual styles. The game screen has sub-sections: header bar, bot zone, central zone, player zone, action bar, action log. All become flat panel style:

Key principles for this section:
- All `font-family: var(--font-mono)` → remove (inherits from body)
- All `text-shadow` → remove
- All neon `box-shadow` glows on non-card elements → remove
- Bot zone tabs: flat `--bg-surface-raised` + `1px solid --border-default`
- Action bar: flat bar, `border-top: 1px solid var(--border-subtle)`
- Action buttons: ghost style per spec (colored border + text, no ::before overlay, no scale on :active)
- Selected action button: 2px border, 25% color fill, white text
- Turn banner: flat pill, no neon glow
- Action log: flat panel with max-height scroll
- Keep `.bot-tab--active` pulse-border animation
- Keep `.first-player-badge` as-is

For action buttons specifically, the new CSS is:

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
  transition: all var(--t-fast);
}

.action-btn.btn-construct {
  border-color: rgba(96, 165, 250, 0.4);
  color: #60a5fa;
}
.action-btn.btn-construct:hover { background: rgba(96, 165, 250, 0.1); }

.action-btn.btn-attack {
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}
.action-btn.btn-attack:hover { background: rgba(239, 68, 68, 0.1); }

.action-btn.btn-secure {
  border-color: rgba(74, 222, 128, 0.4);
  color: #4ade80;
}
.action-btn.btn-secure:hover { background: rgba(74, 222, 128, 0.1); }

/* Selected state */
.action-btn.selected { border-width: 2px; color: #fff; }
.action-btn.btn-construct.selected {
  background: rgba(96, 165, 250, 0.25);
  border-color: #60a5fa;
}
.action-btn.btn-attack.selected {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
}
.action-btn.btn-secure.selected {
  background: rgba(74, 222, 128, 0.25);
  border-color: #4ade80;
}

/* Disabled */
.action-btn.disabled,
.action-btn:disabled {
  opacity: 0.5;
  pointer-events: none;
}
```

Remove: `.action-btn::before`, `.action-btn:hover::before`, `.action-btn:active { transform: scale(0.95) }`, all per-color hover `box-shadow` multi-layer glows.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL 120 PASS

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "feat(css): rewrite setup screen + game screen chrome — flat shadcn panels, no neon"
```

---

## Chunk 4: Task 3 — Card Design (Glass Treatment)

### Task 3: Rewrite card styles with heavy glass/frosted treatment

**Files:**
- Modify: `public/style.css` (section 6: card design, ~lines 720-1023)

- [ ] **Step 1: Rewrite card base and color variants**

Replace the entire section 6 with glass treatment. Base card:

```css
/* -- 6. CARD DESIGN -- */
.card {
  width: var(--card-w);
  height: var(--card-h);
  border-radius: var(--card-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.25rem;
  position: relative;
  cursor: pointer;
  transition: transform var(--t-fast), box-shadow var(--t-fast);
  transform-style: preserve-3d;
  user-select: none;
  border: 1px solid var(--card-border, var(--border-default));
  background: var(--card-bg, var(--bg-surface-raised));
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 4px 20px var(--card-glow, transparent), 0 8px 16px rgba(0, 0, 0, 0.3);
}

.player-grid .card:not(.face-down):hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px var(--card-glow, transparent), 0 12px 20px rgba(0, 0, 0, 0.35);
}

/* Card in bot grids — smaller, reduced blur */
.bot-grid .card {
  width: var(--card-bot-w);
  height: var(--card-bot-h);
  font-size: 0.9rem;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* -- Glass Color Variants -- */
.card.card-blue {
  --card-bg: rgba(96, 165, 250, 0.22);
  --card-border: rgba(96, 165, 250, 0.5);
  --card-glow: rgba(96, 165, 250, 0.2);
  --card-bg-solid: rgba(96, 165, 250, 0.35);
  color: #f8fafc;
}

.card.card-violet {
  --card-bg: rgba(167, 139, 250, 0.22);
  --card-border: rgba(167, 139, 250, 0.5);
  --card-glow: rgba(167, 139, 250, 0.2);
  --card-bg-solid: rgba(167, 139, 250, 0.35);
  color: #f8fafc;
}

.card.card-orange {
  --card-bg: rgba(251, 146, 60, 0.22);
  --card-border: rgba(251, 146, 60, 0.5);
  --card-glow: rgba(251, 146, 60, 0.2);
  --card-bg-solid: rgba(251, 146, 60, 0.35);
  color: #f8fafc;
}

.card.card-green {
  --card-bg: rgba(74, 222, 128, 0.22);
  --card-border: rgba(74, 222, 128, 0.5);
  --card-glow: rgba(74, 222, 128, 0.2);
  --card-bg-solid: rgba(74, 222, 128, 0.35);
  color: #f8fafc;
}

.card.card-multi {
  --card-bg: linear-gradient(135deg, rgba(96,165,250,0.15), rgba(167,139,250,0.15), rgba(251,146,60,0.15), rgba(74,222,128,0.15));
  --card-border: rgba(148, 163, 184, 0.4);
  --card-glow: rgba(148, 163, 184, 0.15);
  background: var(--card-bg);
  border-color: var(--card-border);
  color: #f8fafc;
}

.card.card-neutral {
  --card-bg: rgba(226, 232, 240, 0.15);
  --card-border: rgba(226, 232, 240, 0.4);
  --card-glow: rgba(226, 232, 240, 0.15);
  --card-bg-solid: rgba(226, 232, 240, 0.3);
  color: #f8fafc;
}

/* Face-down card */
.card.face-down {
  --card-bg: rgba(51, 65, 85, 0.3);
  --card-border: rgba(51, 65, 85, 0.5);
  --card-glow: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.card.face-down:hover {
  --card-border: var(--text-muted);
}

/* backdrop-filter fallback */
@supports not (backdrop-filter: blur(1px)) {
  .card { background: var(--card-bg-solid, rgba(30, 41, 59, 0.85)); }
}
```

Key changes: removed all per-color hover `box-shadow` overrides (card base handles it), removed multicolor `::before` rotating rainbow border (replaced with static gradient), removed face-down crosshatch pattern, glass scoped variables per class.

- [ ] **Step 2: Rewrite prism, immune, selected, attack-target, card slots**

```css
/* Prism — softened glow */
.card.prismed {
  position: relative;
  overflow: visible;
  border: 2px solid var(--prism-cyan);
  box-shadow: var(--prism-glow);
  animation: prism-glow 2.5s ease-in-out infinite;
}

.card.prismed::after {
  content: '\25C6';
  position: absolute;
  top: 2px;
  right: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--prism-cyan);
  animation: prism-pulse 2s ease-in-out infinite;
}

.bot-grid .card.prismed::after {
  font-size: 0.45rem;
  top: 1px;
  right: 2px;
}

@keyframes prism-glow {
  0%, 100% { box-shadow: 0 0 6px rgba(34, 211, 238, 0.3); }
  50%      { box-shadow: 0 0 12px rgba(34, 211, 238, 0.5); }
}

@keyframes prism-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}

/* Immune — softened amber */
.card.immune {
  animation: immune-glow 1.5s ease-in-out infinite;
}

@keyframes immune-glow {
  0%, 100% { border-color: var(--immune-amber); box-shadow: 0 0 6px rgba(245, 158, 11, 0.3); }
  50%      { border-color: #fbbf24; box-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }
}

/* Selected card */
.card.selected {
  outline: 2px solid var(--prism-cyan);
  outline-offset: 2px;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
}

/* Attack target — subtle border pulse instead of neon glow */
.card.attack-target {
  border-color: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.3);
  cursor: pointer;
  animation: pulse-attack 1.2s ease-in-out infinite;
}

@keyframes pulse-attack {
  0%, 100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.3); }
  50%      { box-shadow: 0 0 14px rgba(239, 68, 68, 0.5); }
}

/* Empty grid slot */
.card-slot {
  width: var(--card-w);
  height: var(--card-h);
  border-radius: var(--card-radius);
  border: 1px dashed var(--border-default);
  background: rgba(15, 23, 42, 0.3);
}

.bot-grid .card-slot {
  width: var(--card-bot-w);
  height: var(--card-bot-h);
}
```

Also keep the action-guide, card-color-label styles but update `font-family: var(--font-mono)` to remove (inherits from body):

```css
/* Action Guide */
.action-guide {
  width: 100%;
  text-align: center;
  padding: 8px 16px;
  font-size: 0.78rem;
  color: var(--text-secondary);
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  margin-top: 6px;
  line-height: 1.5;
}
.action-guide strong { color: var(--text-primary); }
.action-guide .step {
  display: inline-block;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  padding: 1px 6px;
  margin: 0 2px;
  font-size: 0.72rem;
}
.action-guide--construct { border-color: var(--btn-construct); }
.action-guide--attack { border-color: var(--btn-attack); }
.action-guide--secure { border-color: var(--btn-secure); }

/* Card color label */
.card-color-label {
  position: absolute;
  top: 2px;
  left: 2px;
  font-size: 0.45rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
  color: inherit;
}
.bot-grid .card-color-label { font-size: 0.35rem; }
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: ALL 120 PASS

- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "feat(css): heavy glass card treatment — frosted backdrop-filter, scoped color variables"
```

---

## Chunk 5: Task 4 — Animations + LUMINA Flash + Round/Game End Screens

### Task 4: Rewrite animations and end-game screens

**Files:**
- Modify: `public/style.css` (sections 7-9: animations, round-end, game-end)

- [ ] **Step 1: Rewrite Section 7 — Animations**

Keep all KEEP animations unchanged. Rewrite the LUMINA flash:

```css
/* -- 7. ANIMATIONS -- */

/* Card Flip */
.card-flip { animation: cardFlip 0.5s ease forwards; }

@keyframes cardFlip {
  0%   { transform: rotateY(0deg); }
  50%  { transform: rotateY(90deg); }
  100% { transform: rotateY(0deg); }
}

/* Card Swap */
.card-swap { animation: cardSwap 0.4s ease; }

@keyframes cardSwap {
  0%   { transform: translateX(0); opacity: 1; }
  40%  { transform: translateX(30px); opacity: 0; }
  60%  { transform: translateX(-30px); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}

/* Prism Drop */
.prism-drop { animation: prismDrop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

@keyframes prismDrop {
  0%   { transform: scale(0) translateY(-20px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}

/* LUMINA Flash — clean frosted overlay */
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
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}

/* Score Count-up */
.score-countup { animation: scoreCountup 0.6s ease-out; }

@keyframes scoreCountup {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* Fade In / Out */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }

/* Card Deal */
.card-deal { animation: cardDeal 0.3s ease-out forwards; opacity: 0; }

@keyframes cardDeal {
  0%   { transform: translateY(-30px) scale(0.8); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}

/* Shake */
.shake { animation: shake 0.4s ease; }

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-6px); }
  75%      { transform: translateX(6px); }
}
```

REMOVED animations: `rainbow-rotate`, `rainbow-rotate-fallback`, `winnerGlow`, `pulse-glow`. The `pulse-attack` replaces `pulse-glow` (defined in Task 3). `pulse-border` and `pulse-border-amber` are kept later in the utilities section.

- [ ] **Step 2: Rewrite Section 8 — Round End Screen**

Keep the existing round-end styles from Spec 1 but update to match new design:
- Remove any `text-shadow` or neon effects
- Ensure `font-family` inherits (no explicit `--font-mono`)
- Keep `.round-end-grids`, `.round-end-panel`, bonus highlights as they are (already use clean styling from Spec 1)
- Update any `.round-end-card` background to flat `--bg-surface` without glow shadow

- [ ] **Step 3: Rewrite Section 9 — Game End Screen**

Key changes:
- Winner text: large bold Inter, NO `text-shadow`, NO `winnerGlow` animation
- Score table: flat rows with `border-bottom: 1px solid var(--border-subtle)`
- Buttons: `.btn-play-again` → `btn-primary` style, `.btn-view-history` → `btn-ghost` style
- Remove all neon glows

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: ALL 120 PASS

- [ ] **Step 5: Commit**

```bash
git add public/style.css
git commit -m "feat(css): rewrite animations, LUMINA flash, round-end + game-end screens"
```

---

## Chunk 6: Task 5 — History, Dialog, Utilities, Responsive + JS Fixes

### Task 5: Rewrite remaining sections + fix ui.js inline styles

**Files:**
- Modify: `public/style.css` (sections 10-16: history, dialog, utilities, responsive, stats, cheatsheet)
- Modify: `public/ui.js:162, 166, 176`

- [ ] **Step 1: Rewrite Section 10 — History Screen**

Flat table rows, clean Inter typography. Remove any monospace references or neon effects.

- [ ] **Step 2: Rewrite Section 11 — Confirmation Dialog**

Keep layout, update to flat panel style: `--bg-surface` background, `1px solid --border-default`, no glow shadow.

- [ ] **Step 3: Rewrite Section 12 — Utility Classes**

Keep card badges (inline in action log), turn banner (flat pill, no neon), scoreboard (flat panel). Update `pulse-border` and `pulse-border-amber` keyframes — keep as-is (already clean). Remove any `text-shadow`.

- [ ] **Step 4: Rewrite Section 13 — Responsive Design**

Keep existing breakpoint values (`1024px`, `640px`, `380px`). Update styles within each:
- All `font-family: var(--font-mono)` → remove
- All `text-shadow` → remove
- Bot-zone cards: ensure `backdrop-filter: blur(8px)` (already set in base)
- At 380px: consider `backdrop-filter: blur(4px)` for performance
- Keep card dimension overrides unchanged
- Update `.lumina-flash::before` responsive overrides to match new clean style (just smaller `font-size` at mobile)
- Preserve existing layout adjustments (grid gap, padding, etc.)

Add `prefers-reduced-motion` block:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Rewrite Sections 15-16 — Stats + Cheatsheet**

Update to flat panel styling, remove monospace/neon. These are smaller sections.

- [ ] **Step 6: Fix ui.js inline styles**

In `public/ui.js`, make these 3 changes:

Line 162: Change `'rgba(96, 165, 250, 0.3)'` → `'rgba(96, 165, 250, 0.25)'`
Line 166: Change `'var(--font-mono)'` → `'var(--font-sans)'`
Line 176: Change `'rgba(96, 165, 250, 0.3)'` → `'rgba(96, 165, 250, 0.25)'`

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: ALL 120 PASS

- [ ] **Step 8: Commit**

```bash
git add public/style.css public/ui.js
git commit -m "feat(css): rewrite history, dialog, utilities, responsive + fix ui.js inline styles"
```

---

## Chunk 7: Task 6 — Final Verification + Deploy

### Task 6: Run full test suite, push, deploy

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL 120 PASS

- [ ] **Step 2: Visual smoke test**

Run: `npm start`
Manually verify in browser at `http://localhost:3000`:
- Setup screen: flat panel, Inter font, white start button
- Game board: glass cards with colored glow, flat action buttons
- Bot zone: flat tabs, glass cards
- Action buttons: ghost style, selected state works
- LUMINA flash: clean white text on frosted overlay
- Round-end: grid panels with glass cards
- Game-end: flat summary, clean text

- [ ] **Step 3: Push to remote**

```bash
git push
```

- [ ] **Step 4: Deploy to Dokploy**

```bash
curl -s -X POST "http://72.61.4.99:3000/api/trpc/application.deploy" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: HJHwqUMvvEkhsTOFOrRxLyqRlAfqUverngcEvaAZEzFXMpfMMMMmbrfodQTWiPSU" \
  -d '{"json":{"applicationId":"FHySEsOkCN2DbNyG4MEKd"}}'
```

- [ ] **Step 5: Verify deployment**

Check https://aifunflix.cloud/lumina loads with new glass theme.
