# Party Simulator — Design Spec

**Date:** 2026-03-16
**Status:** Approved

## Overview

A standalone parameter sandbox page (`/simulator`) where users configure game rule parameters, run batch bot-vs-bot simulations, and view results through interactive Chart.js visualizations. Purpose: balance testing and game design exploration.

---

## Architecture

### New Files

- **`public/simulator.html`** — Standalone HTML page served at `/simulator`, loads Chart.js from CDN, links `simulator.css` and `simulator.js`
- **`public/simulator.js`** — Controller: collects parameter inputs, runs simulation loop via `simulation-engine.js`, renders Chart.js charts, manages progress bar
- **`public/simulation-engine.js`** — Headless game runner: imports `game.js`, `bot.js`, `scoring.js`, runs complete games without DOM interaction, returns structured stats
- **`public/simulator.css`** — Simulator-specific styles (inherits design tokens from the existing theme via shared CSS custom properties or inline)

### Modified Files

- **`server.js`** — Add static serving for `simulator.html` at `/simulator` route
- **`public/cards.js`** — `createDeck(config)` accepts optional config to override card values/counts
- **`public/game.js`** — `createGame(opts)` accepts optional `config` for win threshold and bonus values
- **`public/scoring.js`** — `calcRoundScore(grid, config)` accepts optional config for bonus values

### No Changes To

- `bot.js` — Bots use existing game methods; they work with any parameter values
- `ui.js` — Simulator has its own rendering, no shared UI code needed
- `app.js` — Main game flow untouched

---

## Configurable Parameters

| Parameter | Field | Default | Range | Affects |
|---|---|---|---|---|
| Normal card min | `cardMin` | 1 | 1–20 | `cards.js` deck generation |
| Normal card max | `cardMax` | 12 | 2–50 | `cards.js` deck generation |
| Negative card value | `negativeValue` | -2 | -20 to -1 | `cards.js` multicolor cards |
| Top card value | `topValue` | 15 | 1–99 | `cards.js` colorless cards |
| Number of players | `playerCount` | 4 | 2–6 | `game.js` player setup |
| Win threshold | `winThreshold` | 200 | 50–500 | `game.js` isGameOver check |
| Column bonus | `columnBonus` | 10 | 0–50 | `scoring.js` calcColumnBonus |
| Row bonus | `rowBonus` | 10 | 0–50 | `scoring.js` calcRowBonus |
| Prism bonus | `prismBonus` | 10 | 0–50 | `scoring.js` calcPrismBonus |
| Number of games | `gameCount` | 100 | 10–1000 | Simulation loop |
| Bot difficulties | `difficulties[]` | all hard | per-bot: easy/medium/hard | `game.js` + `bot.js` |

### Config Object Shape

```js
const config = {
  cardMin: 1,
  cardMax: 12,
  negativeValue: -2,
  topValue: 15,
  winThreshold: 200,
  columnBonus: 10,
  rowBonus: 10,
  prismBonus: 10,
};
```

Passed to `createDeck(config)`, `createGame({ botCount, botDifficulties, config })`, and `calcRoundScore(grid, config)`. When omitted or `undefined`, all functions use existing hardcoded defaults (backwards-compatible).

---

## Module Changes

### `cards.js` — `createDeck(config)`

Currently generates:
- 96 vector cards: values 1–12, 4 colors, 2 copies each
- 8 multicolor cards: value -2
- 8 colorless cards: value 15

With config:
- Vector cards: values `config.cardMin` to `config.cardMax`, 4 colors, 2 copies each
- Multicolor cards: value `config.negativeValue`, count 8
- Colorless cards: value `config.topValue`, count 8
- Total deck size changes with card range (affects dealing feasibility — see Constraints below)

### `game.js` — `createGame({ botCount, botDifficulties, config })`

- Passes `config` to `createDeck(config)`
- Stores `config` on the game object so `scoreRound()` can access it
- `isGameOver()` uses `config.winThreshold` instead of hardcoded 200
- `scoreRound()` passes `config` to `calcRoundScore()`

### `scoring.js` — `calcRoundScore(grid, config)`

- `calcColumnBonus()` returns `config.columnBonus` instead of hardcoded 10
- `calcRowBonus()` returns `config.rowBonus` instead of hardcoded 10
- `calcPrismBonus()` returns `config.prismBonus` instead of hardcoded 10
- LUMINA caller bonus/penalty also uses a configurable value (defaults to 10)

### Backwards Compatibility

All config parameters default to current hardcoded values when not provided:

```js
export function createDeck(config = {}) {
  const cardMin = config.cardMin ?? 1;
  const cardMax = config.cardMax ?? 12;
  const negativeValue = config.negativeValue ?? -2;
  const topValue = config.topValue ?? 15;
  // ... rest unchanged
}
```

Existing callers (`app.js`, tests) pass no config and get identical behavior.

---

## Simulation Engine (`simulation-engine.js`)

### API

```js
/**
 * Run a batch of headless bot-vs-bot games.
 * @param {object} params
 * @param {number} params.gameCount - Number of games to simulate
 * @param {number} params.playerCount - Number of bot players
 * @param {string[]} params.difficulties - Difficulty per bot
 * @param {object} params.config - Game parameter overrides
 * @param {function} params.onProgress - Called after each game with (completed, total)
 * @returns {SimulationResults}
 */
export function runSimulation(params) { ... }
```

### Game Loop (per game)

