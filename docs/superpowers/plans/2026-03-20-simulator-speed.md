# Simulator Speed Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LUMINA Party Simulator 5-10x faster by optimizing the hard bot Monte Carlo hot path and parallelizing game execution across CPU cores via a Web Worker pool.

**Architecture:** Five targeted optimizations to the hard bot AI in `bot.js` reduce per-game computation by ~7-10x. A parallel Web Worker pool in `simulator.js` splits games across `navigator.hardwareConcurrency` cores for an additional ~3x. A new `runBatch()` function in `simulation-engine.js` returns raw game arrays so workers can run independently and the main thread merges + summarizes.

**Tech Stack:** JavaScript ES modules, Web Workers API, Node.js built-in test runner (`node:test`)

---

## File Structure

| File | Responsibility | Change Type |
|---|---|---|
| `public/bot.js` | Bot AI — Monte Carlo engine | Modify (C1-C5 optimizations) |
| `public/simulation-engine.js` | Headless simulation runner | Modify (extract `runBatch`) |
| `public/simulator-worker.js` | Web Worker entry point | Modify (use `runBatch`, return raw games) |
| `public/simulator.js` | UI controller | Modify (worker pool, merge results) |
| `tests/simulation-engine.test.js` | Simulation tests | Modify (add `runBatch` tests) |
| `tests/bot.test.js` | Bot AI tests | No changes (existing tests verify behavior preserved) |

---

## Chunk 1: Bot Hot Path Optimizations (Part C)

### Task 1: Baseline — Verify All Existing Tests Pass

**Files:**
- Test: `tests/bot.test.js`
- Test: `tests/simulation-engine.test.js`

- [ ] **Step 1: Run full test suite to establish baseline**

Run: `npm test`
Expected: All tests PASS. Record output for comparison.

- [ ] **Step 2: Commit baseline confirmation (no code changes)**

No commit needed — this is just a verification step.

---

### Task 2: C4 — In-Place Card Mutation in `applyActionToClone`

This is done first because it's the safest isolated change and sets up C5.

**Files:**
- Modify: `public/bot.js:784-854` (function `applyActionToClone`)

- [ ] **Step 1: Run existing tests to confirm they pass before changes**

Run: `npm test`
Expected: All PASS

- [ ] **Step 2: Modify `applyActionToClone` to mutate cards in-place**

In `public/bot.js`, replace the entire `applyActionToClone` function (lines 784-854) with this version that mutates existing card objects instead of creating new ones:

```js
function applyActionToClone(clone, playerIndex, action) {
  const player = clone.players[playerIndex];
  const grid = player.grid;

  if (action.type === 'construct') {
    if (action.source === 'discard' && clone.discard.length > 0) {
      const drawn = clone.discard.pop();
      const target = grid[action.row][action.col];
      // Discard old card
      clone.discard.push({ value: target.value, color: target.color });
      // Mutate card in-place
      target.value = drawn.value;
      target.color = drawn.color;
      target.faceUp = true;
      target.hasPrism = false;
      target.immune = false;
    } else if (action.source === 'deck_discard') {
      // Draw random card, discard it, reveal face-down
      const randomCard = generateRandomCard();
      clone.discard.push(randomCard);
      clone.deckLength = Math.max(0, clone.deckLength - 1);
      if (action.revealRow !== undefined) {
        grid[action.revealRow][action.revealCol].faceUp = true;
      }
    } else {
      // Construct from deck
      const randomCard = generateRandomCard();
      const target = grid[action.row][action.col];
      clone.discard.push({ value: target.value, color: target.color });
      // Mutate card in-place
      target.value = randomCard.value;
      target.color = randomCard.color;
      target.faceUp = true;
      target.hasPrism = false;
      target.immune = false;
      clone.deckLength = Math.max(0, clone.deckLength - 1);
    }
  } else if (action.type === 'attack') {
    const defender = clone.players[action.defenderIndex];
    const attackerCard = grid[action.attackerRow][action.attackerCol];
    const defenderCard = defender.grid[action.defenderRow][action.defenderCol];

    // Reveal cost card
    if (action.revealRow !== undefined) {
      grid[action.revealRow][action.revealCol].faceUp = true;
    }

    // Save values before swap
    const aVal = attackerCard.value, aCol = attackerCard.color;
    const dVal = defenderCard.value, dCol = defenderCard.color;

    // Mutate attacker cell in-place
    attackerCard.value = dVal;
    attackerCard.color = dCol;
    attackerCard.faceUp = true;
    attackerCard.hasPrism = false;
    attackerCard.immune = false;

    // Mutate defender cell in-place
    defenderCard.value = aVal;
    defenderCard.color = aCol;
    defenderCard.faceUp = true;
    defenderCard.hasPrism = false;
    defenderCard.immune = true;
  } else if (action.type === 'secure') {
    grid[action.row][action.col].hasPrism = true;
    player.prismsRemaining--;
  }
}
```

