/** @module bot – Bot AI module for LUMINA */

import { calcRoundScore } from './scoring.js';
import { COLORS } from './cards.js';

// ══════════════════════════════════════════════════════════════════════
// ── Helpers ──────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Get all face-down card positions for a player.
 */
function getFaceDownPositions(grid) {
  const positions = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (!grid[r][c].faceUp) positions.push([r, c]);
    }
  }
  return positions;
}

/**
 * Get all face-up, non-prismed card positions for a player.
 */
function getVisibleUnprismedPositions(grid) {
  const positions = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (card.faceUp && !card.hasPrism) positions.push([r, c]);
    }
  }
  return positions;
}

/**
 * Get all face-up card positions for a player.
 */
function getVisiblePositions(grid) {
  const positions = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c].faceUp) positions.push([r, c]);
    }
  }
  return positions;
}

/**
 * Find the position of the lowest-value visible, non-prismed card.
 */
function findLowestVisible(grid) {
  let minVal = Infinity;
  const candidates = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (card.faceUp && !card.hasPrism) {
        if (card.value < minVal) {
          minVal = card.value;
          candidates.length = 0;
          candidates.push([r, c]);
        } else if (card.value === minVal) {
          candidates.push([r, c]);
        }
      }
    }
  }
  return candidates.length > 0 ? pickRandom(candidates) : null;
}

/**
 * Find the position of the highest-value visible, non-prismed card.
 */
function findHighestVisible(grid) {
  let maxVal = -Infinity;
  const candidates = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (card.faceUp && !card.hasPrism) {
        if (card.value > maxVal) {
          maxVal = card.value;
          candidates.length = 0;
          candidates.push([r, c]);
        } else if (card.value === maxVal) {
          candidates.push([r, c]);
        }
      }
    }
  }
  return candidates.length > 0 ? pickRandom(candidates) : null;
}

/**
 * Pick a random element from an array.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get the top discard card (or null if empty).
 */
function topDiscard(game) {
  if (game.discard.length === 0) return null;
  return game.discard[game.discard.length - 1];
}

/**
 * Check if a column has all same color (valid structure).
 * Returns true if all 3 cards are face-up and share a color (multicolor is wildcard).
 */
function isValidColumn(grid, col) {
  const cards = [grid[0][col], grid[1][col], grid[2][col]];
  if (cards.some((c) => !c.faceUp)) return false;
  if (cards.some((c) => c.color === null)) return false;
  const concreteColors = cards
    .filter((c) => c.color !== 'multicolor')
    .map((c) => c.color);
  if (concreteColors.length === 0) return true;
  return concreteColors.every((c) => c === concreteColors[0]);
}

/**
 * Check if a row is strictly increasing (valid structure).
 */
function isValidRow(grid, row) {
  const cards = grid[row];
  if (cards.some((c) => !c.faceUp)) return false;
  for (let i = 1; i < 4; i++) {
    if (cards[i].value <= cards[i - 1].value) return false;
  }
  return true;
}

/**
 * Check if a card at (row, col) is in a valid structure.
 */
function isInValidStructure(grid, row, col) {
  return isValidColumn(grid, col) || isValidRow(grid, row);
}

/**
 * Count how many cards in a column share the same color as a given color.
 * Multicolor counts as matching. Null color never matches.
 */
function columnColorMatchCount(grid, col, color) {
  if (color === null) return 0;
  let count = 0;
  for (let r = 0; r < 3; r++) {
    const card = grid[r][col];
    if (!card.faceUp) continue;
    if (card.color === 'multicolor' || card.color === color) count++;
  }
  return count;
}

/**
 * Get valid attack targets from all opponents.
 */
function getValidAttackTargets(game, playerIndex) {
  const targets = [];
  for (let di = 0; di < game.players.length; di++) {
    if (di === playerIndex) continue;
    const defender = game.players[di];
    if (game.phase === 'final_turns' && game.isLumina(di)) continue;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const card = defender.grid[r][c];
        if (card.faceUp && !card.hasPrism && !card.immune) {
          targets.push({ defenderIndex: di, row: r, col: c, card });
        }
      }
    }
  }
  return targets;
}

/**
 * Calculate average visible score across all players.
 */
function averageVisibleScore(game) {
  let total = 0;
  let count = 0;
  for (const player of game.players) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const card = player.grid[r][c];
        if (card.faceUp) {
          total += card.value;
          count++;
        }
      }
    }
  }
  return count > 0 ? total / count : 0;
}

/**
 * Count how many face-up cards in a row are in ascending order from left.
 * Returns count of sequential ascending cards.
 */
