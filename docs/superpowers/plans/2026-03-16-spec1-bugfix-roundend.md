# Spec 1: Bot Attack Audit, Round-End Grids, Active Player Highlight — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix bot attack correctness, show all players' final grids at round end with bonus highlights, and highlight the active bot during play.

**Architecture:** Three independent sections executed in parallel subagents. Section A audits game.js attack logic and bot.js selection, adding a deterministic swap test. Section B extends scoring.js to return valid column/row indices, then builds a new round-end grid UI in ui.js. Section C adds CSS classes for active bot tabs and first-player badges.

**Tech Stack:** Vanilla JS (ES modules), Node.js test runner, CSS

---

## Chunk 1: File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `public/game.js` | Audit (fix if needed) | `attack()` swap logic |
| `public/bot.js` | Audit (fix if needed) | Attack selection in all 3 tiers |
| `public/app.js` | Audit + modify | `executeBotTurn()` attack params, `endRound()` wiring |
| `public/scoring.js` | Modify | Add `validColumns`/`validRows` to `calcRoundScore()` return |
| `public/ui.js` | Modify | New `renderRoundEndGrids()`, bot-tab active class, first-player badge |
| `public/style.css` | Modify | Round-end grid styles, bot-tab--active, first-player-badge |
| `tests/game.test.js` | Modify | New deterministic attack swap test |
| `tests/scoring.test.js` | Modify | Test `validColumns`/`validRows` fields |

---

## Chunk 2: Task 1 — Bot Attack Audit & Fix

### Task 1: Audit and test the attack swap logic

**Files:**
- Audit: `public/game.js:272-334`
- Audit: `public/app.js:409-485`
- Audit: `public/bot.js` (buildAttackAction, buildMediumAttackAction, generateAllCandidateActions)
- Test: `tests/game.test.js`

**Audit findings from code review (pre-verified):**

The `game.attack()` at `game.js:272-334` is **correct**:
- Line 310: attacker gets `defenderCard.value/color` ✓
- Line 317: defender gets `attackerCard.value/color` with `immune: true` ✓
- Line 307: cost card flipped face-up ✓

The `executeBotTurn()` at `app.js:447-452` is **correct**:
- Passes `botIndex, action.attackerRow, action.attackerCol, action.defenderIndex, action.defenderRow, action.defenderCol, action.revealRow, action.revealCol` ✓

The bot selection in `bot.js` is **correct** across all tiers:
- `buildAttackAction()` line 1222: `target.card.value > attackerCard.value` ✓
- `buildMediumAttackAction()` line 550: `delta >= 4` ✓
- `generateAllCandidateActions()` line 687: `target.card.value > attackerCard.value` ✓

**Conclusion:** No bugs found in attack logic. The user's concern may stem from the action log not clearly showing what happened (swapped card badges show the pre-swap values which can be confusing). We'll add a clearer post-swap verification test to prove correctness.

- [ ] **Step 1: Write a deterministic attack swap verification test**

Add to `tests/game.test.js` inside the existing `describe('attack', ...)` block:

```javascript
it('correctly swaps card values between attacker and defender', () => {
  const g = setupPlayingGame();
  const pi = g.currentPlayerIndex;
  const di = pi === 0 ? 1 : 0;

  // Set up known card values
  g.players[pi].grid[0][0] = {
    value: 3, color: 'blue', faceUp: true, hasPrism: false, immune: false,
  };
  g.players[di].grid[0][0] = {
    value: 12, color: 'orange', faceUp: true, hasPrism: false, immune: false,
  };
  // Ensure a face-down cost card exists
  g.players[pi].grid[2][3].faceUp = false;

  const result = g.attack(pi, 0, 0, di, 0, 0, 2, 3);
  assert.equal(result, true, 'attack should succeed');

  // Attacker now has the defender's old card
  assert.equal(g.players[pi].grid[0][0].value, 12, 'attacker should have defender card value');
  assert.equal(g.players[pi].grid[0][0].color, 'orange', 'attacker should have defender card color');

  // Defender now has the attacker's old card, marked immune
  assert.equal(g.players[di].grid[0][0].value, 3, 'defender should have attacker card value');
  assert.equal(g.players[di].grid[0][0].color, 'blue', 'defender should have attacker card color');
  assert.equal(g.players[di].grid[0][0].immune, true, 'defender card should be immune');

  // Cost card is now face-up
  assert.equal(g.players[pi].grid[2][3].faceUp, true, 'cost card should be face-up');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/game.test.js`
