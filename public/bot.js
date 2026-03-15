/** @module bot – Bot AI module for LUMINA */

import { calcRoundScore } from './scoring.js';
import { COLORS } from './cards.js';

// ── Helpers ─────────────────────────────────────────────────────────

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
  let minPos = null;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (card.faceUp && !card.hasPrism && card.value < minVal) {
        minVal = card.value;
        minPos = [r, c];
      }
    }
  }
  return minPos;
}

/**
 * Find the position of the highest-value visible, non-prismed card.
 */
function findHighestVisible(grid) {
  let maxVal = -Infinity;
  let maxPos = null;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = grid[r][c];
      if (card.faceUp && !card.hasPrism && card.value > maxVal) {
        maxVal = card.value;
        maxPos = [r, c];
      }
    }
  }
  return maxPos;
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
    // Check if defender is fully revealed (during final turns, can't attack them)
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

// ── chooseBotReveal ─────────────────────────────────────────────────

/**
 * Choose 2 cards for a bot to reveal during the reveal phase.
 * @param {object} game - The game state
 * @param {number} playerIndex - The bot's player index
 * @returns {[[number, number], [number, number]]} Two [row, col] positions
 */
export function chooseBotReveal(game, playerIndex) {
  const grid = game.players[playerIndex].grid;
  const faceDown = getFaceDownPositions(grid);

  // Shuffle face-down positions and pick 2
  const shuffled = [...faceDown].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

// ── chooseBotAction ─────────────────────────────────────────────────

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

// ── Easy Bot ────────────────────────────────────────────────────────

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

// ── Medium Bot ──────────────────────────────────────────────────────

/**
 * Medium bot:
 * - Prefers high-value cards from discard (>=8) to replace lowest visible cards
 * - Checks for column bonus completion (2/3 same color -> secure)
 * - 15% chance to attack if big gain visible (value delta >= 5)
 * - Otherwise constructs from deck, replacing lowest visible or face-down cards
 * - Pursues LUMINA when visible score above average
 */
function chooseMediumAction(game, playerIndex) {
  const available = game.getAvailableActions(playerIndex);
  const player = game.players[playerIndex];
  const grid = player.grid;
  const discard = topDiscard(game);

  // 1. Check discard for high-value card (>=8)
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
    // Also consider placing on face-down cards
    const faceDown = getFaceDownPositions(grid);
    if (faceDown.length > 0) {
      const pos = pickRandom(faceDown);
      return {
        type: 'construct',
        source: 'discard',
        row: pos[0],
        col: pos[1],
      };
    }
  }

  // 2. Check for column bonus completion opportunity -> secure
  if (available.includes('secure') && player.prismsRemaining > 0) {
    for (let col = 0; col < 4; col++) {
      // Count same-color face-up cards in column
      const cards = [grid[0][col], grid[1][col], grid[2][col]];
      const faceUpCards = cards.filter((c) => c.faceUp);
      if (faceUpCards.length >= 2) {
        const concreteColors = faceUpCards
          .filter((c) => c.color !== 'multicolor' && c.color !== null)
          .map((c) => c.color);
        if (
          concreteColors.length > 0 &&
          concreteColors.every((c) => c === concreteColors[0])
        ) {
          // Find a high-value unprismed card in this column to secure
          for (let r = 0; r < 3; r++) {
            const card = grid[r][col];
            if (card.faceUp && !card.hasPrism && card.value >= 5) {
              return { type: 'secure', row: r, col };
            }
          }
        }
      }
    }
  }

  // 3. 15% chance to attack if big gain visible (delta >= 5)
  if (available.includes('attack') && Math.random() < 0.15) {
    const action = buildAttackAction(game, playerIndex, 'medium');
    if (action) return action;
  }

  // 4. Construct from deck, replacing lowest visible or face-down
  return buildConstructAction(game, playerIndex, 'medium');
}

// ── Hard Bot ────────────────────────────────────────────────────────

