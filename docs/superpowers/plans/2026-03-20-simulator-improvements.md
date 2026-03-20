# Simulator Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Party Simulator fast (Web Worker), add comprehensive statistics, and integrate AI balance analysis via Gemini Flash.

**Architecture:** Three independent improvements layered onto the existing simulator: (1) Web Worker wraps the synchronous `runSimulation()` to unblock the UI thread, (2) `computeSummary()` is extended with statistical helpers (median, stdDev, Wilson CI, histograms) and new UI elements display them, (3) a server-side `/api/analyze` proxy route sends simulation results to Gemini Flash for balance analysis.

**Tech Stack:** Vanilla JS (ES modules), Chart.js 4.x (CDN), Web Workers (`type: 'module'`), Express, Google Gemini Flash API

**Spec:** `docs/superpowers/specs/2026-03-20-simulator-improvements-design.md`

---

## Task 1: Statistical helper functions + tests (TDD)

**Files:**
- Modify: `public/simulation-engine.js` (add helpers before `computeSummary`)
- Modify: `tests/simulation-engine.test.js` (add new describe block)

- [ ] **Step 1: Write failing tests for statistical helpers**

Add this describe block at the END of `tests/simulation-engine.test.js`. First add the import — the helpers will be exported individually:

```js
import { median, stdDev, wilsonCI, buildHistogram } from '../public/simulation-engine.js';

describe('statistical helpers', () => {
  it('median of odd-length array', () => {
    assert.equal(median([3, 1, 2]), 2);
  });

  it('median of even-length array', () => {
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  it('median of single element', () => {
    assert.equal(median([42]), 42);
  });

  it('stdDev of identical values is 0', () => {
    assert.equal(stdDev([5, 5, 5, 5]), 0);
  });

  it('stdDev of known values', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] → sample stdDev ≈ 2.138
    const result = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.ok(Math.abs(result - 2.138) < 0.01, `Expected ~2.138, got ${result}`);
  });

  it('stdDev of single element is 0', () => {
    assert.equal(stdDev([10]), 0);
  });

  it('wilsonCI returns {lower, upper} in [0,1]', () => {
    const ci = wilsonCI(30, 100);
    assert.ok(ci.lower >= 0 && ci.lower < ci.upper && ci.upper <= 1);
    // 30/100 = 0.30, 95% CI should be roughly [0.21, 0.40]
    assert.ok(Math.abs(ci.lower - 0.216) < 0.02, `lower: ${ci.lower}`);
    assert.ok(Math.abs(ci.upper - 0.400) < 0.02, `upper: ${ci.upper}`);
  });

  it('wilsonCI with 0 total returns {0, 0}', () => {
    const ci = wilsonCI(0, 0);
    assert.equal(ci.lower, 0);
    assert.equal(ci.upper, 0);
  });

  it('buildHistogram creates correct buckets', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const buckets = buildHistogram(values, 5);
    assert.equal(buckets.length, 5);
    assert.equal(buckets[0].min, 10);
    assert.ok(Math.abs(buckets[4].max - 100) < 0.01);
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    assert.equal(totalCount, 10);
  });

  it('buildHistogram handles identical values', () => {
    const buckets = buildHistogram([5, 5, 5, 5], 3);
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    assert.equal(totalCount, 4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/simulation-engine.test.js`
Expected: FAIL — `median`, `stdDev`, `wilsonCI`, `buildHistogram` are not exported

- [ ] **Step 3: Implement the four helper functions**

Add these BEFORE the `computeSummary` function in `public/simulation-engine.js` (around line 160), and export them:

```js
export function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function stdDev(arr) {
  if (arr.length <= 1) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function wilsonCI(wins, total, z = 1.96) {
  if (total === 0) return { lower: 0, upper: 0 };
  const p = wins / total;
  const denom = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denom;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

export function buildHistogram(values, bucketCount = 10) {
  if (values.length === 0) return [];
  const min = values.reduce((a, b) => Math.min(a, b), Infinity);
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
  const range = max - min || 1;
  const bucketSize = range / bucketCount;
  const buckets = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({ min: min + i * bucketSize, max: min + (i + 1) * bucketSize, count: 0 });
  }
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1);
    buckets[idx].count++;
  }
  return buckets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/simulation-engine.test.js`
Expected: ALL pass

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL pass (no regressions)

- [ ] **Step 6: Commit**

```bash
git add public/simulation-engine.js tests/simulation-engine.test.js
git commit -m "feat: add statistical helper functions (median, stdDev, wilsonCI, buildHistogram)"
```

---

## Task 2: Enhanced `computeSummary()` with full stats

**Files:**
- Modify: `public/simulation-engine.js` (expand `computeSummary`)
- Modify: `tests/simulation-engine.test.js` (add tests for enhanced summary)

