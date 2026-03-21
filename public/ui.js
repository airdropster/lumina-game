/** @module ui – DOM rendering layer for LUMINA */

import { PHASE } from './game.js';
import { calcRoundScore } from './scoring.js';

// ── Helpers ────────────────────────────────────────────────────────────

const SCREEN_IDS = [
  'setup-screen',
  'game-screen',
  'round-end-screen',
  'game-end-screen',
  'history-screen',
];

/**
 * Map card color to CSS class suffix.
 * @param {string|null} color
 * @returns {string}
 */
function colorClass(color) {
  if (color === 'multicolor') return 'card-multi';
  if (color === null) return 'card-neutral';
  return `card-${color}`;
}

/**
 * Create an HTML element with optional class list and attributes.
 * @param {string} tag
 * @param {string|string[]} [classes]
 * @param {Record<string,string>} [attrs]
 * @returns {HTMLElement}
 */
function el(tag, classes, attrs) {
  const node = document.createElement(tag);
  if (classes) {
    const list = Array.isArray(classes) ? classes : [classes];
    list.forEach((c) => c && node.classList.add(c));
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v);
    }
  }
  return node;
}

// ── hideAllScreens ─────────────────────────────────────────────────────

/**
 * Hide every screen div by removing the `active` class.
 */
export function hideAllScreens() {
  for (const id of SCREEN_IDS) {
    const screen = document.getElementById(id);
    if (screen) screen.classList.remove('active');
  }
}

/**
 * Show a single screen by id.
 * @param {string} id
 */
function showScreen(id) {
  hideAllScreens();
  let screen = document.getElementById(id);
  if (!screen) {
    screen = el('div', 'screen', { id });
    document.body.appendChild(screen);
  }
  screen.classList.add('active');
  return screen;
}

// ── renderCard ─────────────────────────────────────────────────────────

/**
 * Render a single card as an HTMLElement.
 * @param {{ value: number, color: string|null, faceUp: boolean, hasPrism: boolean, immune: boolean }} card
 * @param {'normal'|'small'} [size='normal']
 * @returns {HTMLElement}
 */
export function renderCard(card, size = 'normal') {
  const classes = ['card'];

  if (!card.faceUp) {
    classes.push('face-down');
  } else {
    classes.push(colorClass(card.color));
  }

  if (card.hasPrism) classes.push('prismed');
  if (card.immune) classes.push('immune');

  const cardEl = el('div', classes);
  cardEl.style.position = 'relative';

  if (size === 'small') {
    cardEl.style.width = 'var(--card-bot-w)';
    cardEl.style.height = 'var(--card-bot-h)';
    cardEl.style.fontSize = '0.9rem';
  }

  if (card.faceUp) {
    // Card value (centered)
    const valueSpan = el('span');
    valueSpan.textContent = String(card.value);
    cardEl.appendChild(valueSpan);

    // Color label (top-left corner)
    const colorName = card.color === 'multicolor' ? 'WILD'
      : card.color === null ? 'NONE'
      : card.color.toUpperCase();
    const label = el('span', 'card-color-label');
    label.textContent = colorName;
    cardEl.appendChild(label);
  }

  return cardEl;
}

// ── renderSetupScreen ──────────────────────────────────────────────────

/**
 * Render the setup/configuration screen.
 * @param {HTMLElement} container
 * @param {function({ botCount: number, botDifficulties: string[] }): void} onStart
 */
