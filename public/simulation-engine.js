/** @module simulation-engine – Headless bot-vs-bot batch simulation runner */

import { createGame, PHASE } from './game.js';
import { chooseBotReveal, chooseBotAction } from './bot.js';
import { calcRoundScore } from './scoring.js';

const MAX_TURNS_PER_ROUND = 500;
const MAX_ROUNDS_PER_GAME = 50;

/**
 * Execute a bot action on the game.
 * @param {object} game
 * @param {number} botIndex
 * @param {object} action
 */
function executeAction(game, botIndex, action) {
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
}

/**
 * Perform the reveal phase for all bots: each bot reveals 2 cards.
 * @param {object} game
 */
function doReveals(game) {
  for (let i = 0; i < game.players.length; i++) {
    const positions = chooseBotReveal(game, i);
    for (const [r, c] of positions) {
      game.revealCard(i, r, c);
    }
  }
}

/**
 * Run a single round to completion. Returns round detail object.
 * @param {object} game
 * @returns {{ scores: number[], breakdowns: object[], luminaCaller: number|null }}
 */
function playRound(game) {
  let turns = 0;

  while (game.phase !== PHASE.SCORING && turns < MAX_TURNS_PER_ROUND) {
    const action = chooseBotAction(game, game.currentPlayerIndex);
    executeAction(game, game.currentPlayerIndex, action);
    turns++;
  }

  // Collect breakdowns before scoreRound mutates cumulative scores
  const breakdowns = [];
  const scores = [];
  for (let i = 0; i < game.players.length; i++) {
    const result = calcRoundScore(game.players[i].grid, game.config);
    breakdowns.push({
      base: result.baseScore,
      columnBonus: result.columnBonus,
      rowBonus: result.rowBonus,
      prismBonus: result.prismBonus,
    });
    scores.push(result.total);
  }

  // Apply LUMINA bonus/penalty to scores (mirrors game.scoreRound logic)
  if (game.luminaCaller !== null) {
    const callerScore = scores[game.luminaCaller];
    const isStrictlyHighest = scores.every(
      (s, i) => i === game.luminaCaller || s < callerScore
    );
    const luminaBonus = game.config?.luminaBonus ?? 10;
    if (isStrictlyHighest) {
      scores[game.luminaCaller] += luminaBonus;
    } else {
      scores[game.luminaCaller] -= luminaBonus;
    }
  }

  const luminaCaller = game.luminaCaller;

  // Let game update cumulative scores
  game.scoreRound();

  return { scores, breakdowns, luminaCaller };
}

/**
 * Run a single complete game (multiple rounds until someone wins).
 * @param {number} playerCount
 * @param {string[]} difficulties
 * @param {object} config
 * @returns {{ winner: number, rounds: number, finalScores: number[], roundDetails: object[] }}
 */
function playGame(playerCount, difficulties, config) {
  let game = createGame({
    botCount: playerCount,
    botDifficulties: difficulties,
    config,
    allBots: true,
  });

  const roundDetails = [];
  let roundNum = 0;

  while (roundNum < MAX_ROUNDS_PER_GAME) {
    // Reveal phase
    doReveals(game);
    game.startGame();

    // Play round
    const detail = playRound(game);
    roundDetails.push(detail);
    roundNum++;

    if (game.isGameOver()) break;

    // Start new round: save state, create fresh game, transplant
    const savedScores = [...game.cumulativeScores];
    const savedRound = game.round;

    game = createGame({
      botCount: playerCount,
      botDifficulties: difficulties,
      config,
      allBots: true,
    });
    game.cumulativeScores = savedScores;
    game.round = savedRound + 1;
  }

  // Determine winner (highest cumulative score)
  let maxScore = -Infinity;
  let winner = 0;
  for (let i = 0; i < game.cumulativeScores.length; i++) {
    if (game.cumulativeScores[i] > maxScore) {
      maxScore = game.cumulativeScores[i];
      winner = i;
    }
  }

  return {
    winner,
    rounds: roundDetails.length,
    finalScores: [...game.cumulativeScores],
    roundDetails,
  };
}