/**
 * Hard bot: Evaluates ALL valid actions via utility scoring.
 *
 * utility(action) =
 *   card_value_delta x 1.0
 *   + structure_bonus_potential x 1.5
 *   + opponent_disruption x 0.8
 *   - risk_of_revealing_bad_card x 1.2
 */
function chooseHardAction(game, playerIndex) {
  const candidates = [];

  // Generate all possible construct actions
  candidates.push(...generateConstructCandidates(game, playerIndex));

  // Generate all possible attack actions
  candidates.push(...generateAttackCandidates(game, playerIndex));

  // Generate all possible secure actions
  candidates.push(...generateSecureCandidates(game, playerIndex));

  if (candidates.length === 0) {
    // Absolute fallback: construct from deck at random position
    return buildConstructAction(game, playerIndex, 'hard');
  }

  // Pick highest utility
  candidates.sort((a, b) => b.utility - a.utility);
  return candidates[0].action;
}

function generateConstructCandidates(game, playerIndex) {
  const player = game.players[playerIndex];
  const grid = player.grid;
  const candidates = [];
  const discard = topDiscard(game);

  // Construct from discard: evaluate placing discard card at each position
  if (discard) {
    const positions = getVisibleUnprismedPositions(grid);
    const faceDown = getFaceDownPositions(grid);

    for (const [r, c] of positions) {
      const oldCard = grid[r][c];
      const valueDelta = discard.value - oldCard.value;
      const structureBonus = evalStructureBonusPotential(grid, r, c, discard);
      const risk = 0; // no risk, we know the card
      const utility =
        valueDelta * 1.0 + structureBonus * 1.5 - risk * 1.2;

      candidates.push({
        utility,
        action: { type: 'construct', source: 'discard', row: r, col: c },
      });
    }

    for (const [r, c] of faceDown) {
      // Replacing face-down: assume average hidden value of ~6
      const valueDelta = discard.value - 6;
      const structureBonus = evalStructureBonusPotential(grid, r, c, discard);
      const utility = valueDelta * 1.0 + structureBonus * 1.5;

      candidates.push({
        utility,
        action: { type: 'construct', source: 'discard', row: r, col: c },
      });
    }
  }

  // Construct from deck: replace lowest visible or face-down
  {
    const positions = getVisibleUnprismedPositions(grid);
    const faceDown = getFaceDownPositions(grid);

    for (const [r, c] of positions) {
      const oldCard = grid[r][c];
      // Expected deck card value is ~6 (average of deck)
      const valueDelta = 6 - oldCard.value;
      const risk = 3; // uncertainty of random draw
      const utility = valueDelta * 1.0 - risk * 1.2;

      candidates.push({
        utility,
        action: { type: 'construct', source: 'deck', row: r, col: c },
      });
    }

    for (const [r, c] of faceDown) {
      // Replacing unknown with unknown: small positive (reveals a card)
      const utility = 0.5; // slight preference for revealing
      candidates.push({
        utility,
        action: { type: 'construct', source: 'deck', row: r, col: c },
      });
    }
  }

  // Construct deck_discard: draw from deck but discard it, reveal a face-down
  {
    const faceDown = getFaceDownPositions(grid);
    for (const [r, c] of faceDown) {
      // Value of revealing is modest
      const utility = 0.2;
      candidates.push({
        utility,
        action: {
          type: 'construct',
          source: 'deck_discard',
          revealRow: r,
          revealCol: c,
        },
      });
    }
  }

  return candidates;
}

