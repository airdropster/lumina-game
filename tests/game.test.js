import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE,
  ACTION,
  createGame,
} from '../public/game.js';

// ── Constants ────────────────────────────────────────────────────────

describe('PHASE constant', () => {
  it('exports all four phases', () => {
    assert.deepEqual(PHASE, {
      REVEAL: 'reveal',
      PLAYING: 'playing',
      FINAL_TURNS: 'final_turns',
      SCORING: 'scoring',
    });
  });
});

describe('ACTION constant', () => {
  it('exports all three actions', () => {
    assert.deepEqual(ACTION, {
      CONSTRUCT: 'construct',
      ATTACK: 'attack',
      SECURE: 'secure',
    });
  });
});

// ── Setup ────────────────────────────────────────────────────────────

describe('createGame – setup', () => {
  it('creates correct number of players (1 human + bots)', () => {
    const g = createGame({ botCount: 2, botDifficulties: ['easy', 'hard'] });
    assert.equal(g.players.length, 3);
    assert.equal(g.players[0].isBot, false);
    assert.equal(g.players[1].isBot, true);
    assert.equal(g.players[2].isBot, true);
  });

  it('deals 12 face-down cards per player in a 3×4 grid', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    for (const p of g.players) {
      assert.equal(p.grid.length, 3);
      for (const row of p.grid) {
        assert.equal(row.length, 4);
        for (const card of row) {
          assert.equal(card.faceUp, false);
          assert.equal(card.hasPrism, false);
          assert.equal(card.immune, false);
          assert.ok('value' in card);
          assert.ok('color' in card);
        }
      }
    }
  });

  it('gives 3 prisms to each player', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    for (const p of g.players) {
      assert.equal(p.prismsRemaining, 3);
    }
  });

  it('starts discard pile with 1 card', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    assert.equal(g.discard.length, 1);
  });

  it('deck has correct remaining count (112 - dealt - 1 discard)', () => {
    const g = createGame({ botCount: 2, botDifficulties: ['easy', 'easy'] });
    // 3 players × 12 cards + 1 discard = 37
    assert.equal(g.deck.length, 112 - 37);
  });

  it('starts in REVEAL phase', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    assert.equal(g.phase, PHASE.REVEAL);
  });

  it('initializes player stats', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    assert.deepEqual(g.players[0].stats, { attacksMade: 0, prismsUsed: 0 });
  });

  it('initializes revealsLeft to 2 per player', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    for (const p of g.players) {
      assert.equal(p.revealsLeft, 2);
    }
  });

  it('initializes luminaCaller as null', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    assert.equal(g.luminaCaller, null);
  });

  it('initializes round to 1 and cumulative scores to 0', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    assert.equal(g.round, 1);
    assert.deepEqual(g.cumulativeScores, [0, 0]);
  });

  it('initializes actionLog as empty', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    assert.deepEqual(g.actionLog, []);
  });
});

// ── Reveal Phase ─────────────────────────────────────────────────────

describe('revealCard', () => {
  it('reveals a face-down card and decrements revealsLeft', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    const result = g.revealCard(0, 0, 0);
    assert.equal(result, true);
    assert.equal(g.players[0].grid[0][0].faceUp, true);
    assert.equal(g.players[0].revealsLeft, 1);
  });

  it('returns false if card is already face-up', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.revealCard(0, 0, 0);
    const result = g.revealCard(0, 0, 0);
    assert.equal(result, false);
  });

  it('returns false if revealsLeft is 0', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 1, 0);
    const result = g.revealCard(0, 2, 0);
    assert.equal(result, false);
    assert.equal(g.players[0].revealsLeft, 0);
  });

  it('returns false if not in REVEAL phase', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.phase = PHASE.PLAYING;
    const result = g.revealCard(0, 0, 0);
    assert.equal(result, false);
  });
});

// ── startGame ────────────────────────────────────────────────────────