Expected: ALL PASS (this test verifies existing correct behavior)

- [ ] **Step 3: Improve attack action log clarity in app.js**

In `public/app.js` at line 474-480, update the attack log to show the swap direction more clearly. Replace the existing attack log block:

```javascript
  } else if (action.type === 'attack') {
    const defName = game.players[action.defenderIndex].name;
    const aBadge = _badge(attackerCard.value, attackerCard.color);
    const dBadge = _badge(defenderCard.value, defenderCard.color);
    logRichAction(document, { actor: bot.name, actionType: 'attacked', details: `gave ${aBadge} to ${defName}, took ${dBadge}, revealed (${action.revealRow + 1},${action.revealCol + 1})` });
    flashGridCell(botIndex, action.attackerRow, action.attackerCol);
    flashGridCell(action.defenderIndex, action.defenderRow, action.defenderCol);
    flashGridCell(botIndex, action.revealRow, action.revealCol);
  }
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: 117/117 pass (116 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add tests/game.test.js public/app.js
git commit -m "fix: verify attack swap correctness, improve attack action log clarity"
```

---

## Chunk 3: Task 2 — Extend scoring.js with validColumns/validRows

### Task 2: Add valid structure indices to calcRoundScore return value

**Files:**
- Modify: `public/scoring.js:132-164`
- Test: `tests/scoring.test.js`

- [ ] **Step 1: Write failing test for validColumns/validRows**

Add to `tests/scoring.test.js`:

```javascript
describe('calcRoundScore validColumns and validRows', () => {
  it('returns validColumns for same-color columns', () => {
    // Column 0: all blue → valid. Column 1: mixed → invalid.
    const grid = makeGrid({
      '0,0': c(3, 'blue'),
      '1,0': c(5, 'blue'),
      '2,0': c(8, 'blue'),
      '0,1': c(3, 'blue'),
      '1,1': c(5, 'orange'),
      '2,1': c(8, 'blue'),
    });
    const result = calcRoundScore(grid);
    assert.ok(result.validColumns.includes(0), 'column 0 should be valid');
    assert.ok(!result.validColumns.includes(1), 'column 1 should not be valid');
  });

  it('returns validRows for ascending rows', () => {
    // Row 0: 1,3,5,7 → ascending → valid. Row 1: 5,5,5,5 → not ascending.
    const grid = makeGrid({
      '0,0': c(1, 'blue'),
      '0,1': c(3, 'orange'),
      '0,2': c(5, 'green'),
      '0,3': c(7, 'violet'),
    });
    const result = calcRoundScore(grid);
    assert.ok(result.validRows.includes(0), 'row 0 should be valid');
    assert.ok(!result.validRows.includes(1), 'row 1 should not be valid (all 5s)');
  });

  it('returns empty arrays when no valid structures', () => {
    const grid = makeGrid(); // all 5, blue → columns valid but rows not ascending
    const result = calcRoundScore(grid);
    assert.ok(Array.isArray(result.validColumns));
    assert.ok(Array.isArray(result.validRows));
    assert.deepEqual(result.validRows, []);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scoring.test.js`
Expected: FAIL — `result.validColumns` is `undefined`

- [ ] **Step 3: Implement validColumns/validRows in calcRoundScore**

In `public/scoring.js`, modify `calcRoundScore()` to compute and return the indices. Insert before the `return` statement at line 154:

```javascript
  // Determine valid structure indices for UI highlights
  const validColumns = [];
  for (let col = 0; col < 4; col++) {
    const cards = [grid[0][col], grid[1][col], grid[2][col]];
    if (cards.some((cc) => !cc.faceUp)) continue;
    if (cards.some((cc) => cc.color === null)) continue;
    const concreteColors = cards
      .filter((cc) => cc.color !== 'multicolor')
      .map((cc) => cc.color);
    if (concreteColors.length === 0 || concreteColors.every((cc) => cc === concreteColors[0])) {
      validColumns.push(col);
    }
  }

  const validRows = [];
  for (let row = 0; row < 3; row++) {
    const cards = grid[row];
    if (cards.some((cc) => !cc.faceUp)) continue;
    let increasing = true;
    for (let i = 1; i < 4; i++) {
      if (cards[i].value <= cards[i - 1].value) { increasing = false; break; }
    }
    if (increasing) validRows.push(row);
  }
```

Add `validColumns` and `validRows` to the return object:

```javascript
  return {
    visibleSum,
    faceDownCount,
    faceDownPenalty,
    baseScore,
    columnBonus,
    rowBonus,
    prismBonus,
    total,
    validColumns,
    validRows,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scoring.test.js`
Expected: ALL PASS

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: ALL PASS (existing tests unaffected — new fields are additive)

- [ ] **Step 6: Commit**

```bash
git add public/scoring.js tests/scoring.test.js
git commit -m "feat: add validColumns/validRows to calcRoundScore for UI highlights"
```

---

## Chunk 4: Task 3 — Round-End Screen with Player Grids

### Task 3: Build the round-end grid panels UI

**Files:**
- Modify: `public/ui.js:551-638` (replace `renderRoundEnd` body)
- Modify: `public/style.css` (add round-end grid styles)
- Modify: `public/app.js:544-551` (no changes needed — already passes `game` to `renderRoundEnd`)

- [ ] **Step 1: Add round-end grid CSS to style.css**

Add after the existing `#round-end-screen` block (around line 1190):

```css
/* -- Round-End Grid Panels -- */
.round-end-grids {
  display: flex;
  gap: 16px;
  justify-content: center;
  overflow-x: auto;
  padding: var(--sp-4) 0;
  margin-bottom: var(--sp-4);
}

.round-end-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
  min-width: 180px;
}

.round-end-panel--player {
  border-color: var(--card-blue-border);
}

.round-end-panel--caller-positive {
  border-color: #22c55e;
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.3);
}

.round-end-panel--caller-negative {
  border-color: #ef4444;
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
}

.round-end-panel-header {
  text-align: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
}

.round-end-panel-header .difficulty-badge {
  font-size: 0.65rem;
  font-weight: 400;
  color: var(--text-muted);
  margin-left: var(--sp-1);
}

.lumina-caller-banner {
  font-size: 0.7rem;
  font-weight: 700;
  padding: var(--sp-1) var(--sp-2);
  border-radius: 4px;
  text-align: center;
}

.lumina-caller-banner--positive {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.lumina-caller-banner--negative {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.round-end-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
}

.round-end-grid .card {
  width: 44px;
  height: 56px;
  font-size: 0.75rem;
}

.round-end-panel--player .round-end-grid .card {
  width: 56px;
  height: 68px;
  font-size: 0.85rem;
}

.bonus-col-highlight {
  border-left: 3px solid var(--prism-cyan) !important;
}

.bonus-row-highlight {
  border-bottom: 3px solid #f59e0b !important;
}

.round-end-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  justify-content: center;
  font-size: 0.7rem;
  color: var(--text-secondary);
}

.round-end-breakdown .breakdown-item {
  white-space: nowrap;
}

.round-end-breakdown .breakdown-item--bonus {
  color: #22c55e;
}

.round-end-breakdown .breakdown-item--penalty {
  color: #ef4444;
}

.round-end-breakdown .breakdown-total {
  font-weight: 700;
  color: var(--text-primary);
}

.round-end-cumulative {
  display: flex;
  gap: var(--sp-4);
  justify-content: center;
  font-size: 0.8rem;
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--border-subtle);
}

.round-end-cumulative span {
  color: var(--text-secondary);
}

.round-end-cumulative strong {
  color: var(--text-primary);
}
```

- [ ] **Step 2: Rewrite renderRoundEnd in ui.js**

Replace the body of `renderRoundEnd()` at `ui.js:551-638` with:

```javascript
export function renderRoundEnd(container, game, onNext) {
  const screen = showScreen('round-end-screen');
  screen.innerHTML = '';

  const card = el('div', 'round-end-card');

  const heading = el('h2');
  heading.textContent = `Round ${game.round} Complete`;
  card.appendChild(heading);

  // ── Grid panels ──
  const gridsRow = el('div', 'round-end-grids');

  // Pre-compute all scores to determine LUMINA bonus
  const allBreakdowns = game.players.map((p) => calcRoundScore(p.grid));
  const allTotals = allBreakdowns.map((b) => b.total);
  let callerLuminaAdj = 0;
  if (game.luminaCaller !== null && game.luminaCaller !== undefined) {
    const callerTotal = allTotals[game.luminaCaller];
    const isStrictlyHighest = allTotals.every((s, idx) => idx === game.luminaCaller || s < callerTotal);
    callerLuminaAdj = isStrictlyHighest ? 10 : -10;
  }

  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    const breakdown = allBreakdowns[i];
    const isCaller = game.luminaCaller === i;
    const luminaAdj = isCaller ? callerLuminaAdj : 0;
    const roundTotal = breakdown.total + luminaAdj;

    const panel = el('div', 'round-end-panel');
    if (i === 0) panel.classList.add('round-end-panel--player');
    if (isCaller) {
      panel.classList.add(callerLuminaAdj >= 0 ? 'round-end-panel--caller-positive' : 'round-end-panel--caller-negative');
    }

    // Header
    const header = el('div', 'round-end-panel-header');
    header.textContent = player.name;
    if (player.isBot) {
      const badge = el('span', 'difficulty-badge');
      badge.textContent = `(${player.difficulty})`;
      header.appendChild(badge);
    }
    panel.appendChild(header);

    // LUMINA caller banner
    if (isCaller) {
      const banner = el('div', 'lumina-caller-banner');
      banner.classList.add(callerLuminaAdj >= 0 ? 'lumina-caller-banner--positive' : 'lumina-caller-banner--negative');
      banner.textContent = `CALLED LUMINA (${callerLuminaAdj >= 0 ? '+' : ''}${callerLuminaAdj})`;
      panel.appendChild(banner);
    }

    // Grid with bonus highlights
    const gridDiv = el('div', 'round-end-grid');
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const cardEl = renderCard(player.grid[r][c]);
        if (breakdown.validColumns.includes(c)) {
          cardEl.classList.add('bonus-col-highlight');
        }
        if (breakdown.validRows.includes(r)) {
          cardEl.classList.add('bonus-row-highlight');
        }
        gridDiv.appendChild(cardEl);
      }
    }
    panel.appendChild(gridDiv);

    // Score breakdown
    const bdDiv = el('div', 'round-end-breakdown');
    const items = [
      { label: `Base: ${breakdown.baseScore}`, cls: '' },
      { label: `Col: +${breakdown.columnBonus}`, cls: breakdown.columnBonus > 0 ? 'breakdown-item--bonus' : '' },
      { label: `Row: +${breakdown.rowBonus}`, cls: breakdown.rowBonus > 0 ? 'breakdown-item--bonus' : '' },
      { label: `Prism: +${breakdown.prismBonus}`, cls: breakdown.prismBonus > 0 ? 'breakdown-item--bonus' : '' },
    ];
    if (luminaAdj !== 0) {
      items.push({ label: `LUMINA: ${luminaAdj > 0 ? '+' : ''}${luminaAdj}`, cls: luminaAdj > 0 ? 'breakdown-item--bonus' : 'breakdown-item--penalty' });
    }
    items.push({ label: `Total: ${roundTotal}`, cls: 'breakdown-total' });

    for (const item of items) {
      const span = el('span', ['breakdown-item', item.cls].filter(Boolean));
      span.textContent = item.label;
      bdDiv.appendChild(span);
    }
    panel.appendChild(bdDiv);

    gridsRow.appendChild(panel);
  }

  card.appendChild(gridsRow);

  // Cumulative scores
  const cumDiv = el('div', 'round-end-cumulative');
  for (let i = 0; i < game.players.length; i++) {
    const span = el('span');
    span.innerHTML = `${game.players[i].name}: <strong>${game.cumulativeScores[i]}</strong>`;
    cumDiv.appendChild(span);
  }
  card.appendChild(cumDiv);

  // Next button
  const isGameOver = game.isGameOver();
  const nextBtn = el('button', 'btn-next-round');
  nextBtn.textContent = isGameOver ? 'See Results' : 'Next Round';
  nextBtn.setAttribute('aria-label', isGameOver ? 'See final results' : 'Start next round');
  nextBtn.addEventListener('click', onNext);
  card.appendChild(nextBtn);

  screen.appendChild(card);
}
```