- [ ] **Step 1: Write failing tests for enhanced summary fields**

Add to the END of `tests/simulation-engine.test.js`:

```js
describe('enhanced summary statistics', () => {
  // Run a small simulation once, reuse results
  const results = runSimulation({
    gameCount: 20,
    playerCount: 3,
    difficulties: ['hard', 'medium', 'easy'],
    config: {},
  });
  const { summary } = results;

  it('should include perPlayer stats', () => {
    assert.equal(summary.perPlayer.length, 3);
    for (const p of summary.perPlayer) {
      assert.ok(typeof p.wins === 'number');
      assert.ok(typeof p.winRate === 'number');
      assert.ok(typeof p.avgScore === 'number');
      assert.ok(typeof p.medianScore === 'number');
      assert.ok(typeof p.stdDev === 'number');
      assert.ok(typeof p.minScore === 'number');
      assert.ok(typeof p.maxScore === 'number');
      assert.ok(typeof p.maxWinStreak === 'number');
    }
  });

  it('perPlayer wins should sum to totalGames', () => {
    const totalWins = summary.perPlayer.reduce((s, p) => s + p.wins, 0);
    assert.equal(totalWins, 20);
  });

  it('should include perDifficulty stats', () => {
    assert.ok(summary.perDifficulty.hard);
    assert.ok(summary.perDifficulty.medium);
    assert.ok(summary.perDifficulty.easy);
    assert.ok(typeof summary.perDifficulty.hard.winRate === 'number');
  });

  it('should include scoreDistribution per player', () => {
    assert.equal(summary.scoreDistribution.length, 3);
    for (const dist of summary.scoreDistribution) {
      assert.ok(Array.isArray(dist));
      assert.ok(dist.length > 0);
      const total = dist.reduce((s, b) => s + b.count, 0);
      assert.equal(total, 20); // one entry per game
    }
  });

  it('should include bonusContributions per player', () => {
    assert.equal(summary.bonusContributions.length, 3);
    for (const bc of summary.bonusContributions) {
      const sum = bc.base + bc.column + bc.row + bc.prism;
      assert.ok(Math.abs(sum - 1.0) < 0.01, `Contributions should sum to ~1.0, got ${sum}`);
    }
  });

  it('should include roundStats', () => {
    assert.ok(typeof summary.roundStats.avgTurns === 'number');
    assert.ok(typeof summary.roundStats.minTurns === 'number');
    assert.ok(typeof summary.roundStats.maxTurns === 'number');
    assert.ok(summary.roundStats.minTurns <= summary.roundStats.maxTurns);
  });

  it('should include winRateCI per player', () => {
    assert.equal(summary.winRateCI.length, 3);
    for (const ci of summary.winRateCI) {
      assert.ok(ci.lower >= 0 && ci.upper <= 1);
      assert.ok(ci.lower <= ci.upper);
    }
  });

  it('should include scoreProgressionBands', () => {
    assert.ok(summary.scoreProgressionBands.length > 0);
    const band = summary.scoreProgressionBands[0];
    assert.equal(band.avg.length, 3);
    assert.equal(band.min.length, 3);
    assert.equal(band.max.length, 3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/simulation-engine.test.js`
Expected: FAIL — `summary.perPlayer` is undefined, etc.

- [ ] **Step 3: Expand `computeSummary()` to produce all new fields**

In `public/simulation-engine.js`, rewrite `computeSummary(games, playerCount)` to add the following after the existing return fields. The function also needs the `difficulties` parameter passed through.

Change the function signature:
```js
function computeSummary(games, playerCount, difficulties) {
```

And update the caller in `runSimulation`:
```js
const summary = computeSummary(games, playerCount, difficulties);
```

**First, modify `playRound()` to return `turns`.** In `simulation-engine.js`, change line 97 from:
```js
  return { scores, breakdowns, luminaCaller };
```
to:
```js
  return { scores, breakdowns, luminaCaller, turns };
```
The `turns` variable already exists at line 56 of `playRound()`.

**Then, add all new code to `computeSummary()`, after the existing `avgBreakdown` section but before the `return` statement.** This is one unified block:

```js
  // --- NEW: Round stats (turns per round) ---
  const allTurnCounts = [];
  for (const game of games) {
    for (const rd of game.roundDetails) {
      if (typeof rd.turns === 'number') allTurnCounts.push(rd.turns);
    }
  }
  const roundStats = {
    avgTurns: allTurnCounts.length > 0
      ? allTurnCounts.reduce((a, b) => a + b, 0) / allTurnCounts.length : 0,
    minTurns: allTurnCounts.length > 0
      ? allTurnCounts.reduce((a, b) => Math.min(a, b), Infinity) : 0,
    maxTurns: allTurnCounts.length > 0
      ? allTurnCounts.reduce((a, b) => Math.max(a, b), -Infinity) : 0,
  };

  // --- NEW: Per-player detailed stats ---
  const playerFinalScores = [];
  for (let i = 0; i < playerCount; i++) {
    playerFinalScores.push(games.map((g) => g.finalScores[i]));
  }

  // Win streaks per player
  const maxWinStreaks = new Array(playerCount).fill(0);
  const currentStreaks = new Array(playerCount).fill(0);
  for (const game of games) {
    for (let i = 0; i < playerCount; i++) {
      if (game.winner === i) {
        currentStreaks[i]++;
        maxWinStreaks[i] = Math.max(maxWinStreaks[i], currentStreaks[i]);
      } else {
        currentStreaks[i] = 0;
      }
    }
  }

  const perPlayer = [];
  for (let i = 0; i < playerCount; i++) {
    const scores = playerFinalScores[i];
    perPlayer.push({
      wins: wins[i],
      winRate: wins[i] / totalGames,
      avgScore: avgScore[i],
      medianScore: median(scores),
      stdDev: stdDev(scores),
      minScore: scores.reduce((a, b) => Math.min(a, b), Infinity),
      maxScore: scores.reduce((a, b) => Math.max(a, b), -Infinity),
      maxWinStreak: maxWinStreaks[i],
    });
  }

  // --- NEW: Per-difficulty aggregated stats ---
  // winRate = share of all games won by this difficulty tier
  const perDifficulty = {};
  if (difficulties) {
    const diffGroups = {};
    for (let i = 0; i < playerCount; i++) {
      const d = difficulties[i];
      if (!diffGroups[d]) diffGroups[d] = { wins: 0, totalScore: 0, bots: 0 };
      diffGroups[d].wins += wins[i];
      diffGroups[d].totalScore += totalScores[i];
      diffGroups[d].bots++;
    }
    for (const [d, g] of Object.entries(diffGroups)) {
      perDifficulty[d] = {
        wins: g.wins,
        games: totalGames,
        winRate: totalGames > 0 ? g.wins / totalGames : 0,
        avgScore: g.bots > 0 ? g.totalScore / (totalGames * g.bots) : 0,
        bots: g.bots,
      };
    }
  }

  // --- NEW: Score distribution (histogram per player) ---
  const scoreDistribution = [];
  for (let i = 0; i < playerCount; i++) {
    scoreDistribution.push(buildHistogram(playerFinalScores[i], 10));
  }

  // --- NEW: Bonus contributions as percentages ---
  const bonusContributions = [];
  for (let i = 0; i < playerCount; i++) {
    const b = avgBreakdown[i];
    const total = (b.base + b.column + b.row + b.prism) || 1;
    bonusContributions.push({
      base: b.base / total,
      column: b.column / total,
      row: b.row / total,
      prism: b.prism / total,
    });
  }

  // --- NEW: Wilson CI for win rates ---
  const winRateCI = [];
  for (let i = 0; i < playerCount; i++) {
    winRateCI.push(wilsonCI(wins[i], totalGames));
  }

  // --- NEW: Score progression bands (min/max per round) ---
  const scoreProgressionBands = [];
  for (let r = 0; r < maxRounds; r++) {
    const avg = [];
    const min = [];
    const max = [];
    for (let i = 0; i < playerCount; i++) {
      const values = scoresByRound[r][i];
      if (values.length > 0) {
        avg.push(values.reduce((a, b) => a + b, 0) / values.length);
        min.push(values.reduce((a, b) => Math.min(a, b), Infinity));
        max.push(values.reduce((a, b) => Math.max(a, b), -Infinity));
      } else {
        avg.push(0);
        min.push(0);
        max.push(0);
      }
    }
    scoreProgressionBands.push({ avg, min, max });
  }
```

**Replace the existing `return` statement with:**
```js
  return {
    totalGames, wins, avgScore, avgRounds, luminaCallRate,
    avgScoreByRound, avgBreakdown,
    // NEW
    perPlayer, perDifficulty, scoreDistribution,
    bonusContributions, roundStats, winRateCI, scoreProgressionBands,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/simulation-engine.test.js`
Expected: ALL pass

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL pass

- [ ] **Step 6: Commit**

```bash
git add public/simulation-engine.js tests/simulation-engine.test.js
git commit -m "feat: add enhanced statistics to computeSummary (perPlayer, distributions, CI, streaks)"
```

---

## Task 3: Web Worker for non-blocking simulation

**Files:**
- Create: `public/simulator-worker.js`
- Modify: `public/simulator.js` (replace sync call with Worker)

- [ ] **Step 1: Create the Web Worker file**

Create `public/simulator-worker.js`:

```js
import { runSimulation } from './simulation-engine.js';

self.onmessage = (e) => {
  const params = e.data;
  const results = runSimulation({
    ...params,
    onProgress: (completed, total) => {
      self.postMessage({ type: 'progress', completed, total });
    },
  });
  self.postMessage({ type: 'results', results });
};
```

- [ ] **Step 2: Modify `simulator.js` to use the Worker**

Replace the `import { runSimulation }` line at the top with nothing (remove it — we'll use the Worker instead).

Replace the `handleRun()` function with a Worker-based version:

```js
let activeWorker = null;

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

  // Hide previous AI results
  $('ai-section')?.classList.add('hidden');
  $('ai-result')?.classList.add('hidden');

  try {
    const worker = new Worker('simulator-worker.js', { type: 'module' });
    activeWorker = worker;

    worker.postMessage({
      gameCount: params.gameCount,
      playerCount: params.playerCount,
      difficulties: params.difficulties,
      config: params.config,
    });

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        const { completed, total } = e.data;
        const pct = (completed / total * 100).toFixed(0);
        $('progress-fill').style.width = pct + '%';
        $('progress-text').textContent = `${completed} / ${total}`;
      }
      if (e.data.type === 'results') {
        worker.terminate();
        activeWorker = null;
        onSimulationComplete(e.data.results, params);
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      worker.terminate();
      activeWorker = null;
      // Fallback to synchronous
      runSimulationFallback(params);
    };
  } catch (e) {
    // Module Worker not supported — fallback
    console.warn('Module Worker not supported, falling back to sync:', e.message);
    runSimulationFallback(params);
  }
}

async function runSimulationFallback(params) {
  // Dynamic import for fallback
  const { runSimulation } = await import('./simulation-engine.js');
  await new Promise((r) => setTimeout(r, 50));
  const results = runSimulation({
    ...params,
    onProgress: (completed, total) => {
      const pct = (completed / total * 100).toFixed(0);
      $('progress-fill').style.width = pct + '%';
      $('progress-text').textContent = `${completed} / ${total}`;
    },
  });
  onSimulationComplete(results, params);
}

let lastResults = null;
let lastParams = null;

function onSimulationComplete(results, params) {
  lastResults = results;
  lastParams = params;

  $('progress-container').classList.add('hidden');
  $('run-btn').disabled = false;
  $('empty-state').classList.add('hidden');
  $('results-content').classList.remove('hidden');

  // Show AI section if available
  if ($('ai-section')) {
    $('ai-section').classList.remove('hidden');
    $('ai-result')?.classList.add('hidden');
  }

  renderResults(results, params);
}
```

- [ ] **Step 3: Test manually in browser**

Run: `npm start`
Open: `http://localhost:3000/simulator`
1. Set 100 games, 4 hard bots
2. Click "Run Simulation"
3. Verify: progress bar animates smoothly, UI stays responsive
4. Verify: results appear after completion

- [ ] **Step 4: Run full test suite (no regressions)**

Run: `npm test`
Expected: ALL pass

- [ ] **Step 5: Commit**

```bash
git add public/simulator-worker.js public/simulator.js
git commit -m "feat: use Web Worker for non-blocking simulation with fallback"
```

---

## Task 4: Expanded UI — stat cards, new charts, detail table

**Files:**
- Modify: `public/simulator.html` (add stat cards, canvases, table, AI section)
- Modify: `public/simulator.css` (styles for new elements)
- Modify: `public/simulator.js` (render new stats, charts, table)

- [ ] **Step 1: Update `simulator.html` — expand stat cards from 4 to 8**

Replace the existing `.stat-cards` div with:

```html
<div class="stat-cards">
  <div class="stat-card"><span class="stat-value" id="stat-games">—</span><span class="stat-label">Games</span></div>
  <div class="stat-card"><span class="stat-value" id="stat-rounds">—</span><span class="stat-label">Avg Rounds</span></div>
  <div class="stat-card"><span class="stat-value" id="stat-lumina">—</span><span class="stat-label">LUMINA Rate</span></div>
  <div class="stat-card"><span class="stat-value" id="stat-winning">—</span><span class="stat-label">Avg Win Score</span></div>
  <div class="stat-card"><span class="stat-value" id="stat-median">—</span><span class="stat-label">Median Score</span></div>
  <div class="stat-card"><span class="stat-value" id="stat-stddev">—</span><span class="stat-label">Score Std Dev</span></div>
  <div class="stat-card"><span class="stat-value" id="stat-range">—</span><span class="stat-label">Score Range</span></div>
  <div class="stat-card"><span class="stat-value" id="stat-turns">—</span><span class="stat-label">Avg Turns/Round</span></div>
</div>
```

- [ ] **Step 2: Add new chart canvases and detail sections to HTML**

After the existing 3 chart containers in `#results-content`, add:

```html
<div class="chart-container"><canvas id="chart-histogram"></canvas></div>
<div class="chart-container chart-container-sm"><canvas id="chart-donut"></canvas></div>

<details class="detail-section">
  <summary>Detailed Statistics</summary>
  <div class="detail-tables">
    <div id="player-stats-table"></div>
    <div id="difficulty-stats-table"></div>
  </div>
</details>

<div id="ai-section" class="ai-section hidden">
  <button id="analyze-btn" class="btn-primary">Analyze with AI</button>
  <div id="ai-loading" class="hidden">
    <span class="spinner"></span> Analyzing with Gemini...
  </div>
  <div id="ai-result" class="hidden">
    <h3>AI Balance Analysis</h3>
    <div id="ai-text"></div>
    <button id="reanalyze-btn" class="btn-ghost">Re-analyze</button>
  </div>
</div>
```

- [ ] **Step 3: Add CSS for new elements**

Append to `public/simulator.css`:

```css
/* Donut chart smaller container */
.chart-container-sm {
  max-width: 400px;
}

/* Detail section (collapsible) */
.detail-section {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  margin-bottom: 16px;
}
.detail-section summary {
  padding: 12px 16px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: #94a3b8;
  user-select: none;
}
.detail-section summary:hover { color: #f8fafc; }
.detail-tables {
  padding: 0 16px 16px;
  overflow-x: auto;
}
.detail-tables table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin-bottom: 16px;
}
.detail-tables th,
.detail-tables td {
  padding: 8px 12px;
  text-align: right;
  border-bottom: 1px solid #1e293b;
}
.detail-tables th {
  text-align: left;
  color: #94a3b8;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.detail-tables td:first-child { text-align: left; color: #94a3b8; }

/* AI section */
.ai-section {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}
.ai-section h3 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 12px;
  color: #f8fafc;
}
#ai-text {
  font-size: 0.85rem;
  color: #cbd5e1;
  line-height: 1.6;
  white-space: pre-wrap;
  margin-bottom: 12px;
}
#ai-text ul { padding-left: 20px; margin: 8px 0; }
#ai-text li { margin-bottom: 4px; }
#ai-text strong { color: #f8fafc; }

/* Spinner */
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #334155;
  border-top-color: #60a5fa;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
  margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg); } }

#ai-loading {
  font-size: 0.85rem;
  color: #94a3b8;
  padding: 8px 0;
}

/* NOTE: Do NOT add a duplicate @media rule for .stat-cards — it already exists
   in the existing simulator.css at line 248. Only add new responsive rules here
   if needed for the new elements. */
```

- [ ] **Step 4: Update `renderResults()` in `simulator.js`**

Add the new stat cards population, new charts, and detail table rendering. Add these to `renderResults()`:

**Stat cards:**
```js
  // New stat cards
  const allFinalScores = [];
  for (let i = 0; i < params.playerCount; i++) {
    allFinalScores.push(...summary.perPlayer.map((p) => p.avgScore));
  }
  const globalMedian = median(summary.perPlayer.map((p) => p.medianScore));
  const globalStdDev = Math.round(summary.perPlayer.reduce((s, p) => s + p.stdDev, 0) / params.playerCount);
  const globalMin = Math.min(...summary.perPlayer.map((p) => p.minScore));
  const globalMax = Math.max(...summary.perPlayer.map((p) => p.maxScore));

  $('stat-median').textContent = Math.round(globalMedian);
  $('stat-stddev').textContent = globalStdDev;
  $('stat-range').textContent = `${globalMin} – ${globalMax}`;
  $('stat-turns').textContent = summary.roundStats.avgTurns.toFixed(1);
```

**IMPORTANT:** First, add this import at the top of `simulator.js` (after the existing imports):
```js
import { median } from './simulation-engine.js';
```

Also update the `charts` object declaration AND the `handleReset` function to include new chart keys:
```js
let charts = { winrate: null, breakdown: null, progression: null, histogram: null, donut: null };
```
In `handleReset`, update the reassignment to match:
```js
charts = { winrate: null, breakdown: null, progression: null, histogram: null, donut: null };
```

**Histogram chart:**
```js
  // Score Distribution Histogram
  const histLabels = summary.scoreDistribution[0].map(
    (b) => `${Math.round(b.min)}-${Math.round(b.max)}`
  );
  const histDatasets = params.difficulties.map((d, i) => ({
    label: `Bot ${i + 1}`,
    data: summary.scoreDistribution[i].map((b) => b.count),
    backgroundColor: DIFF_COLORS[d] + '99', // semi-transparent
  }));

  charts.histogram = new Chart($('chart-histogram'), {
    type: 'bar',
    data: { labels: histLabels, datasets: histDatasets },
    options: chartOptions('Score Distribution'),
  });
```

**Donut chart:**
```js
  // Bonus Contribution Donut (aggregated across players)
  const avgContrib = { base: 0, column: 0, row: 0, prism: 0 };
  for (const bc of summary.bonusContributions) {
    avgContrib.base += bc.base;
    avgContrib.column += bc.column;
    avgContrib.row += bc.row;
    avgContrib.prism += bc.prism;
  }
  const n = summary.bonusContributions.length || 1;

  charts.donut = new Chart($('chart-donut'), {
    type: 'doughnut',
    data: {
      labels: ['Base', 'Column', 'Row', 'Prism'],
      datasets: [{
        data: [
          +(avgContrib.base / n * 100).toFixed(1),
          +(avgContrib.column / n * 100).toFixed(1),
          +(avgContrib.row / n * 100).toFixed(1),
          +(avgContrib.prism / n * 100).toFixed(1),
        ],
        backgroundColor: ['#94a3b8', '#4ade80', '#60a5fa', '#a78bfa'],
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Bonus Contribution (%)', color: '#f8fafc', font: { size: 14 } },
        legend: { labels: { color: '#94a3b8' } },
      },
    },
  });
```

**Score Progression with bands:**

Enhance the existing progression chart to add min/max fill bands. Replace the progression chart code:

```js
  // Score Progression line chart with min/max bands
  const maxRounds = summary.avgScoreByRound.length;
  const roundLabels = Array.from({ length: maxRounds }, (_, i) => `R${i + 1}`);

  const progressionDatasets = [];
  for (let i = 0; i < params.playerCount; i++) {
    const color = DIFF_COLORS[params.difficulties[i]];
    // Min band (hidden line, acts as fill lower boundary)
    progressionDatasets.push({
      label: `Bot ${i + 1} min`,
      data: summary.scoreProgressionBands.map((b) => b.min[i] ?? 0),
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
      hidden: false,
    });
    // Max band (fill down to min)
    progressionDatasets.push({
      label: `Bot ${i + 1} range`,
      data: summary.scoreProgressionBands.map((b) => b.max[i] ?? 0),
      borderColor: 'transparent',
      backgroundColor: color + '15', // very transparent
      pointRadius: 0,
      fill: '-1', // fill to previous dataset
    });
    // Average line
    progressionDatasets.push({
      label: `Bot ${i + 1}`,
      data: summary.avgScoreByRound.map((r) => r[i] !== undefined ? +r[i].toFixed(0) : null),
      borderColor: color,
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 2,
    });
  }

  charts.progression = new Chart($('chart-progression'), {
    type: 'line',
    data: { labels: roundLabels, datasets: progressionDatasets },
    options: {
      ...chartOptions('Score Progression (avg cumulative with range)'),
      plugins: {
        ...chartOptions('').plugins,
        title: { display: true, text: 'Score Progression (avg cumulative with range)', color: '#f8fafc', font: { size: 14 } },
        legend: {
          labels: {
            color: '#94a3b8',
            filter: (item) => !item.text.includes('min') && !item.text.includes('range'),
          },
        },
      },
    },
  });
```

**Detail table:**
```js
  // Detailed Statistics Table
  renderDetailTable(summary, params);
```

Add `renderDetailTable` function:
```js
function renderDetailTable(summary, params) {
  const labels = params.difficulties.map((d, i) => `Bot ${i + 1} (${d})`);

  // Per-player table
  const rows = [
    ['Wins', ...summary.perPlayer.map((p) => p.wins)],
    ['Win Rate', ...summary.perPlayer.map((p) => (p.winRate * 100).toFixed(1) + '%')],
    ['Win Rate CI', ...summary.winRateCI.map((ci) => `${(ci.lower * 100).toFixed(0)}-${(ci.upper * 100).toFixed(0)}%`)],
    ['Median Score', ...summary.perPlayer.map((p) => Math.round(p.medianScore))],
    ['Std Dev', ...summary.perPlayer.map((p) => p.stdDev.toFixed(1))],
    ['Min Score', ...summary.perPlayer.map((p) => p.minScore)],
    ['Max Score', ...summary.perPlayer.map((p) => p.maxScore)],
    ['Max Win Streak', ...summary.perPlayer.map((p) => p.maxWinStreak)],
  ];

  let html = '<table><thead><tr><th>Stat</th>';
  for (const l of labels) html += `<th>${l}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) html += `<td>${cell}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';

  // Per-difficulty table
  const diffs = Object.entries(summary.perDifficulty);
  if (diffs.length > 0) {
    html += '<table><thead><tr><th>Difficulty</th><th>Bots</th><th>Win Rate</th><th>Avg Score</th></tr></thead><tbody>';
    for (const [d, stats] of diffs) {
      html += `<tr><td>${d}</td><td>${stats.bots}</td><td>${(stats.winRate * 100).toFixed(1)}%</td><td>${Math.round(stats.avgScore)}</td></tr>`;
    }
    html += '</tbody></table>';
  }

  $('player-stats-table').innerHTML = html;
}
```

