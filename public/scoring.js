/** @module scoring – Scoring utilities for LUMINA */

import { COLORS } from './cards.js';

/**
 * Check if a column of 3 cards all share the same color.
 * - 'multicolor' cards act as wildcards (match any color).
 * - null-color cards (value 15) never satisfy a column bonus.
 * - Face-down cards disqualify the column.
 *
 * @param {Array<Array<{value:number, color:string|null, faceUp:boolean, hasPrism:boolean}>>} grid 3×4
 * @returns {number} bonus points
 */
export function calcColumnBonus(grid) {
  let bonus = 0;

  for (let col = 0; col < 4; col++) {
    const cards = [grid[0][col], grid[1][col], grid[2][col]];

    // Any face-down card disqualifies
    if (cards.some((c) => !c.faceUp)) continue;

    // Any null-color card (15) disqualifies
    if (cards.some((c) => c.color === null)) continue;

    // Gather non-wildcard colors
    const concreteColors = cards
      .filter((c) => c.color !== 'multicolor')
      .map((c) => c.color);

    // All wildcards → qualifies (they adopt the same color)
    if (concreteColors.length === 0) {
      bonus += 10;
      continue;
    }

    // All concrete colors must be the same
    if (concreteColors.every((c) => c === concreteColors[0])) {
      bonus += 10;
    }
  }

  return bonus;
}

/**
 * Award +10 for each row of 4 cards that is strictly increasing left-to-right.
 * Face-down cards disqualify the row.
 *
 * @param {Array<Array<{value:number, color:string|null, faceUp:boolean, hasPrism:boolean}>>} grid 3×4
 * @returns {number} bonus points
 */
export function calcRowBonus(grid) {
  let bonus = 0;

  for (let row = 0; row < 3; row++) {
    const cards = grid[row];

    // Any face-down card disqualifies
    if (cards.some((c) => !c.faceUp)) continue;

    let increasing = true;
    for (let i = 1; i < 4; i++) {
      if (cards[i].value <= cards[i - 1].value) {
        increasing = false;
        break;
      }
    }

    if (increasing) bonus += 10;
  }

  return bonus;
}

/**
 * Determine which columns and rows are valid structures,
 * then award +10 for each prism card that participates in at least one.
 *
 * @param {Array<Array<{value:number, color:string|null, faceUp:boolean, hasPrism:boolean}>>} grid 3×4
 * @returns {number} bonus points
 */
export function calcPrismBonus(grid) {
  // Determine valid columns
  const validCols = new Set();
  for (let col = 0; col < 4; col++) {
    const cards = [grid[0][col], grid[1][col], grid[2][col]];
    if (cards.some((c) => !c.faceUp)) continue;
    if (cards.some((c) => c.color === null)) continue;
    const concreteColors = cards
      .filter((c) => c.color !== 'multicolor')
      .map((c) => c.color);
    if (concreteColors.length === 0 || concreteColors.every((c) => c === concreteColors[0])) {
      validCols.add(col);
    }
  }

  // Determine valid rows
  const validRows = new Set();
  for (let row = 0; row < 3; row++) {
    const cards = grid[row];
    if (cards.some((c) => !c.faceUp)) continue;
    let increasing = true;
    for (let i = 1; i < 4; i++) {
      if (cards[i].value <= cards[i - 1].value) {
        increasing = false;
        break;
      }
    }
    if (increasing) validRows.add(row);
  }

  // Award prism bonus: +10 once if any prismed card is in a valid structure
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const card = grid[row][col];
      if (card.hasPrism && (validCols.has(col) || validRows.has(row))) {
        return 10;
      }
    }
  }

  return 0;
}

/**
 * Calculate the full round score breakdown.
 *
 * @param {Array<Array<{value:number, color:string|null, faceUp:boolean, hasPrism:boolean}>>} grid 3×4
 * @returns {{visibleSum:number, faceDownCount:number, faceDownPenalty:number, baseScore:number, columnBonus:number, rowBonus:number, prismBonus:number, total:number}}
 */
export function calcRoundScore(grid) {
  let visibleSum = 0;
  let faceDownCount = 0;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const card = grid[row][col];
      if (card.faceUp) {
        visibleSum += card.value;
      } else {
        faceDownCount++;
      }
    }
  }

  const faceDownPenalty = faceDownCount > 0 ? faceDownCount * -5 : 0;
  const baseScore = visibleSum + faceDownPenalty;
  const columnBonus = calcColumnBonus(grid);
  const rowBonus = calcRowBonus(grid);
  const prismBonus = calcPrismBonus(grid);
  const total = baseScore + columnBonus + rowBonus + prismBonus;

  return {
    visibleSum,
    faceDownCount,
    faceDownPenalty,
    baseScore,
    columnBonus,
    rowBonus,
    prismBonus,
    total,
  };
}