export function renderSetupScreen(container, onStart, onViewStats) {
  const screen = showScreen('setup-screen');
  screen.innerHTML = '';

  const card = el('div', 'setup-card');

  // Title
  const title = el('h1');
  title.textContent = 'LUMINA';
  card.appendChild(title);

  // Subtitle
  const subtitle = el('h2');
  subtitle.textContent = 'Game Setup';
  card.appendChild(subtitle);

  // Bot count selector
  const botField = el('div', 'setup-field');
  const botLabel = el('label');
  botLabel.textContent = 'Number of Bots';
  botField.appendChild(botLabel);

  let selectedBotCount = 2;
  const btnRow = el('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--sp-2)';

  const countButtons = [];
  for (let i = 1; i <= 5; i++) {
    const btn = el('button');
    btn.textContent = String(i);
    btn.style.flex = '1';
    btn.style.padding = 'var(--sp-3)';
    btn.style.background = i === selectedBotCount ? 'rgba(96, 165, 250, 0.25)' : 'var(--bg-surface-raised)';
    btn.style.border = i === selectedBotCount ? '2px solid var(--card-blue-border)' : '1px solid var(--border-default)';
    btn.style.borderRadius = '6px';
    btn.style.color = 'var(--text-primary)';
    btn.style.fontFamily = 'var(--font-sans)';
    btn.style.fontSize = '0.9rem';
    btn.style.fontWeight = '700';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'all 150ms ease';

    btn.addEventListener('click', () => {
      selectedBotCount = i;
      countButtons.forEach((b, idx) => {
        const active = idx + 1 === i;
        b.style.background = active ? 'rgba(96, 165, 250, 0.25)' : 'var(--bg-surface-raised)';
        b.style.border = active ? '2px solid var(--card-blue-border)' : '1px solid var(--border-default)';
      });
      renderBotConfigs();
    });

    countButtons.push(btn);
    btnRow.appendChild(btn);
  }
  botField.appendChild(btnRow);
  card.appendChild(botField);

  // Bot difficulty configs
  const botConfigContainer = el('div', 'bot-config');
  card.appendChild(botConfigContainer);

  const difficultySelects = [];

  function renderBotConfigs() {
    botConfigContainer.innerHTML = '';
    difficultySelects.length = 0;

    for (let i = 0; i < selectedBotCount; i++) {
      const row = el('div', 'bot-config-row');

      const label = el('span', 'bot-label');
      label.textContent = `Bot ${i + 1}`;
      row.appendChild(label);

      const select = el('select');
      ['easy', 'medium', 'hard'].forEach((diff) => {
        const opt = el('option');
        opt.value = diff;
        opt.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
        if (diff === 'medium') opt.selected = true;
        select.appendChild(opt);
      });

      difficultySelects.push(select);
      row.appendChild(select);
      botConfigContainer.appendChild(row);
    }
  }

  renderBotConfigs();

  // Start button
  const startBtn = el('button', 'btn-start');
  startBtn.textContent = 'START GAME';
  startBtn.setAttribute('aria-label', 'Start a new game');
  startBtn.addEventListener('click', () => {
    const botDifficulties = difficultySelects.map((s) => s.value);
    onStart({ botCount: selectedBotCount, botDifficulties });
  });
  card.appendChild(startBtn);

  // View Stats button
  if (onViewStats) {
    const viewStatsBtn = el('button', 'btn-stats');
    viewStatsBtn.textContent = 'VIEW STATS';
    viewStatsBtn.style.display = 'block';
    viewStatsBtn.style.margin = 'var(--sp-3) auto 0';
    viewStatsBtn.addEventListener('click', () => onViewStats());
    card.appendChild(viewStatsBtn);
  }

  // Party Simulator link
  const simBtn = el('button', 'btn-stats');
  simBtn.textContent = 'PARTY SIMULATOR';
  simBtn.style.display = 'block';
  simBtn.style.margin = 'var(--sp-3) auto 0';
  simBtn.addEventListener('click', () => { window.location.href = 'simulator'; });
  card.appendChild(simBtn);

  screen.appendChild(card);
}

// ── renderGameBoard ────────────────────────────────────────────────────

/**
 * Render the main game board.
 * @param {HTMLElement} container
 * @param {object} game – game state from createGame()
 * @param {object} callbacks
 */
export function renderGameBoard(container, game, callbacks) {
  const screen = showScreen('game-screen');
  screen.innerHTML = '';

  // ── Header Bar ──
  const header = el('div', 'header-bar');

  const titleSpan = el('span', 'game-title');
  titleSpan.textContent = 'LUMINA';
  header.appendChild(titleSpan);

  const roundInfo = el('span', 'round-info');
  roundInfo.innerHTML = `Round <span class="round-number">${game.round}</span>`;
  header.appendChild(roundInfo);

  const scoreDisplay = el('span', 'score-display');
  scoreDisplay.innerHTML = `Score: <span class="score-value">${game.cumulativeScores[0]}</span>`;
  header.appendChild(scoreDisplay);

  // Header buttons (Stats + Help)
  const headerBtns = el('span');
  headerBtns.style.display = 'flex';
  headerBtns.style.gap = 'var(--sp-2)';

  const statsBtn = el('button', 'btn-stats');
  statsBtn.textContent = 'STATS';
  statsBtn.setAttribute('aria-label', 'View stats');
  statsBtn.addEventListener('click', () => callbacks.onStatsClick());
  headerBtns.appendChild(statsBtn);

  const helpBtn = el('button', 'btn-help');
  helpBtn.textContent = '?';
  helpBtn.setAttribute('aria-label', 'Game rules');
  helpBtn.addEventListener('click', () => showCheatsheet());
  headerBtns.appendChild(helpBtn);

  header.appendChild(headerBtns);

  screen.appendChild(header);

  // ── Turn Banner ──
  const turnBanner = el('div', 'turn-banner');
  if (game.phase === PHASE.REVEAL) {
    const remaining = game.players[0].revealsLeft;
    turnBanner.classList.add('turn-banner--reveal');
    turnBanner.textContent = `REVEAL PHASE \u2014 Click ${remaining} cards to flip`;
  } else if (game.phase === PHASE.FINAL_TURNS) {
    const callerName = game.luminaCaller !== null ? game.players[game.luminaCaller].name : 'Unknown';
    turnBanner.classList.add('turn-banner--final');
    turnBanner.textContent = `FINAL TURNS \u2014 LUMINA called by ${callerName}!`;
  } else if (game.currentPlayerIndex === 0) {
    turnBanner.classList.add('turn-banner--player');
    turnBanner.textContent = 'YOUR TURN \u2014 Choose an action';
  } else {
    const botName = game.players[game.currentPlayerIndex].name;
    turnBanner.classList.add('turn-banner--bot');
    turnBanner.textContent = `${botName} is thinking...`;
  }
  screen.appendChild(turnBanner);

  // ── Scoreboard ──
  const scoreboard = el('div', 'scoreboard');
  for (let i = 0; i < game.players.length; i++) {
    const classes = ['scoreboard-entry'];
    if (i === game.currentPlayerIndex) classes.push('scoreboard-entry--active');
    const entry = el('div', classes);
    entry.textContent = `${game.players[i].name}: ${game.cumulativeScores[i]}`;
    if (game.round === 1 && game.turnCount !== undefined && game.turnCount <= game.players.length && i === game.currentPlayerIndex) {
      const badge = el('span', 'first-player-badge');
      badge.textContent = '1st';
      entry.appendChild(badge);
    }
    scoreboard.appendChild(entry);
  }
  screen.appendChild(scoreboard);

  // ── Bot Zone ──
  const botZone = el('div', 'bot-zone');

  for (let b = 1; b < game.players.length; b++) {
    const bot = game.players[b];

    const tab = el('div', 'bot-tab');
    if (b === game.currentPlayerIndex) {
      tab.classList.add('bot-tab--active');
    }
    tab.setAttribute('role', 'region');
    tab.setAttribute('aria-label', `${bot.name} - ${bot.difficulty}`);

    // Bot name + score header
    const nameRow = el('div', 'bot-name');
    const nameSpan = el('span');
    nameSpan.textContent = `${bot.name} (${bot.difficulty})`;
    nameRow.appendChild(nameSpan);

    const scoreSpan = el('span', 'bot-score');
    scoreSpan.textContent = String(game.cumulativeScores[b]);
    nameRow.appendChild(scoreSpan);
    tab.appendChild(nameRow);

    // Bot grid (3 rows x 4 cols)
    const gridDiv = el('div', 'bot-grid');

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const card = bot.grid[r][c];
        const cardEl = renderCard(card, 'small');
        const row = r;
        const col = c;
        cardEl.addEventListener('click', () => {
          callbacks.onBotCardClick(b, row, col);
        });
        gridDiv.appendChild(cardEl);
      }
    }

    tab.appendChild(gridDiv);
    botZone.appendChild(tab);
  }

  screen.appendChild(botZone);

  // ── Central Zone (Deck + Discard) ──
  const centralZone = el('div', 'central-zone');

  // Deck
  const deckArea = el('div', 'deck-area');
  const deckLabel = el('div', 'label');
  deckLabel.textContent = 'DECK';
  deckArea.appendChild(deckLabel);

  const deckPile = el('div', 'deck-pile');
  deckPile.setAttribute('role', 'button');
  deckPile.setAttribute('aria-label', `Draw from deck, ${game.deck.length} cards remaining`);
  deckPile.setAttribute('tabindex', '0');
  const deckCount = el('span', 'card-count');
  deckCount.textContent = String(game.deck.length);
  deckPile.appendChild(deckCount);
  deckPile.addEventListener('click', () => callbacks.onDeckClick());
  deckPile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      callbacks.onDeckClick();
    }
  });
  deckArea.appendChild(deckPile);
  centralZone.appendChild(deckArea);

  // Discard
  const discardArea = el('div', 'discard-area');
  const discardLabel = el('div', 'label');
  discardLabel.textContent = 'DISCARD';
  discardArea.appendChild(discardLabel);

  const topDiscard = game.discard.length > 0 ? game.discard[game.discard.length - 1] : null;
  if (topDiscard) {
    const discardCard = renderCard(
      { value: topDiscard.value, color: topDiscard.color, faceUp: true, hasPrism: false, immune: false },
      'normal'
    );
    discardCard.setAttribute('role', 'button');
    discardCard.setAttribute('aria-label', `Discard pile top: ${topDiscard.value} ${topDiscard.color || 'neutral'}`);
    discardCard.setAttribute('tabindex', '0');
    discardCard.addEventListener('click', () => callbacks.onDiscardClick());
    discardCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        callbacks.onDiscardClick();
      }
    });
    discardArea.appendChild(discardCard);
  } else {
    const emptySlot = el('div', 'card-slot');
    discardArea.appendChild(emptySlot);
  }
  centralZone.appendChild(discardArea);

  screen.appendChild(centralZone);

  // ── Player Zone ──
  const playerZone = el('div', 'player-zone');

  // Player info
  const playerInfo = el('div', 'player-info');
  const playerName = el('span', 'player-name');
  playerName.textContent = game.players[0].name;
  playerInfo.appendChild(playerName);

  const playerScore = el('span', 'player-score');
  playerScore.textContent = String(game.cumulativeScores[0]);
  playerInfo.appendChild(playerScore);

  const prismCount = el('span', 'prism-count');
  prismCount.textContent = `${game.players[0].prismsRemaining} prisms`;
  playerInfo.appendChild(prismCount);

  playerZone.appendChild(playerInfo);

  // Player grid (3 rows x 4 cols)
  const playerGrid = el('div', 'player-grid');
  playerGrid.setAttribute('role', 'grid');
  playerGrid.setAttribute('aria-label', 'Your card grid');

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const card = game.players[0].grid[r][c];
      const cardEl = renderCard(card, 'normal');
      const row = r;
      const col = c;
      cardEl.setAttribute('role', 'gridcell');
      cardEl.setAttribute('tabindex', '0');
      cardEl.setAttribute('aria-label', cardAriaLabel(card, row, col));
      cardEl.addEventListener('click', () => callbacks.onCardClick(row, col));
      cardEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          callbacks.onCardClick(row, col);
        }
      });
      playerGrid.appendChild(cardEl);
    }
  }

  playerZone.appendChild(playerGrid);
  screen.appendChild(playerZone);

  // ── Action Bar ──
  const actionBar = el('div', 'action-bar');
  const availableActions = game.getAvailableActions(0);

  const actionDefs = [
    { key: 'construct', label: 'CONSTRUCT', cssClass: 'btn-construct' },
    { key: 'attack', label: 'ATTACK', cssClass: 'btn-attack' },
    { key: 'secure', label: 'SECURE', cssClass: 'btn-secure' },
  ];

  const isPlayerTurn = game.currentPlayerIndex === 0 && game.phase !== PHASE.REVEAL && game.phase !== PHASE.SCORING;

  for (const def of actionDefs) {
    const btn = el('button', ['action-btn', def.cssClass]);
    btn.textContent = def.label;
    btn.setAttribute('aria-label', `${def.label} action`);

    if (!isPlayerTurn || !availableActions.includes(def.key)) {
      btn.classList.add('disabled');
      btn.disabled = true;
    }

    btn.addEventListener('click', () => {
      if (!btn.disabled) callbacks.onActionClick(def.key);
    });

    actionBar.appendChild(btn);
  }

  screen.appendChild(actionBar);

  // ── Action Guide (step-by-step instructions for selected action) ──
  const guideDiv = el('div', 'action-guide');
  guideDiv.id = 'action-guide';
  guideDiv.style.display = 'none';
  screen.appendChild(guideDiv);

  // ── Action Log ──
  const logDiv = el('div', 'action-log');
  logDiv.setAttribute('aria-live', 'polite');
  logDiv.setAttribute('aria-label', 'Game action log');

  const logTitle = el('div', 'log-title');
  logTitle.textContent = 'Action Log';
  logDiv.appendChild(logTitle);

  // Render existing log entries (most recent first)
  const entries = [...game.actionLog].reverse();
  for (const msg of entries) {
    const entry = el('div', 'log-entry');
    entry.textContent = msg;
    logDiv.appendChild(entry);
  }

  screen.appendChild(logDiv);
}

