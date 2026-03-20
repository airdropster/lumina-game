/** @module simulator – Party Simulator UI controller */

import { runSimulation } from './simulation-engine.js';

const DEFAULTS = {
  cardMin: 1, cardMax: 12, negativeValue: -2, topValue: 15,
  playerCount: 4, winThreshold: 200,
  columnBonus: 10, rowBonus: 10, prismBonus: 10, luminaBonus: 10,
  gameCount: 100,
};

const DIFF_COLORS = { easy: '#4ade80', medium: '#fbbf24', hard: '#ef4444' };

let charts = { winrate: null, breakdown: null, progression: null };

// DOM ref helper
const $ = (id) => document.getElementById(id);

// Set Chart.js global defaults for dark theme
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = '#1e293b';

// Init
document.addEventListener('DOMContentLoaded', () => {
  buildDifficultySelects(+$('playerCount').value);

  // Sync slider <-> number input
  $('gameCountSlider').addEventListener('input', (e) => {
    $('gameCount').value = e.target.value;
  });
  $('gameCount').addEventListener('input', (e) => {
    $('gameCountSlider').value = e.target.value;
  });

  // Rebuild difficulty selects when player count changes
  $('playerCount').addEventListener('change', () => {
    buildDifficultySelects(+$('playerCount').value);
  });

  $('run-btn').addEventListener('click', handleRun);
  $('reset-btn').addEventListener('click', handleReset);
});

function buildDifficultySelects(count) {
  const container = $('difficulty-container');
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'difficulty-row';
    row.innerHTML = `
      <span>Bot ${i + 1}</span>
      <select class="bot-difficulty" data-index="${i}">
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard" selected>Hard</option>
      </select>`;
    container.appendChild(row);
  }
}

function getParams() {
  const playerCount = +$('playerCount').value;
  const selects = document.querySelectorAll('.bot-difficulty');
  const difficulties = Array.from(selects).map((s) => s.value);

  return {
    gameCount: +$('gameCount').value,
    playerCount,
    difficulties,
    config: {
      cardMin: +$('cardMin').value,
      cardMax: +$('cardMax').value,
      negativeValue: +$('negativeValue').value,
      topValue: +$('topValue').value,
      winThreshold: +$('winThreshold').value,
      columnBonus: +$('columnBonus').value,
      rowBonus: +$('rowBonus').value,
      prismBonus: +$('prismBonus').value,
      luminaBonus: +$('luminaBonus').value,
    },
  };
}

function validate(params) {
  const { cardMin, cardMax } = params.config;
  if (cardMin >= cardMax) return 'Card min must be less than max';
  const deckSize = (cardMax - cardMin + 1) * 4 * 2 + 8 + 8;
  const needed = params.playerCount * 12 + 1;
  if (needed > deckSize) {
    return `Deck too small (${deckSize} cards) for ${params.playerCount} players (need ${needed})`;
  }
  return null;
}

async function handleRun() {
  const params = getParams();
  const error = validate(params);

  if (error) {
    $('validation-msg').textContent = error;
    $('validation-msg').classList.remove('hidden');
    return;
  }
  $('validation-msg').classList.add('hidden');

  // Show progress, disable button
  $('run-btn').disabled = true;
  $('progress-container').classList.remove('hidden');
  $('progress-fill').style.width = '0%';
  $('progress-text').textContent = `0 / ${params.gameCount}`;

  // Let UI paint before blocking with simulation
  await new Promise((resolve) => setTimeout(resolve, 50));

  const results = runSimulation({
    ...params,
    onProgress: (completed, total) => {
      const pct = (completed / total * 100).toFixed(0);
      $('progress-fill').style.width = pct + '%';
      $('progress-text').textContent = `${completed} / ${total}`;
    },
  });

  // Hide progress, show results
  $('progress-container').classList.add('hidden');
  $('run-btn').disabled = false;
  $('empty-state').classList.add('hidden');
  $('results-content').classList.remove('hidden');

  renderResults(results, params);
}

