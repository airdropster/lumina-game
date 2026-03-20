/** @module simulator – Party Simulator UI controller */

const DEFAULTS = {
  cardMin: 1, cardMax: 12, negativeValue: -2, topValue: 15,
  playerCount: 4, winThreshold: 200,
  columnBonus: 10, rowBonus: 10, prismBonus: 10, luminaBonus: 10,
  gameCount: 100,
};

const DIFF_COLORS = { easy: '#4ade80', medium: '#fbbf24', hard: '#ef4444' };

let charts = { winrate: null, breakdown: null, progression: null, histogram: null, donut: null };

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

  // Check AI availability and wire up button
  fetch('/api/analyze/status')
    .then((r) => r.json())
    .then((data) => {
      if (data.available) {
        $('analyze-btn')?.addEventListener('click', handleAnalyze);
        $('reanalyze-btn')?.addEventListener('click', handleAnalyze);
      } else {
        const aiSection = $('ai-section');
        if (aiSection) aiSection.remove();
      }
    })
    .catch(() => {
      const aiSection = $('ai-section');
      if (aiSection) aiSection.remove();
    });
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

let activeWorker = null;
let lastResults = null;
let lastParams = null;

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

  try {
    const worker = new Worker('simulator-worker.js', { type: 'module' });
    activeWorker = worker;

    worker.postMessage({
      gameCount: params.gameCount,
      playerCount: params.playerCount,
      difficulties: params.difficulties,
      config: params.config,
    });

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        const { completed, total } = e.data;
        const pct = (completed / total * 100).toFixed(0);
        $('progress-fill').style.width = pct + '%';
        $('progress-text').textContent = `${completed} / ${total}`;
      }
      if (e.data.type === 'results') {
        worker.terminate();
        activeWorker = null;
        onSimulationComplete(e.data.results, params);
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      worker.terminate();
      activeWorker = null;
      runSimulationFallback(params);
    };
  } catch (e) {
    console.warn('Module Worker not supported, falling back to sync:', e.message);
    runSimulationFallback(params);
  }
}

async function runSimulationFallback(params) {
  const { runSimulation } = await import('./simulation-engine.js');
  await new Promise((r) => setTimeout(r, 50));
  const results = runSimulation({
    ...params,
    onProgress: (completed, total) => {
      const pct = (completed / total * 100).toFixed(0);
      $('progress-fill').style.width = pct + '%';
      $('progress-text').textContent = `${completed} / ${total}`;
    },
  });
  onSimulationComplete(results, params);
}