function rowAscendingCount(grid, row) {
  const cards = grid[row];
  const faceUpEntries = [];
  for (let c = 0; c < 4; c++) {
    if (cards[c].faceUp) {
      faceUpEntries.push({ col: c, value: cards[c].value });
    }
  }
  if (faceUpEntries.length <= 1) return faceUpEntries.length;

  let ascending = 1;
  for (let i = 1; i < faceUpEntries.length; i++) {
    if (faceUpEntries[i].value > faceUpEntries[i - 1].value) {
      ascending++;
    } else {
      break;
    }
  }
  return ascending;
}

/**
 * Find the player with the highest cumulative score (excluding self).
 */
function findLeadingOpponent(game, playerIndex) {
  let maxScore = -Infinity;
  let leader = -1;
  for (let i = 0; i < game.players.length; i++) {
    if (i === playerIndex) continue;
    if (game.cumulativeScores[i] > maxScore) {
      maxScore = game.cumulativeScores[i];
      leader = i;
    }
  }
  return leader;
}

// ══════════════════════════════════════════════════════════════════════
// ── chooseBotReveal ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Choose 2 cards for a bot to reveal during the reveal phase.
 * @param {object} game - The game state
 * @param {number} playerIndex - The bot's player index
 * @returns {[[number, number], [number, number]]} Two [row, col] positions
 */
export function chooseBotReveal(game, playerIndex) {
  const player = game.players[playerIndex];
  const difficulty = player.difficulty || 'easy';
  const grid = player.grid;
  const faceDown = getFaceDownPositions(grid);

  if (difficulty === 'easy') {
    // Easy: Random 2 positions
    const shuffled = [...faceDown].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
  }

  if (difficulty === 'medium') {
    // Medium: Prefer corner positions — they participate in both a row and column
    const corners = [[0, 0], [0, 3], [2, 0], [2, 3]];
    const availableCorners = corners.filter(([r, c]) => !grid[r][c].faceUp);
    if (availableCorners.length >= 2) {
      const shuffled = [...availableCorners].sort(() => Math.random() - 0.5);
      return [shuffled[0], shuffled[1]];
    }
    // Fall back to random if not enough corners
    const shuffled = [...faceDown].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
  }

  // Hard: Pick pair with highest information value
  // Corners = 3, edges = 2, center = 1 — with randomness for ties
  const infoValue = (r, c) => {
    const isCorner = (r === 0 || r === 2) && (c === 0 || c === 3);
    const isEdge = (r === 0 || r === 2 || c === 0 || c === 3);
    if (isCorner) return 3;
    if (isEdge) return 2;
    return 1;
  };

  // Score all pairs
  const scoredPairs = [];
  for (let i = 0; i < faceDown.length; i++) {
    for (let j = i + 1; j < faceDown.length; j++) {
      const [r1, c1] = faceDown[i];
      const [r2, c2] = faceDown[j];
      let score = infoValue(r1, c1) + infoValue(r2, c2);

      for (const [r, c] of [faceDown[i], faceDown[j]]) {
        for (let row = 0; row < 3; row++) {
          if (row === r) continue;
          const other = grid[row][c];
          if (other.faceUp && other.color && other.color !== 'multicolor' && other.color !== null) {
            score += 0.1;
          }
        }
      }

      scoredPairs.push({ pair: [faceDown[i], faceDown[j]], score });
    }
  }

  if (scoredPairs.length === 0) return [faceDown[0], faceDown[1]];

  // Find max score and randomly pick among ties
  const maxScore = Math.max(...scoredPairs.map((p) => p.score));
  const topPairs = scoredPairs.filter((p) => p.score >= maxScore - 0.01);
  const pick = topPairs[Math.floor(Math.random() * topPairs.length)];
  return pick.pair;
}

// ══════════════════════════════════════════════════════════════════════
// ── chooseBotAction ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Choose the best action for a bot based on its difficulty.
 * @param {object} game - The game state
 * @param {number} playerIndex - The bot's player index
 * @returns {object} An action object
 */
export function chooseBotAction(game, playerIndex) {
  const player = game.players[playerIndex];
  const difficulty = player.difficulty || 'easy';

  switch (difficulty) {
    case 'easy':
      return chooseEasyAction(game, playerIndex);
    case 'medium':
      return chooseMediumAction(game, playerIndex);
    case 'hard':
      return chooseHardAction(game, playerIndex);
    default:
      return chooseEasyAction(game, playerIndex);
  }
}

// ══════════════════════════════════════════════════════════════════════
// ── Easy Bot ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Easy bot: 70% construct, 20% secure, 10% attack.
 * Random valid actions mostly.
 * Stupidity floor: never secures a -2, never attacks to get a worse card.
 * Does not intentionally pursue LUMINA.
 */