function renderResults(results, params) {
  const { summary } = results;
  const labels = params.difficulties.map((d, i) => `Bot ${i + 1} (${d})`);
  const colors = params.difficulties.map((d) => DIFF_COLORS[d]);

  // Summary stat cards
  $('stat-games').textContent = summary.totalGames;
  $('stat-rounds').textContent = summary.avgRounds.toFixed(1);
  $('stat-lumina').textContent = (summary.luminaCallRate * 100).toFixed(0) + '%';
  const avgWinScore =
    summary.avgScore.reduce((a, b) => a + b, 0) / summary.avgScore.length;
  $('stat-winning').textContent = Math.round(avgWinScore);

  // Destroy old charts
  Object.values(charts).forEach((c) => c?.destroy());

  // Win Rate bar chart
  charts.winrate = new Chart($('chart-winrate'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Win Rate %',
          data: summary.wins.map(
            (w) => +(w / summary.totalGames * 100).toFixed(1)
          ),
          backgroundColor: colors,
        },
      ],
    },
    options: chartOptions('Win Rate (%)', { yMax: 100 }),
  });

  // Score Breakdown stacked bar chart
  charts.breakdown = new Chart($('chart-breakdown'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Base',
          data: summary.avgBreakdown.map((b) => +b.base.toFixed(1)),
          backgroundColor: '#94a3b8',
        },
        {
          label: 'Column',
          data: summary.avgBreakdown.map((b) => +b.column.toFixed(1)),
          backgroundColor: '#4ade80',
        },
        {
          label: 'Row',
          data: summary.avgBreakdown.map((b) => +b.row.toFixed(1)),
          backgroundColor: '#60a5fa',
        },
        {
          label: 'Prism',
          data: summary.avgBreakdown.map((b) => +b.prism.toFixed(1)),
          backgroundColor: '#a78bfa',
        },
      ],
    },
    options: chartOptions('Avg Score Breakdown (per round)', { stacked: true }),
  });

  // Score Progression line chart
  const maxRounds = summary.avgScoreByRound.length;
  const roundLabels = Array.from({ length: maxRounds }, (_, i) => `R${i + 1}`);
  const datasets = params.difficulties.map((d, i) => ({
    label: `Bot ${i + 1}`,
    data: summary.avgScoreByRound.map((r) =>
      r[i] !== undefined ? +r[i].toFixed(0) : null
    ),
    borderColor: DIFF_COLORS[d],
    backgroundColor: 'transparent',
    tension: 0.3,
  }));

  charts.progression = new Chart($('chart-progression'), {
    type: 'line',
    data: { labels: roundLabels, datasets },
    options: chartOptions('Score Progression (avg cumulative)'),
  });
}

function chartOptions(title, opts = {}) {
  return {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: title,
        color: '#f8fafc',
        font: { size: 14 },
      },
      legend: { labels: { color: '#94a3b8' } },
    },
    scales: {
      x: {
        stacked: !!opts.stacked,
        ticks: { color: '#94a3b8' },
        grid: { color: '#1e293b' },
      },
      y: {
        stacked: !!opts.stacked,
        ticks: { color: '#94a3b8' },
        grid: { color: '#1e293b' },
        ...(opts.yMax ? { max: opts.yMax } : {}),
      },
    },
  };
}

function handleReset() {
  Object.entries(DEFAULTS).forEach(([key, val]) => {
    const el = $(key);
    if (el) el.value = val;
  });
  $('gameCountSlider').value = DEFAULTS.gameCount;
  buildDifficultySelects(DEFAULTS.playerCount);

  // Clear results
  Object.values(charts).forEach((c) => c?.destroy());
  charts = { winrate: null, breakdown: null, progression: null };
  $('results-content').classList.add('hidden');
  $('empty-state').classList.remove('hidden');
  $('validation-msg').classList.add('hidden');
}