Update the `charts` object and `handleReset` to include new charts:
```js
let charts = { winrate: null, breakdown: null, progression: null, histogram: null, donut: null };
```

- [ ] **Step 5: Test manually in browser**

Run: `npm start`
Open: `http://localhost:3000/simulator`
1. Run a simulation with 4 players (mix of difficulties)
2. Verify: 8 stat cards display correctly
3. Verify: 5 charts render (win rate, breakdown, progression with bands, histogram, donut)
4. Verify: "Detailed Statistics" section is collapsible and shows correct data
5. Verify: responsive layout on narrow window

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: ALL pass

- [ ] **Step 7: Commit**

```bash
git add public/simulator.html public/simulator.css public/simulator.js
git commit -m "feat: add expanded stats UI — 8 stat cards, histogram, donut, detail table, progression bands"
```

---

## Task 5: AI balance analysis via Gemini Flash

**Files:**
- Modify: `server.js` (add `/api/analyze` routes)
- Create: `.env` (Gemini API key)
- Modify: `public/simulator.js` (AI button handler)

- [ ] **Step 1: Create `.env` file with Gemini API key**

Create `.env` in project root:
```
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE
```

Verify `.env` is in `.gitignore`:
Run: `grep -q '.env' .gitignore && echo "OK" || echo "MISSING"`

