/** @module app – Main game controller for LUMINA */

import { createGame, PHASE, ACTION } from './game.js';
import { chooseBotReveal, chooseBotAction } from './bot.js';
import { calcRoundScore } from './scoring.js';
import {
  renderSetupScreen,
  renderGameBoard,
  renderRoundEnd,
  renderGameEnd,
  renderHistory,
  renderStatsScreen,
  showDeckDrawDialog,
  logAction,
  logRichAction,
  flashGridCell,
  highlightAttackTargets,
  clearAttackHighlights,
} from './ui.js';
import { saveGameStats, fetchHistory } from './stats.js';

// ── State ──────────────────────────────────────────────────────────────

let game = null;
let selectedAction = null;   // 'construct' | 'attack' | 'secure' | null
let attackStep = null;        // tracks multi-step attack flow
let constructSource = null;   // 'deck' | 'discard' | null
let roundStats = [];          // accumulated round data for stats saving
let isProcessingBot = false;  // prevent user clicks during bot turns

// Bot thinking delays by difficulty (ms)
const BOT_DELAY = { easy: 800, medium: 1200, hard: 1800 };

// ── Boot ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  showSetup();
});

// ── Setup Screen ───────────────────────────────────────────────────────

function showSetup() {
  game = null;
  selectedAction = null;
  attackStep = null;
  constructSource = null;
  roundStats = [];
  isProcessingBot = false;
  renderSetupScreen(document.body, onStartGame, showStatsScreen);
}

function onStartGame({ botCount, botDifficulties }) {
  game = createGame({ botCount, botDifficulties });
  roundStats = [];
  startRevealPhase();
}

// ── Reveal Phase ───────────────────────────────────────────────────────

function startRevealPhase() {
  // Bots auto-reveal their 2 cards
  for (let b = 1; b < game.players.length; b++) {
    const reveals = chooseBotReveal(game, b);
    for (const [r, c] of reveals) {
      game.revealCard(b, r, c);
    }
  }

  // Player needs to reveal 2 cards
  game.actionLog.push('Reveal 2 of your cards to begin.');
  renderBoard();
}

// ── Render Board ───────────────────────────────────────────────────────

function renderBoard() {
  renderGameBoard(document.body, game, {
    onCardClick: handleCardClick,
    onBotCardClick: handleBotCardClick,
    onBotTabClick: () => {},
    onDeckClick: handleDeckClick,
    onDiscardClick: handleDiscardClick,
    onActionClick: handleActionClick,
    onStatsClick: showStatsScreen,
  });

  // Show phase-specific status in the log
  if (game.phase === PHASE.REVEAL) {
    const remaining = game.players[0].revealsLeft;
    if (remaining > 0) {
      logAction(document, `Click ${remaining} of your face-down cards to reveal.`);
    }
  } else if (game.phase === PHASE.PLAYING || game.phase === PHASE.FINAL_TURNS) {
    const current = game.players[game.currentPlayerIndex];
    if (game.currentPlayerIndex === 0) {
      logAction(document, `Your turn — choose an action.`);
    } else {
      logAction(document, `${current.name} is thinking...`);
    }
  }

  // Highlight selected action
  if (selectedAction) {
    const btnMap = { construct: '.btn-construct', attack: '.btn-attack', secure: '.btn-secure' };
    const btn = document.querySelector(btnMap[selectedAction]);
    if (btn) btn.classList.add('selected');
  }
}

// ── Card Click (Player Grid) ───────────────────────────────────────────

