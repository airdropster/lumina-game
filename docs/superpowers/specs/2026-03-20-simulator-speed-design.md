# Simulator Speed Optimization — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Goal:** Make the LUMINA Party Simulator 5-10x faster by parallelizing game execution across CPU cores and optimizing the hard bot Monte Carlo hot path.

---

## Context

The simulator runs bot-vs-bot games to test game balance. With hard bots, each game takes ~300ms because `chooseHardAction()` runs 50 Monte Carlo iterations across ~30 candidate actions per bot turn. A 100-game simulation takes ~30s, blocking meaningful batch testing.

### Current Architecture

```
simulator.js  →  1 Worker (simulator-worker.js)  →  runSimulation() loop
                                                      └── playGame() × N
                                                            └── playRound()
                                                                  └── chooseBotAction() per turn
                                                                        └── chooseHardAction()
                                                                              └── 30 candidates × 50 MC iters
```

### Bottleneck Profile

Per hard bot turn decision:
- `generateAllCandidateActions()`: ~20-40 candidates
- `simulateGame()` per candidate: 50 iterations × (`cloneGameForSim()` + `applyActionToClone()` + 3×N random turns + `evaluateBoard()`)
- Total: ~1000-2000 clone-simulate-evaluate cycles per turn decision
- Allocations: each cycle creates ~15-20 new objects (card objects in `applyActionToClone`, arrays in `getFaceDownPositions`/`getVisibleUnprismedPositions`)

---

## Part B: Parallel Web Workers Pool

### Design

Replace the single Worker with a pool of `navigator.hardwareConcurrency` Workers (capped at 8, minimum 2). Games are split into equal chunks and distributed across workers. Results are merged on the main thread.

### Architecture

```
simulator.js (main thread)
  ├── createWorkerPool(size)     — spawns N workers on page load
  ├── handleRun()                — splits gameCount into N chunks
  │     ├── Worker 1: runSimulation({games: 0..24, ...params})
  │     ├── Worker 2: runSimulation({games: 25..49, ...params})
  │     ├── Worker 3: runSimulation({games: 50..74, ...params})
  │     └── Worker 4: runSimulation({games: 75..99, ...params})
  ├── mergeResults(rawGamesArrays) — concatenate game result arrays
  └── computeSummary(mergedGames)  — run once on merged data
```

### Changes to `simulation-engine.js`

`runSimulation()` currently returns `{ summary, games }`. It will be split:

- `runBatch(params)` — runs `params.gameCount` games, calls `onProgress`, returns raw `games[]` array only (no summary computation)
- `computeSummary(games, playerCount, difficulties)` — already exists, no change needed
- `runSimulation(params)` — kept as a wrapper that calls `runBatch` then `computeSummary`, preserving backward compatibility

### Changes to `simulator-worker.js`

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

### Changes to `simulator.js`

- On page load: create worker pool via `createWorkerPool()`
- `handleRun()`:
  1. Determine pool size: `Math.min(navigator.hardwareConcurrency || 4, 8, gameCount)`
  2. Split `gameCount` into `poolSize` chunks
  3. Post each chunk to a worker with its params + chunk-specific `gameCount`
  4. Track progress: sum each worker's `completed` count, update progress bar with aggregate
  5. When all workers report `done`: concatenate all `games[]` arrays, call `computeSummary()` in main thread
  6. Render results
- Fallback: if Worker construction fails (same try/catch as before), fall back to synchronous `runSimulation()` in main thread
- Worker pool is reused across runs (not recreated each time)

### Progress Tracking

Each worker reports `{ type: 'progress', completed, total }` for its chunk. Main thread maintains a `completedPerWorker[]` array and sums them for the progress bar display.

---

## Part C: Hard Bot Hot Path Optimization

All changes are in `public/bot.js`. No API surface changes.

### C1: Reduce Monte Carlo Iterations (50 → 20)

**Location:** `chooseHardAction()` line 643

```js
// Before
const score = simulateGame(game, playerIndex, candidate, 3, 50);

// After
const score = simulateGame(game, playerIndex, candidate, 3, 20);
```

**Rationale:** 20 iterations provides sufficient signal to rank candidates. The standard error of the mean decreases as 1/sqrt(n) — going from 50 to 20 increases SE by only ~58%, while giving 2.5x speedup. For action selection (ordinal ranking), this is acceptable.

### C2: Pre-filter Candidates (Top 10 by Quick-Score)

**Location:** `chooseHardAction()`, between candidate generation and MC loop

Add a quick-score pass that evaluates each candidate with a single `cloneGameForSim` + `applyActionToClone` + `evaluateBoard` (no random rollouts). Keep only the top 10 candidates for full MC evaluation.