function chooseEasyAction(game, playerIndex) {
  const available = game.getAvailableActions(playerIndex);
  const player = game.players[playerIndex];
  const grid = player.grid;

  // Weighted random action selection
  const roll = Math.random();
  let actionType;

  if (roll < 0.70) {
    actionType = 'construct';
  } else if (roll < 0.90 && available.includes('secure')) {
    actionType = 'secure';
  } else if (available.includes('attack')) {
    actionType = 'attack';
  } else {
    actionType = 'construct';
  }

  // Attempt the chosen action, fall back to construct if invalid
  if (actionType === 'secure') {
    const action = buildSecureAction(game, playerIndex, 'easy');
    if (action) return action;
    actionType = 'construct'; // fallback
  }

  if (actionType === 'attack') {
    const action = buildAttackAction(game, playerIndex, 'easy');
    if (action) return action;
    actionType = 'construct'; // fallback
  }

  return buildConstructAction(game, playerIndex, 'easy');
}

// ══════════════════════════════════════════════════════════════════════
// ── Medium Bot ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Medium bot — Heuristic-based decision making:
 * - Discard evaluation: take from discard if value >= 7 AND it improves a visible position
 * - Column awareness: prefer placements where card color matches existing face-up cards
 * - Row awareness: when 3/4 ascending, prioritize completing the sequence
 * - Opponent tracking: attack the player with highest cumulative score
 * - Secure timing: only secure cards >= 7 in completed structures
 * - LUMINA awareness: when 2 face-down remaining, boost reveal actions
 * - Attack frequency: 25% chance when delta >= 4
 */
function chooseMediumAction(game, playerIndex) {
  const available = game.getAvailableActions(playerIndex);
  const player = game.players[playerIndex];
  const grid = player.grid;
  const discard = topDiscard(game);
  const faceDown = getFaceDownPositions(grid);

  // ── LUMINA awareness: when 2 face-down remaining, boost construct/deck_discard to reveal ──
  if (faceDown.length <= 2 && faceDown.length > 0) {
    // Prioritize actions that reveal face-down cards
    // If discard is good, place it on a face-down position
    if (discard && discard.value >= 7 && faceDown.length > 0) {
      const pos = pickRandom(faceDown);
      return { type: 'construct', source: 'discard', row: pos[0], col: pos[1] };
    }
    // Otherwise construct from deck onto a face-down, or deck_discard to reveal
    if (faceDown.length > 0) {
      const pos = pickRandom(faceDown);
      if (Math.random() < 0.5) {
        return { type: 'construct', source: 'deck', row: pos[0], col: pos[1] };
      }
      return { type: 'construct', source: 'deck_discard', revealRow: pos[0], revealCol: pos[1] };
    }
  }

  // ── 1. Discard evaluation: take from discard if value >= 7 AND improves a visible position ──
  if (discard && discard.value >= 7) {
    let bestPos = null;
    let bestImprovement = 0;

    // Check all visible unprismed positions for improvement
    const visiblePositions = getVisibleUnprismedPositions(grid);
    for (const [r, c] of visiblePositions) {
      const oldCard = grid[r][c];
      if (discard.value > oldCard.value) {
        let improvement = discard.value - oldCard.value;

        // Column color awareness bonus: if discard color matches column cards
        if (discard.color && discard.color !== null) {
          const matchCount = columnColorMatchCount(grid, c, discard.color);
          if (matchCount === 2) improvement += 5; // would complete column
          else if (matchCount === 1) improvement += 2;
        }

        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestPos = [r, c];
        }
      }
    }

    // Also consider placing on face-down positions
    for (const [r, c] of faceDown) {
      let improvement = discard.value - 6; // assume average hidden value ~6
      if (discard.color && discard.color !== null) {
        const matchCount = columnColorMatchCount(grid, c, discard.color);
        if (matchCount === 2) improvement += 5;
        else if (matchCount === 1) improvement += 2;
      }
      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        bestPos = [r, c];
      }
    }

    if (bestPos && bestImprovement > 0) {
      return { type: 'construct', source: 'discard', row: bestPos[0], col: bestPos[1] };
    }
  }

  // ── 2. Row awareness: if 3/4 ascending in a row, try to complete it ──
  for (let row = 0; row < 3; row++) {
    const cards = grid[row];
    const faceUpInRow = [];
    let gapCol = -1;

    for (let c = 0; c < 4; c++) {
      if (cards[c].faceUp && !cards[c].hasPrism) {
        faceUpInRow.push({ col: c, value: cards[c].value });
      } else if (!cards[c].faceUp) {
        gapCol = c;
      }
    }

    // If exactly 3 face-up cards and 1 face-down, check if 3 are ascending
    if (faceUpInRow.length === 3 && gapCol >= 0) {
      faceUpInRow.sort((a, b) => a.col - b.col);
      let ascending = true;
      for (let i = 1; i < faceUpInRow.length; i++) {
        if (faceUpInRow[i].value <= faceUpInRow[i - 1].value) {
          ascending = false;
          break;
        }
      }
      if (ascending) {
        // Try to complete by constructing at the gap
        return { type: 'construct', source: 'deck', row: row, col: gapCol };
      }
    }
  }

  // ── 3. Secure timing: only secure cards >= 7 in completed structures ──
  if (available.includes('secure') && player.prismsRemaining > 0) {
    let bestSecure = null;
    let bestSecureValue = 0;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const card = grid[r][c];
        if (!card.faceUp || card.hasPrism) continue;
        if (card.value < 7) continue;
        if (!isInValidStructure(grid, r, c)) continue;

        if (card.value > bestSecureValue) {
          bestSecureValue = card.value;
          bestSecure = { type: 'secure', row: r, col: c };
        }
      }
    }

    if (bestSecure) return bestSecure;
  }

  // ── 4. Attack: 25% chance when delta >= 4, prefer leading opponent ──
  if (available.includes('attack') && Math.random() < 0.25) {
    const action = buildMediumAttackAction(game, playerIndex);
    if (action) return action;
  }

  // ── 5. Column awareness: construct from deck, placing in color-matching columns ──
  return buildMediumConstructAction(game, playerIndex);
}