/**
 * Compute summary statistics from game results.
 * @param {object[]} games
 * @param {number} playerCount
 * @returns {object}
 */
function computeSummary(games, playerCount) {
  const totalGames = games.length;
  const wins = new Array(playerCount).fill(0);
  const totalScores = new Array(playerCount).fill(0);
  let totalRounds = 0;
  let totalRoundsWithLumina = 0;
  let totalRoundsAll = 0;

  // For avgScoreByRound: collect cumulative scores at each round index
  const maxRounds = Math.max(...games.map((g) => g.rounds));
  // scoresByRound[r][i] = array of cumulative scores at round r for player i
  const scoresByRound = [];
  for (let r = 0; r < maxRounds; r++) {
    scoresByRound.push(new Array(playerCount).fill(null).map(() => []));
  }

  // For avgBreakdown: accumulate per-player totals
  const breakdownTotals = [];
  const breakdownCounts = [];
  for (let i = 0; i < playerCount; i++) {
    breakdownTotals.push({ base: 0, column: 0, row: 0, prism: 0 });
    breakdownCounts.push(0);
  }

  for (const game of games) {
    wins[game.winner]++;
    totalRounds += game.rounds;

    for (let i = 0; i < playerCount; i++) {
      totalScores[i] += game.finalScores[i];
    }

    // Track cumulative scores per round
    const cumulative = new Array(playerCount).fill(0);
    for (let r = 0; r < game.rounds; r++) {
      const rd = game.roundDetails[r];

      for (let i = 0; i < playerCount; i++) {
        cumulative[i] += Math.max(0, rd.scores[i]);
        scoresByRound[r][i].push(cumulative[i]);

        // Accumulate breakdowns
        breakdownTotals[i].base += rd.breakdowns[i].base;
        breakdownTotals[i].column += rd.breakdowns[i].columnBonus;
        breakdownTotals[i].row += rd.breakdowns[i].rowBonus;
        breakdownTotals[i].prism += rd.breakdowns[i].prismBonus;
        breakdownCounts[i]++;
      }

      totalRoundsAll++;
      if (rd.luminaCaller !== null) {
        totalRoundsWithLumina++;
      }
    }
  }

  const avgScore = totalScores.map((s) => s / totalGames);
  const avgRounds = totalRounds / totalGames;
  const luminaCallRate = totalRoundsAll > 0 ? totalRoundsWithLumina / totalRoundsAll : 0;

  // avgScoreByRound[r][i] = average cumulative score at round r for player i
  const avgScoreByRound = [];
  for (let r = 0; r < maxRounds; r++) {
    const roundAvgs = [];
    for (let i = 0; i < playerCount; i++) {
      const values = scoresByRound[r][i];
      if (values.length > 0) {
        roundAvgs.push(values.reduce((a, b) => a + b, 0) / values.length);
      } else {
        roundAvgs.push(0);
      }
    }
    avgScoreByRound.push(roundAvgs);
  }

  // avgBreakdown[i] = average per-round breakdown for player i
  const avgBreakdown = [];
  for (let i = 0; i < playerCount; i++) {
    const count = breakdownCounts[i] || 1;
    avgBreakdown.push({
      base: breakdownTotals[i].base / count,
      column: breakdownTotals[i].column / count,
      row: breakdownTotals[i].row / count,
      prism: breakdownTotals[i].prism / count,
    });
  }

  return {
    totalGames,
    wins,
    avgScore,
    avgRounds,
    luminaCallRate,
    avgScoreByRound,
    avgBreakdown,
  };
}

/**
 * Run a batch of bot-vs-bot simulations.
 * @param {{ gameCount: number, playerCount: number, difficulties: string[], config?: object, onProgress?: function }} params
 * @returns {{ games: object[], summary: object }}
 */
export function runSimulation({ gameCount, playerCount, difficulties, config = {}, onProgress }) {
  const games = [];

  for (let g = 0; g < gameCount; g++) {
    const result = playGame(playerCount, difficulties, config);
    games.push(result);

    if (onProgress) {
      onProgress(g + 1, gameCount);
    }
  }

  const summary = computeSummary(games, playerCount);

  return { games, summary };
}
