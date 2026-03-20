# Simulator Improvements — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

Three improvements to the Party Simulator: (1) Web Worker for non-blocking simulation, (2) full statistical suite with new charts and metrics, (3) AI-powered balance analysis via Gemini Flash (free tier).

---

## 1. Speed Fix: Web Worker

### Problem

`runSimulation()` runs synchronously on the main thread. The browser can't repaint during simulation, so:
- Progress bar never updates (frozen at 0%)
- UI is completely unresponsive during simulation
- 100+ games with hard bots can take 5-30 seconds of frozen UI

### Solution

Move simulation execution into a **Web Worker** (`simulator-worker.js`).

### New File: `public/simulator-worker.js`

```js
// Web Worker — runs simulation off main thread
importScripts are not available for ES modules, so this worker uses
a different pattern: self.onmessage receives params, runs simulation,
posts progress and results back.
```

**Challenge:** The simulation engine uses ES module imports (`import { createGame } from './game.js'`). Web Workers with `type: 'module'` support ES imports in modern browsers.

**Worker setup:**
```js
// In simulator.js (main thread):
const worker = new Worker('simulator-worker.js', { type: 'module' });

// Send params to worker
worker.postMessage({ gameCount, playerCount, difficulties, config });

// Receive progress updates and final results
worker.onmessage = (e) => {
  if (e.data.type === 'progress') updateProgressBar(e.data.completed, e.data.total);
  if (e.data.type === 'results') renderResults(e.data.results, params);
};
```

**Worker file (`simulator-worker.js`):**
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

**Async chunking in simulation engine:** To allow `postMessage` progress updates to actually send between games, add `setTimeout(0)` yielding every N games. However, since the worker thread doesn't need to paint UI, the `postMessage` calls are already non-blocking from the worker side — they queue on the main thread's event loop. The current synchronous loop in the worker is fine; progress messages will be delivered as the main thread processes them.

**Fallback:** If `Worker` is unavailable (unlikely in modern browsers), fall back to synchronous execution with the existing code path.

### Modified: `public/simulator.js`

- Replace direct `runSimulation()` call with Worker-based async pattern
- `handleRun()` becomes fully async: sends params to worker, receives results via `onmessage`
- Progress bar updates come from worker messages (smooth, non-blocking)
- Disable "Run" button during simulation, re-enable on results

### Modified: `public/simulation-engine.js`

- Add async yielding: every 10 games, yield with `setTimeout(0)` for progress delivery
- Change `runSimulation` to async: `export async function runSimulation(params)`
- `onProgress` still called synchronously from worker context (no DOM dependency)

**Note:** Making `runSimulation` async means the worker needs to `await` it. Worker `onmessage` becomes async.

---

## 2. Enhanced Statistics

### New Metrics in `computeSummary()`

Add to the existing summary object:

```js
summary: {
  // ... existing fields ...

  // NEW: Per-player detailed stats
  perPlayer: [
    {
      wins: 12,
      winRate: 0.12,
      avgScore: 185.3,
      medianScore: 188,
      stdDev: 32.4,
      minScore: 98,
      maxScore: 267,
      maxWinStreak: 4,        // max consecutive wins
      avgTurnsPerRound: 8.2,  // avg turns taken per round
    },
    // ... per player
  ],

  // NEW: Per-difficulty aggregated stats
  perDifficulty: {
    easy: { wins: 12, games: 30, winRate: 0.40, avgScore: 175 },
    medium: { wins: 22, games: 40, winRate: 0.55, avgScore: 195 },
    hard: { wins: 66, games: 130, winRate: 0.508, avgScore: 210 },
  },

  // NEW: Score distribution (for histogram)
  scoreDistribution: [
    // Per player: array of bucket objects
    [
      { min: 100, max: 120, count: 5 },
      { min: 120, max: 140, count: 12 },
      // ... buckets
    ],
    // ... per player
  ],

  // NEW: Bonus contribution percentages
  bonusContributions: [
    { base: 0.72, column: 0.14, row: 0.08, prism: 0.06 },
    // ... per player
  ],

  // NEW: Round duration stats
  roundStats: {
    avgTurns: 8.5,
    minTurns: 4,
    maxTurns: 15,
  },

  // NEW: Confidence intervals for win rates (95% Wilson score interval)
  winRateCI: [
    { lower: 0.08, upper: 0.18 },  // player 0
    // ... per player
  ],

  // NEW: Score progression with min/max bands
  scoreProgressionBands: [
    // Per round: { avg: [...], min: [...], max: [...] }
    { avg: [42, 45, 50, 48], min: [20, 22, 30, 25], max: [65, 70, 72, 68] },
    // ... per round
  ],
}
```