function onSimulationComplete(results, params) {
  lastResults = results;
  lastParams = params;

  $('progress-container').classList.add('hidden');
  $('run-btn').disabled = false;
  $('empty-state').classList.add('hidden');
  $('results-content').classList.remove('hidden');

  // Show AI section if available
  if ($('ai-section')) {
    $('ai-section').classList.remove('hidden');
    $('ai-result')?.classList.add('hidden');
    $('analyze-btn')?.classList.remove('hidden');
  }

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

  // New stat cards
  const globalMedian = Math.round(
    summary.perPlayer.reduce((s, p) => s + p.medianScore, 0) / params.playerCount
  );
  const globalStdDev = Math.round(
    summary.perPlayer.reduce((s, p) => s + p.stdDev, 0) / params.playerCount
  );
  const globalMin = Math.min(...summary.perPlayer.map((p) => p.minScore));
  const globalMax = Math.max(...summary.perPlayer.map((p) => p.maxScore));

  $('stat-median').textContent = globalMedian;
  $('stat-stddev').textContent = globalStdDev;
  $('stat-range').textContent = `${globalMin} – ${globalMax}`;
  $('stat-turns').textContent = summary.roundStats.avgTurns.toFixed(1);

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

  // Score Progression line chart with min/max bands
  const maxRounds = summary.avgScoreByRound.length;
  const roundLabels = Array.from({ length: maxRounds }, (_, i) => `R${i + 1}`);

  const progressionDatasets = [];
  for (let i = 0; i < params.playerCount; i++) {
    const color = DIFF_COLORS[params.difficulties[i]];
    progressionDatasets.push({
      label: `Bot ${i + 1} min`,
      data: summary.scoreProgressionBands.map((b) => b.min[i] ?? 0),
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      pointRadius: 0,
      fill: false,
    });
    progressionDatasets.push({
      label: `Bot ${i + 1} range`,
      data: summary.scoreProgressionBands.map((b) => b.max[i] ?? 0),
      borderColor: 'transparent',
      backgroundColor: color + '15',
      pointRadius: 0,
      fill: '-1',
    });
    progressionDatasets.push({
      label: `Bot ${i + 1}`,
      data: summary.avgScoreByRound.map((r) => r[i] !== undefined ? +r[i].toFixed(0) : null),
      borderColor: color,
      backgroundColor: 'transparent',
      tension: 0.3,
      pointRadius: 2,
    });
  }

  charts.progression = new Chart($('chart-progression'), {
    type: 'line',
    data: { labels: roundLabels, datasets: progressionDatasets },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Score Progression (avg with range)', color: '#f8fafc', font: { size: 14 } },
        legend: {
          labels: {
            color: '#94a3b8',
            filter: (item) => !item.text.includes('min') && !item.text.includes('range'),
          },
        },
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
      },
    },
  });

  // Score Distribution Histogram
  const histLabels = summary.scoreDistribution[0].map(
    (b) => `${Math.round(b.min)}-${Math.round(b.max)}`
  );
  const histDatasets = params.difficulties.map((d, i) => ({
    label: `Bot ${i + 1}`,
    data: summary.scoreDistribution[i].map((b) => b.count),
    backgroundColor: DIFF_COLORS[d] + '99',
  }));

  charts.histogram = new Chart($('chart-histogram'), {
    type: 'bar',
    data: { labels: histLabels, datasets: histDatasets },
    options: chartOptions('Score Distribution'),
  });

  // Bonus Contribution Donut (aggregated across players)
  const avgContrib = { base: 0, column: 0, row: 0, prism: 0 };
  for (const bc of summary.bonusContributions) {
    avgContrib.base += bc.base;
    avgContrib.column += bc.column;
    avgContrib.row += bc.row;
    avgContrib.prism += bc.prism;
  }
  const n = summary.bonusContributions.length || 1;

  charts.donut = new Chart($('chart-donut'), {
    type: 'doughnut',
    data: {
      labels: ['Base', 'Column', 'Row', 'Prism'],
      datasets: [{
        data: [
          +(avgContrib.base / n * 100).toFixed(1),
          +(avgContrib.column / n * 100).toFixed(1),
          +(avgContrib.row / n * 100).toFixed(1),
          +(avgContrib.prism / n * 100).toFixed(1),
        ],
        backgroundColor: ['#94a3b8', '#4ade80', '#60a5fa', '#a78bfa'],
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Bonus Contribution (%)', color: '#f8fafc', font: { size: 14 } },
        legend: { labels: { color: '#94a3b8' } },
      },
    },
  });

  // Detailed Statistics Table
  renderDetailTable(summary, params);
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

function renderDetailTable(summary, params) {
  const labels = params.difficulties.map((d, i) => `Bot ${i + 1} (${d})`);

  const rows = [
    ['Wins', ...summary.perPlayer.map((p) => p.wins)],
    ['Win Rate', ...summary.perPlayer.map((p) => (p.winRate * 100).toFixed(1) + '%')],
    ['Win Rate CI', ...summary.winRateCI.map((ci) => `${(ci.lower * 100).toFixed(0)}-${(ci.upper * 100).toFixed(0)}%`)],
    ['Median Score', ...summary.perPlayer.map((p) => Math.round(p.medianScore))],
    ['Std Dev', ...summary.perPlayer.map((p) => p.stdDev.toFixed(1))],
    ['Min Score', ...summary.perPlayer.map((p) => p.minScore)],
    ['Max Score', ...summary.perPlayer.map((p) => p.maxScore)],
    ['Max Win Streak', ...summary.perPlayer.map((p) => p.maxWinStreak)],
  ];

  let html = '<table><thead><tr><th>Stat</th>';
  for (const l of labels) html += `<th>${l}</th>`;
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) html += `<td>${cell}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';

  const diffs = Object.entries(summary.perDifficulty);
  if (diffs.length > 0) {
    html += '<table><thead><tr><th>Difficulty</th><th>Bots</th><th>Win Rate</th><th>Avg Score</th></tr></thead><tbody>';
    for (const [d, stats] of diffs) {
      html += `<tr><td>${d}</td><td>${stats.bots}</td><td>${(stats.winRate * 100).toFixed(1)}%</td><td>${Math.round(stats.avgScore)}</td></tr>`;
    }
    html += '</tbody></table>';
  }

  $('player-stats-table').innerHTML = html;
}

async function handleAnalyze() {
  if (!lastResults || !lastParams) return;

  $('analyze-btn').classList.add('hidden');
  $('ai-loading').classList.remove('hidden');
  $('ai-result').classList.add('hidden');

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: lastResults.summary,
        config: lastParams.config,
      }),
    });

    const data = await resp.json();

    if (resp.ok) {
      $('ai-text').innerHTML = formatAnalysis(data.analysis);
      $('ai-result').classList.remove('hidden');
    } else {
      $('ai-text').textContent = data.error || 'Analysis failed.';
      $('ai-result').classList.remove('hidden');
    }
  } catch (err) {
    $('ai-text').textContent = 'Failed to reach server. Try again.';
    $('ai-result').classList.remove('hidden');
  }

  $('ai-loading').classList.add('hidden');
  $('analyze-btn').classList.add('hidden');
}

function formatAnalysis(text) {
  // Escape HTML entities first to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-\u2022]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n/g, '<br>');
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
  charts = { winrate: null, breakdown: null, progression: null, histogram: null, donut: null };
  $('results-content').classList.add('hidden');
  $('empty-state').classList.remove('hidden');
  $('validation-msg').classList.add('hidden');
  $('player-stats-table').innerHTML = '';
  if ($('ai-section')) $('ai-section').classList.add('hidden');
  if ($('ai-result')) $('ai-result').classList.add('hidden');
}