```js
function chooseHardAction(game, playerIndex) {
  const candidates = generateAllCandidateActions(game, playerIndex);
  if (candidates.length === 0) {
    return buildConstructAction(game, playerIndex, 'hard');
  }

  // Quick-score: evaluate each candidate with a single board eval (no MC)
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

  // Run Monte Carlo only on top candidates
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

**Impact:** If 30 candidates → 10 for MC, that's 10×20=200 MC iterations instead of 30×50=1500. Combined with C1, this is a **7.5x reduction** in MC work.

### C3: Cache Grid Scans in `generateRandomAction`

**Location:** `generateRandomAction()` line 878 and `simulateGame()` line 1103

`generateRandomAction()` calls `getFaceDownPositions(grid)` and `getVisibleUnprismedPositions(grid)` every invocation. In the MC inner loop, this function is called `20 iterations × 3×numPlayers` times per candidate = ~240-480 times per candidate.

The grid changes between calls (actions mutate it), so we can't fully cache. But we can avoid the array allocation by computing positions inline:

```js
function generateRandomAction(clone, playerIndex) {
  const player = clone.players[playerIndex];
  const grid = player.grid;

  // Compute positions inline without array allocation
  let faceDownCount = 0, visibleUnprismedCount = 0;
  let fdR = -1, fdC = -1, vuR = -1, vuC = -1; // track one random position of each

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (!card.faceUp) {
        faceDownCount++;
        // Reservoir sampling: pick random face-down position
        if (Math.random() * faceDownCount < 1) { fdR = r; fdC = c; }
      } else if (!card.hasPrism) {
        visibleUnprismedCount++;
        if (Math.random() * visibleUnprismedCount < 1) { vuR = r; vuC = c; }
      }
    }
  }

  // ... use fdR/fdC and vuR/vuC instead of arrays
}
```

This eliminates ~500 array allocations per candidate evaluation.

**Note:** The `generateRandomAction` function only needs one random position for most operations (attack picks one attacker, secure picks one card, construct picks one target). Reservoir sampling gives a uniformly random pick without building the full array.

### C4: Mutate Cards In-Place in `applyActionToClone`

**Location:** `applyActionToClone()` line 784

Currently creates new card objects like `{ value, color, faceUp: true, hasPrism: false, immune: false }`. Instead, mutate the existing card object properties directly:

```js
// Before (construct from discard)
grid[action.row][action.col] = {
  value: drawn.value, color: drawn.color,
  faceUp: true, hasPrism: false, immune: false,
};

// After
const target = grid[action.row][action.col];
target.value = drawn.value;
target.color = drawn.color;
target.faceUp = true;
target.hasPrism = false;
target.immune = false;
```

This eliminates object creation in the hottest loop. Applied to all three action types (construct, attack, secure).

### C5: Clone Optimization — Flatten the Clone

**Location:** `cloneGameForSim()` line 753

The current clone creates nested objects: `players[].grid[][]` with full card objects. Optimize by reducing allocations:

```js
function cloneGameForSim(game) {
  const players = game.players.map((p) => {
    // Reuse row arrays, clone card objects with Object.assign
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

The main win here is that with C4 (in-place mutation), we don't need to allocate new card objects during simulation — only during initial clone. This makes the clone function the only allocation point.

---

## Expected Performance

| Optimization | Speedup Factor | Cumulative |
|---|---|---|
| C1: 50→20 iterations | 2.5x | 2.5x |
| C2: Pre-filter to top 10 | ~2-3x | 5-7.5x |
| C3: Inline grid scans | ~1.2x | 6-9x |
| C4: In-place mutation | ~1.1x | 6.6-9.9x |
| C5: Clone optimization | ~1.05x | ~7-10x |
| B: Parallel workers (4 cores) | ~3.5x | **~25-35x** |

**100 hard-bot games: ~30s → ~1-2s**

## Files Changed

| File | Change |
|---|---|
| `public/bot.js` | C1-C5: optimize `chooseHardAction`, `simulateGame`, `generateRandomAction`, `applyActionToClone`, `cloneGameForSim` |
| `public/simulation-engine.js` | Extract `runBatch()` from `runSimulation()` |
| `public/simulator-worker.js` | Use `runBatch()` instead of `runSimulation()` |
| `public/simulator.js` | Worker pool management, chunk splitting, result merging |

## What Stays The Same

- `computeSummary()` API unchanged
- All stats, charts, AI analysis work identically
- Easy/medium bot paths untouched (they don't use Monte Carlo)
- `runSimulation()` still works as before (backward compatible wrapper)
- No new dependencies

## Testing

- Run simulation with 2/4/6 players at all difficulty levels, verify results are statistically comparable to pre-optimization (same win rate distributions within CI)
- Verify Worker pool fallback works when Workers unavailable
- Verify progress bar shows correct aggregate progress
- Compare hard bot decision quality: run 50 games before/after, check win rates are within 5% margin