### Statistical Helpers

Add to `simulation-engine.js`:

```js
function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDev(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((sum, val) => sum + (val - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function wilsonCI(wins, total, z = 1.96) {
  // Wilson score interval for 95% confidence
  const p = wins / total;
  const denom = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denom;
  const margin = (z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denom;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function buildHistogram(values, bucketCount = 10) {
  const min = Math.min(...values);
  const max = Math.max(...values);
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

### UI Changes

#### Stat Cards (expand from 4 → 8)

Existing 4:
1. Games Played
2. Avg Rounds
3. LUMINA Rate
4. Avg Win Score

New 4:
5. **Median Win Score** — more robust than mean
6. **Score Std Dev** — how spread are the scores
7. **Min / Max Score** — range display (e.g., "98 – 267")
8. **Avg Turns/Round** — game pace indicator

Layout: 2 rows × 4 cards (responsive: wraps to 2×2 on mobile).

#### New Charts

**Chart 4: Score Distribution Histogram** (Chart.js bar)
- X-axis: score buckets (e.g., "100-120", "120-140", ...)
- Y-axis: frequency (number of games)
- Grouped bars per player, colored by difficulty
- Shows whether scores cluster tightly or spread wide

**Chart 5: Bonus Contribution Donut** (Chart.js doughnut)
- One donut per player (or a single aggregated donut)
- Segments: Base (gray), Column (green), Row (blue), Prism (violet)
- Shows what % of scoring comes from each source
- Decision: **Single aggregated donut** (average across all players) to avoid clutter. Per-player breakdown is in the stacked bar chart already.

#### Enhanced Existing Charts

**Win Rate bar chart** — add error bars using Chart.js `errorBars` plugin or custom drawing:
- Show 95% confidence interval whiskers on each bar
- Helps distinguish "Bot A wins 52% vs Bot B wins 48%" (not significant) from "Bot A wins 80% vs Bot B wins 20%" (significant)

**Score Progression line chart** — add min/max bands:
- Shaded area between min and max cumulative score at each round
- Uses Chart.js `fill` between datasets (transparent fill)
- Shows variance, not just average trajectory

#### Stats Detail Table

Below all charts, a collapsible "Detailed Statistics" section:

| Stat | Bot 1 (hard) | Bot 2 (hard) | Bot 3 (medium) | Bot 4 (easy) |
|------|-------------|-------------|----------------|-------------|
| Wins | 35 | 31 | 22 | 12 |
| Win Rate | 35% | 31% | 22% | 12% |
| Win Rate CI | 26-45% | 22-41% | 14-32% | 6-20% |
| Median Score | 210 | 205 | 195 | 185 |
| Std Dev | 28.4 | 31.2 | 35.1 | 40.8 |
| Min Score | 112 | 98 | 85 | 62 |
| Max Score | 289 | 267 | 258 | 245 |
| Max Win Streak | 5 | 4 | 3 | 2 |
| Avg Turns/Round | 7.8 | 8.1 | 8.5 | 9.2 |

**Per-difficulty summary** (if mixed difficulties):

| Difficulty | Bots | Win Rate | Avg Score |
|-----------|------|----------|-----------|
| Hard | 2 | 33% | 207.5 |
| Medium | 1 | 22% | 195.0 |
| Easy | 1 | 12% | 185.0 |

---

## 3. AI Balance Analysis (Gemini Flash)

### Server Route: `POST /api/analyze`

**`server.js` addition:**

```js
app.post('/api/analyze', express.json(), async (req, res) => {
  const { summary, config } = req.body;

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

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Analysis unavailable.';
  res.json({ analysis: text });
});
```

**API Key storage:**
- Environment variable `GEMINI_API_KEY` on the server
- For local dev: `.env` file (already gitignored)
- For Dokploy: add environment variable in the deployment config
- Key value: `AIzaSyB8yAmkGtGYSMNv1PthOjdCxbc056tpeKM`

**Analysis prompt template:**

```
You are a game balance analyst for LUMINA, a card game where players build a 3x4 grid
to maximize their score. First to the win threshold wins.