function handleCardClick(row, col) {
  if (isProcessingBot) return;

  // Reveal phase
  if (game.phase === PHASE.REVEAL) {
    const player = game.players[0];
    if (player.revealsLeft <= 0) return;
    const card = player.grid[row][col];
    if (card.faceUp) return;

    game.revealCard(0, row, col);

    const cardEls = document.querySelectorAll('.player-grid .card');
    const cardEl = cardEls[row * 4 + col];
    if (cardEl) cardEl.classList.add('card-flip');

    if (player.revealsLeft === 0) {
      // All players revealed — start game
      game.startGame();
      game.actionLog.push('Game started!');
      renderBoard();
      // If bot goes first, trigger bot turn
      if (game.currentPlayerIndex !== 0) {
        scheduleBotTurn();
      }
    } else {
      renderBoard();
    }
    return;
  }

  // Playing phase — only on player's turn
  if (game.currentPlayerIndex !== 0) return;

  if (!selectedAction) {
    logAction(document, 'Select an action first (Construct, Attack, or Secure).');
    return;
  }

  const card = game.players[0].grid[row][col];

  // CONSTRUCT
  if (selectedAction === 'construct') {
    if (constructSource === 'deck') {
      // Player chose to place deck draw at this position
      if (card.hasPrism) {
        logAction(document, 'Cannot replace a prismed card.');
        return;
      }
      game.constructFromDeck(0, row, col);
      endPlayerTurn();
    } else if (constructSource === 'discard') {
      if (card.hasPrism) {
        logAction(document, 'Cannot replace a prismed card.');
        return;
      }
      game.constructFromDiscard(0, row, col);
      endPlayerTurn();
    } else if (constructSource === 'deck_discard') {
      // Player drew from deck and chose to discard — reveal a face-down card
      if (card.faceUp) {
        logAction(document, 'Select a face-down card to reveal.');
        return;
      }
      game.constructDiscardDraw(0, row, col);
      endPlayerTurn();
    } else {
      logAction(document, 'Draw from the Deck or Discard pile first.');
    }
    return;
  }

  // ATTACK — multi-step
  if (selectedAction === 'attack') {
    if (!attackStep) {
      // Step 1: select your face-up card to swap
      if (!card.faceUp || card.hasPrism) {
        logAction(document, 'Select one of your face-up, non-prismed cards to swap.');
        return;
      }
      attackStep = { attackerRow: row, attackerCol: col };
      logAction(document, `Selected your card at (${row + 1},${col + 1}). Now click an opponent's card.`);
      return;
    }
    if (attackStep && !attackStep.defenderIndex) {
      // Need to click bot card, not own card
      logAction(document, 'Now click on an opponent\'s face-up card to steal.');
      return;
    }
    if (attackStep && attackStep.defenderIndex) {
      // Step 3: select face-down cost card
      if (card.faceUp) {
        logAction(document, 'Select a face-down card to reveal as the attack cost.');
        return;
      }
      const ok = game.attack(
        0,
        attackStep.attackerRow, attackStep.attackerCol,
        attackStep.defenderIndex, attackStep.defenderRow, attackStep.defenderCol,
        row, col
      );
      if (!ok) {
        logAction(document, 'Invalid attack. Try again.');
        attackStep = null;
        return;
      }
      endPlayerTurn();
    }
    return;
  }

  // SECURE
  if (selectedAction === 'secure') {
    if (!card.faceUp) {
      logAction(document, 'Select a face-up card to secure with a prism.');
      return;
    }
    if (card.hasPrism) {
      logAction(document, 'This card already has a prism.');
      return;
    }
    const ok = game.secure(0, row, col);
    if (!ok) {
      logAction(document, 'Cannot secure this card. No prisms remaining?');
      return;
    }
    const secureCardEls = document.querySelectorAll('.player-grid .card');
    const secureCardEl = secureCardEls[row * 4 + col];
    if (secureCardEl) secureCardEl.classList.add('prism-drop');
    endPlayerTurn();
  }
}

// ── Bot Card Click (for Attack targeting) ──────────────────────────────

function handleBotCardClick(botIndex, row, col) {
  if (isProcessingBot) return;
  if (game.currentPlayerIndex !== 0) return;

  if (selectedAction === 'attack' && attackStep && !attackStep.defenderIndex) {
    const card = game.players[botIndex].grid[row][col];
    if (!card.faceUp || card.hasPrism || card.immune) {
      logAction(document, 'Invalid target. Pick a face-up, non-prismed, non-immune card.');
      return;
    }
    attackStep.defenderIndex = botIndex;
    attackStep.defenderRow = row;
    attackStep.defenderCol = col;
    logAction(document, `Targeting ${game.players[botIndex].name}'s card at (${row + 1},${col + 1}). Now reveal a face-down card as cost.`);
  }
}