function generateAttackCandidates(game, playerIndex) {
  const available = game.getAvailableActions(playerIndex);
  if (!available.includes('attack')) return [];

  const player = game.players[playerIndex];
  const grid = player.grid;
  const candidates = [];

  const attackerPositions = getVisibleUnprismedPositions(grid);
  const costPositions = getFaceDownPositions(grid);
  const targets = getValidAttackTargets(game, playerIndex);

  if (costPositions.length === 0 || attackerPositions.length === 0) return [];

  for (const target of targets) {
    for (const [ar, ac] of attackerPositions) {
      const attackerCard = grid[ar][ac];
      const defenderCard = target.card;

      // Value delta: how much better is the defender's card?
      const valueDelta = defenderCard.value - attackerCard.value;
      if (valueDelta <= 0) continue; // never attack for a worse card

      // Disruption: bonus if card is in opponent's valid structure
      const defenderGrid = game.players[target.defenderIndex].grid;
      const disruption = isInValidStructure(defenderGrid, target.row, target.col)
        ? 5
        : 0;

      // Risk: revealing a face-down card (assume average ~6, risk is variance)
      const risk = 3;

      // Pick a random cost position
      const [costR, costC] = pickRandom(costPositions);

      const utility =
        valueDelta * 1.0 + disruption * 0.8 - risk * 1.2;

      candidates.push({
        utility,
        action: {
          type: 'attack',
          attackerRow: ar,
          attackerCol: ac,
          defenderIndex: target.defenderIndex,
          defenderRow: target.row,
          defenderCol: target.col,
          revealRow: costR,
          revealCol: costC,
        },
      });
    }
  }

  return candidates;
}

function generateSecureCandidates(game, playerIndex) {
  const available = game.getAvailableActions(playerIndex);
  if (!available.includes('secure')) return [];

  const player = game.players[playerIndex];
  const grid = player.grid;
  const candidates = [];

  if (player.prismsRemaining <= 0) return [];

  const positions = getVisibleUnprismedPositions(grid);

  for (const [r, c] of positions) {
    const card = grid[r][c];

    // Only consider securing cards worth >= 5 AND in valid structure
    const inStructure = isInValidStructure(grid, r, c);
    if (card.value < 5 || !inStructure) {
      // Low utility, but include it
      const utility = (card.value * 0.1) + (inStructure ? 1 : -2);
      candidates.push({
        utility,
        action: { type: 'secure', row: r, col: c },
      });
      continue;
    }

    // High value card in valid structure: high utility
    const utility = card.value * 0.5 + 5;
    candidates.push({
      utility,
      action: { type: 'secure', row: r, col: c },
    });
  }

  return candidates;
}

/**
 * Evaluate how much a card placement contributes to structure bonuses.
 * Checks column color matching and row ascending potential.
 */
function evalStructureBonusPotential(grid, row, col, newCard) {
  let bonus = 0;

  // Column color bonus: how many of the other 2 cards in this column match?
  if (newCard.color && newCard.color !== null) {
    let matchCount = 0;
    for (let r = 0; r < 3; r++) {
      if (r === row) continue;
      const other = grid[r][col];
      if (!other.faceUp) continue;
      if (
        other.color === newCard.color ||
        other.color === 'multicolor' ||
        newCard.color === 'multicolor'
      ) {
        matchCount++;
      }
    }
    // 2 matches = completing a column bonus (very valuable)
    // 1 match = contributing toward a column bonus
    if (matchCount === 2) bonus += 5;
    else if (matchCount === 1) bonus += 2;
  }

  // Row ascending potential: would this help form an ascending row?
  const rowCards = [...grid[row]];
  // Simulate placing the new card
  const simRow = rowCards.map((c, i) =>
    i === col
      ? { ...newCard, faceUp: true }
      : c
  );
  const faceUpValues = simRow
    .filter((c) => c.faceUp)
    .map((c) => c.value);
  if (faceUpValues.length === 4) {
    let ascending = true;
    for (let i = 1; i < 4; i++) {
      if (simRow[i].value <= simRow[i - 1].value) {
        ascending = false;
        break;
      }
    }
    if (ascending) bonus += 5;
  }

  return bonus;
}

// ── Action Builders ─────────────────────────────────────────────────

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

  // For medium: only attack if delta >= 5
  if (difficulty === 'medium') {
    const bigGains = validPairs.filter((p) => p.delta >= 5);
    if (bigGains.length === 0) return null;
    const pick = pickRandom(bigGains);
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