**Note:** In production (Docker/Dokploy), `GEMINI_API_KEY` is set as a real environment variable, not via `.env`. `dotenv/config` will harmlessly no-op when `.env` is absent.

- [ ] **Step 2: Install dotenv and add server routes**

Run: `npm install dotenv`

Add to the top of `server.js` (after existing imports):
```js
import 'dotenv/config';
```

Add the analyze routes after the `/api/stats/history` route:

```js
  // AI Analysis — Gemini Flash proxy
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const analyzeTimestamps = new Map();

  app.get('/api/analyze/status', (_req, res) => {
    res.json({ available: !!GEMINI_API_KEY });
  });

  app.post('/api/analyze', async (req, res) => {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI analysis not configured.' });
    }

    // Rate limiting: 1 request per 10 seconds per IP
    const ip = req.ip;
    const now = Date.now();
    const last = analyzeTimestamps.get(ip) || 0;
    if (now - last < 10000) {
      return res.status(429).json({ error: 'Please wait 10 seconds between analyses.' });
    }
    analyzeTimestamps.set(ip, now);

    const { summary, config } = req.body;
    if (!summary || !config) {
      return res.status(400).json({ error: 'Missing summary or config.' });
    }

    try {
      const prompt = buildAnalysisPrompt(summary, config);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini API error:', response.status, errText);
        return res.status(502).json({ error: 'AI service unavailable. Try again.' });
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Analysis unavailable.';
      res.json({ analysis: text });
    } catch (err) {
      console.error('Gemini fetch error:', err.message);
      res.status(502).json({ error: 'AI service unavailable. Try again.' });
    }
  });
```