// ── Deck Click ─────────────────────────────────────────────────────────

function handleDeckClick() {
  if (isProcessingBot) return;
  if (game.currentPlayerIndex !== 0) return;

  if (selectedAction !== 'construct') {
    logAction(document, 'Select CONSTRUCT first.');
    return;
  }

  if (constructSource) {
    logAction(document, 'You already drew a card. Place it on your grid.');
    return;
  }

  // Peek at the top card to show in the dialog
  const drawnCard = game.peekDeck();

  // Offer choice: place on grid or discard and reveal
  showDeckDrawDialog(
    drawnCard,
    () => {
      constructSource = 'deck';
      logAction(document, 'Click a card in your grid to replace it with the drawn card.');
    },
    () => {
      constructSource = 'deck_discard';
      logAction(document, 'Click a face-down card to reveal it. The drawn card goes to discard.');
    }
  );
}

// ── Discard Click ──────────────────────────────────────────────────────

function handleDiscardClick() {
  if (isProcessingBot) return;
  if (game.currentPlayerIndex !== 0) return;

  if (selectedAction !== 'construct') {
    logAction(document, 'Select CONSTRUCT first.');
    return;
  }

  if (constructSource) {
    logAction(document, 'You already drew a card. Place it on your grid.');
    return;
  }

  if (game.discard.length === 0) {
    logAction(document, 'Discard pile is empty.');
    return;
  }

  constructSource = 'discard';
  const top = game.discard[game.discard.length - 1];
  logAction(document, `Picked ${top.value} from discard. Click a card in your grid to replace.`);
}

// ── Action Button Click ────────────────────────────────────────────────

function handleActionClick(action) {
  if (isProcessingBot) return;
  if (game.currentPlayerIndex !== 0) return;

  selectedAction = action;
  attackStep = null;
  constructSource = null;

  clearAttackHighlights();

  if (action === 'construct') {
    logAction(document, 'CONSTRUCT: Draw from Deck or Discard pile.');
  } else if (action === 'attack') {
    highlightAttackTargets(game, 0);
    logAction(document, 'ATTACK: Select your face-up card to swap, then an opponent\'s card, then reveal a cost card.');
  } else if (action === 'secure') {
    clearAttackHighlights();
    logAction(document, 'SECURE: Click a face-up card to place a prism on it.');
  }

  renderBoard();
}

// ── End Player Turn ────────────────────────────────────────────────────

function endPlayerTurn() {
  selectedAction = null;
  attackStep = null;
  constructSource = null;
  clearAttackHighlights();

  // Check for LUMINA flash
  if (game.luminaCaller === 0 && game.phase === PHASE.FINAL_TURNS) {
    logAction(document, 'LUMINA! You revealed all your cards!');
    const flash = document.createElement('div');
    flash.classList.add('lumina-flash');
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1500);
  }

  // Check if round is over
  if (game.phase === PHASE.SCORING) {
    endRound();
    return;
  }

  renderBoard();

  // If next player is a bot, schedule bot turn
  if (game.currentPlayerIndex !== 0) {
    scheduleBotTurn();
  }
}

// ── Bot Turn ───────────────────────────────────────────────────────────

function scheduleBotTurn() {
  isProcessingBot = true;
  const bot = game.players[game.currentPlayerIndex];
  const delay = BOT_DELAY[bot.difficulty] || 1000;

  setTimeout(() => {
    executeBotTurn();
  }, delay);
}

/** Build inline card badge HTML for the rich action log. */
function _badge(value, color) {
  const cls = color === 'multicolor' ? 'card-badge-multi'
    : color === null ? 'card-badge-neutral'
    : `card-badge-${color}`;
  return `<span class="card-badge ${cls}">${value}</span>`;
}

