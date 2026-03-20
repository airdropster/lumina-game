import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation, median, stdDev, wilsonCI, buildHistogram } from '../public/simulation-engine.js';

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

describe('statistical helpers', () => {
  it('median of odd-length array', () => {
    assert.equal(median([3, 1, 2]), 2);
  });

  it('median of even-length array', () => {
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  it('median of single element', () => {
    assert.equal(median([42]), 42);
  });

  it('stdDev of identical values is 0', () => {
    assert.equal(stdDev([5, 5, 5, 5]), 0);
  });

  it('stdDev of known values', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] sample stdDev ~ 2.138
    const result = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.ok(Math.abs(result - 2.138) < 0.01, `Expected ~2.138, got ${result}`);
  });

  it('stdDev of single element is 0', () => {
    assert.equal(stdDev([10]), 0);
  });

  it('wilsonCI returns {lower, upper} in [0,1]', () => {
    const ci = wilsonCI(30, 100);
    assert.ok(ci.lower >= 0 && ci.lower < ci.upper && ci.upper <= 1);
    assert.ok(Math.abs(ci.lower - 0.216) < 0.02, `lower: ${ci.lower}`);
    assert.ok(Math.abs(ci.upper - 0.400) < 0.02, `upper: ${ci.upper}`);
  });

  it('wilsonCI with 0 total returns {0, 0}', () => {
    const ci = wilsonCI(0, 0);
    assert.equal(ci.lower, 0);
    assert.equal(ci.upper, 0);
  });

  it('buildHistogram creates correct buckets', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const buckets = buildHistogram(values, 5);
    assert.equal(buckets.length, 5);
    assert.equal(buckets[0].min, 10);
    assert.ok(Math.abs(buckets[4].max - 100) < 0.01);
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    assert.equal(totalCount, 10);
  });

  it('buildHistogram handles identical values', () => {
    const buckets = buildHistogram([5, 5, 5, 5], 3);
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    assert.equal(totalCount, 4);
  });
});
