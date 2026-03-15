import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcColumnBonus,
  calcRowBonus,
  calcPrismBonus,
  calcRoundScore,
} from '../public/scoring.js';

// Helper: create a card object
const c = (value, color, faceUp = true, hasPrism = false) => ({
  value,
  color,
  faceUp,
  hasPrism,
});

// Helper: build a 3×4 grid filled with a default card, with overrides
function makeGrid(overrides = {}) {
  const grid = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => c(5, 'blue'))
  );
  for (const [key, card] of Object.entries(overrides)) {
    const [r, col] = key.split(',').map(Number);
    grid[r][col] = card;
  }
  return grid;
}

// ── calcColumnBonus ──────────────────────────────────────────────────

describe('calcColumnBonus', () => {
  it('awards +10 for a column of 3 same-color cards', () => {
    // Column 0: all blue (default grid is all blue)
    const grid = makeGrid();
    // All 4 columns are blue → 4 × 10
    assert.equal(calcColumnBonus(grid), 40);
  });

  it('awards +10 when -2 wildcard completes a column', () => {
    // Column 0: blue, blue, -2 (multicolor) → should match blue
    const grid = makeGrid({
      '2,0': c(-2, 'multicolor'),
    });
    assert.equal(calcColumnBonus(grid), 40); // all columns still qualify
  });

  it('does NOT award bonus when 15 (color null) is in column', () => {
    // Column 0: blue, blue, 15(null) → fails
    const grid = makeGrid({
      '2,0': c(15, null),
    });
    // Columns 1,2,3 still all blue → 30
    assert.equal(calcColumnBonus(grid), 30);
  });

  it('does NOT award bonus when any card is face-down', () => {
    const grid = makeGrid({
      '1,0': c(5, 'blue', false),
    });
    // Column 0 fails, columns 1,2,3 pass → 30
    assert.equal(calcColumnBonus(grid), 30);
  });

  it('awards +10 for three -2 cards in a column', () => {
    const grid = makeGrid({
      '0,0': c(-2, 'multicolor'),
      '1,0': c(-2, 'multicolor'),
      '2,0': c(-2, 'multicolor'),
    });
    // Column 0: three multicolors → qualifies
    // Columns 1,2,3: all blue → qualify
    assert.equal(calcColumnBonus(grid), 40);
  });

  it('mixed colors without wildcard do not qualify', () => {
    const grid = makeGrid({
      '0,0': c(3, 'violet'),
    });
    // Column 0: violet, blue, blue → fails
    assert.equal(calcColumnBonus(grid), 30);
  });
});

// ── calcRowBonus ─────────────────────────────────────────────────────

describe('calcRowBonus', () => {
  it('awards +10 for a strictly increasing row', () => {
    const grid = makeGrid({
      '0,0': c(1, 'blue'),
      '0,1': c(3, 'blue'),
      '0,2': c(7, 'blue'),
      '0,3': c(10, 'blue'),
    });
    // Row 0 is increasing; rows 1,2 are all 5 (not increasing)
    assert.equal(calcRowBonus(grid), 10);
  });

  it('does NOT award for non-strictly increasing row (duplicates)', () => {
    const grid = makeGrid({
      '0,0': c(1, 'blue'),
      '0,1': c(3, 'blue'),
      '0,2': c(3, 'blue'),
      '0,3': c(10, 'blue'),
    });
    assert.equal(calcRowBonus(grid), 0);
  });

  it('does NOT award for decreasing row', () => {
    const grid = makeGrid({
      '0,0': c(10, 'blue'),
      '0,1': c(7, 'blue'),
      '0,2': c(3, 'blue'),
      '0,3': c(1, 'blue'),
    });
    assert.equal(calcRowBonus(grid), 0);
  });

  it('-2 and 15 participate as their numeric values', () => {
    const grid = makeGrid({
      '0,0': c(-2, 'multicolor'),
      '0,1': c(3, 'blue'),
      '0,2': c(7, 'blue'),
      '0,3': c(15, null),
    });
    // -2 < 3 < 7 < 15 → strictly increasing
    assert.equal(calcRowBonus(grid), 10);
  });

  it('does NOT award when any card is face-down', () => {
    const grid = makeGrid({
      '0,0': c(1, 'blue'),
      '0,1': c(3, 'blue', false),
      '0,2': c(7, 'blue'),
      '0,3': c(10, 'blue'),
    });
    assert.equal(calcRowBonus(grid), 0);
  });

  it('awards for multiple qualifying rows', () => {
    const grid = makeGrid({
      '0,0': c(1, 'blue'),
      '0,1': c(2, 'blue'),
      '0,2': c(3, 'blue'),
      '0,3': c(4, 'blue'),
      '1,0': c(5, 'blue'),
      '1,1': c(6, 'blue'),
      '1,2': c(7, 'blue'),
      '1,3': c(8, 'blue'),
    });
    // Rows 0 and 1 qualify, row 2 is all 5s → 20
    assert.equal(calcRowBonus(grid), 20);
  });
});