/**
 * Medium bot attack: prefer targeting the player with the highest cumulative score,
 * targeting their high-value cards. Delta threshold: >= 4.
 */
function buildMediumAttackAction(game, playerIndex) {
  const player = game.players[playerIndex];
  const grid = player.grid;
  const attackerPositions = getVisibleUnprismedPositions(grid);
  const costPositions = getFaceDownPositions(grid);
  const targets = getValidAttackTargets(game, playerIndex);

  if (attackerPositions.length === 0 || costPositions.length === 0 || targets.length === 0) {
    return null;
  }

  const leadingOpponent = findLeadingOpponent(game, playerIndex);

  // Build valid pairs with delta >= 4
  const validPairs = [];
  for (const [ar, ac] of attackerPositions) {
    const attackerCard = grid[ar][ac];
    for (const target of targets) {
      const delta = target.card.value - attackerCard.value;
      if (delta >= 4) {
        // Bonus for targeting leading opponent
        const leaderBonus = target.defenderIndex === leadingOpponent ? 3 : 0;
        // Bonus for targeting high-value cards
        const valueBonus = target.card.value;
        validPairs.push({
          ar, ac, target, delta,
          score: delta + leaderBonus + valueBonus,
        });
      }
    }
  }

  if (validPairs.length === 0) return null;

  // Pick the best scoring pair
  validPairs.sort((a, b) => b.score - a.score);
  const pick = validPairs[0];
  const [costR, costC] = pickRandom(costPositions);

  return {
    type: 'attack',
    attackerRow: pick.ar,
    attackerCol: pick.ac,
    defenderIndex: pick.target.defenderIndex,
    defenderRow: pick.target.row,
    defenderCol: pick.target.col,
    revealRow: costR,
    revealCol: costC,
  };
}

/**
 * Medium bot construct: prefer placing cards in columns where the color matches.
 */
function buildMediumConstructAction(game, playerIndex) {
  const player = game.players[playerIndex];
  const grid = player.grid;
  const discard = topDiscard(game);
  const faceDown = getFaceDownPositions(grid);

  // Find best target position with column color awareness
  const lowestPos = findLowestVisible(grid);

  let targetRow, targetCol;

  if (lowestPos) {
    [targetRow, targetCol] = lowestPos;
  } else if (faceDown.length > 0) {
    [targetRow, targetCol] = pickRandom(faceDown);
  } else {
    const unprismed = getVisibleUnprismedPositions(grid);
    if (unprismed.length > 0) {
      [targetRow, targetCol] = pickRandom(unprismed);
    } else {
      targetRow = 0;
      targetCol = 0;
    }
  }

  return { type: 'construct', source: 'deck', row: targetRow, col: targetCol };
}

// ══════════════════════════════════════════════════════════════════════
// ── Hard Bot — Monte Carlo + Utility Engine ─────────────────────────
// ══════════════════════════════════════════════════════════════════════

/**
 * Hard bot: Generate ALL valid actions, run Monte Carlo simulation for each,
 * pick the one with the highest average evaluation.
 */
function chooseHardAction(game, playerIndex) {
  const candidates = generateAllCandidateActions(game, playerIndex);

  if (candidates.length === 0) {
    return buildConstructAction(game, playerIndex, 'hard');
  }

  // Run Monte Carlo for each candidate
  let bestAction = candidates[0];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const score = simulateGame(game, playerIndex, candidate, 3, 50);
    if (score > bestScore) {
      bestScore = score;
      bestAction = candidate;
    }
  }

  return bestAction;
}

