# Spec 1: Bot Attack Audit, Round-End Grids, Active Player Highlight

**Date:** 2026-03-16
**Status:** Approved

## Overview

Three focused improvements: audit and fix bot attack logic, show all players' final grids side by side at round end, and highlight the active bot during play.

---

## A. Bot Attack Audit & Fix

**Problem:** Bot attacks may swap wrong cards — giving away high-value cards instead of gaining them.

**Approach:** Systematic audit, not guessing.

### Steps

1. **Audit `executeBotTurn()` in app.js** — verify that when an attack action is returned by the bot, the correct `game.attack()` method is called with the right parameters (attackerRow/Col, defenderIndex/Row/Col, revealRow/Col).

2. **Audit `game.attack()` in game.js** — verify the swap logic:
   - Attacker gives their card to defender
   - Attacker gets defender's card
   - Defender's received card is marked `immune: true`
   - Cost card (face-down) is flipped face-up

3. **Audit bot attack selection in bot.js** — verify:
   - Easy bot: `target.card.value > attackerCard.value` check is correct
   - Medium bot: delta >= 4 threshold is applied correctly
   - Hard bot: Monte Carlo only considers `target.card.value > attackerCard.value`

4. **Add attack logging** — in `executeBotTurn()`, log attack details before and after execution:
   ```
   "Bot X attacks: giving [value,color] at (r,c), taking [value,color] from Player Y at (r,c), cost reveal at (r,c)"
   ```
   This log should use the existing `logRichAction()` with accurate card values captured BEFORE the swap.

5. **Write targeted test** — create a deterministic attack scenario in `tests/bot.test.js`:
   - Set up known grid state
   - Execute attack via `game.attack()`
   - Assert attacker got the defender's card
   - Assert defender got the attacker's card (immune)
   - Assert cost card is face-up

### Files touched
- `public/app.js` — fix `executeBotTurn()` attack parameter passing if needed
- `public/game.js` — fix `attack()` swap logic if needed
- `public/bot.js` — fix attack selection if needed
- `tests/bot.test.js` — new attack outcome test
- `tests/game.test.js` — new attack swap verification test

---

## B. Round-End Screen — All Players' Final Grids

**Problem:** Round-end shows text summary only. No way to see why scores differ.

### Layout

Horizontal flex row of all player panels (player + all bots), horizontally scrollable on mobile.

### Each player panel contains

1. **Header:** Player name + difficulty badge (for bots)
2. **3x4 grid** rendered with `renderCard()` — colors, values, prism badges all visible
3. **Bonus highlights on the grid:**
   - Valid columns (3 same-color): cyan left-border on the 3 cells
   - Valid rows (4 ascending): amber bottom-border on the 4 cells
   - Prismed cards in valid structures: extra glow effect
4. **Score breakdown** below grid:
   ```
   Base: 45 | Col: +10 | Row: +10 | Prism: +10 | Total: 75
   ```
5. **LUMINA caller indicator:** Banner above the caller's grid:
   - `"CALLED LUMINA (+10)"` — green styling (if strictly highest)
   - `"CALLED LUMINA (-10)"` — red styling (if not strictly highest)

### Cumulative scores

Below all grids: updated running total per player showing progression.

### Sizing

- Player's own grid: full card size
- Bot grids: slightly smaller (matching bot-zone sizing during gameplay)

### Implementation

- New export `renderRoundEndGrids(container, game, scoreBreakdowns)` in `ui.js`
- Called from existing round-end flow in `app.js` (within or replacing current `renderRoundEnd()`)
- Reuses existing `renderCard()` for card rendering
- `scoring.js` already provides per-player breakdowns — pass these through

### CSS classes

- `.round-end-grids` — flex row, gap 16px, overflow-x auto, justify-content center
- `.round-end-panel` — flex column, border, border-radius, padding
- `.round-end-panel--caller` — green/red border depending on LUMINA bonus
- `.round-end-grid` — CSS grid 4 columns, same as player-grid but potentially smaller for bots
- `.bonus-col-highlight` — cyan left-border on valid column cells
- `.bonus-row-highlight` — amber bottom-border on valid row cells
- `.round-end-breakdown` — flex row of score items below each grid

### Files touched
- `public/ui.js` — new `renderRoundEndGrids()` function
- `public/app.js` — wire into round-end flow
- `public/style.css` — new round-end grid styles

---

## C. Active Player Highlight

**Problem:** No visual indication of which bot is currently taking its turn, or who plays first.

### Active bot highlight

- During bot turns: add `bot-tab--active` CSS class to the playing bot's tab in the bot zone
- Cyan border + subtle pulse animation (consistent with existing turn-banner--player style)
- Class applied in `renderGameBoard()` by checking `game.currentPlayerIndex` against bot indices

### First player indicator

- On the first turn of each round, add a small `1st` badge on the starting player's scoreboard entry
- Simple `<span class="first-player-badge">1st</span>` appended to the scoreboard entry

### CSS classes

- `.bot-tab--active` — border-color: var(--prism-cyan), box-shadow glow, pulse animation
- `.first-player-badge` — small pill, font-size 0.6rem, background cyan, color dark

### Files touched
- `public/ui.js` — update `renderGameBoard()` bot tab rendering
- `public/style.css` — new `.bot-tab--active` and `.first-player-badge` styles

---

## Execution Plan

Sequential within spec, can be parallelized across sections:

1. **Section A** (Bot Attack Audit) — investigate first, fix if bugs found, add tests
2. **Section B** (Round-End Grids) — ui.js + app.js + style.css
3. **Section C** (Active Player Highlight) — ui.js + style.css

After all sections: run tests, commit, push, redeploy.
