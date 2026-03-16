# Party Simulator Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable Party Simulator page that runs batch bot-vs-bot games and visualizes results with Chart.js.

**Architecture:** Extend existing modules (`cards.js`, `scoring.js`, `game.js`) with optional `config` parameter for custom game rules. New `simulation-engine.js` runs headless games. New `simulator.html`/`simulator.js`/`simulator.css` provide the UI on a separate `/simulator` route.

**Tech Stack:** Vanilla JS (ES modules), Chart.js 4.x (CDN), Express static serving, Node.js built-in test runner.

---

## Task 1: Add config parameter to `cards.js`

**Files:**
- Modify: `public/cards.js:28-50`
- Test: `tests/cards.test.js`

**Context:** Currently `createDeck()` generates a hardcoded 112-card deck. We need it to accept an optional `config` object to customize card value range, negative card value, and top card value. When no config is passed, behavior must be identical.

- [ ] **Step 1: Write failing tests for `createDeck(config)`**

Add these tests to the end of the `createDeck` describe block in `tests/cards.test.js`:

```js
it('should accept config to customize card range', () => {
  const deck = createDeck({ cardMin: 1, cardMax: 5 });
  const vectors = deck.filter(
    (c) => c.value >= 1 && c.value <= 5 && COLORS.includes(c.color)
  );
  // 5 values × 4 colors × 2 copies = 40
  assert.equal(vectors.length, 40);
  // Total: 40 + 8 multi + 8 colorless = 56
  assert.equal(deck.length, 56);
});

it('should accept config to customize negative card value', () => {
  const deck = createDeck({ negativeValue: -5 });
  const multi = deck.filter((c) => c.value === -5 && c.color === 'multicolor');
  assert.equal(multi.length, 8);
  const oldMulti = deck.filter((c) => c.value === -2 && c.color === 'multicolor');
  assert.equal(oldMulti.length, 0);
});

it('should accept config to customize top card value', () => {
  const deck = createDeck({ topValue: 20 });
  const top = deck.filter((c) => c.value === 20 && c.color === null);
  assert.equal(top.length, 8);
  const oldTop = deck.filter((c) => c.value === 15 && c.color === null);
  assert.equal(oldTop.length, 0);
});

it('should use defaults when config is empty or omitted', () => {
  const deck1 = createDeck();
  const deck2 = createDeck({});
  assert.equal(deck1.length, 112);
  assert.equal(deck2.length, 112);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cards.test.js`