/**
 * Generate all valid actions for the hard bot to evaluate.
 */
function generateAllCandidateActions(game, playerIndex) {
  const player = game.players[playerIndex];
  const grid = player.grid;
  const available = game.getAvailableActions(playerIndex);
  const discard = topDiscard(game);
  const faceDown = getFaceDownPositions(grid);
  const visibleUnprismed = getVisibleUnprismedPositions(grid);
  const candidates = [];

  // ── Construct from deck: at each valid position ──
  for (const [r, c] of visibleUnprismed) {
    candidates.push({ type: 'construct', source: 'deck', row: r, col: c });
  }
  for (const [r, c] of faceDown) {
    candidates.push({ type: 'construct', source: 'deck', row: r, col: c });
  }

  // ── Construct from discard: at each valid position ──
  if (discard) {
    for (const [r, c] of visibleUnprismed) {
      candidates.push({ type: 'construct', source: 'discard', row: r, col: c });
    }
    for (const [r, c] of faceDown) {
      candidates.push({ type: 'construct', source: 'discard', row: r, col: c });
    }
  }

  // ── Construct deck_discard: reveal each face-down ──
  for (const [r, c] of faceDown) {
    candidates.push({ type: 'construct', source: 'deck_discard', revealRow: r, revealCol: c });
  }

  // ── Attack: all valid attacker-target-cost combinations ──
  if (available.includes('attack') && faceDown.length > 0 && visibleUnprismed.length > 0) {
    const targets = getValidAttackTargets(game, playerIndex);
    // Limit combinatorial explosion: pick a random cost position
    const costPos = pickRandom(faceDown);

    for (const target of targets) {
      for (const [ar, ac] of visibleUnprismed) {
        const attackerCard = grid[ar][ac];
        if (target.card.value <= attackerCard.value) continue; // skip bad swaps

        candidates.push({
          type: 'attack',
          attackerRow: ar,
          attackerCol: ac,
          defenderIndex: target.defenderIndex,
          defenderRow: target.row,
          defenderCol: target.col,
          revealRow: costPos[0],
          revealCol: costPos[1],
        });
      }
    }
  }

  // ── Secure: prefer highest-value cards in valid structures ──
  if (available.includes('secure') && player.prismsRemaining > 0) {
    // Collect all securable positions in valid structures
    const secureCandidates = [];
    for (const [r, c] of visibleUnprismed) {
      const card = grid[r][c];
      if (card.value >= 5 && isInValidStructure(grid, r, c)) {
        secureCandidates.push({ r, c, value: card.value });
      }
    }

    if (secureCandidates.length > 0) {
      // Sort by value descending — only send top candidates to MC (avoid noise)
      secureCandidates.sort((a, b) => b.value - a.value);
      const maxValue = secureCandidates[0].value;
      // Only include candidates within 2 points of the best
      for (const sc of secureCandidates) {
        if (sc.value >= maxValue - 2) {
          candidates.push({ type: 'secure', row: sc.r, col: sc.c });
        }
      }
    } else {
      // Fallback: consider high-value cards even outside structures
      for (const [r, c] of visibleUnprismed) {
        if (grid[r][c].value >= 8) {
          candidates.push({ type: 'secure', row: r, col: c });
        }
      }
    }
  }

  return candidates;
}

// ── Monte Carlo Simulation Engine ───────────────────────────────────

/**
 * Clone the game state into a minimal plain object for simulation.
 * No class instances, no DOM, just arrays and primitives.
 */
function cloneGameForSim(game) {
  const players = game.players.map((p) => ({
    name: p.name,
    isBot: p.isBot,
    difficulty: p.difficulty,
    prismsRemaining: p.prismsRemaining,
    grid: p.grid.map((row) =>
      row.map((card) => ({
        value: card.value,
        color: card.color,
        faceUp: card.faceUp,
        hasPrism: card.hasPrism,
        immune: card.immune,
      }))
    ),
  }));

  return {
    players,
    deckLength: game.deck.length,
    discard: game.discard.map((c) => ({ value: c.value, color: c.color })),
    cumulativeScores: [...game.cumulativeScores],
    phase: game.phase,
    currentPlayerIndex: game.currentPlayerIndex,
  };
}

/**
 * Apply an action to a cloned game state (in-place mutation).
 * Simplified — no full game method calls, just direct array manipulation.
 */