/**
 * Build an aria-label for a card in the player grid.
 * @param {object} card
 * @param {number} row
 * @param {number} col
 * @returns {string}
 */
function cardAriaLabel(card, row, col) {
  const pos = `Row ${row + 1}, Column ${col + 1}`;
  if (!card.faceUp) return `${pos}: face down`;
  const color = card.color || 'neutral';
  let label = `${pos}: ${card.value} ${color}`;
  if (card.hasPrism) label += ', prismed';
  if (card.immune) label += ', immune';
  return label;
}

// ── renderRoundEnd ─────────────────────────────────────────────────────

/**
 * Render the round-end scoring screen.
 * @param {HTMLElement} container
 * @param {object} game – game state (for players, grids, cumulative scores, luminaCaller)
 * @param {function(): void} onNext
 */
export function renderRoundEnd(container, game, onNext) {
  const screen = showScreen('round-end-screen');
  screen.innerHTML = '';

  const card = el('div', 'round-end-card');

  const heading = el('h2');
  heading.textContent = `Round ${game.round} Complete`;
  card.appendChild(heading);

  // ── Grid panels ──
  const gridsRow = el('div', 'round-end-grids');

  // Pre-compute all scores to determine LUMINA bonus
  const allBreakdowns = game.players.map((p) => calcRoundScore(p.grid));
  const allTotals = allBreakdowns.map((b) => b.total);
  let callerLuminaAdj = 0;
  if (game.luminaCaller !== null && game.luminaCaller !== undefined) {
    const callerTotal = allTotals[game.luminaCaller];
    const isStrictlyHighest = allTotals.every((s, idx) => idx === game.luminaCaller || s < callerTotal);
    callerLuminaAdj = isStrictlyHighest ? 10 : -10;
  }

  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    const breakdown = allBreakdowns[i];
    const isCaller = game.luminaCaller === i;
    const luminaAdj = isCaller ? callerLuminaAdj : 0;
    const roundTotal = breakdown.total + luminaAdj;

    const panel = el('div', 'round-end-panel');
    if (i === 0) panel.classList.add('round-end-panel--player');
    if (isCaller) {
      panel.classList.add(callerLuminaAdj >= 0 ? 'round-end-panel--caller-positive' : 'round-end-panel--caller-negative');
    }

    // Header
    const header = el('div', 'round-end-panel-header');
    header.textContent = player.name;
    if (player.isBot) {
      const badge = el('span', 'difficulty-badge');
      badge.textContent = ` (${player.difficulty})`;
      header.appendChild(badge);
    }
    panel.appendChild(header);

    // LUMINA caller banner
    if (isCaller) {
      const banner = el('div', 'lumina-caller-banner');
      banner.classList.add(callerLuminaAdj >= 0 ? 'lumina-caller-banner--positive' : 'lumina-caller-banner--negative');
      banner.textContent = `CALLED LUMINA (${callerLuminaAdj >= 0 ? '+' : ''}${callerLuminaAdj})`;
      panel.appendChild(banner);
    }

    // Grid with bonus highlights
    const gridDiv = el('div', 'round-end-grid');
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const cardEl = renderCard(player.grid[r][c]);
        if (breakdown.validColumns && breakdown.validColumns.includes(c)) {
          cardEl.classList.add('bonus-col-highlight');
        }
        if (breakdown.validRows && breakdown.validRows.includes(r)) {
          cardEl.classList.add('bonus-row-highlight');
        }
        gridDiv.appendChild(cardEl);
      }
    }
    panel.appendChild(gridDiv);

    // Score breakdown
    const bdDiv = el('div', 'round-end-breakdown');
    const items = [
      { label: `Base: ${breakdown.baseScore}`, cls: '' },
      { label: `Col: +${breakdown.columnBonus}`, cls: breakdown.columnBonus > 0 ? 'breakdown-item--bonus' : '' },
      { label: `Row: +${breakdown.rowBonus}`, cls: breakdown.rowBonus > 0 ? 'breakdown-item--bonus' : '' },
      { label: `Prism: +${breakdown.prismBonus}`, cls: breakdown.prismBonus > 0 ? 'breakdown-item--bonus' : '' },
    ];
    if (luminaAdj !== 0) {
      items.push({ label: `LUMINA: ${luminaAdj > 0 ? '+' : ''}${luminaAdj}`, cls: luminaAdj > 0 ? 'breakdown-item--bonus' : 'breakdown-item--penalty' });
    }
    items.push({ label: `Total: ${roundTotal}`, cls: 'breakdown-total' });

    for (const item of items) {
      const classes = ['breakdown-item'];
      if (item.cls) classes.push(item.cls);
      const span = el('span', classes);
      span.textContent = item.label;
      bdDiv.appendChild(span);
    }
    panel.appendChild(bdDiv);

    gridsRow.appendChild(panel);
  }

  card.appendChild(gridsRow);

  // Cumulative scores
  const cumDiv = el('div', 'round-end-cumulative');
  for (let i = 0; i < game.players.length; i++) {
    const span = el('span');
    span.innerHTML = `${game.players[i].name}: <strong>${game.cumulativeScores[i]}</strong>`;
    cumDiv.appendChild(span);
  }
  card.appendChild(cumDiv);

  // Next button
  const isGameOver = game.isGameOver();
  const nextBtn = el('button', 'btn-next-round');
  nextBtn.textContent = isGameOver ? 'See Results' : 'Next Round';
  nextBtn.setAttribute('aria-label', isGameOver ? 'See final results' : 'Start next round');
  nextBtn.addEventListener('click', onNext);
  card.appendChild(nextBtn);

  screen.appendChild(card);
}