- [ ] **Step 3: Run tests to verify behavior preserved**

Run: `npm test`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add public/bot.js
git commit -m "perf: mutate cards in-place in applyActionToClone (C4)"
```

---

### Task 3: C3 — Inline Grid Scans with Reservoir Sampling in `generateRandomAction`

**Files:**
- Modify: `public/bot.js:878-941` (function `generateRandomAction`)

- [ ] **Step 1: Replace `generateRandomAction` with reservoir sampling version**

In `public/bot.js`, replace the entire `generateRandomAction` function (lines 878-941) with this version that avoids array allocations:

```js
function generateRandomAction(clone, playerIndex) {
  const player = clone.players[playerIndex];
  const grid = player.grid;

  // Reservoir sampling: pick one random face-down and one random visible-unprismed position
  // without allocating arrays
  let faceDownCount = 0, visibleUnprismedCount = 0;
  let fdR = -1, fdC = -1, vuR = -1, vuC = -1;
  let allCount = 0, allR = -1, allC = -1; // for construct target (any non-prismed)

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (!card.faceUp) {
        faceDownCount++;
        if (Math.random() * faceDownCount < 1) { fdR = r; fdC = c; }
        allCount++;
        if (Math.random() * allCount < 1) { allR = r; allC = c; }
      } else if (!card.hasPrism) {
        visibleUnprismedCount++;
        if (Math.random() * visibleUnprismedCount < 1) { vuR = r; vuC = c; }
        allCount++;
        if (Math.random() * allCount < 1) { allR = r; allC = c; }
      }
    }
  }

  // 70% construct, 15% attack, 15% secure
  const roll = Math.random();

  if (roll < 0.15 && faceDownCount > 0 && visibleUnprismedCount > 0) {
    // Try attack — find first valid target
    for (let di = 0; di < clone.players.length; di++) {
      if (di === playerIndex) continue;
      const defGrid = clone.players[di].grid;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const card = defGrid[r][c];
          if (card.faceUp && !card.hasPrism && !card.immune) {
            if (vuR >= 0 && card.value > grid[vuR][vuC].value) {
              return {
                type: 'attack',
                attackerRow: vuR, attackerCol: vuC,
                defenderIndex: di,
                defenderRow: r, defenderCol: c,
                revealRow: fdR, revealCol: fdC,
              };
            }
          }
        }
      }
    }
  }

  if (roll < 0.30 && visibleUnprismedCount > 0 && player.prismsRemaining > 0) {
    // Try secure
    if (vuR >= 0 && grid[vuR][vuC].value >= 5) {
      return { type: 'secure', row: vuR, col: vuC };
    }
  }

  // Default: construct
  if (allCount === 0) {
    return { type: 'construct', source: 'deck', row: 0, col: 0 };
  }

  // Sometimes use discard
  if (clone.discard.length > 0 && Math.random() < 0.3) {
    return { type: 'construct', source: 'discard', row: allR, col: allC };
  }

  // Sometimes use deck_discard for face-down
  if (faceDownCount > 0 && Math.random() < 0.2) {
    return { type: 'construct', source: 'deck_discard', revealRow: fdR, revealCol: fdC };
  }

  return { type: 'construct', source: 'deck', row: allR, col: allC };
}
```

- [ ] **Step 2: Run tests to verify behavior preserved**

Run: `npm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add public/bot.js
git commit -m "perf: inline grid scans with reservoir sampling in generateRandomAction (C3)"
```

---

### Task 4: C5 — Clone Optimization

**Files:**
- Modify: `public/bot.js:753-778` (function `cloneGameForSim`)

- [ ] **Step 1: Update `cloneGameForSim` to handle both real game objects and clones**

In `public/bot.js`, replace `cloneGameForSim` (lines 753-778) with:

```js
function cloneGameForSim(game) {
  const players = game.players.map((p) => {
    const grid = [
      p.grid[0].map(c => ({ value: c.value, color: c.color, faceUp: c.faceUp, hasPrism: c.hasPrism, immune: c.immune })),
      p.grid[1].map(c => ({ value: c.value, color: c.color, faceUp: c.faceUp, hasPrism: c.hasPrism, immune: c.immune })),
      p.grid[2].map(c => ({ value: c.value, color: c.color, faceUp: c.faceUp, hasPrism: c.hasPrism, immune: c.immune })),
    ];
    return {
      name: p.name, isBot: p.isBot, difficulty: p.difficulty,
      prismsRemaining: p.prismsRemaining, grid,
    };
  });

  return {
    players,
    deckLength: game.deck ? game.deck.length : (game.deckLength || 0),
    discard: game.discard.map(c => ({ value: c.value, color: c.color })),
    cumulativeScores: [...game.cumulativeScores],
    phase: game.phase,
    currentPlayerIndex: game.currentPlayerIndex,
  };
}
```

The key change: `game.deck ? game.deck.length : (game.deckLength || 0)` handles both real game objects (which have `deck` array) and clone objects (which have `deckLength` number). This lets us avoid an unnecessary property access pattern.

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add public/bot.js
git commit -m "perf: optimize cloneGameForSim to handle both real and clone objects (C5)"
```