function applyActionToClone(clone, playerIndex, action) {
  const player = clone.players[playerIndex];
  const grid = player.grid;

  if (action.type === 'construct') {
    if (action.source === 'discard' && clone.discard.length > 0) {
      const drawn = clone.discard.pop();
      const target = grid[action.row][action.col];
      clone.discard.push({ value: target.value, color: target.color });
      target.value = drawn.value;
      target.color = drawn.color;
      target.faceUp = true;
      target.hasPrism = false;
      target.immune = false;
    } else if (action.source === 'deck_discard') {
      const randomCard = generateRandomCard();
      clone.discard.push(randomCard);
      clone.deckLength = Math.max(0, clone.deckLength - 1);
      if (action.revealRow !== undefined) {
        grid[action.revealRow][action.revealCol].faceUp = true;
      }
    } else {
      const randomCard = generateRandomCard();
      const target = grid[action.row][action.col];
      clone.discard.push({ value: target.value, color: target.color });
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

    if (action.revealRow !== undefined) {
      grid[action.revealRow][action.revealCol].faceUp = true;
    }

    const aVal = attackerCard.value, aCol = attackerCard.color;
    const dVal = defenderCard.value, dCol = defenderCard.color;

    attackerCard.value = dVal;
    attackerCard.color = dCol;
    attackerCard.faceUp = true;
    attackerCard.hasPrism = false;
    attackerCard.immune = false;

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

/**
 * Generate a random card for simulation (approximating deck composition).
 */
function generateRandomCard() {
  const roll = Math.random();
  if (roll < 0.857) {
    // 96/112 = ~85.7% chance of vector card
    const value = Math.floor(Math.random() * 12) + 1;
    const color = COLORS[Math.floor(Math.random() * 4)];
    return { value, color };
  } else if (roll < 0.928) {
    // 8/112 = ~7.1% multicolor
    return { value: -2, color: 'multicolor' };
  } else {
    // 8/112 = ~7.1% colorless
    return { value: 15, color: null };
  }
}

/**
 * Generate a random valid action for a simulated player.
 */
function generateRandomAction(clone, playerIndex) {
  const player = clone.players[playerIndex];
  const grid = player.grid;

  let faceDownCount = 0, visibleUnprismedCount = 0;
  let fdR = -1, fdC = -1, vuR = -1, vuC = -1;
  let allCount = 0, allR = -1, allC = -1;

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

  const roll = Math.random();

  if (roll < 0.15 && faceDownCount > 0 && visibleUnprismedCount > 0) {
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
    if (vuR >= 0 && grid[vuR][vuC].value >= 5) {
      return { type: 'secure', row: vuR, col: vuC };
    }
  }

  if (allCount === 0) {
    return { type: 'construct', source: 'deck', row: 0, col: 0 };
  }

  if (clone.discard.length > 0 && Math.random() < 0.3) {
    return { type: 'construct', source: 'discard', row: allR, col: allC };
  }

  if (faceDownCount > 0 && Math.random() < 0.2) {
    return { type: 'construct', source: 'deck_discard', revealRow: fdR, revealCol: fdC };
  }

  return { type: 'construct', source: 'deck', row: allR, col: allC };
}

/**
 * Evaluate the board state for a given player.
 * Returns a numeric score representing board quality.
 */
function evaluateBoard(clone, playerIndex) {
  const player = clone.players[playerIndex];
  const grid = player.grid;
  let score = 0;

  // Sum of face-up card values
  let faceDownCount = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (card.faceUp) {
        score += card.value;
      } else {
        faceDownCount++;
      }
    }
  }

  // -3 per face-down card (unknown risk)
  score -= faceDownCount * 3;

  // +10 per completed column bonus
  for (let col = 0; col < 4; col++) {
    if (isValidColumnClone(grid, col)) {
      score += 10;
    } else {
      // +5 per card that's 1 away from completing a column structure
      const colCards = [grid[0][col], grid[1][col], grid[2][col]];
      const faceUpCards = colCards.filter((c) => c.faceUp);
      if (faceUpCards.length === 2) {
        const faceDownInCol = colCards.filter((c) => !c.faceUp);
        if (faceDownInCol.length === 1) {
          // Check if the 2 face-up cards match color
          const concreteColors = faceUpCards
            .filter((c) => c.color !== 'multicolor' && c.color !== null)
            .map((c) => c.color);
          if (concreteColors.length <= 1 || concreteColors.every((c) => c === concreteColors[0])) {
            if (!faceUpCards.some((c) => c.color === null)) {
              score += 5;
            }
          }
        }
      }
    }
  }

  // +10 per completed row bonus
  for (let row = 0; row < 3; row++) {
    if (isValidRowClone(grid, row)) {
      score += 10;
    } else {
      // +5 if 1 away from completing a row
      const cards = grid[row];
      const faceUpCount = cards.filter((c) => c.faceUp).length;
      if (faceUpCount === 3) {
        // Check if the 3 face-up cards are ascending in their positions
        const faceUpEntries = [];
        for (let c = 0; c < 4; c++) {
          if (cards[c].faceUp) {
            faceUpEntries.push({ col: c, value: cards[c].value });
          }
        }
        faceUpEntries.sort((a, b) => a.col - b.col);
        let ascending = true;
        for (let i = 1; i < faceUpEntries.length; i++) {
          if (faceUpEntries[i].value <= faceUpEntries[i - 1].value) {
            ascending = false;
            break;
          }
        }
        if (ascending) score += 5;
      }
    }
  }

  // +10 if any prismed card in valid structure (prism bonus)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (card.hasPrism && (isValidColumnClone(grid, c) || isValidRowClone(grid, r))) {
        score += 10;
        break; // only once
      }
    }
  }

  // -0.5 * (max opponent visible score - my visible score) if behind
  let myVisibleScore = 0;
  let maxOppVisibleScore = -Infinity;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c].faceUp) myVisibleScore += grid[r][c].value;
    }
  }
  for (let i = 0; i < clone.players.length; i++) {
    if (i === playerIndex) continue;
    let oppScore = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (clone.players[i].grid[r][c].faceUp) {
          oppScore += clone.players[i].grid[r][c].value;
        }
      }
    }
    if (oppScore > maxOppVisibleScore) maxOppVisibleScore = oppScore;
  }
  if (maxOppVisibleScore > myVisibleScore) {
    score -= 0.5 * (maxOppVisibleScore - myVisibleScore);
  }

  // LUMINA proximity bonus
  if (faceDownCount === 1) score += 15;
  else if (faceDownCount === 2) score += 8;

  return score;
}

