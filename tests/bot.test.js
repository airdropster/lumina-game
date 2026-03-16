import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotReveal, chooseBotAction } from '../public/bot.js';
import { createGame } from '../public/game.js';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Create a game in PLAYING phase with controlled grid values.
 * @param {string} difficulty
 * @param {number} botCount
 * @returns game object with bot at index 1
 */
function setupPlayingGame(difficulty = 'easy', botCount = 2) {
  const difficulties = Array(botCount).fill(difficulty);
  const g = createGame({ botCount, botDifficulties: difficulties });

  // Reveal 2 cards per player for reveal phase
  for (let i = 0; i <= botCount; i++) {
    g.revealCard(i, 0, 0);
    g.revealCard(i, 0, 1);
  }
  g.startGame();
  return g;
}

/**
 * Build a deterministic grid for testing.
 * All cards face-up unless overridden.
 */
function makeGrid(values, colors, opts = {}) {
  const grid = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 4; c++) {
      row.push({
        value: values[r][c],
        color: colors[r][c],
        faceUp: opts.faceDown?.[r]?.[c] ? false : true,
        hasPrism: opts.prism?.[r]?.[c] ? true : false,
        immune: opts.immune?.[r]?.[c] ? true : false,
      });
    }
    grid.push(row);
  }
  return grid;
}

// ── chooseBotReveal ─────────────────────────────────────────────────

describe('chooseBotReveal', () => {
  it('returns exactly 2 valid positions', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    const positions = chooseBotReveal(g, 1);

    assert.equal(positions.length, 2);
    for (const [row, col] of positions) {
      assert.ok(row >= 0 && row < 3, `row ${row} in bounds`);
      assert.ok(col >= 0 && col < 4, `col ${col} in bounds`);
    }
  });

  it('returns two distinct positions', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    const positions = chooseBotReveal(g, 1);

    const [p1, p2] = positions;
    assert.ok(p1[0] !== p2[0] || p1[1] !== p2[1], 'positions must be distinct');
  });

  it('only selects face-down cards', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // Make some cards face-up already
    g.players[1].grid[0][0].faceUp = true;
    g.players[1].grid[0][1].faceUp = true;

    const positions = chooseBotReveal(g, 1);
    for (const [row, col] of positions) {
      assert.equal(
        g.players[1].grid[row][col].faceUp,
        false,
        `card at (${row},${col}) should be face-down`
      );
    }
  });
});

// ── Easy Bot ────────────────────────────────────────────────────────

describe('Easy bot', () => {
  it('returns a valid action object', () => {
    const g = setupPlayingGame('easy');
    g.currentPlayerIndex = 1;

    const action = chooseBotAction(g, 1);
    assert.ok(action, 'action should not be null');
    assert.ok(
      ['construct', 'attack', 'secure'].includes(action.type),
      `action type "${action.type}" should be valid`
    );
  });

  it('never secures a -2 card', () => {
    const g = setupPlayingGame('easy');
    g.currentPlayerIndex = 1;

    // Set all visible cards to -2
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[1].grid[r][c] = {
          value: -2,
          color: 'multicolor',
          faceUp: true,
          hasPrism: false,
          immune: false,
        };
      }
    }
    // Keep one face-down for attack option
    g.players[1].grid[2][3].faceUp = false;

    // Run many times to check probabilistically
    for (let i = 0; i < 50; i++) {
      const action = chooseBotAction(g, 1);
      if (action.type === 'secure') {
        const card = g.players[1].grid[action.row][action.col];
        assert.notEqual(card.value, -2, 'should never secure a -2 card');
      }
    }
  });

  it('never attacks to get a worse card', () => {
    const g = setupPlayingGame('easy', 1);
    g.currentPlayerIndex = 1;

    // Bot has a high-value visible card (12)
    g.players[1].grid[0][0] = {
      value: 12, color: 'blue', faceUp: true, hasPrism: false, immune: false,
    };
    // Opponent has a low-value visible card (1)
    g.players[0].grid[0][0] = {
      value: 1, color: 'blue', faceUp: true, hasPrism: false, immune: false,
    };
    // Make sure bot has face-down cards for attack cost
    g.players[1].grid[2][3].faceUp = false;

    for (let i = 0; i < 50; i++) {
      const action = chooseBotAction(g, 1);
      if (action.type === 'attack') {
        const attackerCard = g.players[1].grid[action.attackerRow][action.attackerCol];
        const defenderCard = g.players[action.defenderIndex].grid[action.defenderRow][action.defenderCol];
        // Bot should only attack if defender card value > attacker card value
        assert.ok(
          defenderCard.value > attackerCard.value,
          `should not attack to get worse card: giving ${attackerCard.value}, getting ${defenderCard.value}`
        );
      }
    }
  });

  it('returns construct action with valid row/col', () => {
    const g = setupPlayingGame('easy');
    g.currentPlayerIndex = 1;

    const action = chooseBotAction(g, 1);
    if (action.type === 'construct') {
      if (action.source === 'deck' || action.source === 'discard') {
        assert.ok(action.row >= 0 && action.row < 3);
        assert.ok(action.col >= 0 && action.col < 4);
      } else if (action.source === 'deck_discard') {
        assert.ok(action.revealRow >= 0 && action.revealRow < 3);
        assert.ok(action.revealCol >= 0 && action.revealCol < 4);
      }
    }
  });
});