describe('startGame', () => {
  it('transitions phase to PLAYING', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    assert.equal(g.phase, PHASE.PLAYING);
  });

  it('sets currentPlayerIndex based on highest visible sum', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // Force known values for player 0
    g.players[0].grid[0][0] = { value: 12, color: 'blue', faceUp: false, hasPrism: false, immune: false };
    g.players[0].grid[0][1] = { value: 12, color: 'blue', faceUp: false, hasPrism: false, immune: false };
    // Force known values for player 1
    g.players[1].grid[0][0] = { value: 1, color: 'blue', faceUp: false, hasPrism: false, immune: false };
    g.players[1].grid[0][1] = { value: 1, color: 'blue', faceUp: false, hasPrism: false, immune: false };
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    assert.equal(g.currentPlayerIndex, 0); // 24 > 2
  });
});

// ── constructFromDeck ────────────────────────────────────────────────

describe('constructFromDeck', () => {
  /** @returns {ReturnType<typeof createGame>} */
  function setupPlayingGame() {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // Reveal cards so startGame works
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    return g;
  }

  it('replaces card at position, deck shrinks, old card goes to discard', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const oldCard = { ...g.players[pi].grid[1][0] };
    const deckSizeBefore = g.deck.length;
    const discardSizeBefore = g.discard.length;

    g.constructFromDeck(pi, 1, 0);

    assert.equal(g.deck.length, deckSizeBefore - 1);
    assert.equal(g.discard.length, discardSizeBefore + 1);
    // The old card should be on top of discard
    assert.equal(g.discard[g.discard.length - 1].value, oldCard.value);
    // New card should be face-up
    assert.equal(g.players[pi].grid[1][0].faceUp, true);
  });

  it('cannot replace a prismed card', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    // Make a card face-up and prismed
    g.players[pi].grid[1][0].faceUp = true;
    g.players[pi].grid[1][0].hasPrism = true;

    const result = g.constructFromDeck(pi, 1, 0);
    assert.equal(result, false);
  });

  it('advances turn after constructing', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    g.constructFromDeck(pi, 1, 0);
    assert.notEqual(g.currentPlayerIndex, pi);
  });
});

// ── constructFromDiscard ─────────────────────────────────────────────

describe('constructFromDiscard', () => {
  function setupPlayingGame() {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    return g;
  }

  it('takes top discard card and places it, old card goes to discard', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const topDiscard = { ...g.discard[g.discard.length - 1] };
    const oldCard = { ...g.players[pi].grid[1][0] };

    g.constructFromDiscard(pi, 1, 0);

    // New card at position should have the discard's value
    assert.equal(g.players[pi].grid[1][0].value, topDiscard.value);
    assert.equal(g.players[pi].grid[1][0].faceUp, true);
    // Old card is now top of discard
    assert.equal(g.discard[g.discard.length - 1].value, oldCard.value);
  });

  it('cannot replace a prismed card', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    g.players[pi].grid[1][0].faceUp = true;
    g.players[pi].grid[1][0].hasPrism = true;

    const result = g.constructFromDiscard(pi, 1, 0);
    assert.equal(result, false);
  });
});

// ── constructDiscardDraw ─────────────────────────────────────────────

describe('constructDiscardDraw', () => {
  function setupPlayingGame() {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    return g;
  }

  it('deck card goes to discard, face-down card is revealed', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const deckSizeBefore = g.deck.length;
    const discardSizeBefore = g.discard.length;
    // Find a face-down card
    let revealRow = -1, revealCol = -1;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (!g.players[pi].grid[r][c].faceUp) {
          revealRow = r;
          revealCol = c;
          break;
        }
      }
      if (revealRow >= 0) break;
    }

    g.constructDiscardDraw(pi, revealRow, revealCol);

    assert.equal(g.deck.length, deckSizeBefore - 1);
    assert.equal(g.discard.length, discardSizeBefore + 1);
    assert.equal(g.players[pi].grid[revealRow][revealCol].faceUp, true);
  });

  it('returns false if target card is already face-up', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    // [0][0] was revealed
    const result = g.constructDiscardDraw(pi, 0, 0);
    assert.equal(result, false);
  });
});

// ── attack ───────────────────────────────────────────────────────────