---

### Task 5: C1 + C2 — Reduce Iterations and Pre-filter Candidates

These are combined because C2 replaces the entire MC loop in `chooseHardAction`, which includes the iteration count (C1).

**Files:**
- Modify: `public/bot.js:631-651` (function `chooseHardAction`)

- [ ] **Step 1: Replace `chooseHardAction` with pre-filtering + reduced iterations**

In `public/bot.js`, replace the `chooseHardAction` function (lines 631-651) with:

```js
function chooseHardAction(game, playerIndex) {
  const candidates = generateAllCandidateActions(game, playerIndex);

  if (candidates.length === 0) {
    return buildConstructAction(game, playerIndex, 'hard');
  }

  // Quick-score: evaluate each candidate with a single board eval (no MC rollouts)
  const MAX_MC_CANDIDATES = 10;
  let mcCandidates = candidates;

  if (candidates.length > MAX_MC_CANDIDATES) {
    const scored = candidates.map(candidate => {
      const clone = cloneGameForSim(game);
      applyActionToClone(clone, playerIndex, candidate);
      return { candidate, quickScore: evaluateBoard(clone, playerIndex) };
    });
    scored.sort((a, b) => b.quickScore - a.quickScore);
    mcCandidates = scored.slice(0, MAX_MC_CANDIDATES).map(s => s.candidate);
  }

  // Run Monte Carlo only on top candidates with reduced iterations (20 instead of 50)
  let bestAction = mcCandidates[0];
  let bestScore = -Infinity;

  for (const candidate of mcCandidates) {
    const score = simulateGame(game, playerIndex, candidate, 3, 20);
    if (score > bestScore) {
      bestScore = score;
      bestAction = candidate;
    }
  }

  return bestAction;
}
```

- [ ] **Step 2: Run tests to verify behavior preserved**

Run: `npm test`
Expected: All PASS. Hard bot tests should still pass since the bot still uses MC-based utility reasoning — just faster.

- [ ] **Step 3: Commit**

```bash
git add public/bot.js
git commit -m "perf: pre-filter candidates (top 10) and reduce MC iterations 50→20 (C1+C2)"
```

---

### Task 6: Run Full Test Suite — Verify All Bot Optimizations

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All PASS

- [ ] **Step 2: Quick smoke test — run a small simulation to confirm speed improvement**

Run: `node -e "const { runSimulation } = await import('./public/simulation-engine.js'); const t = Date.now(); runSimulation({ gameCount: 10, playerCount: 4, difficulties: ['hard','hard','hard','hard'], config: {} }); console.log('10 hard games:', Date.now() - t, 'ms');" --input-type=module`

Expected: Significantly faster than before (rough target: <5s for 10 hard 4-player games vs ~30s before).

---

## Chunk 2: Parallel Web Workers Pool (Part B)

### Task 7: Extract `runBatch` from `runSimulation`

**Files:**
- Modify: `public/simulation-engine.js:426-441`
- Test: `tests/simulation-engine.test.js`

- [ ] **Step 1: Write failing test for `runBatch`**

Add to `tests/simulation-engine.test.js`:

```js
import { runSimulation, runBatch, computeSummary, median, stdDev, wilsonCI, buildHistogram } from '../public/simulation-engine.js';
```

