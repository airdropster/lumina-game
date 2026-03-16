# LUMINA Game Improvements — Design Spec

**Date:** 2026-03-16
**Status:** Approved

## Overview

9 improvements across 3 parallel work streams to improve game feel, bot intelligence, and feature completeness.

---

## Stream 1: UX Clarity (ui.js, app.js, style.css)

### 1A. Rich Action Log with Card Badges + Grid Highlights

**Problem:** Action log shows plain text. Players can't follow what opponents did.

**Design:**
- Replace plain text log entries with structured HTML containing inline card badges
- Card badge: small colored `<span>` with card value, background matching card color class
- Log format examples:
  - `"Bot 1 constructed [🔵8] at (2,3), replaced [🟠3]"`
  - `"Bot 2 attacked: swapped [🟢5] ↔ [🟣11] from Player, revealed (1,4)"`
  - `"Bot 3 secured [🔵10] with prism"`
- After each bot action, briefly flash the affected cell(s) on the bot's grid with a `action-highlight` CSS class (0.8s fade-out animation)
- New `ui.js` export: `logRichAction(document, { actor, actionType, details })` that builds the HTML
- New `ui.js` export: `flashGridCell(playerIndex, row, col)` that adds/removes highlight class
- `app.js` calls these in `executeBotTurn()` after each bot action

**CSS:**
- `.card-badge` — inline-block, 24x18px, rounded, colored background, white text, font-size 0.7rem
- `.card-badge-blue` / `-violet` / `-orange` / `-green` / `-multi` / `-neutral` — background colors matching existing card palette
- `.action-highlight` — box-shadow glow + scale(1.05), animates out over 0.8s

### 1B. Active Player Turn Indicator

**Problem:** No clear indication of whose turn it is. Status buried in action log.

**Design:**
- New `<div class="turn-banner">` rendered between header-bar and bot-zone
- When player's turn: `"YOUR TURN — Choose an action"` with pulsing cyan border
- When bot's turn: `"Bot N is thinking..."` with animated dots and bot's difficulty badge
- During reveal phase: `"REVEAL PHASE — Click N cards to flip"`
- During final turns: `"FINAL TURNS — LUMINA called by [name]!"` with amber warning style
- During scoring: hidden
- `renderGameBoard()` in `ui.js` creates this element based on `game.phase` and `game.currentPlayerIndex`

**CSS:**
- `.turn-banner` — full-width, centered text, padding 12px, font-weight 700, z-index 10
- `.turn-banner--player` — cyan border-left, subtle pulse animation
- `.turn-banner--bot` — muted border, animated ellipsis
- `.turn-banner--final` — amber/warning colors
- `.turn-banner--reveal` — green accent

### 1C. In-Game Scorecard

**Problem:** No way to track standings during gameplay.

**Design:**
- Compact scoreboard strip below the turn banner, above bot zone
- Shows all players in a horizontal row: `[Player: 45] [Bot 1 (M): 32] [Bot 2 (H): 58]`
- Current player's score highlighted
- Updates on every `renderBoard()` call
- Uses existing `game.cumulativeScores[]`

**CSS:**
- `.scoreboard` — flex row, gap 16px, centered, font-size 0.8rem
- `.scoreboard-entry` — pill shape, border matching player/bot color
- `.scoreboard-entry--active` — brighter border for current turn player

---

## Stream 2: Bot AI Engine (bot.js)

### 2A. Bot Play Engine Rewrite

**Problem:** Bots are simplistic. Hard bot uses basic utility scoring without look-ahead.

**Design — 3 tiers:**

**Easy (unchanged):** Weighted random with stupidity floor. No changes needed.

**Medium — Heuristic with awareness:**
- Discard evaluation: take from discard if value >= 7 (lowered from 8) AND improves position
- Column awareness: actively pursue column bonuses by preferring same-color placements
- Row awareness: when 3/4 cards in a row are ascending, prioritize completing the sequence
- Opponent tracking: prefer attacking the leading player's high-value cards
- Secure timing: secure cards in completed structures, prefer value >= 7
- LUMINA awareness: when 2 face-down, slightly boost reveal actions