1. `createGame({ botCount: playerCount, botDifficulties: difficulties, config })` — all players are bots (no human)
2. Auto-reveal: each bot reveals 2 cards via `chooseBotReveal()`
3. `game.startGame()` to determine first player
4. Loop: `chooseBotAction(game, currentPlayerIndex)` → execute action → check LUMINA → check scoring → check game over
5. After each round: `game.scoreRound()`, check `game.isGameOver()`
6. If not over: start new round (fresh deck/grids, keep cumulative scores)
7. Collect per-round stats: scores, breakdowns, LUMINA calls, round count

### Results Shape

```js
{
  games: [
    {
      winner: 0,           // player index
      rounds: 4,           // rounds played
      finalScores: [210, 180, 165, 195],
      roundDetails: [
        {
          scores: [45, 38, 42, 50],
          breakdowns: [
            { base: 35, columnBonus: 10, rowBonus: 0, prismBonus: 0 },
            // ... per player
          ],
          luminaCaller: 2,  // player index or null
        },
        // ... per round
      ],
    },
    // ... per game
  ],
  summary: {
    totalGames: 100,
    wins: [12, 22, 35, 31],        // per player
    avgScore: [185, 195, 210, 205], // per player
    avgRounds: 4.2,
    luminaCallRate: 0.38,           // fraction of rounds with LUMINA
    avgScoreByRound: [              // for line chart
      [42, 45, 50, 48],            // round 1 avg per player
      [85, 92, 102, 97],           // round 2 cumulative avg
      // ...
    ],
    avgBreakdown: [                 // for stacked bar chart
      { base: 32, column: 5, row: 3, prism: 2 },  // player 0 avg per round
      // ...
    ],
  },
}
```

### Performance

- Each headless game runs ~1-5ms (no DOM, no delays)
- 1000 games: ~1-5 seconds
- Progress callback updates UI every game for smooth progress bar
- Use `setTimeout(0)` chunking every 10 games to keep UI responsive

---

## Page Layout

### Two-Column Design

- **Left panel (300px fixed)**: Parameter inputs + "Run Simulation" button + progress bar
- **Right panel (flex)**: Summary stat cards + 3 charts

### Left Panel — Parameters

Grouped sections with section headers:

1. **Card Values**: Normal range (min/max inputs), Negative card value, Top card value
2. **Game Rules**: Number of players (2–6), Win threshold
3. **Bonus Values**: Column, Row, Prism (3 inputs in a row)
4. **Simulation**: Number of games (slider + input), Bot difficulties (per-bot dropdown)
5. **Run Simulation** button (white primary, full-width)
6. **Progress bar** (appears during simulation)

### Right Panel — Results

1. **Summary stat cards** (top row, 4 cards):
   - Games played
   - Average rounds per game
   - LUMINA call rate (% of rounds)
   - Average game duration (computed time)

2. **Win Rate bar chart** (Chart.js bar):
   - X-axis: player names with difficulty badges
   - Y-axis: win percentage
   - Bars colored by difficulty (green=easy, yellow=medium, red=hard)

3. **Average Score Breakdown stacked bar chart** (Chart.js stacked bar):
   - X-axis: player names
   - Y-axis: average score per round
   - Stacked segments: Base (gray), Column bonus (green), Row bonus (blue), Prism bonus (violet)
   - Legend below chart

4. **Score Progression line chart** (Chart.js line):
   - X-axis: round number
   - Y-axis: average cumulative score
   - One line per player, colored by difficulty
   - Shows how scores build across a typical game

### Empty State

Before running: right panel shows a centered message "Configure parameters and run a simulation to see results."

### Styling

- Follows the existing slate/glass design system from the CSS modernization
- Dark background (`#020617`), slate panels (`#0f172a`), borders (`#1e293b`)
- Inter font, same spacing and border-radius conventions
- Chart.js configured with dark theme: transparent backgrounds, slate grid lines, white text

---

## Navigation

- **Setup screen** gets a "Party Simulator" button (alongside existing "Stats" button)
- **Simulator page** has a "← Back to Game" link in the header that navigates to `/`
- Simple `<a href>` navigation (separate pages, not SPA routing)

---

## Dependencies

- **Chart.js 4.x** — loaded via CDN (`<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`)
- No other new dependencies

---

## Constraints & Edge Cases

- **Deck size vs players**: With `cardMin=1, cardMax=12`: 96 + 8 + 8 = 112 cards. Each player needs 12 + some for discard/draws. Max 6 players need ~80+ cards minimum. If user shrinks card range too much (e.g., 1-3 = 24 + 16 = 40 cards for 6 players needing 72+), show a validation warning and prevent running.
- **Minimum deck formula**: `(playerCount * 12) + 1 (initial discard)` must be ≤ total deck size
- **Infinite games**: If win threshold is very high and scores are very low, games could run forever. Cap at 50 rounds per game — if no winner, declare highest scorer the winner.
- **Bot AI with custom values**: Bots use relative comparisons (highest value, lowest value), so they adapt naturally to different card ranges. Hard bot's Monte Carlo evaluations work on actual values, so custom ranges don't break the logic.

---

## Testing

- **`cards.js`**: Test `createDeck(config)` with custom config produces correct card counts and values
- **`scoring.js`**: Test `calcRoundScore(grid, config)` with custom bonus values
- **`game.js`**: Test `createGame` with config, verify `isGameOver()` respects custom threshold
- **`simulation-engine.js`**: Test `runSimulation()` returns correct results shape, test with minimal config (2 players, 10 games), verify winner counts sum to total games
- Existing tests continue to pass (no config = defaults)