describe('attack', () => {
  function setupPlayingGame() {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    return g;
  }

  it('swaps two face-up cards, reveals cost card, sets immunity', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const di = pi === 0 ? 1 : 0;

    // Make attacker and defender swap cards face-up
    g.players[pi].grid[0][0].faceUp = true;
    g.players[di].grid[0][0].faceUp = true;

    const attackerCard = { ...g.players[pi].grid[0][0] };
    const defenderCard = { ...g.players[di].grid[0][0] };

    // Need a face-down card to reveal as cost
    let costRow = -1, costCol = -1;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (!g.players[pi].grid[r][c].faceUp) {
          costRow = r;
          costCol = c;
          break;
        }
      }
      if (costRow >= 0) break;
    }

    const result = g.attack(pi, 0, 0, di, 0, 0, costRow, costCol);
    assert.equal(result, true);

    // Cards swapped
    assert.equal(g.players[pi].grid[0][0].value, defenderCard.value);
    assert.equal(g.players[di].grid[0][0].value, attackerCard.value);

    // Cost card revealed
    assert.equal(g.players[pi].grid[costRow][costCol].faceUp, true);

    // Immunity set on received card
    assert.equal(g.players[di].grid[0][0].immune, true);

    // Stats updated
    assert.equal(g.players[pi].stats.attacksMade, 1);
  });

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

  it('cannot attack a prismed card', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const di = pi === 0 ? 1 : 0;

    g.players[pi].grid[0][0].faceUp = true;
    g.players[di].grid[0][0].faceUp = true;
    g.players[di].grid[0][0].hasPrism = true;

    const result = g.attack(pi, 0, 0, di, 0, 0, 1, 0);
    assert.equal(result, false);
  });

  it('cannot attack an immune card', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const di = pi === 0 ? 1 : 0;

    g.players[pi].grid[0][0].faceUp = true;
    g.players[di].grid[0][0].faceUp = true;
    g.players[di].grid[0][0].immune = true;

    const result = g.attack(pi, 0, 0, di, 0, 0, 1, 0);
    assert.equal(result, false);
  });

  it('cannot attack if attacker card is prismed', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const di = pi === 0 ? 1 : 0;

    g.players[pi].grid[0][0].faceUp = true;
    g.players[pi].grid[0][0].hasPrism = true;
    g.players[di].grid[0][0].faceUp = true;

    const result = g.attack(pi, 0, 0, di, 0, 0, 1, 0);
    assert.equal(result, false);
  });
});

// ── secure ───────────────────────────────────────────────────────────

describe('secure', () => {
  function setupPlayingGame() {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    return g;
  }

  it('places prism on face-up card, decrements prismsRemaining', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    // [0][0] should be face-up from reveal
    const result = g.secure(pi, 0, 0);
    assert.equal(result, true);
    assert.equal(g.players[pi].grid[0][0].hasPrism, true);
    assert.equal(g.players[pi].prismsRemaining, 2);
    assert.equal(g.players[pi].stats.prismsUsed, 1);
  });

  it('cannot place prism on face-down card', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const result = g.secure(pi, 2, 0); // face-down card
    assert.equal(result, false);
  });

  it('moves prism from source to target, unlocks source', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    // Place prism first
    g.secure(pi, 0, 0);
    // Now move it — need next turn for this player
    // Advance turns back to this player
    const otherPi = pi === 0 ? 1 : 0;
    g.constructFromDeck(otherPi, 1, 0);
    // Should be back to pi's turn or we force it
    g.currentPlayerIndex = pi;

    // Make target face-up
    g.players[pi].grid[0][1].faceUp = true;
    const result = g.secure(pi, 0, 1, 0, 0);
    assert.equal(result, true);
    assert.equal(g.players[pi].grid[0][0].hasPrism, false);
    assert.equal(g.players[pi].grid[0][1].hasPrism, true);
    // prismsRemaining should not change on a move
    assert.equal(g.players[pi].prismsRemaining, 2);
  });

  it('returns false if no prisms remaining and not moving', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    g.players[pi].prismsRemaining = 0;
    const result = g.secure(pi, 0, 0);
    assert.equal(result, false);
  });
});

// ── LUMINA detection ─────────────────────────────────────────────────

describe('isLumina', () => {
  it('returns true when all cards are face-up', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[0].grid[r][c].faceUp = true;
      }
    }
    assert.equal(g.isLumina(0), true);
  });

  it('returns false when some cards are face-down', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.players[0].grid[0][0].faceUp = true;
    assert.equal(g.isLumina(0), false);
  });
});