// ── calcPrismBonus ───────────────────────────────────────────────────

describe('calcPrismBonus', () => {
  it('awards +10 for prism card in a valid column', () => {
    // All blue grid, prism on [0,0]
    const grid = makeGrid({
      '0,0': c(5, 'blue', true, true),
    });
    // Column 0 is valid (all blue)
    assert.equal(calcPrismBonus(grid), 10);
  });

  it('awards only +10 even if prism card is in both valid row and column', () => {
    const grid = makeGrid({
      '0,0': c(1, 'blue', true, true),
      '0,1': c(3, 'blue'),
      '0,2': c(7, 'blue'),
      '0,3': c(10, 'blue'),
    });
    // Row 0 is valid (increasing), column 0 is valid (all blue)
    // Prism at [0,0] → only +10 total
    assert.equal(calcPrismBonus(grid), 10);
  });

  it('awards 0 if prism card is NOT in any valid structure', () => {
    const grid = makeGrid({
      '0,0': c(5, 'violet', true, true), // breaks column 0 (rest are blue)
    });
    // Column 0: violet, blue, blue → invalid
    // Row 0: 5, 5, 5, 5 → not increasing
    assert.equal(calcPrismBonus(grid), 0);
  });

  it('awards +10 once even if multiple prism cards are in valid structures', () => {
    // Two prism cards each in valid columns
    const grid = makeGrid({
      '0,0': c(5, 'blue', true, true),
      '0,1': c(5, 'blue', true, true),
    });
    // Columns 0 and 1 are valid, but bonus is capped at +10 total
    assert.equal(calcPrismBonus(grid), 10);
  });
});

// ── calcRoundScore ───────────────────────────────────────────────────

describe('calcRoundScore', () => {
  it('returns correct score with all face-up, no bonuses', () => {
    // Grid of mixed colors, non-increasing rows, mixed columns
    const grid = [
      [c(4, 'blue'), c(2, 'violet'), c(3, 'orange'), c(1, 'green')],
      [c(8, 'green'), c(6, 'orange'), c(7, 'violet'), c(5, 'blue')],
      [c(9, 'orange'), c(10, 'green'), c(1, 'blue'), c(2, 'violet')],
    ];
    const result = calcRoundScore(grid);
    assert.equal(result.visibleSum, 4+2+3+1+8+6+7+5+9+10+1+2);
    assert.equal(result.faceDownCount, 0);
    assert.equal(result.faceDownPenalty, 0);
    assert.equal(result.baseScore, 58);
    assert.equal(result.columnBonus, 0);
    assert.equal(result.rowBonus, 0);
    assert.equal(result.prismBonus, 0);
    assert.equal(result.total, 58);
  });

  it('applies face-down penalty correctly', () => {
    const grid = makeGrid({
      '0,0': c(5, 'blue', false),
      '1,1': c(5, 'blue', false),
    });
    const result = calcRoundScore(grid);
    assert.equal(result.faceDownCount, 2);
    assert.equal(result.faceDownPenalty, -10);
    // visibleSum = 10 face-up cards × 5 = 50
    assert.equal(result.visibleSum, 50);
    assert.equal(result.baseScore, 40);
  });

  it('combines all bonuses into total', () => {
    // All blue, row 0 increasing, prism on [0,0]
    const grid = [
      [c(1, 'blue', true, true), c(3, 'blue'), c(7, 'blue'), c(10, 'blue')],
      [c(5, 'blue'), c(5, 'blue'), c(5, 'blue'), c(5, 'blue')],
      [c(5, 'blue'), c(5, 'blue'), c(5, 'blue'), c(5, 'blue')],
    ];
    const result = calcRoundScore(grid);
    // visibleSum = 1+3+7+10 + 8×5 = 21+40 = 61
    assert.equal(result.visibleSum, 61);
    assert.equal(result.faceDownPenalty, 0);
    assert.equal(result.baseScore, 61);
    // 4 columns all blue → columnBonus = 40
    assert.equal(result.columnBonus, 40);
    // Row 0 increasing → rowBonus = 10
    assert.equal(result.rowBonus, 10);
    // Prism at [0,0] in valid column + valid row → 10
    assert.equal(result.prismBonus, 10);
    assert.equal(result.total, 61 + 40 + 10 + 10);
  });
});