function executeBotTurn() {
  const botIndex = game.currentPlayerIndex;
  const bot = game.players[botIndex];

  const action = chooseBotAction(game, botIndex);

  // Capture card values BEFORE the action modifies the grid
  let oldCard = null;
  let attackerCard = null;
  let defenderCard = null;
  let secureCard = null;
  let discardTop = null;

  if (action.type === 'construct') {
    if (action.source === 'discard') {
      oldCard = { ...bot.grid[action.row][action.col] };
      discardTop = game.discard.length > 0 ? { ...game.discard[game.discard.length - 1] } : null;
    } else if (action.source === 'deck_discard') {
      // No card to capture for deck_discard (drawn card goes to discard, a face-down is revealed)
    } else {
      oldCard = { ...bot.grid[action.row][action.col] };
    }
  } else if (action.type === 'attack') {
    attackerCard = { ...bot.grid[action.attackerRow][action.attackerCol] };
    defenderCard = { ...game.players[action.defenderIndex].grid[action.defenderRow][action.defenderCol] };
  } else if (action.type === 'secure') {
    secureCard = { ...bot.grid[action.row][action.col] };
  }

  if (action.type === 'construct') {
    if (action.source === 'discard') {
      game.constructFromDiscard(botIndex, action.row, action.col);
    } else if (action.source === 'deck_discard') {
      game.constructDiscardDraw(botIndex, action.revealRow, action.revealCol);
    } else {
      game.constructFromDeck(botIndex, action.row, action.col);
    }
  } else if (action.type === 'attack') {
    game.attack(
      botIndex,
      action.attackerRow, action.attackerCol,
      action.defenderIndex, action.defenderRow, action.defenderCol,
      action.revealRow, action.revealCol
    );
  } else if (action.type === 'secure') {
    game.secure(botIndex, action.row, action.col);
  }

  // Rich action log with card badges and grid highlights
  if (action.type === 'construct') {
    if (action.source === 'discard' && discardTop) {
      const newCard = bot.grid[action.row][action.col];
      const badge = _badge(discardTop.value, discardTop.color);
      const oldBadge = oldCard && oldCard.faceUp ? `, replaced ${_badge(oldCard.value, oldCard.color)}` : '';
      logRichAction(document, { actor: bot.name, actionType: 'constructed', details: `${badge} at (${action.row + 1},${action.col + 1})${oldBadge}` });
      flashGridCell(botIndex, action.row, action.col);
    } else if (action.source === 'deck_discard') {
      logRichAction(document, { actor: bot.name, actionType: 'drew and discarded', details: `revealed (${action.revealRow + 1},${action.revealCol + 1})` });
      flashGridCell(botIndex, action.revealRow, action.revealCol);
    } else {
      const newCard = bot.grid[action.row][action.col];
      const oldBadge = oldCard && oldCard.faceUp ? `, replaced ${_badge(oldCard.value, oldCard.color)}` : '';
      logRichAction(document, { actor: bot.name, actionType: 'drew from deck', details: `placed at (${action.row + 1},${action.col + 1})${oldBadge}` });
      flashGridCell(botIndex, action.row, action.col);
    }
  } else if (action.type === 'attack') {
    const defName = game.players[action.defenderIndex].name;
    const aBadge = _badge(attackerCard.value, attackerCard.color);
    const dBadge = _badge(defenderCard.value, defenderCard.color);
    logRichAction(document, { actor: bot.name, actionType: 'swapped', details: `${aBadge} \u2194 ${dBadge} from ${defName}, revealed (${action.revealRow + 1},${action.revealCol + 1})` });
    flashGridCell(botIndex, action.revealRow, action.revealCol);
    flashGridCell(action.defenderIndex, action.defenderRow, action.defenderCol);
  } else if (action.type === 'secure') {
    const sBadge = _badge(secureCard.value, secureCard.color);
    logRichAction(document, { actor: bot.name, actionType: 'secured', details: `${sBadge} with prism` });
    flashGridCell(botIndex, action.row, action.col);
  }

  // Check LUMINA
  if (game.luminaCaller === botIndex && game.phase === PHASE.FINAL_TURNS) {
    logAction(document, `${bot.name} called LUMINA!`);
    const flash = document.createElement('div');
    flash.classList.add('lumina-flash');
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1500);
  }

  isProcessingBot = false;

  // Check if round is over
  if (game.phase === PHASE.SCORING) {
    endRound();
    return;
  }

  renderBoard();

  // If next player is also a bot, schedule another bot turn
  if (game.currentPlayerIndex !== 0) {
    scheduleBotTurn();
  }
}