// ── renderGameEnd ──────────────────────────────────────────────────────

/**
 * Render the game-over screen.
 * @param {HTMLElement} container
 * @param {number[]} scores – cumulative scores array
 * @param {string} winner – winner name
 * @param {{ onPlayAgain: function, onViewHistory: function }} callbacks
 */
export function renderGameEnd(container, scores, winner, callbacks) {
  const screen = showScreen('game-end-screen');
  screen.innerHTML = '';

  const card = el('div', 'game-end-card');

  // Winner announcement
  const announcement = el('div', 'winner-announcement');

  const winLabel = el('div', 'winner-label');
  winLabel.textContent = 'WINNER';
  announcement.appendChild(winLabel);

  const winName = el('div', 'winner-name');
  winName.textContent = `${winner}!`;
  announcement.appendChild(winName);

  // Find winner score
  const winnerIndex = scores.indexOf(Math.max(...scores));
  const winScore = el('div', 'winner-score');
  winScore.textContent = `${scores[winnerIndex]} points`;
  announcement.appendChild(winScore);

  card.appendChild(announcement);

  // Leaderboard
  const leaderboard = el('div', 'leaderboard');

  // Sort by score descending, keep player names
  const entries = scores.map((s, i) => ({ score: s, index: i }));
  entries.sort((a, b) => b.score - a.score);

  for (let rank = 0; rank < entries.length; rank++) {
    const entry = el('div', 'leaderboard-entry');

    const rankSpan = el('span', 'rank');
    rankSpan.textContent = `#${rank + 1}`;
    entry.appendChild(rankSpan);

    const nameSpan = el('span', 'name');
    // We need player names; use index convention: 0 = Player, 1+ = Bot N
    const idx = entries[rank].index;
    nameSpan.textContent = idx === 0 ? 'Player' : `Bot ${idx}`;
    entry.appendChild(nameSpan);

    const scoreSpan = el('span', 'final-score');
    scoreSpan.textContent = String(entries[rank].score);
    entry.appendChild(scoreSpan);

    leaderboard.appendChild(entry);
  }

  card.appendChild(leaderboard);

  // Buttons
  const btnContainer = el('div');
  btnContainer.style.display = 'flex';
  btnContainer.style.gap = 'var(--sp-4)';
  btnContainer.style.justifyContent = 'center';
  btnContainer.style.position = 'relative';
  btnContainer.style.zIndex = '1';

  const playAgainBtn = el('button', 'btn-play-again');
  playAgainBtn.textContent = 'Play Again';
  playAgainBtn.setAttribute('aria-label', 'Start a new game');
  playAgainBtn.addEventListener('click', () => callbacks.onPlayAgain());
  btnContainer.appendChild(playAgainBtn);

  const historyBtn = el('button', 'btn-back');
  historyBtn.textContent = 'View History';
  historyBtn.setAttribute('aria-label', 'View game history');
  historyBtn.addEventListener('click', () => callbacks.onViewHistory());
  btnContainer.appendChild(historyBtn);

  card.appendChild(btnContainer);

  screen.appendChild(card);
}