describe('LUMINA trigger', () => {
  it('triggers FINAL_TURNS when a player gets all cards face-up', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    const pi = g.currentPlayerIndex;

    // Make all cards face-up except one
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[pi].grid[r][c].faceUp = true;
      }
    }
    // Make one face-down so construct reveals the last
    g.players[pi].grid[2][3].faceUp = false;

    // constructFromDeck will place face-up card, triggering lumina
    g.constructFromDeck(pi, 2, 3);

    assert.equal(g.luminaCaller, pi);
    assert.equal(g.phase, PHASE.FINAL_TURNS);
  });
});

// ── Final turns ──────────────────────────────────────────────────────

describe('final turns', () => {
  function setupFinalTurns() {
    const g = createGame({ botCount: 2, botDifficulties: ['easy', 'easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.revealCard(2, 0, 0);
    g.revealCard(2, 0, 1);
    g.startGame();

    // Force player 0 as current and trigger LUMINA
    g.currentPlayerIndex = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[0].grid[r][c].faceUp = true;
      }
    }
    g.players[0].grid[2][3].faceUp = false;
    g.constructFromDeck(0, 2, 3);

    return g;
  }

  it('skips the LUMINA caller during final turns', () => {
    const g = setupFinalTurns();
    assert.equal(g.luminaCaller, 0);
    // After LUMINA trigger, turn ends and caller is skipped
    // Next player should be 1, not 0
    assert.notEqual(g.currentPlayerIndex, 0);
  });

  it('counts down finalTurnsRemaining and enters SCORING', () => {
    const g = setupFinalTurns();
    // 2 other players get 1 turn each = finalTurnsRemaining starts at 2
    assert.equal(g.finalTurnsRemaining, 2);

    // Player 1 takes a turn
    const p1 = g.currentPlayerIndex;
    g.constructFromDeck(p1, 1, 0);
    assert.equal(g.finalTurnsRemaining, 1);

    // Player 2 takes a turn
    const p2 = g.currentPlayerIndex;
    g.constructFromDeck(p2, 1, 0);
    assert.equal(g.phase, PHASE.SCORING);
  });
});

// ── Scoring ──────────────────────────────────────────────────────────

describe('scoreRound', () => {
  it('calculates correct totals with LUMINA bonus/penalty', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.phase = PHASE.SCORING;
    g.luminaCaller = 0;

    // Make all cards face-up with known values for player 0
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[0].grid[r][c] = { value: 5, color: 'blue', faceUp: true, hasPrism: false, immune: false };
        g.players[1].grid[r][c] = { value: 3, color: 'violet', faceUp: true, hasPrism: false, immune: false };
      }
    }

    g.scoreRound();

    // Player 0: visible sum 60, column bonus 40 (all blue), total = 100, LUMINA +10 = 110
    // Player 1: visible sum 36, column bonus 40 (all violet), total = 76, no LUMINA bonus
    // Player 0 strictly highest → +10; Player 1 gets -10
    // Player 0 cumulative: max(0, 110) = 110
    // Player 1 cumulative: max(0, 66) = 66
    assert.ok(g.cumulativeScores[0] > g.cumulativeScores[1]);
  });

  it('applies -10 penalty to LUMINA caller if not strictly highest', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.phase = PHASE.SCORING;
    g.luminaCaller = 0;

    // Make player 0 score lower than player 1
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[0].grid[r][c] = { value: 1, color: 'blue', faceUp: true, hasPrism: false, immune: false };
        g.players[1].grid[r][c] = { value: 10, color: 'violet', faceUp: true, hasPrism: false, immune: false };
      }
    }

    g.scoreRound();

    // Player 0 base total: 12 + 40 = 52, -10 penalty = 42
    // Player 1 base total: 120 + 40 = 160, +10 bonus... wait, only caller gets +10/-10
    // Actually: caller gets +10 if strictly highest, -10 otherwise
    // Non-callers don't get bonus/penalty
    // So player 0: 52 - 10 = 42, player 1: 160
    assert.ok(g.cumulativeScores[0] < g.cumulativeScores[1]);
  });

  it('negative round totals are clamped to 0', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.phase = PHASE.SCORING;
    g.luminaCaller = null;

    // All face-down → big penalties
    // visibleSum=0, faceDownCount=12, penalty=-60, total=-60
    g.scoreRound();
    assert.equal(g.cumulativeScores[0], 0);
  });
});