// ── End Round ──────────────────────────────────────────────────────────

function endRound() {
  // Calculate and store round scores before applying them
  const roundScoreData = [];
  for (let i = 0; i < game.players.length; i++) {
    const breakdown = calcRoundScore(game.players[i].grid);
    const player = game.players[i];

    // Count hidden cards at LUMINA call
    let hiddenCount = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (!player.grid[r][c].faceUp) hiddenCount++;
      }
    }

    roundScoreData.push({
      roundNumber: game.round,
      playerName: player.name,
      roundScore: breakdown.total,
      attacksMade: player.stats.attacksMade,
      prismsUsed: player.stats.prismsUsed,
      hiddenCardsAtLumina: hiddenCount,
      calledLumina: game.luminaCaller === i ? 1 : 0,
    });
  }
  roundStats.push(...roundScoreData);

  // Apply scoring
  game.scoreRound();

  // Show round end screen
  renderRoundEnd(document.body, game, () => {
    if (game.isGameOver()) {
      endGame();
    } else {
      startNewRound();
    }
  });
}

// ── Start New Round ────────────────────────────────────────────────────

function startNewRound() {
  // Re-create the game with same players but fresh deck/grids
  const botCount = game.players.length - 1;
  const botDifficulties = game.players.slice(1).map((p) => p.difficulty);
  const cumulativeScores = [...game.cumulativeScores];
  const round = game.round + 1;

  game = createGame({ botCount, botDifficulties });
  game.cumulativeScores = cumulativeScores;
  game.round = round;

  startRevealPhase();
}

// ── End Game ───────────────────────────────────────────────────────────

async function endGame() {
  const winner = game.getWinner();
  const scores = [...game.cumulativeScores];

  // Save stats to server
  try {
    await saveGameStats(
      {
        numPlayers: game.players.length,
        numRounds: game.round,
        winner,
        playerFinalScore: scores[0],
      },
      roundStats
    );
  } catch (e) {
    console.error('Failed to save stats:', e);
  }

  renderGameEnd(document.body, scores, winner, {
    onPlayAgain: showSetup,
    onViewHistory: showHistoryScreen,
  });
}

// ── History / Stats Screen ─────────────────────────────────────────────

async function fetchSessions() {
  const history = await fetchHistory();
  return (history || []).map((s) => ({
    date: new Date(s.playedAt).toLocaleDateString(),
    players: s.numPlayers,
    rounds: s.numRounds,
    winner: s.winner,
    playerScore: s.playerFinalScore,
    roundDetails: (s.rounds || [])
      .filter((r) => r.playerName === 'Player')
      .map((r) => ({
        round: r.roundNumber,
        playerScore: r.roundScore,
        roundWinner: r.calledLumina ? 'LUMINA caller' : '-',
      })),
  }));
}

async function showHistoryScreen() {
  try {
    const sessions = await fetchSessions();
    renderStatsScreen(document.body, sessions, showSetup);
  } catch (e) {
    console.error('Failed to fetch history:', e);
    renderStatsScreen(document.body, [], showSetup);
  }
}

async function showStatsScreen() {
  try {
    const sessions = await fetchSessions();
    renderStatsScreen(document.body, sessions, showSetup);
  } catch (e) {
    console.error('Failed to fetch stats:', e);
    renderStatsScreen(document.body, [], showSetup);
  }
}