Note: `renderCard` and `calcRoundScore` are already imported in ui.js. If `calcRoundScore` is not imported, add `import { calcRoundScore } from './scoring.js';` at the top.

- [ ] **Step 3: Verify calcRoundScore import in ui.js**

Check if `calcRoundScore` is already imported in `ui.js`. If not, add the import.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add public/ui.js public/style.css
git commit -m "feat: round-end screen shows all players' grids with bonus highlights and LUMINA indicator"
```

---

## Chunk 5: Task 4 — Active Bot Highlight + First Player Badge

### Task 4: Add bot-tab--active class and first-player badge

**Files:**
- Modify: `public/ui.js:325-340` (bot-tab rendering in `renderGameBoard`)
- Modify: `public/ui.js:313-320` (scoreboard entries)
- Modify: `public/style.css`

- [ ] **Step 1: Add CSS for bot-tab--active and first-player-badge**

Add to `public/style.css` after the existing `.bot-tab` styles:

```css
/* -- Active Bot Highlight -- */
.bot-tab--active {
  border-color: var(--prism-cyan) !important;
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.4), inset 0 0 6px rgba(34, 211, 238, 0.1);
  animation: pulse-border 1.5s ease-in-out infinite;
}

/* -- First Player Badge -- */
.first-player-badge {
  display: inline-block;
  font-size: 0.55rem;
  font-weight: 700;
  background: var(--prism-cyan);
  color: var(--bg-surface);
  padding: 1px 5px;
  border-radius: 8px;
  margin-left: var(--sp-1);
  vertical-align: middle;
}
```

- [ ] **Step 2: Add bot-tab--active class in renderGameBoard**

In `public/ui.js`, inside the bot tab loop (around line 330), after `const tab = el('div', 'bot-tab');`, add:

```javascript
    if (b === game.currentPlayerIndex) {
      tab.classList.add('bot-tab--active');
    }
```

- [ ] **Step 3: Add first-player badge to scoreboard**

In `public/ui.js`, in the scoreboard rendering section (around line 313-320), after creating the scoreboard entry for the current player (`game.currentPlayerIndex`), check if it's the first turn:

Inside the scoreboard entry loop, after the entry text is set, add:

```javascript
    // First player badge on turn 1
    if (game.turnCount <= 1 && i === game.currentPlayerIndex) {
      const badge = el('span', 'first-player-badge');
      badge.textContent = '1st';
      entry.appendChild(badge);
    }
```

Note: Check if `game.turnCount` exists. If not, use a heuristic: all players have 2 revealed cards and no actions taken yet means it's the first turn. Alternatively, check if the game just entered PLAYING phase by counting face-up cards.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add public/ui.js public/style.css
git commit -m "feat: highlight active bot tab and show first-player badge"
```

---

## Chunk 6: Task 5 — Final Integration

### Task 5: Run full test suite, push, deploy

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 2: Push to remote**

```bash
git push
```

- [ ] **Step 3: Deploy to Dokploy**

```bash
curl -s -X POST "http://72.61.4.99:3000/api/trpc/application.deploy" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: HJHwqUMvvEkhsTOFOrRxLyqRlAfqUverngcEvaAZEzFXMpfMMMMmbrfodQTWiPSU" \
  -d '{"json":{"applicationId":"FHySEsOkCN2DbNyG4MEKd"}}'
```

- [ ] **Step 4: Verify deployment**

Check https://aifunflix.cloud/lumina loads with:
- Bot attack logs showing "gave X to Y, took Z"
- Round-end screen showing all player grids side by side
- Active bot tab highlighted with cyan glow
- Bonus columns/rows highlighted on round-end grids