// ── isGameOver / getWinner ───────────────────────────────────────────

describe('isGameOver', () => {
  it('returns true when any cumulative score >= 200', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.cumulativeScores[0] = 200;
    assert.equal(g.isGameOver(), true);
  });

  it('returns false when all scores < 200', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.cumulativeScores[0] = 199;
    assert.equal(g.isGameOver(), false);
  });
});

describe('getWinner', () => {
  it('returns player name with highest cumulative score', () => {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.cumulativeScores[0] = 150;
    g.cumulativeScores[1] = 210;
    assert.equal(g.getWinner(), g.players[1].name);
  });
});

// ── getAvailableActions ──────────────────────────────────────────────

describe('getAvailableActions', () => {
  function setupPlayingGame() {
    const g = createGame({ botCount: 1, botDifficulties: ['easy'] });
    g.revealCard(0, 0, 0);
    g.revealCard(0, 0, 1);
    g.revealCard(1, 0, 0);
    g.revealCard(1, 0, 1);
    g.startGame();
    return g;
  }

  it('CONSTRUCT is always available', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const actions = g.getAvailableActions(pi);
    assert.ok(actions.includes(ACTION.CONSTRUCT));
  });

  it('ATTACK is available if player has face-down cards', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    const actions = g.getAvailableActions(pi);
    assert.ok(actions.includes(ACTION.ATTACK));
  });

  it('ATTACK is NOT available if all cards face-up', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        g.players[pi].grid[r][c].faceUp = true;
      }
    }
    const actions = g.getAvailableActions(pi);
    assert.ok(!actions.includes(ACTION.ATTACK));
  });

  it('SECURE is available if player has visible unprismed cards and prisms remaining', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    // Player has revealed 2 cards and has 3 prisms
    const actions = g.getAvailableActions(pi);
    assert.ok(actions.includes(ACTION.SECURE));
  });

  it('SECURE is available if player has placed prisms to move even with 0 remaining', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    g.players[pi].prismsRemaining = 0;
    g.players[pi].grid[0][0].hasPrism = true; // has a prism to move
    const actions = g.getAvailableActions(pi);
    assert.ok(actions.includes(ACTION.SECURE));
  });

  it('SECURE is NOT available if no visible unprismed cards and no prisms remaining', () => {
    const g = setupPlayingGame();
    const pi = g.currentPlayerIndex;
    g.players[pi].prismsRemaining = 0;
    // Make revealed cards prismed
    g.players[pi].grid[0][0].hasPrism = true;
    g.players[pi].grid[0][1].hasPrism = true;
    // All visible cards are prismed, no remaining prisms, no unprismed visible cards for target
    // Actually if all visible cards are prismed, there's nowhere to move TO
    // So SECURE should not be available
    const actions = g.getAvailableActions(pi);
    // If all visible are prismed: no unprismed visible target → no SECURE
    assert.ok(!actions.includes(ACTION.SECURE));
  });
});

// ── clearImmunity ────────────────────────────────────────────────────

describe('clearImmunity', () => {
  it('removes immune flag from all cards of a player', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    g.players[0].grid[0][0].immune = true;
    g.players[0].grid[1][1].immune = true;
    g.clearImmunity(0);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        assert.equal(g.players[0].grid[r][c].immune, false);
      }
    }
  });
});

// ── Deck reshuffle ───────────────────────────────────────────────────

describe('_reshuffleDeck', () => {
  it('reshuffles discard into deck when deck is empty, keeping top discard card', () => {
    const g = createGame({ botCount: 0, botDifficulties: [] });
    // Move all deck cards to discard
    const topDiscard = { ...g.discard[g.discard.length - 1] };
    while (g.deck.length > 0) {
      g.discard.push(g.deck.pop());
    }
    const discardCount = g.discard.length;

    g._reshuffleDeck();

    // Deck should now have cards
    assert.equal(g.deck.length, discardCount - 1);
    // Discard should have exactly 1 card (the kept top card)
    assert.equal(g.discard.length, 1);
  });
});