// ── renderHistory ──────────────────────────────────────────────────────

/**
 * Render the game history screen.
 * @param {HTMLElement} container
 * @param {Array<{ date: string, players: string[], rounds: number, winner: string, playerScore: number, roundDetails?: Array }>} sessions
 */
export function renderHistory(container, sessions) {
  const screen = showScreen('history-screen');
  screen.innerHTML = '';

  const heading = el('h2');
  heading.textContent = 'Game History';
  screen.appendChild(heading);

  if (!sessions || sessions.length === 0) {
    const empty = el('p');
    empty.textContent = 'No games played yet.';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--text-secondary)';
    screen.appendChild(empty);
    return;
  }

  const table = el('table', 'history-table');

  // Header
  const thead = el('thead');
  const headerRow = el('tr');
  ['Date', 'Players', 'Rounds', 'Winner', 'Your Score'].forEach((h) => {
    const th = el('th');
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = el('tbody');

  for (const session of sessions) {
    const row = el('tr');
    row.style.cursor = session.roundDetails ? 'pointer' : 'default';

    const dateCell = el('td');
    dateCell.textContent = session.date;
    row.appendChild(dateCell);

    const playersCell = el('td');
    playersCell.textContent = Array.isArray(session.players) ? session.players.join(', ') : String(session.players);
    row.appendChild(playersCell);

    const roundsCell = el('td');
    roundsCell.textContent = String(session.rounds);
    row.appendChild(roundsCell);

    const winnerCell = el('td', 'winner-cell');
    winnerCell.textContent = session.winner;
    row.appendChild(winnerCell);

    const scoreCell = el('td');
    scoreCell.textContent = String(session.playerScore);
    row.appendChild(scoreCell);

    // Expandable round details
    if (session.roundDetails && session.roundDetails.length > 0) {
      let expanded = false;
      let detailRow = null;

      row.addEventListener('click', () => {
        if (expanded && detailRow) {
          detailRow.remove();
          detailRow = null;
          expanded = false;
          return;
        }

        detailRow = el('tr');
        const detailCell = el('td');
        detailCell.setAttribute('colspan', '5');
        detailCell.style.padding = 'var(--sp-4)';
        detailCell.style.background = 'var(--bg-surface-raised)';

        const detailTable = el('table');
        detailTable.style.width = '100%';
        detailTable.style.borderCollapse = 'collapse';
        detailTable.style.fontSize = '0.75rem';

        const dHead = el('thead');
        const dHRow = el('tr');
        ['Round', 'Your Score', 'Winner'].forEach((h) => {
          const th = el('th');
          th.textContent = h;
          th.style.padding = 'var(--sp-2)';
          th.style.color = 'var(--text-muted)';
          th.style.textAlign = 'left';
          th.style.borderBottom = '1px solid var(--border-default)';
          dHRow.appendChild(th);
        });
        dHead.appendChild(dHRow);
        detailTable.appendChild(dHead);

        const dBody = el('tbody');
        for (const rd of session.roundDetails) {
          const dRow = el('tr');

          const rCell = el('td');
          rCell.textContent = String(rd.round);
          rCell.style.padding = 'var(--sp-2)';
          dRow.appendChild(rCell);

          const sCell = el('td');
          sCell.textContent = String(rd.playerScore);
          sCell.style.padding = 'var(--sp-2)';
          dRow.appendChild(sCell);

          const wCell = el('td');
          wCell.textContent = rd.roundWinner || '-';
          wCell.style.padding = 'var(--sp-2)';
          dRow.appendChild(wCell);

          dBody.appendChild(dRow);
        }
        detailTable.appendChild(dBody);
        detailCell.appendChild(detailTable);
        detailRow.appendChild(detailCell);

        row.after(detailRow);
        expanded = true;
      });
    }

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  screen.appendChild(table);

  // Back button
  const backBtn = el('button', 'btn-back');
  backBtn.textContent = 'Back';
  backBtn.addEventListener('click', () => {
    hideAllScreens();
  });
  screen.appendChild(backBtn);
}

// ── renderStatsScreen ─────────────────────────────────────────────────

/**
 * Render a full stats dashboard.
 * @param {HTMLElement} container
 * @param {Array<{ date: string, players: string|string[], rounds: number, winner: string, playerScore: number, roundDetails?: Array }>} sessions
 * @param {function(): void} onBack
 */
export function renderStatsScreen(container, sessions, onBack) {
  const screen = showScreen('history-screen');
  screen.innerHTML = '';

  const dashboard = el('div', 'stats-dashboard');

  const heading = el('h2');
  heading.textContent = 'Stats Dashboard';
  heading.style.textAlign = 'center';
  heading.style.marginBottom = 'var(--sp-6)';
  dashboard.appendChild(heading);

  // Calculate stats
  const total = sessions.length;
  const wins = sessions.filter((s) => s.winner && s.winner.includes('Player')).length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  // Current win streak (most recent consecutive wins)
  let streak = 0;
  for (let i = 0; i < sessions.length; i++) {
    if (sessions[i].winner && sessions[i].winner.includes('Player')) {
      streak++;
    } else {
      break;
    }
  }

  const totalScore = sessions.reduce((sum, s) => sum + (s.playerScore || 0), 0);
  const avgScore = total > 0 ? Math.round(totalScore / total) : 0;

  // Stat cards row
  const statCards = el('div', 'stat-cards');

  const statData = [
    { value: String(total), label: 'Total Games' },
    { value: winRate + '%', label: 'Win Rate' },
    { value: String(streak), label: 'Win Streak' },
    { value: String(avgScore), label: 'Avg Score/Game' },
  ];

  for (const sd of statData) {
    const card = el('div', 'stat-card');
    const valEl = el('div', 'stat-value');
    valEl.textContent = sd.value;
    card.appendChild(valEl);
    const labelEl = el('div', 'stat-label');
    labelEl.textContent = sd.label;
    card.appendChild(labelEl);
    statCards.appendChild(card);
  }
  dashboard.appendChild(statCards);

  // Per-difficulty breakdown
  const diffSection = el('div', 'stat-cards');
  const difficulties = ['easy', 'medium', 'hard'];
  for (const diff of difficulties) {
    const diffSessions = sessions.filter((s) => {
      const p = Array.isArray(s.players) ? s.players.join(' ') : String(s.players);
      return p.toLowerCase().includes(diff);
    });
    const diffTotal = diffSessions.length;
    const diffWins = diffSessions.filter((s) => s.winner && s.winner.includes('Player')).length;
    const diffRate = diffTotal > 0 ? Math.round((diffWins / diffTotal) * 100) + '%' : 'N/A';

    const card = el('div', 'stat-card');
    const valEl = el('div', 'stat-value');
    valEl.textContent = diffRate;
    card.appendChild(valEl);
    const labelEl = el('div', 'stat-label');
    labelEl.textContent = 'vs ' + diff.charAt(0).toUpperCase() + diff.slice(1);
    card.appendChild(labelEl);
    diffSection.appendChild(card);
  }
  dashboard.appendChild(diffSection);

  // Recent games table
  if (sessions.length > 0) {
    const tableHeading = el('h3');
    tableHeading.textContent = 'Recent Games';
    tableHeading.style.marginTop = 'var(--sp-6)';
    tableHeading.style.marginBottom = 'var(--sp-3)';
    dashboard.appendChild(tableHeading);

    const table = el('table', 'history-table');
    const thead = el('thead');
    const headerRow = el('tr');
    ['Date', 'Players', 'Rounds', 'Winner', 'Your Score'].forEach((h) => {
      const th = el('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const session of sessions) {
      const row = el('tr');

      const dateCell = el('td');
      dateCell.textContent = session.date;
      row.appendChild(dateCell);

      const playersCell = el('td');
      playersCell.textContent = Array.isArray(session.players) ? session.players.join(', ') : String(session.players);
      row.appendChild(playersCell);

      const roundsCell = el('td');
      roundsCell.textContent = String(session.rounds);
      row.appendChild(roundsCell);

      const winnerCell = el('td', 'winner-cell');
      winnerCell.textContent = session.winner;
      row.appendChild(winnerCell);

      const scoreCell = el('td');
      scoreCell.textContent = String(session.playerScore);
      row.appendChild(scoreCell);

      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    dashboard.appendChild(table);
  } else {
    const empty = el('p');
    empty.textContent = 'No games played yet.';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--text-secondary)';
    dashboard.appendChild(empty);
  }

  // Back button
  const backBtn = el('button', 'btn-back');
  backBtn.textContent = 'Back';
  backBtn.style.marginTop = 'var(--sp-6)';
  backBtn.addEventListener('click', () => {
    if (onBack) {
      onBack();
    } else {
      hideAllScreens();
    }
  });
  dashboard.appendChild(backBtn);

  screen.appendChild(dashboard);
}

// ── showCheatsheet ────────────────────────────────────────────────────

/**
 * Show/update the action guide strip below action buttons.
 * @param {string|null} action — 'construct', 'attack', 'secure', or null to hide
 * @param {string|null} step — optional step within the action flow
 */
export function showActionGuide(action, step) {
  const guide = document.getElementById('action-guide');
  if (!guide) return;

  if (!action) {
    guide.style.display = 'none';
    return;
  }

  guide.style.display = 'block';
  guide.className = 'action-guide';

  if (action === 'construct') {
    guide.classList.add('action-guide--construct');
    if (step === 'place') {
      guide.innerHTML = '<strong>CONSTRUCT</strong> — <span class="step">Step 2</span> Click a card in your grid to replace it with the drawn card';
    } else if (step === 'reveal') {
      guide.innerHTML = '<strong>CONSTRUCT</strong> — <span class="step">Step 2</span> Click a face-down card to reveal it (drawn card goes to discard)';
    } else {
      guide.innerHTML = '<strong>CONSTRUCT</strong> — <span class="step">Step 1</span> Click the <strong>DECK</strong> to draw a new card, or the <strong>DISCARD</strong> pile to take the top card';
    }
  } else if (action === 'attack') {
    guide.classList.add('action-guide--attack');
    if (step === 'defender') {
      guide.innerHTML = '<strong>ATTACK</strong> — <span class="step">Step 2</span> Click an opponent\'s <strong>highlighted card</strong> to steal it';
    } else if (step === 'cost') {
      guide.innerHTML = '<strong>ATTACK</strong> — <span class="step">Step 3</span> Click one of your <strong>face-down cards</strong> to reveal as the attack cost';
    } else {
      guide.innerHTML = '<strong>ATTACK</strong> — <span class="step">Step 1</span> Click one of your <strong>face-up cards</strong> to swap with an opponent\'s card';
    }
  } else if (action === 'secure') {
    guide.classList.add('action-guide--secure');
    guide.innerHTML = '<strong>SECURE</strong> — Click a <strong>face-up card</strong> to protect it with a prism (prevents attacks)';
  }
}

/**
 * Show a modal overlay with game rules / quick reference.
 */
export function showCheatsheet() {
  const overlay = el('div', ['confirm-overlay', 'cheatsheet-overlay']);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const dialog = el('div', 'cheatsheet-dialog');
  dialog.style.position = 'relative';

  // Close button
  const closeBtn = el('button', 'cheatsheet-close');
  closeBtn.textContent = '\u00D7';
  closeBtn.setAttribute('aria-label', 'Close cheatsheet');
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
  });
  dialog.appendChild(closeBtn);

  // Title
  const title = el('h3');
  title.textContent = 'LUMINA \u2014 Quick Reference';
  dialog.appendChild(title);

  // Sections
  const sections = [
    {
      heading: 'ACTIONS (pick one per turn)',
      items: [
        'CONSTRUCT \u2014 Draw from Deck or Discard, place on your grid (replaces existing card). OR draw from Deck and discard it, then reveal a face-down card.',
        'ATTACK \u2014 Swap your face-up card with an opponent\'s. Cost: reveal a face-down card.',
        'SECURE \u2014 Place a prism on a face-up card to protect it (3 prisms per round).',
      ],
    },
    {
      heading: 'SCORING',
      items: [
        'Base Score \u2014 Sum of all face-up card values (-5 per face-down card)',
        'Column Bonus \u2014 +10 for each column of 3 same-color cards (multicolor is wildcard)',
        'Row Bonus \u2014 +10 for each row of 4 strictly ascending values',
        'Prism Bonus \u2014 +10 if ANY prismed card is in a valid structure',
      ],
    },
    {
      heading: 'LUMINA',
      items: [
        'When ALL your cards are face-up \u2192 LUMINA is called.',
        'Each other player gets one final turn.',
        'Caller gets +10 if strictly highest score, -10 otherwise.',
      ],
    },
    {
      heading: 'WIN CONDITION',
      items: [
        'First player to reach 200 cumulative points wins!',
      ],
    },
    {
      heading: 'CARDS',
      items: [
        '96 Vector cards: values 1-12, 4 colors (blue, violet, orange, green), 2 copies each',
        '8 Multicolor cards: value -2, acts as color wildcard',
        '8 Colorless cards: value 15, no color (can\'t contribute to column bonus)',
      ],
    },
  ];

  for (const section of sections) {
    const sectionDiv = el('div', 'cheatsheet-section');

    const h4 = el('h4');
    h4.textContent = section.heading;
    sectionDiv.appendChild(h4);

    const ul = el('ul');
    ul.style.paddingLeft = '1.2em';
    ul.style.margin = '0';
    for (const item of section.items) {
      const li = el('li');
      li.textContent = item;
      ul.appendChild(li);
    }
    sectionDiv.appendChild(ul);
    dialog.appendChild(sectionDiv);
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ── showConfirmDialog ──────────────────────────────────────────────────

/**
 * Show a modal confirmation dialog.
 * @param {string} message
 * @param {function(): void} onConfirm
 * @param {function(): void} onCancel
 */
export function showConfirmDialog(message, onConfirm, onCancel) {
  const overlay = el('div', 'confirm-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const dialog = el('div', 'confirm-dialog');

  const heading = el('h3');
  heading.textContent = 'Confirm';
  dialog.appendChild(heading);

  const msg = el('p');
  msg.textContent = message;
  dialog.appendChild(msg);

  const actions = el('div', 'dialog-actions');

  const confirmBtn = el('button', 'btn-confirm');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.addEventListener('click', () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });
  actions.appendChild(confirmBtn);

  const cancelBtn = el('button', 'btn-cancel');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
    if (onCancel) onCancel();
  });
  actions.appendChild(cancelBtn);

  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Focus the cancel button by default (safer action)
  cancelBtn.focus();

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
      if (onCancel) onCancel();
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ── showDeckDrawDialog ─────────────────────────────────────────────────

/**
 * Show a modal dialog for choosing what to do with a drawn deck card.
 * @param {{ value: number, color: string|null }} card – the drawn card to display
 * @param {function(): void} onPlace – called when player chooses to place on grid
 * @param {function(): void} onDiscard – called when player chooses to discard and reveal
 */
export function showDeckDrawDialog(card, onPlace, onDiscard) {
  const overlay = el('div', 'confirm-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const dialog = el('div', 'confirm-dialog');

  const heading = el('h3');
  heading.textContent = 'Draw from Deck';
  dialog.appendChild(heading);

  // Show the drawn card
  const cardWrapper = el('div');
  cardWrapper.style.display = 'flex';
  cardWrapper.style.justifyContent = 'center';
  cardWrapper.style.marginBottom = 'var(--sp-4)';
  const cardEl = renderCard({ value: card.value, color: card.color, faceUp: true, hasPrism: false, immune: false }, 'normal');
  cardWrapper.appendChild(cardEl);
  dialog.appendChild(cardWrapper);

  const msg = el('p');
  msg.textContent = 'You drew this card. What do you want to do?';
  dialog.appendChild(msg);

  const actions = el('div', 'dialog-actions');

  const placeBtn = el('button', 'btn-confirm');
  placeBtn.textContent = 'PLACE ON GRID';
  placeBtn.addEventListener('click', () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    onPlace();
  });
  actions.appendChild(placeBtn);

  const discardBtn = el('button', 'btn-cancel');
  discardBtn.textContent = 'DISCARD & REVEAL';
  discardBtn.addEventListener('click', () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    onDiscard();
  });
  actions.appendChild(discardBtn);

  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  placeBtn.focus();

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ── Attack Target Highlights ───────────────────────────────────────────

/**
 * Highlight valid attack targets on opponent grids.
 * @param {object} game – game state
 * @param {number} playerIndex – the attacking player's index
 */
export function highlightAttackTargets(game, playerIndex) {
  clearAttackHighlights();
  const botTabs = document.querySelectorAll('.bot-tab');

  for (let di = 0; di < game.players.length; di++) {
    if (di === playerIndex) continue;
    const defender = game.players[di];
    const botTab = botTabs[di - 1];
    if (!botTab) continue;
    const gridEl = botTab.querySelector('.bot-grid');
    if (!gridEl) continue;
    const cards = gridEl.children;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        const card = defender.grid[r][c];
        if (card.faceUp && !card.hasPrism && !card.immune) {
          const idx = r * 4 + c;
          if (cards[idx]) cards[idx].classList.add('attack-target');
        }
      }
    }
  }
}

/**
 * Remove all attack-target highlights from the DOM.
 */
export function clearAttackHighlights() {
  document.querySelectorAll('.attack-target').forEach((node) => {
    node.classList.remove('attack-target');
  });
}

// ── logAction ──────────────────────────────────────────────────────────

/**
 * Prepend a message to the action log and auto-scroll to top.
 * @param {HTMLElement} container – the action log container (.action-log)
 * @param {string} message
 */
export function logAction(container, message) {
  // Find the log container in the DOM
  const logDiv = container.querySelector ? container.querySelector('.action-log') : document.querySelector('.action-log');
  if (!logDiv) return;

  const entry = el('div', 'log-entry');
  entry.textContent = message;

  // Insert after the title
  const title = logDiv.querySelector('.log-title');
  if (title && title.nextSibling) {
    logDiv.insertBefore(entry, title.nextSibling);
  } else {
    logDiv.appendChild(entry);
  }

  logDiv.scrollTop = 0;
}

// ── logRichAction ──────────────────────────────────────────────────────

/**
 * Map card color to badge CSS class suffix.
 * @param {string|null} color
 * @returns {string}
 */
function badgeClass(color) {
  if (color === 'multicolor') return 'card-badge-multi';
  if (color === null) return 'card-badge-neutral';
  return `card-badge-${color}`;
}

/**
 * Build an inline card badge HTML string.
 * @param {number} value
 * @param {string|null} color
 * @returns {string}
 */
function cardBadgeHTML(value, color) {
  return `<span class="card-badge ${badgeClass(color)}">${value}</span>`;
}

/**
 * Prepend a rich HTML log entry with inline card badges.
 * @param {HTMLElement|Document} container
 * @param {{ actor: string, actionType: string, details: string }} opts
 */
export function logRichAction(container, { actor, actionType, details }) {
  const logDiv = container.querySelector ? container.querySelector('.action-log') : document.querySelector('.action-log');
  if (!logDiv) return;

  const entry = el('div', 'log-entry');
  entry.innerHTML = `<span class="log-actor">${actor}</span> <span class="log-action">${actionType}</span> ${details}`;

  const title = logDiv.querySelector('.log-title');
  if (title && title.nextSibling) {
    logDiv.insertBefore(entry, title.nextSibling);
  } else {
    logDiv.appendChild(entry);
  }

  logDiv.scrollTop = 0;
}

// ── flashGridCell ──────────────────────────────────────────────────────

/**
 * Add a brief highlight animation to a card element in the DOM.
 * @param {number} playerIndex – 0 = player grid, 1+ = bot grid
 * @param {number} row
 * @param {number} col
 */
export function flashGridCell(playerIndex, row, col) {
  let cardEl;
  if (playerIndex === 0) {
    const cells = document.querySelectorAll('.player-grid .card');
    cardEl = cells[row * 4 + col];
  } else {
    const botTabs = document.querySelectorAll('.bot-tab');
    const tab = botTabs[playerIndex - 1];
    if (!tab) return;
    const cells = tab.querySelectorAll('.bot-grid .card');
    cardEl = cells[row * 4 + col];
  }
  if (!cardEl) return;

  cardEl.classList.add('action-highlight');
  setTimeout(() => cardEl.classList.remove('action-highlight'), 800);
}