Add the `buildAnalysisPrompt` function inside `startServer` (or above it):

```js
function buildAnalysisPrompt(summary, config) {
  const playerLines = summary.perPlayer
    ? summary.perPlayer.map((p, i) =>
      `  Bot ${i + 1}: wins=${p.wins} (${(p.winRate * 100).toFixed(1)}%), avg=${Math.round(p.avgScore)}, median=${Math.round(p.medianScore)}, stdDev=${p.stdDev.toFixed(1)}`
    ).join('\n')
    : '  (no per-player data)';

  const bonusLines = summary.bonusContributions
    ? summary.bonusContributions.map((b, i) =>
      `  Bot ${i + 1}: base=${(b.base * 100).toFixed(0)}%, col=${(b.column * 100).toFixed(0)}%, row=${(b.row * 100).toFixed(0)}%, prism=${(b.prism * 100).toFixed(0)}%`
    ).join('\n')
    : '  (no bonus data)';

  return `You are a game balance analyst for LUMINA, a card game where players build a 3x4 grid to maximize their score. First to the win threshold wins.

Current parameters:
- Card range: ${config.cardMin}-${config.cardMax}, Negative: ${config.negativeValue}, Top: ${config.topValue}
- Win threshold: ${config.winThreshold}
- Bonuses: Column=${config.columnBonus}, Row=${config.rowBonus}, Prism=${config.prismBonus}, LUMINA=${config.luminaBonus}

Simulation results (${summary.totalGames} games):
${playerLines}

