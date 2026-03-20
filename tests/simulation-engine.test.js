import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../public/simulation-engine.js';

describe('runSimulation', () => {
  it('should return correct results shape', () => {
    const results = runSimulation({
      gameCount: 5,
      playerCount: 2,
      difficulties: ['hard', 'hard'],
      config: {},
    });
    assert.equal(results.games.length, 5);
    assert.equal(results.summary.totalGames, 5);
    assert.equal(results.summary.wins.length, 2);
    assert.equal(results.summary.avgScore.length, 2);
    assert.ok(typeof results.summary.avgRounds === 'number');
    assert.ok(typeof results.summary.luminaCallRate === 'number');
  });

  it('should have winner counts sum to total games', () => {
    const results = runSimulation({
      gameCount: 10,
      playerCount: 3,
      difficulties: ['hard', 'hard', 'hard'],
      config: {},
    });
    const totalWins = results.summary.wins.reduce((a, b) => a + b, 0);
    assert.equal(totalWins, 10);
  });

  it('should respect custom config', () => {
    const results = runSimulation({
      gameCount: 3,
      playerCount: 2,
      difficulties: ['hard', 'hard'],
      config: { winThreshold: 50 },
    });
    // With low threshold, games should end quickly
    assert.ok(results.summary.avgRounds <= 5, `Expected few rounds with low threshold, got ${results.summary.avgRounds}`);
  });

  it('should call onProgress callback', () => {
    let progressCalls = 0;
    runSimulation({
      gameCount: 5,
      playerCount: 2,
      difficulties: ['hard', 'hard'],
      config: {},
      onProgress: (completed, total) => {
        progressCalls++;
        assert.equal(total, 5);
      },
    });
    assert.equal(progressCalls, 5);
  });

  it('should include round details per game', () => {
    const results = runSimulation({
      gameCount: 1,
      playerCount: 2,
      difficulties: ['hard', 'hard'],
      config: {},
    });
    const game = results.games[0];
    assert.ok(game.rounds > 0);
    assert.equal(game.roundDetails.length, game.rounds);
    assert.equal(game.finalScores.length, 2);
    for (const rd of game.roundDetails) {
      assert.equal(rd.scores.length, 2);
      assert.equal(rd.breakdowns.length, 2);
    }
  });
});