Expected: 4 new tests FAIL (createDeck doesn't accept config yet)

- [ ] **Step 3: Implement config support in `createDeck`**

Modify `public/cards.js:28-50`. Replace the `createDeck()` function:

```js
/**
 * Create and shuffle a LUMINA deck.
 *
 * Default composition (112 cards):
 *  - 96 Vector cards: values 1-12, 4 colors, 2 copies each
 *  -  8 Multicolor -2 cards
 *  -  8 Colorless 15 cards
 *
 * @param {object} [config] - Optional overrides
 * @param {number} [config.cardMin=1] - Minimum vector card value
 * @param {number} [config.cardMax=12] - Maximum vector card value
 * @param {number} [config.negativeValue=-2] - Multicolor card value
 * @param {number} [config.topValue=15] - Colorless card value
 * @returns {{ value: number, color: string|null }[]}
 */
export function createDeck(config = {}) {
  const cardMin = config.cardMin ?? 1;
  const cardMax = config.cardMax ?? 12;
  const negativeValue = config.negativeValue ?? -2;
  const topValue = config.topValue ?? 15;

  const deck = [];

  // Vector cards: range × 4 colors × 2 copies
  for (const color of COLORS) {
    for (let value = cardMin; value <= cardMax; value++) {
      deck.push({ value, color });
      deck.push({ value, color });
    }
  }

  // 8 multicolor cards
  for (let i = 0; i < 8; i++) {
    deck.push({ value: negativeValue, color: 'multicolor' });
  }

  // 8 colorless cards
  for (let i = 0; i < 8; i++) {
    deck.push({ value: topValue, color: null });
  }

  return shuffle(deck);
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/cards.test.js`
Expected: ALL pass (11 tests — 7 existing + 4 new)

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npm test`
Expected: ALL 120+ tests pass

- [ ] **Step 6: Commit**

```bash
git add public/cards.js tests/cards.test.js
git commit -m "feat: add config parameter to createDeck for custom card values"
```

---

## Task 2: Add config parameter to `scoring.js`

**Files:**
- Modify: `public/scoring.js:14-191`
- Test: `tests/scoring.test.js`

**Context:** Currently `calcColumnBonus`, `calcRowBonus`, `calcPrismBonus`, and `calcRoundScore` all use hardcoded `10` for bonus values. We need them to accept an optional `config` parameter. When no config is passed, behavior must be identical.

- [ ] **Step 1: Write failing tests for config-aware scoring**

Add a new describe block at the end of `tests/scoring.test.js`:

```js
describe('scoring with custom config', () => {
  const customConfig = { columnBonus: 25, rowBonus: 15, prismBonus: 20 };

  it('calcColumnBonus uses config.columnBonus', () => {
    // All blue grid → 4 valid columns
    const grid = makeGrid();
    assert.equal(calcColumnBonus(grid, customConfig), 100); // 4 × 25
  });

  it('calcColumnBonus defaults to 10 without config', () => {
    const grid = makeGrid();
    assert.equal(calcColumnBonus(grid), 40); // 4 × 10 (existing behavior)
  });

  it('calcRowBonus uses config.rowBonus', () => {
    // Build a grid with one strictly increasing row
    const grid = makeGrid({
      '0,0': c(1, 'blue'), '0,1': c(3, 'blue'), '0,2': c(7, 'blue'), '0,3': c(11, 'blue'),
    });
    assert.equal(calcRowBonus(grid, customConfig), 15);
  });

  it('calcPrismBonus uses config.prismBonus', () => {
    // All-blue grid with a prism → column valid → prism bonus
    const grid = makeGrid({
      '0,0': c(5, 'blue', true, true),
    });
    assert.equal(calcPrismBonus(grid, customConfig), 20);
  });

  it('calcRoundScore threads config to all sub-functions', () => {
    const grid = makeGrid(); // all blue 5s, all face-up
    const result = calcRoundScore(grid, customConfig);
    assert.equal(result.columnBonus, 100); // 4 × 25
    assert.equal(result.rowBonus, 0);      // no ascending rows (all 5s)
    assert.equal(result.prismBonus, 0);    // no prisms
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/scoring.test.js`
Expected: 5 new tests FAIL

- [ ] **Step 3: Implement config support in scoring functions**

Modify `public/scoring.js`. Add `config` parameter to each function:

For `calcColumnBonus` (line 14): Change signature to `calcColumnBonus(grid, config = {})` and replace `bonus += 10` with `bonus += config.columnBonus ?? 10` (two occurrences — lines 33 and 39).

For `calcRowBonus` (line 53): Change signature to `calcRowBonus(grid, config = {})` and replace `if (increasing) bonus += 10` with `if (increasing) bonus += config.rowBonus ?? 10`.

For `calcPrismBonus` (line 83): Change signature to `calcPrismBonus(grid, config = {})` and replace `return 10` with `return config.prismBonus ?? 10`.

For `calcRoundScore` (line 132): Change signature to `calcRoundScore(grid, config = {})` and thread config:
```js
const columnBonus = calcColumnBonus(grid, config);
const rowBonus = calcRowBonus(grid, config);
const prismBonus = calcPrismBonus(grid, config);
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/scoring.test.js`
Expected: ALL pass (existing + 5 new)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL tests pass

- [ ] **Step 6: Commit**

```bash
git add public/scoring.js tests/scoring.test.js
git commit -m "feat: add config parameter to scoring functions for custom bonus values"
```

---

## Task 3: Add config and allBots to `game.js`

**Files:**
- Modify: `public/game.js:36-520`
- Test: `tests/game.test.js`

**Context:** `createGame()` needs three changes: (1) accept a `config` object and store it on the game, (2) pass config to `createDeck(config)`, use `config.winThreshold` in `isGameOver()`, pass config to `calcRoundScore()` in `scoreRound()`, use `config.luminaBonus` for LUMINA bonus/penalty, and (3) support `allBots: true` which creates all bot players (no human player 0).

- [ ] **Step 1: Write failing tests**

Add these test blocks at the end of `tests/game.test.js`:

```js
describe('createGame with config', () => {
  it('stores config on the game object', () => {
    const config = { winThreshold: 100, cardMin: 2, cardMax: 8 };
    const g = createGame({ botCount: 1, botDifficulties: ['easy'], config });
    assert.deepEqual(g.config, config);
  });

  it('isGameOver uses config.winThreshold', () => {
    const config = { winThreshold: 100 };
    const g = createGame({ botCount: 1, botDifficulties: ['easy'], config });
    g.cumulativeScores[0] = 99;
    assert.equal(g.isGameOver(), false);
    g.cumulativeScores[0] = 100;
    assert.equal(g.isGameOver(), true);
  });

  it('uses default 200 threshold when no config', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.cumulativeScores[0] = 199;
    assert.equal(g.isGameOver(), false);
    g.cumulativeScores[0] = 200;
    assert.equal(g.isGameOver(), true);
  });
});

describe('createGame with allBots', () => {
  it('creates all bot players when allBots is true', () => {
    const g = createGame({ botCount: 3, botDifficulties: ['easy', 'medium', 'hard'], allBots: true });
    assert.equal(g.players.length, 3);
    assert.equal(g.players[0].isBot, true);
    assert.equal(g.players[1].isBot, true);
    assert.equal(g.players[2].isBot, true);
  });

  it('names bots Bot 1, Bot 2, etc when allBots', () => {
    const g = createGame({ botCount: 4, botDifficulties: ['easy', 'easy', 'hard', 'hard'], allBots: true });
    assert.equal(g.players[0].name, 'Bot 1');
    assert.equal(g.players[3].name, 'Bot 4');
  });

  it('still creates human + bots when allBots is false', () => {
    const g = createGame({ botCount: 2, botDifficulties: ['easy', 'hard'] });
    assert.equal(g.players.length, 3);
    assert.equal(g.players[0].isBot, false);
    assert.equal(g.players[0].name, 'Player');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/game.test.js`
Expected: 6 new tests FAIL

- [ ] **Step 3: Implement changes in `game.js`**

In `public/game.js`, modify the `createGame` function:

**a) Change the function signature** (line 36):
```js
export function createGame({ botCount, botDifficulties, config = {}, allBots = false }) {
```

**b) Pass config to createDeck** (line 37):
```js
const deck = createDeck(config);
```

**c) Replace player creation block** (lines 42-63). The existing code always creates a human first then bots. Replace with:

```js
  const players = [];

  if (allBots) {
    // All-bots mode (for simulator)
    for (let i = 0; i < botCount; i++) {
      players.push({
        name: `Bot ${i + 1}`,
        isBot: true,
        difficulty: botDifficulties[i] || 'easy',
        grid: [],
        prismsRemaining: 3,
        revealsLeft: 2,
        stats: { attacksMade: 0, prismsUsed: 0 },
      });
    }
  } else {
    // Normal mode: 1 human + bots
    players.push({
      name: 'Player',
      isBot: false,
      difficulty: null,
      grid: [],
      prismsRemaining: 3,
      revealsLeft: 2,
      stats: { attacksMade: 0, prismsUsed: 0 },
    });

    for (let i = 0; i < botCount; i++) {
      players.push({
        name: `Bot ${i + 1}`,
        isBot: true,
        difficulty: botDifficulties[i] || 'easy',
        grid: [],
        prismsRemaining: 3,
        revealsLeft: 2,
        stats: { attacksMade: 0, prismsUsed: 0 },
      });
    }
  }

  const totalPlayers = players.length;
```

**d) Store config on the game object** — add to the game object literal (after `actionLog: []`):
```js
    config,
```

**e) Update `isGameOver()`** — replace `return this.cumulativeScores.some((s) => s >= 200)` with:
```js
      const threshold = this.config?.winThreshold ?? 200;
      return this.cumulativeScores.some((s) => s >= threshold);
```

**f) Update `scoreRound()`** — pass config to calcRoundScore:
```js
      const result = calcRoundScore(this.players[i].grid, this.config);
```

And update the LUMINA bonus/penalty (replace hardcoded `10`):
```js
      const luminaBonus = this.config?.luminaBonus ?? 10;
      if (isStrictlyHighest) {
        roundScores[this.luminaCaller] += luminaBonus;
      } else {
        roundScores[this.luminaCaller] -= luminaBonus;
      }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/game.test.js`
Expected: ALL pass

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL tests pass

- [ ] **Step 6: Commit**

```bash
git add public/game.js tests/game.test.js
git commit -m "feat: add config and allBots support to createGame"
```

---

## Task 4: Create simulation engine

**Files:**
- Create: `public/simulation-engine.js`
- Create: `tests/simulation-engine.test.js`

**Context:** This is the headless game runner. It imports `createGame`, `PHASE` from `game.js`, `chooseBotReveal`, `chooseBotAction` from `bot.js`, and `calcRoundScore` from `scoring.js`. It runs complete bot-vs-bot games without DOM interaction and returns structured results.

- [ ] **Step 1: Write failing tests**

Create `tests/simulation-engine.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../public/simulation-engine.js';

describe('simulation engine', () => {
  it('returns results with correct shape', () => {
    const results = runSimulation({
      gameCount: 2,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
    });
    assert.equal(results.games.length, 2);
    assert.equal(results.summary.totalGames, 2);
    assert.equal(results.summary.wins.length, 2);
    assert.equal(results.summary.avgScore.length, 2);
    assert.equal(results.summary.avgBreakdown.length, 2);
    assert.equal(typeof results.summary.avgRounds, 'number');
    assert.equal(typeof results.summary.luminaCallRate, 'number');
  });

  it('winner counts sum to total games', () => {
    const results = runSimulation({
      gameCount: 10,
      playerCount: 3,
      difficulties: ['easy', 'medium', 'hard'],
      config: {},
    });
    const totalWins = results.summary.wins.reduce((a, b) => a + b, 0);
    assert.equal(totalWins, 10);
  });

  it('each game has valid structure', () => {
    const results = runSimulation({
      gameCount: 5,
      playerCount: 2,
      difficulties: ['hard', 'hard'],
      config: {},
    });
    for (const game of results.games) {
      assert.ok(game.winner >= 0 && game.winner < 2);
      assert.ok(game.rounds >= 1 && game.rounds <= 50);
      assert.equal(game.finalScores.length, 2);
      assert.ok(game.roundDetails.length >= 1);
      for (const rd of game.roundDetails) {
        assert.equal(rd.scores.length, 2);
        assert.equal(rd.breakdowns.length, 2);
      }
    }
  });

  it('respects custom config', () => {
    const results = runSimulation({
      gameCount: 3,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: { winThreshold: 50 },
    });
    // With low threshold, games should end faster
    for (const game of results.games) {
      const winnerScore = game.finalScores[game.winner];
      assert.ok(winnerScore >= 50, `winner score ${winnerScore} should be >= 50`);
    }
  });

  it('calls onProgress callback', () => {
    let progressCalls = 0;
    runSimulation({
      gameCount: 5,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
      onProgress: (completed, total) => {
        progressCalls++;
        assert.equal(total, 5);
      },
    });
    assert.equal(progressCalls, 5);
  });

  it('caps games at 50 rounds', () => {
    // Very high threshold to force long games
    const results = runSimulation({
      gameCount: 1,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: { winThreshold: 999999 },
    });
    assert.ok(results.games[0].rounds <= 50);
  });

  it('avgScoreByRound has arrays per round', () => {
    const results = runSimulation({
      gameCount: 3,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
    });
    assert.ok(results.summary.avgScoreByRound.length >= 1);
    for (const roundScores of results.summary.avgScoreByRound) {
      assert.equal(roundScores.length, 2);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/simulation-engine.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement the simulation engine**

Create `public/simulation-engine.js`:

```js
/** @module simulation-engine – Headless bot-vs-bot game runner for LUMINA */

import { createGame, PHASE } from './game.js';
import { chooseBotReveal, chooseBotAction } from './bot.js';
import { calcRoundScore } from './scoring.js';

const MAX_ROUNDS = 50;

/**
 * Execute a single bot action on the game.
 */
function executeAction(game, botIndex, action) {
  if (action.type === 'construct') {
    if (action.source === 'discard') {
      game.constructFromDiscard(botIndex, action.row, action.col);
    } else if (action.source === 'deck_discard') {
      game.constructDiscardDraw(botIndex, action.revealRow, action.revealCol);
    } else {
      game.constructFromDeck(botIndex, action.row, action.col);
    }
  } else if (action.type === 'attack') {
    game.attack(
      botIndex,
      action.attackerRow, action.attackerCol,
      action.defenderIndex, action.defenderRow, action.defenderCol,
      action.revealRow, action.revealCol
    );
  } else if (action.type === 'secure') {
    game.secure(botIndex, action.row, action.col);
  }
}

/**
 * Run a single headless game to completion.
 * @returns {{ winner: number, rounds: number, finalScores: number[], roundDetails: object[] }}
 */
function runSingleGame(playerCount, difficulties, config) {
  let game = createGame({
    botCount: playerCount,
    botDifficulties: difficulties,
    config,
    allBots: true,
  });

  const roundDetails = [];

  for (let roundNum = 0; roundNum < MAX_ROUNDS; roundNum++) {
    // Reveal phase: each bot reveals 2 cards
    for (let i = 0; i < game.players.length; i++) {
      const reveals = chooseBotReveal(game, i);
      for (const [r, c] of reveals) {
        game.revealCard(i, r, c);
      }
    }

    // Start playing
    game.startGame();

    // Turn loop
    let turnSafety = 0;
    while (game.phase !== PHASE.SCORING && turnSafety < 1000) {
      turnSafety++;
      const action = chooseBotAction(game, game.currentPlayerIndex);
      executeAction(game, game.currentPlayerIndex, action);
    }

    // Collect round stats before scoring
    const breakdowns = [];
    const scores = [];
    for (let i = 0; i < game.players.length; i++) {
      const bd = calcRoundScore(game.players[i].grid, config);
      breakdowns.push({
        base: bd.baseScore,
        columnBonus: bd.columnBonus,
        rowBonus: bd.rowBonus,
        prismBonus: bd.prismBonus,
      });
      scores.push(bd.total);
    }

    roundDetails.push({
      scores,
      breakdowns,
      luminaCaller: game.luminaCaller,
    });

    // Apply scoring
    game.scoreRound();

    // Check game over
    if (game.isGameOver()) {
      break;
    }

    // Start new round: save state, create fresh game, transplant
    if (roundNum < MAX_ROUNDS - 1) {
      const savedScores = [...game.cumulativeScores];
      const savedRound = game.round;

      game = createGame({
        botCount: playerCount,
        botDifficulties: difficulties,
        config,
        allBots: true,
      });

      game.cumulativeScores = savedScores;
      game.round = savedRound + 1;
    }
  }

  // Determine winner (highest cumulative score)
  let winner = 0;
  let maxScore = game.cumulativeScores[0];
  for (let i = 1; i < game.cumulativeScores.length; i++) {
    if (game.cumulativeScores[i] > maxScore) {
      maxScore = game.cumulativeScores[i];
      winner = i;
    }
  }

  return {
    winner,
    rounds: roundDetails.length,
    finalScores: [...game.cumulativeScores],
    roundDetails,
  };
}

/**
 * Run a batch of headless bot-vs-bot games.
 * @param {object} params
 * @param {number} params.gameCount
 * @param {number} params.playerCount
 * @param {string[]} params.difficulties
 * @param {object} params.config
 * @param {function} [params.onProgress]
 * @returns {object} SimulationResults
 */
export function runSimulation({ gameCount, playerCount, difficulties, config, onProgress }) {
  const games = [];
  const wins = new Array(playerCount).fill(0);
  const totalScores = new Array(playerCount).fill(0);
  let totalRounds = 0;
  let totalLuminaCalls = 0;
  let totalRoundCount = 0;
  const breakdownSums = Array.from({ length: playerCount }, () => ({
    base: 0, column: 0, row: 0, prism: 0,
  }));

  // Track cumulative scores per round across games for line chart
  const roundScoreAccum = []; // [roundIndex][playerIndex] = { sum, count }

  for (let g = 0; g < gameCount; g++) {
    const result = runSingleGame(playerCount, difficulties, config);
    games.push(result);

    wins[result.winner]++;
    totalRounds += result.rounds;

    for (let i = 0; i < playerCount; i++) {
      totalScores[i] += result.finalScores[i];
    }

    // Accumulate per-round data
    let cumulativeByPlayer = new Array(playerCount).fill(0);
    for (let r = 0; r < result.roundDetails.length; r++) {
      const rd = result.roundDetails[r];
      totalRoundCount++;

      if (rd.luminaCaller !== null) totalLuminaCalls++;

      for (let i = 0; i < playerCount; i++) {
        breakdownSums[i].base += rd.breakdowns[i].base;
        breakdownSums[i].column += rd.breakdowns[i].columnBonus;
        breakdownSums[i].row += rd.breakdowns[i].rowBonus;
        breakdownSums[i].prism += rd.breakdowns[i].prismBonus;
        cumulativeByPlayer[i] += rd.scores[i];
      }

      // Grow the roundScoreAccum array as needed
      if (!roundScoreAccum[r]) {
        roundScoreAccum[r] = Array.from({ length: playerCount }, () => ({ sum: 0, count: 0 }));
      }
      for (let i = 0; i < playerCount; i++) {
        roundScoreAccum[r][i].sum += cumulativeByPlayer[i];
        roundScoreAccum[r][i].count++;
      }
    }

    if (onProgress) onProgress(g + 1, gameCount);
  }

  // Build summary
  const avgRounds = totalRounds / gameCount;
  const luminaCallRate = totalRoundCount > 0 ? totalLuminaCalls / totalRoundCount : 0;

  const avgScore = totalScores.map((s) => Math.round(s / gameCount));
  const avgBreakdown = breakdownSums.map((s) => ({
    base: totalRoundCount > 0 ? Math.round(s.base / totalRoundCount) : 0,
    column: totalRoundCount > 0 ? Math.round(s.column / totalRoundCount) : 0,
    row: totalRoundCount > 0 ? Math.round(s.row / totalRoundCount) : 0,
    prism: totalRoundCount > 0 ? Math.round(s.prism / totalRoundCount) : 0,
  }));

  const avgScoreByRound = roundScoreAccum.map((roundData) =>
    roundData.map((p) => (p.count > 0 ? Math.round(p.sum / p.count) : 0))
  );

  return {
    games,
    summary: {
      totalGames: gameCount,
      wins,
      avgScore,
      avgRounds: Math.round(avgRounds * 10) / 10,
      luminaCallRate: Math.round(luminaCallRate * 100) / 100,
      avgScoreByRound,
      avgBreakdown,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/simulation-engine.test.js`
Expected: ALL 7 tests pass

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL tests pass (add `tests/simulation-engine.test.js` to the test command in `package.json` if needed)

- [ ] **Step 6: Update `package.json` test command**

Check `package.json` — the test command lists test files explicitly. Add `tests/simulation-engine.test.js`:

```json
"test": "node --test tests/db.test.js tests/server.test.js tests/cards.test.js tests/scoring.test.js tests/game.test.js tests/bot.test.js tests/simulation-engine.test.js"
```

- [ ] **Step 7: Run full test suite again to confirm**

Run: `npm test`
Expected: ALL tests pass (127+ total)

- [ ] **Step 8: Commit**

```bash
git add public/simulation-engine.js tests/simulation-engine.test.js package.json
git commit -m "feat: add headless simulation engine for bot-vs-bot games"
```

---

## Task 5: Add `/simulator` route to `server.js`

**Files:**
- Modify: `server.js:18-22`

**Context:** Add an explicit route so `/simulator` serves `public/simulator.html`. The static middleware already serves files from `public/`, but `/simulator` (without `.html`) won't resolve automatically.

- [ ] **Step 1: Add the route**

In `server.js`, after the `app.use(express.static(...))` line (line 21), add:

```js
  // Serve simulator page at clean URL
  app.get('/simulator', (_req, res) => {
    res.sendFile(join(__dirname, 'public', 'simulator.html'));
  });
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: ALL tests pass (server tests still work, route doesn't break anything)

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add /simulator route to serve Party Simulator page"
```

---

## Task 6: Create simulator HTML page

**Files:**
- Create: `public/simulator.html`

**Context:** Standalone page with Chart.js CDN, parameter panel (left), results panel (right). Uses the slate/glass design from the existing CSS modernization. Links to `simulator.css` and `simulator.js`.

- [ ] **Step 1: Create the HTML file**

Create `public/simulator.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LUMINA — Party Simulator</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="simulator.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <!-- Header -->
  <header class="sim-header">
    <div class="sim-header-title">LUMINA <span class="sim-header-subtitle">Party Simulator</span></div>
    <a href="/" class="sim-back-link">← Back to Game</a>
  </header>

  <main class="sim-layout">
    <!-- Left Panel: Parameters -->
    <aside class="sim-params">
      <h2 class="sim-params-title">Game Parameters</h2>

      <!-- Card Values -->
      <section class="sim-section">
        <div class="sim-section-label">Card Values</div>
        <div class="sim-row">
          <label class="sim-field">
            <span class="sim-field-label">Normal min</span>
            <input type="number" id="cardMin" value="1" min="1" max="20">
          </label>
          <label class="sim-field">
            <span class="sim-field-label">Normal max</span>
            <input type="number" id="cardMax" value="12" min="2" max="50">
          </label>
        </div>
        <div class="sim-row">
          <label class="sim-field">
            <span class="sim-field-label">Negative card</span>
            <input type="number" id="negativeValue" value="-2" min="-20" max="-1">
          </label>
          <label class="sim-field">
            <span class="sim-field-label">Top card</span>
            <input type="number" id="topValue" value="15" min="1" max="99">
          </label>
        </div>
      </section>

      <!-- Game Rules -->
      <section class="sim-section">
        <div class="sim-section-label">Game Rules</div>
        <div class="sim-row">
          <label class="sim-field">
            <span class="sim-field-label">Players</span>
            <input type="number" id="playerCount" value="4" min="2" max="6">
          </label>
          <label class="sim-field">
            <span class="sim-field-label">Win at</span>
            <input type="number" id="winThreshold" value="200" min="50" max="500" step="10">
          </label>
        </div>
      </section>

      <!-- Bonus Values -->
      <section class="sim-section">
        <div class="sim-section-label">Bonus Values</div>
        <div class="sim-row">
          <label class="sim-field">
            <span class="sim-field-label">Column</span>
            <input type="number" id="columnBonus" value="10" min="0" max="50">
          </label>
          <label class="sim-field">
            <span class="sim-field-label">Row</span>
            <input type="number" id="rowBonus" value="10" min="0" max="50">
          </label>
        </div>
        <div class="sim-row">
          <label class="sim-field">
            <span class="sim-field-label">Prism</span>
            <input type="number" id="prismBonus" value="10" min="0" max="50">
          </label>
          <label class="sim-field">
            <span class="sim-field-label">LUMINA</span>
            <input type="number" id="luminaBonus" value="10" min="0" max="50">
          </label>
        </div>
      </section>

      <!-- Simulation -->
      <section class="sim-section">
        <div class="sim-section-label">Simulation</div>
        <label class="sim-field">
          <span class="sim-field-label">Number of games</span>
          <input type="range" id="gameCountSlider" value="100" min="10" max="1000" step="10">
          <input type="number" id="gameCount" value="100" min="10" max="1000" step="10" class="sim-range-value">
        </label>
        <div class="sim-field">
          <span class="sim-field-label">Bot difficulties</span>
          <div id="difficultySelectors"></div>
        </div>
      </section>

      <!-- Buttons -->
      <button id="runBtn" class="sim-btn-primary">Run Simulation</button>
      <button id="resetBtn" class="sim-btn-ghost">Reset Defaults</button>

      <!-- Progress -->
      <div id="progressSection" class="sim-progress" hidden>
        <div class="sim-progress-header">
          <span>Progress</span>
          <span id="progressText">0 / 0</span>
        </div>
        <div class="sim-progress-bar">
          <div id="progressFill" class="sim-progress-fill"></div>
        </div>
      </div>
    </aside>

    <!-- Right Panel: Results -->
    <section class="sim-results">
      <div id="emptyState" class="sim-empty">
        Configure parameters and run a simulation to see results.
      </div>

      <div id="resultsContent" hidden>
        <!-- Summary Stats -->
        <div class="sim-stats-row" id="statsRow"></div>

        <!-- Charts -->
        <div class="sim-chart-container">
          <h3 class="sim-chart-title">Win Rate by Player</h3>
          <canvas id="winRateChart"></canvas>
        </div>

        <div class="sim-chart-container">
          <h3 class="sim-chart-title">Avg Score Breakdown</h3>
          <canvas id="breakdownChart"></canvas>
        </div>

        <div class="sim-chart-container">
          <h3 class="sim-chart-title">Score Progression (avg cumulative by round)</h3>
          <canvas id="progressionChart"></canvas>
        </div>
      </div>
    </section>
  </main>

  <script type="module" src="simulator.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add public/simulator.html
git commit -m "feat: add simulator HTML page with parameter panel and chart containers"
```

---

## Task 7: Create simulator CSS

**Files:**
- Create: `public/simulator.css`

**Context:** Follows the slate/glass design system. Dark background, Inter font, consistent with the main game's visual language.

- [ ] **Step 1: Create the CSS file**

Create `public/simulator.css` with all the simulator-specific styles. Key selectors:

- `.sim-header` — top nav bar (`#0f172a` background, border-bottom)
- `.sim-layout` — flex row, full height
- `.sim-params` — 320px fixed width left panel, scrollable, `#0f172a` background
- `.sim-results` — flex:1 right panel, scrollable
- `.sim-section` — grouped parameter block
- `.sim-field` — input wrapper with label
- Input styling — dark inputs (`#1e293b` background, `#334155` border, white text)
- `.sim-btn-primary` — white background, dark text (matches main game)
- `.sim-btn-ghost` — transparent, `#334155` border
- `.sim-stats-row` — 4-card flex row for summary stats
- `.sim-stat-card` — individual stat card
- `.sim-chart-container` — chart wrapper with dark background, border, border-radius
- `.sim-progress` — progress bar section
- `.sim-empty` — centered empty state message
- Responsive: stack columns at `max-width: 768px`

The full CSS will be ~200 lines. Use the same design tokens as `style.css`: `#020617` (deep bg), `#0f172a` (panel bg), `#1e293b` (elevated), `#334155` (borders), `#64748b` / `#94a3b8` (muted text), `#f8fafc` (bright text), `Inter` font.

- [ ] **Step 2: Commit**

```bash
git add public/simulator.css
git commit -m "feat: add simulator CSS with slate/glass design system"
```

---

## Task 8: Create simulator JS controller

**Files:**
- Create: `public/simulator.js`

**Context:** This is the UI controller. It reads parameter inputs, validates them, runs the simulation engine (with chunked async execution for UI responsiveness), and renders Chart.js charts with the results.

- [ ] **Step 1: Create `simulator.js`**

Create `public/simulator.js` with:

1. **Imports**: `runSimulation` from `./simulation-engine.js`
2. **DOM references**: all input fields, buttons, chart canvases, progress elements
3. **Default values object** for reset functionality
4. **`buildDifficultySelectors(count)`** — dynamically creates per-bot difficulty dropdowns when player count changes
5. **`getConfig()`** — reads all inputs, returns `{ config, gameCount, playerCount, difficulties }`
6. **`validateConfig()`** — checks deck size formula `(playerCount * 12) + 1 <= deckSize`, shows warning if invalid
7. **`runBtn` click handler**:
   - Calls `validateConfig()`, abort if invalid
   - Shows progress bar, hides empty state, shows results container
   - Runs simulation in async chunks using `setTimeout(0)` every 10 games:
     ```js
     async function runAsync(params) {
       return new Promise((resolve) => {
         // Run synchronously but yield every 10 games
         const results = runSimulation({
           ...params,
           onProgress: (completed, total) => {
             updateProgress(completed, total);
           },
         });
         resolve(results);
       });
     }
     ```
   - On completion: calls `renderResults(results)`
8. **`renderResults(results)`**:
   - Updates summary stat cards (games, avg rounds, LUMINA rate, avg winning score)
   - Destroys existing Chart.js instances if any
   - Creates win rate bar chart
   - Creates stacked score breakdown bar chart
   - Creates score progression line chart
9. **Chart configuration**: dark theme — `Chart.defaults.color = '#94a3b8'`, grid color `#1e293b`, no borders on bars
10. **`resetBtn` click handler**: restores all inputs to defaults
11. **`playerCount` change handler**: rebuilds difficulty selectors
12. **Slider/input sync**: `gameCountSlider` ↔ `gameCount` input

Difficulty color map for charts:
```js
const DIFF_COLORS = { easy: '#4ade80', medium: '#fbbf24', hard: '#f87171' };
```

- [ ] **Step 2: Commit**

```bash
git add public/simulator.js
git commit -m "feat: add simulator JS controller with Chart.js visualizations"
```

---

## Task 9: Add "Party Simulator" button to setup screen

**Files:**
- Modify: `public/ui.js`

**Context:** The setup screen is rendered by `renderSetupScreen()` in `ui.js`. Add a "Party Simulator" link/button that navigates to `/simulator`.

- [ ] **Step 1: Find the setup screen render function**

In `public/ui.js`, locate `renderSetupScreen()`. Find where the "Stats" button is rendered. Add a "Party Simulator" button alongside it.

- [ ] **Step 2: Add the button**

Add an `<a href="/simulator">` styled as a button, next to the Stats button in the setup screen:

```js
const simBtn = document.createElement('a');
simBtn.href = '/simulator';
simBtn.className = 'btn-ghost';
simBtn.textContent = 'Party Simulator';
```

Insert it in the button row of the setup screen.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: ALL tests pass

- [ ] **Step 4: Commit**

```bash
git add public/ui.js
git commit -m "feat: add Party Simulator button to setup screen"
```

---

## Task 10: Final integration and verification

**Files:** All modified/created files

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL tests pass (127+ total)

- [ ] **Step 2: Manual smoke test**

Run: `npm start`
Open `http://localhost:3000` — verify main game works as before.
Open `http://localhost:3000/simulator` — verify:
- Parameter panel renders with all defaults
- Changing player count updates difficulty selectors
- "Reset Defaults" restores all values
- Running a simulation shows progress bar and charts
- Charts display correctly with Chart.js
- Back to Game link works

- [ ] **Step 3: Push and deploy**

```bash
git push
```

Trigger Dokploy deployment and verify at `https://aifunflix.cloud/lumina/simulator`.

- [ ] **Step 4: Commit any final fixes if needed**