LUMINA call rate: ${(summary.luminaCallRate * 100).toFixed(0)}%
Avg rounds per game: ${summary.avgRounds.toFixed(1)}

Bonus contributions:
${bonusLines}

Provide a concise balance analysis:
1. Are difficulties well-separated? (hard should win more than easy)
2. Is any bonus overpowered or useless?
3. Is the win threshold appropriate? (too many/few rounds?)
4. Is the LUMINA mechanic impactful enough?
5. Specific parameter change suggestions with reasoning.

Keep it under 300 words. Use bullet points.`;
}
```

- [ ] **Step 3: Add AI button handlers to `simulator.js`**

In the `DOMContentLoaded` listener, add:
```js
  // Check AI availability and wire up button
  fetch('/api/analyze/status')
    .then((r) => r.json())
    .then((data) => {
      if (data.available) {
        $('analyze-btn')?.addEventListener('click', handleAnalyze);
        $('reanalyze-btn')?.addEventListener('click', handleAnalyze);
      } else {
        // Hide AI section entirely
        const aiSection = $('ai-section');
        if (aiSection) aiSection.remove();
      }
    })
    .catch(() => {
      const aiSection = $('ai-section');
      if (aiSection) aiSection.remove();
    });
```

Add `handleAnalyze` function:
```js
async function handleAnalyze() {
  if (!lastResults || !lastParams) return;

  $('analyze-btn').classList.add('hidden');
  $('ai-loading').classList.remove('hidden');
  $('ai-result').classList.add('hidden');

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: lastResults.summary,
        config: lastParams.config,
      }),
    });

    const data = await resp.json();

    if (resp.ok) {
      $('ai-text').innerHTML = formatAnalysis(data.analysis);
      $('ai-result').classList.remove('hidden');
    } else {
      $('ai-text').textContent = data.error || 'Analysis failed.';
      $('ai-result').classList.remove('hidden');
    }
  } catch (err) {
    $('ai-text').textContent = 'Failed to reach server. Try again.';
    $('ai-result').classList.remove('hidden');
  }

  $('ai-loading').classList.add('hidden');
  $('analyze-btn').classList.add('hidden');
  $('reanalyze-btn')?.classList.remove('hidden');
}

function formatAnalysis(text) {
  // Escape HTML entities first to prevent XSS from Gemini response
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Then apply markdown-like formatting
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-\u2022]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n/g, '<br>');
}
```

- [ ] **Step 4: Test locally**

Run: `npm start`
Open: `http://localhost:3000/simulator`
1. Run a simulation
2. Click "Analyze with AI"
3. Verify: loading spinner appears, then analysis text
4. Verify: "Re-analyze" button works
5. Test error case: stop server, click analyze, verify error message

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL pass

- [ ] **Step 6: Commit**

```bash
git add server.js public/simulator.js public/simulator.html package.json package-lock.json
git commit -m "feat: add AI balance analysis via Gemini Flash with rate limiting"
```

**IMPORTANT:** Never stage `.env` — it contains secrets and must remain gitignored.

---

## Task 6: Final verification and deployment

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL pass

- [ ] **Step 2: Manual browser testing**

Run: `npm start`
Open: `http://localhost:3000/simulator`

Checklist:
1. ✅ Progress bar animates smoothly (Web Worker)
2. ✅ UI stays responsive during simulation
3. ✅ 8 stat cards display correct values
4. ✅ 5 charts render correctly
5. ✅ Detail table is collapsible and accurate
6. ✅ AI button appears and works
7. ✅ Reset button clears everything
8. ✅ Validation works (e.g., card min > max)
9. ✅ Responsive layout on narrow window

- [ ] **Step 3: Push to remote**

```bash
git push
```

- [ ] **Step 4: Set GEMINI_API_KEY on Dokploy**

Use Dokploy API to add the environment variable:
```bash
curl -s -X POST "http://72.61.4.99:3000/api/application.update" \
  -H "Authorization: Bearer PAqHENxcbWWYVDclWyGepFDeaBgAJHkrwmRkYZJTbcHRymUuyeTUlTvwlYPrwFyc" \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "<APP_ID>", "env": "GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE"}'
```

Then trigger deployment:
```bash
curl -s -X POST "http://72.61.4.99:3000/api/application.deploy" \
  -H "Authorization: Bearer PAqHENxcbWWYVDclWyGepFDeaBgAJHkrwmRkYZJTbcHRymUuyeTUlTvwlYPrwFyc" \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "<APP_ID>"}'
```

- [ ] **Step 5: Verify deployment**

Open: `https://aifunflix.cloud/lumina/simulator`
1. Run simulation — verify Web Worker works
2. Click "Analyze with AI" — verify Gemini responds
3. Check all charts and stats display correctly