Update the import at line 3 to add `runBatch` and `computeSummary`.

Then add a new describe block:

```js
describe('runBatch', () => {
  it('should return raw games array without summary', () => {
    const games = runBatch({
      gameCount: 5,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
    });
    assert.ok(Array.isArray(games));
    assert.equal(games.length, 5);
    for (const g of games) {
      assert.ok(typeof g.winner === 'number');
      assert.ok(Array.isArray(g.finalScores));
      assert.ok(Array.isArray(g.roundDetails));
      assert.ok(typeof g.rounds === 'number');
    }
  });

  it('should call onProgress callback', () => {
    let calls = 0;
    runBatch({
      gameCount: 3,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
      onProgress: () => { calls++; },
    });
    assert.equal(calls, 3);
  });
});

describe('computeSummary', () => {
  it('should produce same summary whether called via runSimulation or separately', () => {
    const params = {
      gameCount: 5,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
    };
    const { games, summary: expected } = runSimulation(params);
    const actual = computeSummary(games, params.playerCount, params.difficulties);
    assert.equal(actual.totalGames, expected.totalGames);
    assert.deepEqual(actual.wins, expected.wins);
    assert.equal(actual.avgRounds, expected.avgRounds);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/simulation-engine.test.js`
Expected: FAIL — `runBatch` and `computeSummary` are not exported

- [ ] **Step 3: Extract `runBatch` and export `computeSummary`**

In `public/simulation-engine.js`, replace the `runSimulation` export (lines 421-441) with:

```js
/**
 * Run a batch of games and return raw results (no summary).
 * Used by workers — each worker runs a chunk and returns games[].
 * @param {{ gameCount: number, playerCount: number, difficulties: string[], config?: object, onProgress?: function }} params
 * @returns {object[]} Raw games array
 */
export function runBatch({ gameCount, playerCount, difficulties, config = {}, onProgress }) {
  const games = [];

  for (let g = 0; g < gameCount; g++) {
    const result = playGame(playerCount, difficulties, config);
    games.push(result);

    if (onProgress) {
      onProgress(g + 1, gameCount);
    }
  }

  return games;
}

// Export computeSummary for main-thread use after merging worker results
export { computeSummary };

/**
 * Run a batch of bot-vs-bot simulations.
 * Backward-compatible wrapper: calls runBatch then computeSummary.
 * @param {{ gameCount: number, playerCount: number, difficulties: string[], config?: object, onProgress?: function }} params
 * @returns {{ games: object[], summary: object }}
 */
export function runSimulation({ gameCount, playerCount, difficulties, config = {}, onProgress }) {
  const games = runBatch({ gameCount, playerCount, difficulties, config, onProgress });
  const summary = computeSummary(games, playerCount, difficulties);
  return { games, summary };
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/simulation-engine.test.js`
Expected: All PASS (both new and existing tests)

- [ ] **Step 5: Commit**

```bash
git add public/simulation-engine.js tests/simulation-engine.test.js
git commit -m "refactor: extract runBatch and export computeSummary from simulation-engine"
```

---

### Task 8: Update `simulator-worker.js` to Use `runBatch`

**Files:**
- Modify: `public/simulator-worker.js`

- [ ] **Step 1: Rewrite `simulator-worker.js` to use `runBatch` and return raw games**

Replace the entire file with:

```js
import { runBatch } from './simulation-engine.js';

self.onmessage = (e) => {
  const params = e.data;
  const games = runBatch({
    ...params,
    onProgress: (completed, total) => {
      self.postMessage({ type: 'progress', completed, total });
    },
  });
  self.postMessage({ type: 'done', games });
};
```

- [ ] **Step 2: Commit**

```bash
git add public/simulator-worker.js
git commit -m "refactor: use runBatch in simulator worker, return raw games array"
```

---

### Task 9: Implement Worker Pool in `simulator.js`

**Files:**
- Modify: `public/simulator.js`

- [ ] **Step 1: Add worker pool management at top of file**

After the existing `let activeWorker = null;` line (line 110), replace lines 110-113 with:

```js
let workerPool = [];
let lastResults = null;
let lastParams = null;
```

Add a worker pool creation function after the `validate` function (after line 108):

```js
function createWorkerPool() {
  const size = Math.min(navigator.hardwareConcurrency || 4, 8);
  workerPool = [];
  for (let i = 0; i < size; i++) {
    try {
      workerPool.push(new Worker('simulator-worker.js', { type: 'module' }));
    } catch (e) {
      // Module workers not supported — fall back to sync
      workerPool = [];
      return;
    }
  }
}
```