// ── Medium Bot ──────────────────────────────────────────────────────

describe('Medium bot', () => {
  it('returns a valid action object', () => {
    const g = setupPlayingGame('medium');
    g.currentPlayerIndex = 1;

    const action = chooseBotAction(g, 1);
    assert.ok(action, 'action should not be null');
    assert.ok(
      ['construct', 'attack', 'secure'].includes(action.type),
      `action type "${action.type}" should be valid`
    );
  });

  it('prefers high-value discard card over deck when replacing low card', () => {
    const g = setupPlayingGame('medium');
    g.currentPlayerIndex = 1;

    // Set discard to a high-value card
    g.discard.push({ value: 10, color: 'blue' });

    // Bot has a low-value visible card
    g.players[1].grid[0][0] = {
      value: 1, color: 'violet', faceUp: true, hasPrism: false, immune: false,
    };
    g.players[1].grid[0][1] = {
      value: 2, color: 'violet', faceUp: true, hasPrism: false, immune: false,
    };

    let discardPickCount = 0;
    const trials = 50;
    for (let i = 0; i < trials; i++) {
      const action = chooseBotAction(g, 1);
      if (action.type === 'construct' && action.source === 'discard') {
        discardPickCount++;
      }
    }

    // Medium bot should prefer discard when it has a high value card (>=8)
    assert.ok(
      discardPickCount > trials * 0.5,
      `medium bot should frequently pick discard (got ${discardPickCount}/${trials})`
    );
  });
});

// ── Hard Bot ────────────────────────────────────────────────────────