/**
 * Check valid column for clone grids (no game object needed).
 */
function isValidColumnClone(grid, col) {
  const cards = [grid[0][col], grid[1][col], grid[2][col]];
  if (cards.some((c) => !c.faceUp)) return false;
  if (cards.some((c) => c.color === null)) return false;
  const concreteColors = cards
    .filter((c) => c.color !== 'multicolor')
    .map((c) => c.color);
  if (concreteColors.length === 0) return true;
  return concreteColors.every((c) => c === concreteColors[0]);
}

/**
 * Check valid row for clone grids (no game object needed).
 */
function isValidRowClone(grid, row) {
  const cards = grid[row];
  if (cards.some((c) => !c.faceUp)) return false;
  for (let i = 1; i < 4; i++) {
    if (cards[i].value <= cards[i - 1].value) return false;
  }
  return true;
}

/**
 * Run Monte Carlo simulation for a candidate action.
 * Deep clones the game state, applies the action, then simulates
 * `iterations` random continuations of `depth` turns each.
 * Returns average board evaluation score.
 *
 * @param {object} game - Real game state
 * @param {number} playerIndex - The hard bot's index
 * @param {object} action - The candidate action to evaluate
 * @param {number} depth - Number of turns to simulate (default 3)
 * @param {number} iterations - Number of random simulations (default 50)
 * @returns {number} Average evaluation score
 */
function simulateGame(game, playerIndex, action, depth = 3, iterations = 50) {
  let totalScore = 0;
  const numPlayers = game.players.length;

  for (let iter = 0; iter < iterations; iter++) {
    // Clone and apply the candidate action
    const clone = cloneGameForSim(game);
    applyActionToClone(clone, playerIndex, action);

    // Simulate `depth` rounds of play for all players
    let currentPlayer = (playerIndex + 1) % numPlayers;
    for (let d = 0; d < depth * numPlayers; d++) {
      const randomAction = generateRandomAction(clone, currentPlayer);
      applyActionToClone(clone, currentPlayer, randomAction);
      currentPlayer = (currentPlayer + 1) % numPlayers;
    }

    // Evaluate the resulting board for our player
    totalScore += evaluateBoard(clone, playerIndex);

    // Also factor in attack targeting bonuses from the original action
    if (action.type === 'attack') {
      const defenderGrid = game.players[action.defenderIndex].grid;
      if (isInValidStructure(defenderGrid, action.defenderRow, action.defenderCol)) {
        totalScore += 3; // bonus for breaking opponent structure
      }
      if (action.defenderIndex === findLeadingOpponent(game, playerIndex)) {
        totalScore += 2; // bonus for targeting leader
      }
    }
  }

  return totalScore / iterations;
}

// ══════════════════════════════════════════════════════════════════════
// ── Action Builders (shared / fallback) ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════

