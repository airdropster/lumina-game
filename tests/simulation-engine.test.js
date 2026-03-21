import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation, runBatch, computeSummary, median, stdDev, wilsonCI, buildHistogram } from '../public/simulation-engine.js';

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

describe('enhanced summary statistics', () => {
  const results = runSimulation({
    gameCount: 20,
    playerCount: 3,
    difficulties: ['hard', 'medium', 'easy'],
    config: {},
  });
  const { summary } = results;

  it('should include perPlayer stats', () => {
    assert.equal(summary.perPlayer.length, 3);
    for (const p of summary.perPlayer) {
      assert.ok(typeof p.wins === 'number');
      assert.ok(typeof p.winRate === 'number');
      assert.ok(typeof p.avgScore === 'number');
      assert.ok(typeof p.medianScore === 'number');
      assert.ok(typeof p.stdDev === 'number');
      assert.ok(typeof p.minScore === 'number');
      assert.ok(typeof p.maxScore === 'number');
      assert.ok(typeof p.maxWinStreak === 'number');
    }
  });

  it('perPlayer wins should sum to totalGames', () => {
    const totalWins = summary.perPlayer.reduce((s, p) => s + p.wins, 0);
    assert.equal(totalWins, 20);
  });

  it('should include perDifficulty stats', () => {
    assert.ok(summary.perDifficulty.hard);
    assert.ok(summary.perDifficulty.medium);
    assert.ok(summary.perDifficulty.easy);
    assert.ok(typeof summary.perDifficulty.hard.winRate === 'number');
  });

  it('should include scoreDistribution per player', () => {
    assert.equal(summary.scoreDistribution.length, 3);
    for (const dist of summary.scoreDistribution) {
      assert.ok(Array.isArray(dist));
      assert.ok(dist.length > 0);
      const total = dist.reduce((s, b) => s + b.count, 0);
      assert.equal(total, 20);
    }
  });

  it('should include bonusContributions per player', () => {
    assert.equal(summary.bonusContributions.length, 3);
    for (const bc of summary.bonusContributions) {
      const sum = bc.base + bc.column + bc.row + bc.prism;
      assert.ok(sum > 0.95 && sum < 1.05, `Contributions should sum to ~1.0, got ${sum}`);
    }
  });

  it('should include roundStats', () => {
    assert.ok(typeof summary.roundStats.avgTurns === 'number');
    assert.ok(typeof summary.roundStats.minTurns === 'number');
    assert.ok(typeof summary.roundStats.maxTurns === 'number');
    assert.ok(summary.roundStats.minTurns <= summary.roundStats.maxTurns);
  });

  it('should include winRateCI per player', () => {
    assert.equal(summary.winRateCI.length, 3);
    for (const ci of summary.winRateCI) {
      assert.ok(ci.lower >= 0 && ci.upper <= 1);
      assert.ok(ci.lower <= ci.upper);
    }
  });

  it('should include scoreProgressionBands', () => {
    assert.ok(summary.scoreProgressionBands.length > 0);
    const band = summary.scoreProgressionBands[0];
    assert.equal(band.avg.length, 3);
    assert.equal(band.min.length, 3);
    assert.equal(band.max.length, 3);
  });
});

describe('runBatch', () => {
  it('should return raw games array without summary', () => {
    const games = runBatch({
      gameCount: 5,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
    });
    assert.ok(Array.isArray(games));
    assert.equal(games.length, 5);
    for (const g of games) {
      assert.ok(typeof g.winner === 'number');
      assert.ok(Array.isArray(g.finalScores));
      assert.ok(Array.isArray(g.roundDetails));
      assert.ok(typeof g.rounds === 'number');
    }
  });

  it('should call onProgress callback', () => {
    let calls = 0;
    runBatch({
      gameCount: 3,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
      onProgress: () => { calls++; },
    });
    assert.equal(calls, 3);
  });
});

describe('computeSummary', () => {
  it('should produce same summary whether called via runSimulation or separately', () => {
    const params = {
      gameCount: 5,
      playerCount: 2,
      difficulties: ['easy', 'easy'],
      config: {},
    };
    const { games, summary: expected } = runSimulation(params);
    const actual = computeSummary(games, params.playerCount, params.difficulties);
    assert.equal(actual.totalGames, expected.totalGames);
    assert.deepEqual(actual.wins, expected.wins);
    assert.equal(actual.avgRounds, expected.avgRounds);
  });
});