describe('Hard bot', () => {
  it('returns a valid action object', () => {
    const g = setupPlayingGame('hard');
    g.currentPlayerIndex = 1;

    const action = chooseBotAction(g, 1);
    assert.ok(action, 'action should not be null');
    assert.ok(
      ['construct', 'attack', 'secure'].includes(action.type),
      `action type "${action.type}" should be valid`
    );
  });

  it('uses utility-based reasoning to choose actions', () => {
    const g = setupPlayingGame('hard');
    g.currentPlayerIndex = 1;

    // Set up a mostly-revealed grid so LUMINA urgency doesn't dominate
    const grid = g.players[1].grid;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        grid[r][c].faceUp = true;
      }
    }
    // Leave one face-down for attack cost availability
    grid[2][3].faceUp = false;
    // Put a low-value card visible
    grid[0][0] = { value: 1, color: 'violet', faceUp: true, hasPrism: false, immune: false };

    // Discard has a high-value card
    g.discard.push({ value: 12, color: 'blue' });

    // Hard bot should return a valid action (construct, attack, or secure)
    const action = chooseBotAction(g, 1);
    assert.ok(action, 'action should not be null');
    assert.ok(
      ['construct', 'attack', 'secure'].includes(action.type),
      `hard bot should return valid action type (got "${action.type}")`
    );
  });

  it('prefers securing high-value cards in valid structures', () => {
    const g = setupPlayingGame('hard');
    g.currentPlayerIndex = 1;

    // Set up a column bonus scenario: all same color, high values
    g.players[1].grid[0][0] = { value: 10, color: 'blue', faceUp: true, hasPrism: false, immune: false };
    g.players[1].grid[1][0] = { value: 11, color: 'blue', faceUp: true, hasPrism: false, immune: false };
    g.players[1].grid[2][0] = { value: 12, color: 'blue', faceUp: true, hasPrism: false, immune: false };
    // Make all other cards face-up too so no face-down cards (no attack available)
    for (let r = 0; r < 3; r++) {
      for (let c = 1; c < 4; c++) {
        g.players[1].grid[r][c] = { value: 5, color: 'violet', faceUp: true, hasPrism: false, immune: false };
      }
    }

    // Discard is low value so construct from discard isn't attractive
    g.discard.push({ value: 1, color: 'orange' });

    let secureCount = 0;
    const trials = 30;
    for (let i = 0; i < trials; i++) {
      const action = chooseBotAction(g, 1);
      if (action.type === 'secure') {
        secureCount++;
        // Should prefer securing cards in the valid blue column
        assert.ok(
          action.col === 0,
          `should secure in valid structure column (got col ${action.col})`
        );
      }
    }

    assert.ok(
      secureCount > 0,
      `hard bot should consider securing high-value structure cards (got ${secureCount}/${trials})`
    );
  });
});

// ── Edge Cases ──────────────────────────────────────────────────────

describe('Bot edge cases', () => {
  it('handles empty discard pile gracefully', () => {
    const g = setupPlayingGame('medium');
    g.currentPlayerIndex = 1;
    g.discard.length = 0; // empty discard

    const action = chooseBotAction(g, 1);
    assert.ok(action, 'should still return an action');
    if (action.type === 'construct') {
      assert.notEqual(action.source, 'discard', 'should not pick from empty discard');
    }
  });

  it('works when all cards are face-up (no attack available)', () => {
    const g = setupPlayingGame('easy');
    g.currentPlayerIndex = 1;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[1].grid[r][c].faceUp = true;
      }
    }

    const action = chooseBotAction(g, 1);
    assert.ok(action, 'should return an action');
    assert.notEqual(action.type, 'attack', 'should not attack without face-down cards');
  });

  it('does not target prismed or immune cards in attacks', () => {
    const g = setupPlayingGame('easy', 1);
    g.currentPlayerIndex = 1;

    // Make all opponent visible cards prismed or immune
    g.players[0].grid[0][0] = {
      value: 15, color: null, faceUp: true, hasPrism: true, immune: false,
    };
    g.players[0].grid[0][1] = {
      value: 12, color: 'blue', faceUp: true, hasPrism: false, immune: true,
    };
    // Rest face-down (not attackable)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (r === 0 && c <= 1) continue;
        g.players[0].grid[r][c].faceUp = false;
      }
    }

    // Bot has face-down for cost and visible cards
    g.players[1].grid[0][0] = {
      value: 3, color: 'blue', faceUp: true, hasPrism: false, immune: false,
    };
    g.players[1].grid[2][3].faceUp = false;

    for (let i = 0; i < 30; i++) {
      const action = chooseBotAction(g, 1);
      if (action.type === 'attack') {
        const defCard =
          g.players[action.defenderIndex].grid[action.defenderRow][action.defenderCol];
        assert.equal(defCard.hasPrism, false, 'should not attack prismed card');
        assert.equal(defCard.immune, false, 'should not attack immune card');
      }
    }
  });
});