**Hard — Monte Carlo + Utility:**
- For each possible action, simulate N=50 random game continuations (3-turn lookahead)
- Each simulation: play random valid moves for all players, evaluate board state
- Board evaluation function: `baseScore + structureBonuses + prismBonus + luminaProximityBonus - opponentLeadPenalty`
- Pick action with highest average simulated outcome
- LUMINA timing: when 1-2 face-down cards, evaluate "rush LUMINA" vs "build score" by simulating both paths
- Opponent modeling: track which opponents are close to LUMINA, prioritize disrupting leaders
- Attack targeting: prefer targets in valid structures (breaks bonus) on leading opponents
- Optimal prism placement: simulate securing each candidate, pick highest expected protection value

**Implementation structure:**
```
bot.js exports:
  chooseBotReveal(game, playerIndex)  — updated with tier-specific reveal logic
  chooseBotAction(game, playerIndex)  — routes to easy/medium/hard

Internal:
  chooseEasyAction()     — existing, minor cleanup
  chooseMediumAction()   — rewritten with heuristics
  chooseHardAction()     — rewritten with Monte Carlo engine
  simulateGame(game, action, depth=3, iterations=50) — new
  evaluateBoard(game, playerIndex)  — new scoring function
  cloneGameState(game)   — deep clone for simulation
```

**Performance:** Monte Carlo with 50 iterations x 3-depth runs ~100-200ms. Acceptable since Hard bot delay is 1800ms.

### 2B. Bot Reveal Strategy

**Problem:** `chooseBotReveal` picks 2 random face-down cards regardless of difficulty.

**Design per tier:**
- **Easy:** Random (current behavior)
- **Medium:** Prefer corners (r0c0, r0c3, r2c0, r2c3) — they participate in both a row and column, maximizing information
- **Hard:** Reveal the 2 cards that maximize expected structure potential — evaluate each pair of positions, pick the pair where revealed cards are most likely to contribute to column/row bonuses based on probability distribution of remaining deck

---

## Stream 3: Features (ui.js, app.js, style.css)

### 3A. Show Drawn Card in Deck Dialog

**Problem:** Player must blindly choose PLACE or DISCARD without seeing the card.

**Design:**
- `game.js`: new method `peekDeck()` — returns top card value/color without removing it
- `app.js`: call `peekDeck()` before showing dialog, pass card to dialog
- `ui.js`: `showDeckDrawDialog(card, onPlace, onDiscard)` — renders a card badge between heading and buttons showing what was drawn
- Card rendered using existing `renderCard()` function at normal size

### 3B. Stats Dashboard + Link

**Problem:** Stats page is a basic table. No link from game page.

**Design:**
- New `stats.html` page (or rendered via `ui.js` as a new screen)
- Dashboard layout:
  - **Top row:** Win rate (%), total games, win streak, avg score per game — 4 stat cards
  - **Middle:** Performance chart area — bar chart showing score breakdown per recent game (base vs bonuses), implemented as simple CSS bar charts (no external lib)
  - **Bottom:** Game history table (existing, improved styling)
  - **Per-difficulty stats:** Win rate broken down by opponent difficulty
- Link: Add "STATS" button to header-bar on game screen and setup screen
- API: existing `/api/stats/history` endpoint has all needed data

### 3C. Prism Visual Upgrade

**Problem:** Prismed cards just show text, no visual distinction.

**Design:**
- Replace text indicator with CSS visual treatment on `.card.prismed`:
  - Rainbow/iridescent border using `conic-gradient`
  - Subtle shimmer animation (moving gradient)
  - Small prism icon (unicode diamond ◆) in top-right corner
  - Inner glow effect
- Remove any text-only prism indicator

### 3D. Cheatsheet/Rules Overlay

**Problem:** New players don't know the rules.

**Design:**
- "?" button in header-bar, opens modal overlay
- Sections: Actions (Construct/Attack/Secure), Scoring (base + bonuses), LUMINA mechanic, Win condition
- Each section: icon + short description + example
- Closeable with X button or Escape key
- Styled consistently with existing confirm-dialog

---

## Execution Plan

3 parallel subagent streams:
1. **Stream 1** (UX): items 1A → 1B → 1C (sequential, all touch ui.js)
2. **Stream 2** (Bot AI): items 2A + 2B (can be done together, all in bot.js)
3. **Stream 3** (Features): items 3A, 3B, 3C, 3D (sequential, various files)

After all streams: run tests → commit → push → redeploy.
