/** @module game – Core game state machine for LUMINA */

import { createDeck } from './cards.js';
import { calcRoundScore } from './scoring.js';

export const PHASE = {
  REVEAL: 'reveal',
  PLAYING: 'playing',
  FINAL_TURNS: 'final_turns',
  SCORING: 'scoring',
};

export const ACTION = {
  CONSTRUCT: 'construct',
  ATTACK: 'attack',
  SECURE: 'secure',
};

/**
 * Fisher-Yates shuffle (in-place).
 * @param {Array} array
 * @returns {Array}
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Create a new LUMINA game.
 * @param {{ botCount: number, botDifficulties: string[] }} opts
 */
export function createGame({ botCount, botDifficulties }) {
  const deck = createDeck(); // 112 cards, shuffled

  // Build players array: human first, then bots
  const totalPlayers = 1 + botCount;
  const players = [];

  players.push({
    name: 'Player',
    isBot: false,
    difficulty: null,
    grid: [],
    prismsRemaining: 3,
    revealsLeft: 2,
    stats: { attacksMade: 0, prismsUsed: 0 },
  });

  for (let i = 0; i < botCount; i++) {
    players.push({
      name: `Bot ${i + 1}`,
      isBot: true,
      difficulty: botDifficulties[i] || 'easy',
      grid: [],
      prismsRemaining: 3,
      revealsLeft: 2,
      stats: { attacksMade: 0, prismsUsed: 0 },
    });
  }

  // Deal 12 cards per player into 3×4 grids, all face-down
  for (const player of players) {
    const grid = [];
    for (let r = 0; r < 3; r++) {
      const row = [];
      for (let c = 0; c < 4; c++) {
        const raw = deck.pop();
        row.push({
          value: raw.value,
          color: raw.color,
          faceUp: false,
          hasPrism: false,
          immune: false,
        });
      }
      grid.push(row);
    }
    player.grid = grid;
  }

  // Pop 1 card from deck to start discard (face-up)
  const discardCard = deck.pop();
  const discard = [discardCard];

  // Game state
  const game = {
    players,
    deck,
    discard,
    phase: PHASE.REVEAL,
    currentPlayerIndex: 0,
    luminaCaller: null,
    finalTurnsRemaining: 0,
    _luminaJustTriggered: false,
    round: 1,
    cumulativeScores: new Array(totalPlayers).fill(0),
    actionLog: [],

    // ── Peek Deck ────────────────────────────────────────────────

    peekDeck() {
      this._reshuffleDeck();
      return this.deck[this.deck.length - 1];
    },

    // ── Reveal Phase ──────────────────────────────────────────────

    revealCard(playerIndex, row, col) {
      if (this.phase !== PHASE.REVEAL) return false;
      const player = this.players[playerIndex];
      if (player.revealsLeft <= 0) return false;
      const card = player.grid[row][col];
      if (card.faceUp) return false;

      card.faceUp = true;
      player.revealsLeft--;
      return true;
    },

    // ── Start Game ────────────────────────────────────────────────

    startGame() {
      this.phase = PHASE.PLAYING;

      // Determine first player: highest visible sum; random tiebreak
      let maxSum = -Infinity;
      let candidates = [];

      for (let i = 0; i < this.players.length; i++) {
        let sum = 0;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 4; c++) {
            const card = this.players[i].grid[r][c];
            if (card.faceUp) sum += card.value;
          }
        }
        if (sum > maxSum) {
          maxSum = sum;
          candidates = [i];
        } else if (sum === maxSum) {
          candidates.push(i);
        }
      }

      this.currentPlayerIndex =
        candidates.length === 1
          ? candidates[0]
          : candidates[Math.floor(Math.random() * candidates.length)];
    },

    // ── LUMINA Check ──────────────────────────────────────────────

    isLumina(playerIndex) {
      const grid = this.players[playerIndex].grid;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          if (!grid[r][c].faceUp) return false;
        }
      }
      return true;
    },

    _checkLumina(playerIndex) {
      if (this.phase === PHASE.FINAL_TURNS) return;
      if (this.isLumina(playerIndex)) {
        this.luminaCaller = playerIndex;
        this.phase = PHASE.FINAL_TURNS;
        // Each other player gets 1 turn
        this.finalTurnsRemaining = this.players.length - 1;
        this._luminaJustTriggered = true;
        this.actionLog.push(
          `${this.players[playerIndex].name} called LUMINA!`
        );
      }
    },

    // ── Construct from Deck ───────────────────────────────────────

    constructFromDeck(playerIndex, row, col) {
      const player = this.players[playerIndex];
      const card = player.grid[row][col];
      if (card.hasPrism) return false;

      this._reshuffleDeck();
      const drawn = this.deck.pop();

      // Discard old card
      this.discard.push({
        value: card.value,
        color: card.color,
      });

      // Place new card
      player.grid[row][col] = {
        value: drawn.value,
        color: drawn.color,
        faceUp: true,
        hasPrism: false,
        immune: false,
      };

      this.actionLog.push(
        `${player.name} constructed from deck at (${row},${col})`
      );
      this._checkLumina(playerIndex);
      this._endTurn();
      return true;
    },

    // ── Construct from Discard ────────────────────────────────────

    constructFromDiscard(playerIndex, row, col) {
      const player = this.players[playerIndex];
      const card = player.grid[row][col];
      if (card.hasPrism) return false;

      const drawn = this.discard.pop();

      // Discard old card
      this.discard.push({
        value: card.value,
        color: card.color,
      });

      // Place new card
      player.grid[row][col] = {
        value: drawn.value,
        color: drawn.color,
        faceUp: true,
        hasPrism: false,
        immune: false,
      };

      this.actionLog.push(
        `${player.name} constructed from discard at (${row},${col})`
      );
      this._checkLumina(playerIndex);
      this._endTurn();
      return true;
    },

    // ── Construct Discard-Draw ────────────────────────────────────

    constructDiscardDraw(playerIndex, revealRow, revealCol) {
      const player = this.players[playerIndex];
      const revealCard = player.grid[revealRow][revealCol];
      if (revealCard.faceUp) return false;

      this._reshuffleDeck();
      const drawn = this.deck.pop();

      // Discard the drawn card immediately
      this.discard.push(drawn);

      // Reveal the face-down card
      revealCard.faceUp = true;

      this.actionLog.push(
        `${player.name} discarded draw, revealed (${revealRow},${revealCol})`
      );
      this._checkLumina(playerIndex);
      this._endTurn();
      return true;
    },

    // ── Attack ────────────────────────────────────────────────────

    attack(
      attackerIndex,
      attackerRow,
      attackerCol,
      defenderIndex,
      defenderRow,
      defenderCol,
      revealRow,
      revealCol
    ) {
      const attacker = this.players[attackerIndex];
      const defender = this.players[defenderIndex];

      const attackerCard = attacker.grid[attackerRow][attackerCol];
      const defenderCard = defender.grid[defenderRow][defenderCol];
      const costCard = attacker.grid[revealRow][revealCol];

      // Validate: attacker must have a face-down card to reveal
      if (costCard.faceUp) return false;

      // Both swap cards must be face-up
      if (!attackerCard.faceUp || !defenderCard.faceUp) return false;

      // Neither swap card can be prismed
      if (attackerCard.hasPrism || defenderCard.hasPrism) return false;

      // Defender card not immune
      if (defenderCard.immune) return false;

      // During final turns: can't attack fully revealed player
      if (this.phase === PHASE.FINAL_TURNS && this.isLumina(defenderIndex)) {
        return false;
      }

      // 1. Reveal the cost card
      costCard.faceUp = true;

      // 2. Swap the two cards
      attacker.grid[attackerRow][attackerCol] = {
        value: defenderCard.value,
        color: defenderCard.color,
        faceUp: true,
        hasPrism: false,
        immune: false,
      };
      defender.grid[defenderRow][defenderCol] = {
        value: attackerCard.value,
        color: attackerCard.color,
        faceUp: true,
        hasPrism: false,
        immune: true, // 4. Set immunity on received card
      };

      // 5. Update stats and log
      attacker.stats.attacksMade++;
      this.actionLog.push(
        `${attacker.name} attacked ${defender.name}: swapped (${attackerRow},${attackerCol}) with (${defenderRow},${defenderCol})`
      );

      this._checkLumina(attackerIndex);
      this._endTurn();
      return true;
    },

    // ── Secure ────────────────────────────────────────────────────

    secure(playerIndex, row, col, fromRow, fromCol) {
      const player = this.players[playerIndex];
      const targetCard = player.grid[row][col];

      if (!targetCard.faceUp) return false;

      if (fromRow !== undefined && fromCol !== undefined) {
        // Moving prism
        const sourceCard = player.grid[fromRow][fromCol];
        if (!sourceCard.hasPrism) return false;
        if (targetCard.hasPrism) return false;

        sourceCard.hasPrism = false; // unlock source
        targetCard.hasPrism = true;

        this.actionLog.push(
          `${player.name} moved prism from (${fromRow},${fromCol}) to (${row},${col})`
        );
      } else {
        // Placing new prism
        if (player.prismsRemaining <= 0) return false;
        if (targetCard.hasPrism) return false;

        targetCard.hasPrism = true;
        player.prismsRemaining--;
        player.stats.prismsUsed++;

        this.actionLog.push(
          `${player.name} secured (${row},${col}) with a prism`
        );
      }

      this._endTurn();
      return true;
    },

    // ── Clear Immunity ────────────────────────────────────────────

    clearImmunity(playerIndex) {
      const grid = this.players[playerIndex].grid;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          grid[r][c].immune = false;
        }
      }
    },

    // ── End Turn ──────────────────────────────────────────────────

    _endTurn() {
      // Clear current player's immunity
      this.clearImmunity(this.currentPlayerIndex);

      if (this.phase === PHASE.FINAL_TURNS) {
        // On the turn that triggers LUMINA, don't decrement — just advance past caller
        if (this._luminaJustTriggered) {
          this._luminaJustTriggered = false;
          let next = (this.currentPlayerIndex + 1) % this.players.length;
          while (next === this.luminaCaller) {
            next = (next + 1) % this.players.length;
          }
          this.currentPlayerIndex = next;
          return;
        }

        this.finalTurnsRemaining--;
        if (this.finalTurnsRemaining <= 0) {
          this.phase = PHASE.SCORING;
          return;
        }
        // Advance to next player, skipping LUMINA caller
        let next = (this.currentPlayerIndex + 1) % this.players.length;
        while (next === this.luminaCaller) {
          next = (next + 1) % this.players.length;
        }
        this.currentPlayerIndex = next;
      } else {
        // Normal turn advance
        this.currentPlayerIndex =
          (this.currentPlayerIndex + 1) % this.players.length;
      }
    },

    // ── Score Round ───────────────────────────────────────────────

    scoreRound() {
      const roundScores = [];

      for (let i = 0; i < this.players.length; i++) {
        const result = calcRoundScore(this.players[i].grid);
        roundScores.push(result.total);
      }

      // Apply LUMINA caller bonus/penalty
      if (this.luminaCaller !== null) {
        const callerScore = roundScores[this.luminaCaller];
        // Strictly highest means no one else has the same or higher score
        const isStrictlyHighest = roundScores.every(
          (s, i) => i === this.luminaCaller || s < callerScore
        );

        if (isStrictlyHighest) {
          roundScores[this.luminaCaller] += 10;
        } else {
          roundScores[this.luminaCaller] -= 10;
        }
      }

      // Add to cumulative scores (negative rounds clamped to 0)
      for (let i = 0; i < this.players.length; i++) {
        this.cumulativeScores[i] += Math.max(0, roundScores[i]);
      }
    },

    // ── Game Over ─────────────────────────────────────────────────

    isGameOver() {
      return this.cumulativeScores.some((s) => s >= 200);
    },

    getWinner() {
      let maxScore = -Infinity;
      let winner = null;
      for (let i = 0; i < this.players.length; i++) {
        if (this.cumulativeScores[i] > maxScore) {
          maxScore = this.cumulativeScores[i];
          winner = this.players[i].name;
        }
      }
      return winner;
    },

    // ── Available Actions ─────────────────────────────────────────

    getAvailableActions(playerIndex) {
      const player = this.players[playerIndex];
      const actions = [ACTION.CONSTRUCT]; // always available

      // ATTACK: only if player has face-down cards
      let hasFaceDown = false;
      let hasVisibleUnprismed = false;
      let hasPlacedPrisms = false;

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const card = player.grid[r][c];
          if (!card.faceUp) hasFaceDown = true;
          if (card.faceUp && !card.hasPrism) hasVisibleUnprismed = true;
          if (card.hasPrism) hasPlacedPrisms = true;
        }
      }

      if (hasFaceDown) {
        actions.push(ACTION.ATTACK);
      }

      // SECURE: if player has visible unprismed cards AND
      // (has prisms remaining OR has placed prisms to move)
      if (hasVisibleUnprismed && (player.prismsRemaining > 0 || hasPlacedPrisms)) {
        actions.push(ACTION.SECURE);
      }

      return actions;
    },

    // ── Reshuffle Deck ────────────────────────────────────────────

    _reshuffleDeck() {
      if (this.deck.length > 0) return;

      // Keep top discard card
      const topCard = this.discard.pop();
      // Move remaining discard to deck
      this.deck.push(...this.discard);
      this.discard.length = 0;
      this.discard.push(topCard);

      shuffle(this.deck);
    },
  };

  return game;
}