function buildConstructAction(game, playerIndex, difficulty) {
  const player = game.players[playerIndex];
  const grid = player.grid;
  const discard = topDiscard(game);

  // For medium/hard: prefer replacing lowest visible card
  if (difficulty !== 'easy') {
    // Check discard first
    if (discard && discard.value >= 8) {
      const lowestPos = findLowestVisible(grid);
      if (lowestPos) {
        const lowestCard = grid[lowestPos[0]][lowestPos[1]];
        if (discard.value > lowestCard.value) {
          return {
            type: 'construct',
            source: 'discard',
            row: lowestPos[0],
            col: lowestPos[1],
          };
        }
      }
    }
  }

  // Find a target position: prefer lowest visible or random face-down
  const lowestPos = findLowestVisible(grid);
  const faceDown = getFaceDownPositions(grid);

  let targetRow, targetCol;

  if (lowestPos && (difficulty !== 'easy' || Math.random() < 0.5)) {
    [targetRow, targetCol] = lowestPos;
  } else if (faceDown.length > 0) {
    [targetRow, targetCol] = pickRandom(faceDown);
  } else if (lowestPos) {
    [targetRow, targetCol] = lowestPos;
  } else {
    // All prismed? Just pick any non-prismed position
    const unprismed = getVisibleUnprismedPositions(grid);
    if (unprismed.length > 0) {
      [targetRow, targetCol] = pickRandom(unprismed);
    } else {
      // Extremely rare: all cards prismed. Use deck_discard on face-down if any
      if (faceDown.length > 0) {
        const [r, c] = pickRandom(faceDown);
        return { type: 'construct', source: 'deck_discard', revealRow: r, revealCol: c };
      }
      // Absolute fallback
      targetRow = 0;
      targetCol = 0;
    }
  }

  // Easy bot: random source choice
  if (difficulty === 'easy') {
    const sourceRoll = Math.random();
    if (sourceRoll < 0.6) {
      return { type: 'construct', source: 'deck', row: targetRow, col: targetCol };
    } else if (discard && sourceRoll < 0.85) {
      return { type: 'construct', source: 'discard', row: targetRow, col: targetCol };
    } else if (faceDown.length > 0) {
      const [r, c] = pickRandom(faceDown);
      return { type: 'construct', source: 'deck_discard', revealRow: r, revealCol: c };
    }
  }

  return { type: 'construct', source: 'deck', row: targetRow, col: targetCol };
}

function buildAttackAction(game, playerIndex, difficulty) {
  const player = game.players[playerIndex];
  const grid = player.grid;

  const attackerPositions = getVisibleUnprismedPositions(grid);
  const costPositions = getFaceDownPositions(grid);
  const targets = getValidAttackTargets(game, playerIndex);

  if (
    attackerPositions.length === 0 ||
    costPositions.length === 0 ||
    targets.length === 0
  ) {
    return null;
  }

  // Filter: never attack to get a worse card (stupidity floor for all difficulties)
  const validPairs = [];
  for (const [ar, ac] of attackerPositions) {
    const attackerCard = grid[ar][ac];
    for (const target of targets) {
      if (target.card.value > attackerCard.value) {
        const delta = target.card.value - attackerCard.value;
        validPairs.push({ ar, ac, target, delta });
      }
    }
  }

  if (validPairs.length === 0) return null;

  // Easy / default: pick random valid pair
  const pick = pickRandom(validPairs);
  const [costR, costC] = pickRandom(costPositions);
  return {
    type: 'attack',
    attackerRow: pick.ar,
    attackerCol: pick.ac,
    defenderIndex: pick.target.defenderIndex,
    defenderRow: pick.target.row,
    defenderCol: pick.target.col,
    revealRow: costR,
    revealCol: costC,
  };
}

function buildSecureAction(game, playerIndex, difficulty) {
  const player = game.players[playerIndex];
  const grid = player.grid;

  if (player.prismsRemaining <= 0) return null;

  const positions = getVisibleUnprismedPositions(grid);
  if (positions.length === 0) return null;

  // Stupidity floor: never secure a -2 card
  const validPositions = positions.filter(
    ([r, c]) => grid[r][c].value !== -2
  );

  if (validPositions.length === 0) return null;

  // Easy: random valid position
  if (difficulty === 'easy') {
    const [r, c] = pickRandom(validPositions);
    return { type: 'secure', row: r, col: c };
  }

  // Medium/Hard: prefer high-value cards in valid structures
  const structured = validPositions.filter(([r, c]) =>
    isInValidStructure(grid, r, c)
  );

  if (structured.length > 0) {
    // Pick highest value in structure
    structured.sort(
      (a, b) => grid[b[0]][b[1]].value - grid[a[0]][a[1]].value
    );
    return { type: 'secure', row: structured[0][0], col: structured[0][1] };
  }

  // Fallback: highest value card
  validPositions.sort(
    (a, b) => grid[b[0]][b[1]].value - grid[a[0]][a[1]].value
  );
  return { type: 'secure', row: validPositions[0][0], col: validPositions[0][1] };
}