In the DOMContentLoaded handler (around line 22), add after the first line:

```js
createWorkerPool();
```

- [ ] **Step 2: Rewrite `handleRun` to distribute work across worker pool**

Replace the entire `handleRun` function (lines 114-166) with:

```js
async function handleRun() {
  const params = getParams();
  const error = validate(params);

  if (error) {
    $('validation-msg').textContent = error;
    $('validation-msg').classList.remove('hidden');
    return;
  }
  $('validation-msg').classList.add('hidden');

  // Show progress, disable button
  $('run-btn').disabled = true;
  $('progress-container').classList.remove('hidden');
  $('progress-fill').style.width = '0%';
  $('progress-text').textContent = `0 / ${params.gameCount}`;

  if (workerPool.length > 0) {
    runWithWorkerPool(params);
  } else {
    runSimulationFallback(params);
  }
}

function runWithWorkerPool(params) {
  const poolSize = Math.min(workerPool.length, params.gameCount);
  const chunkSize = Math.ceil(params.gameCount / poolSize);
  const completedPerWorker = new Array(poolSize).fill(0);
  const totalPerWorker = [];
  const allGames = [];
  let workersFinished = 0;

  for (let i = 0; i < poolSize; i++) {
    const workerGameCount = Math.min(chunkSize, params.gameCount - i * chunkSize);
    if (workerGameCount <= 0) {
      workersFinished++;
      continue;
    }
    totalPerWorker.push(workerGameCount);
    const worker = workerPool[i];

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        completedPerWorker[i] = e.data.completed;
        const totalCompleted = completedPerWorker.reduce((a, b) => a + b, 0);
        const pct = (totalCompleted / params.gameCount * 100).toFixed(0);
        $('progress-fill').style.width = pct + '%';
        $('progress-text').textContent = `${totalCompleted} / ${params.gameCount}`;
      }
      if (e.data.type === 'done') {
        allGames.push(...e.data.games);
        workersFinished++;

        if (workersFinished >= poolSize) {
          // All workers done — compute summary on main thread
          import('./simulation-engine.js').then(({ computeSummary }) => {
            const summary = computeSummary(allGames, params.playerCount, params.difficulties);
            onSimulationComplete({ games: allGames, summary }, params);
          });
        }
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      workersFinished++;
      // If all workers errored, fallback
      if (workersFinished >= poolSize && allGames.length === 0) {
        runSimulationFallback(params);
      }
    };

    worker.postMessage({
      gameCount: workerGameCount,
      playerCount: params.playerCount,
      difficulties: params.difficulties,
      config: params.config,
    });
  }
}
```

- [ ] **Step 3: Update `handleReset` to include all chart keys**

In the `handleReset` function, verify the `charts` reset line includes all chart keys. The existing code at line 510 already has:

```js
charts = { winrate: null, breakdown: null, progression: null, histogram: null, donut: null };
```

This is already correct — no change needed.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: All PASS (the simulator.js changes are UI-only, not testable via Node)

- [ ] **Step 5: Commit**

```bash
git add public/simulator.js
git commit -m "feat: parallel Web Worker pool for simulator (Part B)"
```

---

### Task 10: Manual Smoke Test

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Open simulator in browser**

Open: `http://localhost:3000/simulator`

- [ ] **Step 3: Test with hard bots**

1. Set 4 players, all Hard difficulty
2. Set 100 games
3. Click "Run Simulation"
4. Verify: progress bar updates smoothly, results appear
5. Verify: all 5 charts render (win rate, breakdown, progression, histogram, donut)
6. Verify: stat cards show values
7. Verify: detailed statistics table renders

- [ ] **Step 4: Test speed improvement**

Compare runtime of 100 hard-bot 4-player games. Target: <5s (was ~30s).

- [ ] **Step 5: Test AI analysis still works**

Click "Analyze with AI" after simulation completes. Verify response appears.

- [ ] **Step 6: Test fallback**

Open browser DevTools console, verify no errors. If testing fallback path: temporarily break Worker creation and verify sync fallback works.

---

### Task 11: Final Commit and Cleanup

- [ ] **Step 1: Run full test suite one final time**

Run: `npm test`
Expected: All PASS

- [ ] **Step 2: Create summary commit if any final adjustments were needed**

Only if adjustments were made during smoke testing.