Current parameters:
- Card range: {cardMin}-{cardMax}, Negative: {negativeValue}, Top: {topValue}
- Win threshold: {winThreshold}
- Bonuses: Column={columnBonus}, Row={rowBonus}, Prism={prismBonus}, LUMINA={luminaBonus}

Simulation results ({totalGames} games, {playerCount} players):
- Win rates: {per-player win rates with difficulties}
- Avg scores: {per-player averages}
- Median scores: {per-player medians}
- Score std dev: {per-player std devs}
- LUMINA call rate: {rate}
- Avg rounds per game: {avgRounds}
- Bonus contributions: Base {base}%, Column {col}%, Row {row}%, Prism {prism}%

Provide a concise balance analysis:
1. Are difficulties well-separated? (hard should win more than easy)
2. Is any bonus overpowered or useless?
3. Is the win threshold appropriate? (too many/few rounds?)
4. Is the LUMINA mechanic impactful enough?
5. Specific parameter change suggestions with reasoning.

Keep it under 300 words. Use bullet points.
```

### Client-Side UI

**"Analyze with AI" button:**
- Appears after simulation completes, below the charts
- Glass panel style matching existing design
- Click → button shows "Analyzing..." with spinner → replaced by analysis text
- Analysis text rendered in a styled panel with markdown-like formatting (bold, bullets)
- "Re-analyze" button to regenerate

**HTML addition:**
```html
<div id="ai-section" class="hidden">
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

### Cost

- **Free:** Gemini Flash free tier = 15 requests/minute, 1M tokens/day
- Each analysis: ~500 tokens in, ~400 tokens out = ~900 tokens total
- User would need to run 1,111 analyses/day to hit the limit
- Effectively zero cost

---

## Files Changed

### New Files
- **`public/simulator-worker.js`** — Web Worker wrapper for async simulation
- **`.env`** — Gemini API key (gitignored)

### Modified Files
- **`public/simulation-engine.js`** — Async yielding, enhanced stats computation (median, stdDev, histogram, Wilson CI, streaks, distributions, bonus contributions, progression bands)
- **`public/simulator.js`** — Web Worker integration, 5 chart renderings (up from 3), expanded stat cards, detail table, AI analysis button/panel
- **`public/simulator.html`** — 8 stat cards, 5 chart canvases, detail table section, AI section
- **`public/simulator.css`** — Styles for new stat cards, histogram chart, donut chart, detail table, AI section, spinner
- **`server.js`** — Add `POST /api/analyze` route proxying to Gemini Flash

### No Changes To
- `game.js`, `bot.js`, `cards.js`, `scoring.js` — No game logic changes
- `app.js`, `ui.js` — Main game untouched
- Existing tests — All backwards-compatible

---

## Edge Cases

- **Worker not supported:** Fallback to synchronous `runSimulation()` on main thread (existing behavior)
- **Gemini API down/error:** Show "Analysis unavailable. Try again." in the AI panel, don't break the page
- **Gemini API key missing:** Hide the "Analyze with AI" button entirely (check via a `/api/analyze/status` GET endpoint that returns `{ available: true/false }`)
- **Empty simulation (0 games):** Validation already prevents this (min 10 games)
- **All same difficulty:** Per-difficulty table shows single row, still useful
- **Very few games (10):** CI intervals will be wide — this is correct behavior, shown visually

---

## Testing

- **Simulation engine:** Test new stat functions (median, stdDev, wilsonCI, buildHistogram) with known inputs
- **Web Worker:** Manual browser testing (can't unit test Workers in Node)
- **AI route:** Test `/api/analyze` returns valid response shape, test error handling when API is unavailable
- **Existing tests:** Must all pass (no game logic changes)
