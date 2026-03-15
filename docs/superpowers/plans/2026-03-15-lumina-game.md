# LUMINA Web Game — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based LUMINA card game with bot opponents, retro arcade UI, SQLite stats persistence, and Dokploy deployment.

**Architecture:** Monolithic Express app serving static Vanilla JS frontend + REST API for SQLite stats. Game logic runs entirely in the browser. Server handles file serving and 3 API routes.

**Tech Stack:** Node.js 20, Express, better-sqlite3, Vanilla JS (ES modules), Docker, Dokploy

**Spec:** `docs/superpowers/specs/2026-03-15-lumina-game-design.md`

---

## Chunk 1: Project Scaffolding + Server + Database

### Task 1: Initialize Node.js project

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize git repo**

```bash
cd "c:/Users/franz/Documents/FrancoisALL/AI/Projets/GAMES - LUMINA"
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "lumina",
  "version": "1.0.0",
  "description": "LUMINA card game — browser-based with bot opponents",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test tests/"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
data/*.db
.superpowers/
.omc/
```

- [ ] **Step 4: Install dependencies**

```bash
npm install express better-sqlite3
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize project with express and better-sqlite3"
```

---

### Task 2: SQLite database module

**Files:**
- Create: `db.js`
- Create: `data/` (directory)
- Create: `tests/db.test.js`

- [ ] **Step 1: Create data directory with .gitkeep**

```bash
mkdir -p data
touch data/.gitkeep
```

- [ ] **Step 2: Write failing test for database initialization**

Create `tests/db.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB_PATH = 'data/test-lumina.db';

describe('Database', () => {
  let db;

  before(async () => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    const { createDb } = await import('../db.js');
    db = createDb(TEST_DB_PATH);
  });

  after(() => {
    if (db) db.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('should create sessions table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").all();
    assert.equal(tables.length, 1);
  });

  it('should create round_stats table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='round_stats'").all();
    assert.equal(tables.length, 1);
  });

  it('should save a session and return its id', () => {
    const { saveSession } = await import('../db.js');
    const id = saveSession(db, {
      numPlayers: 3,
      numRounds: 4,
      winner: 'Player',
      playerFinalScore: 210
    });
    assert.ok(id > 0);
  });

  it('should save round stats linked to a session', () => {
    const { saveSession, saveRoundStat } = await import('../db.js');
    const sessionId = saveSession(db, {
      numPlayers: 2, numRounds: 1, winner: 'Bot 1', playerFinalScore: 50
    });
    saveRoundStat(db, {
      sessionId,
      roundNumber: 1,
      playerName: 'Player',
      roundScore: 50,
      attacksMade: 2,
      prismsUsed: 1,
      hiddenCardsAtLumina: 0,
      calledLumina: 1
    });
    const stats = db.prepare('SELECT * FROM round_stats WHERE session_id = ?').all(sessionId);
    assert.equal(stats.length, 1);
    assert.equal(stats[0].attacks_made, 2);
  });

  it('should fetch session history with round stats', () => {
    const { getHistory } = await import('../db.js');
    const history = getHistory(db, 50);
    assert.ok(history.length >= 1);
    assert.ok(history[0].rounds);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `db.js` does not exist.

- [ ] **Step 4: Write db.js implementation**

Create `db.js`:

```js
import Database from 'better-sqlite3';

export function createDb(path = 'data/lumina.db') {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      played_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      num_players     INTEGER NOT NULL,
      num_rounds      INTEGER NOT NULL,
      winner          TEXT NOT NULL,
      player_final_score INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_stats (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id              INTEGER NOT NULL REFERENCES sessions(id),
      round_number            INTEGER NOT NULL,
      player_name             TEXT NOT NULL,
      round_score             INTEGER NOT NULL,
      attacks_made            INTEGER NOT NULL DEFAULT 0,
      prisms_used             INTEGER NOT NULL DEFAULT 0,
      hidden_cards_at_lumina  INTEGER NOT NULL DEFAULT 0,
      called_lumina           INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

export function saveSession(db, { numPlayers, numRounds, winner, playerFinalScore }) {
  const stmt = db.prepare(
    'INSERT INTO sessions (num_players, num_rounds, winner, player_final_score) VALUES (?, ?, ?, ?)'
  );
  return stmt.run(numPlayers, numRounds, winner, playerFinalScore).lastInsertRowid;
}

export function saveRoundStat(db, { sessionId, roundNumber, playerName, roundScore, attacksMade, prismsUsed, hiddenCardsAtLumina, calledLumina }) {
  const stmt = db.prepare(
    'INSERT INTO round_stats (session_id, round_number, player_name, round_score, attacks_made, prisms_used, hidden_cards_at_lumina, called_lumina) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(sessionId, roundNumber, playerName, roundScore, attacksMade, prismsUsed, hiddenCardsAtLumina, calledLumina);
}

export function getHistory(db, limit = 50) {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY played_at DESC LIMIT ?').all(limit);
  return sessions.map(session => ({
    ...session,
    rounds: db.prepare('SELECT * FROM round_stats WHERE session_id = ? ORDER BY round_number').all(session.id)
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test
```
Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add db.js data/.gitkeep tests/db.test.js
git commit -m "feat: add SQLite database module with sessions and round stats"
```

---

### Task 3: Express server with API routes

**Files:**
- Create: `server.js`
- Create: `public/` (directory)
- Create: `public/index.html` (placeholder)
- Create: `tests/server.test.js`

- [ ] **Step 1: Create placeholder index.html**

Create `public/index.html`:

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LUMINA</title>
</head>
<body>
  <h1>LUMINA</h1>
</body>
</html>
```

- [ ] **Step 2: Write failing test for server API**

Create `tests/server.test.js`:

```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_DB_PATH = 'data/test-server.db';
const PORT = 0; // random port

describe('Server API', () => {
  let server, baseUrl;

  before(async () => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    process.env.DB_PATH = TEST_DB_PATH;
    process.env.PORT = PORT;
    const { startServer } = await import('../server.js');
    const result = await startServer(0, TEST_DB_PATH);
    server = result.server;
    baseUrl = `http://localhost:${result.port}`;
  });

  after(() => {
    server.close();
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  it('GET / should serve index.html', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('LUMINA'));
  });

  it('POST /api/stats/save should save a session', async () => {
    const body = {
      session: { numPlayers: 2, numRounds: 3, winner: 'Player', playerFinalScore: 205 },
      rounds: [
        { roundNumber: 1, playerName: 'Player', roundScore: 80, attacksMade: 1, prismsUsed: 2, hiddenCardsAtLumina: 0, calledLumina: 1 },
        { roundNumber: 1, playerName: 'Bot 1', roundScore: 60, attacksMade: 0, prismsUsed: 1, hiddenCardsAtLumina: 3, calledLumina: 0 }
      ]
    };
    const res = await fetch(`${baseUrl}/api/stats/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.sessionId > 0);
  });

  it('GET /api/stats/history should return saved sessions', async () => {
    const res = await fetch(`${baseUrl}/api/stats/history`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.length >= 1);
    assert.ok(data[0].rounds.length >= 1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test
```
Expected: FAIL — `server.js` does not exist.

- [ ] **Step 4: Write server.js implementation**

Create `server.js`:

```js
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb, saveSession, saveRoundStat, getHistory } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function startServer(port = 3000, dbPath = 'data/lumina.db') {
  const app = express();
  const db = createDb(dbPath);

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public')));

  app.post('/api/stats/save', (req, res) => {
    try {
      const { session, rounds } = req.body;
      const sessionId = saveSession(db, session);
      for (const round of rounds) {
        saveRoundStat(db, { sessionId, ...round });
      }
      res.json({ sessionId });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/stats/history', (req, res) => {
    try {
      const history = getHistory(db);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const actualPort = server.address().port;
      console.log(`LUMINA server running on http://localhost:${actualPort}`);
      resolve({ server, port: actualPort, db });
    });
  });
}

// Auto-start when run directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  startServer(process.env.PORT || 3000, process.env.DB_PATH || 'data/lumina.db');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```
Expected: All tests PASS (db + server).

- [ ] **Step 6: Commit**

```bash
git add server.js public/index.html tests/server.test.js
git commit -m "feat: add Express server with stats API and static file serving"
```

---

## Chunk 2: Game Engine — Cards, Deck, Grid, State Machine, Scoring

### Task 4: Card and Deck module

**Files:**
- Create: `public/cards.js`
- Create: `tests/cards.test.js`

- [ ] **Step 1: Write failing tests for card/deck creation**

Create `tests/cards.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, COLORS } from '../public/cards.js';

describe('Cards', () => {
  it('should have 4 colors', () => {
    assert.equal(COLORS.length, 4);
    assert.deepEqual(COLORS, ['blue', 'violet', 'orange', 'green']);
  });

  it('should create a 112-card deck', () => {
    const deck = createDeck();
    assert.equal(deck.length, 112);
  });

  it('should have 96 vector cards (1-12, 4 colors, 2 each)', () => {
    const deck = createDeck();
    const vectors = deck.filter(c => c.value >= 1 && c.value <= 12);
    assert.equal(vectors.length, 96);
  });

  it('should have 8 multicolor -2 cards', () => {
    const deck = createDeck();
    const negatives = deck.filter(c => c.value === -2);
    assert.equal(negatives.length, 8);
    negatives.forEach(c => assert.equal(c.color, 'multicolor'));
  });

  it('should have 8 colorless 15 cards', () => {
    const deck = createDeck();
    const fifteens = deck.filter(c => c.value === 15);
    assert.equal(fifteens.length, 8);
    fifteens.forEach(c => assert.equal(c.color, null));
  });

  it('should shuffle into a different order', () => {
    const d1 = createDeck();
    const d2 = createDeck();
    // Extremely unlikely to be identical after shuffle
    const same = d1.every((c, i) => c.value === d2[i].value && c.color === d2[i].color);
    assert.equal(same, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/cards.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write cards.js implementation**

Create `public/cards.js`:

```js
export const COLORS = ['blue', 'violet', 'orange', 'green'];

export function createDeck() {
  const cards = [];

  // 96 Vector cards: values 1-12, 4 colors, 2 copies each
  for (const color of COLORS) {
    for (let value = 1; value <= 12; value++) {
      cards.push({ value, color });
      cards.push({ value, color });
    }
  }

  // 8 multicolor -2 cards
  for (let i = 0; i < 8; i++) {
    cards.push({ value: -2, color: 'multicolor' });
  }

  // 8 colorless 15 cards
  for (let i = 0; i < 8; i++) {
    cards.push({ value: 15, color: null });
  }

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/cards.test.js
```
Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/cards.js tests/cards.test.js
git commit -m "feat: add card and deck creation with 112-card composition"
```

---

### Task 5: Scoring module

**Files:**
- Create: `public/scoring.js`
- Create: `tests/scoring.test.js`

- [ ] **Step 1: Write failing tests for scoring**

Create `tests/scoring.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calcColumnBonus, calcRowBonus, calcPrismBonus, calcRoundScore } from '../public/scoring.js';

// Helper: create a card
const c = (value, color, faceUp = true, hasPrism = false) => ({ value, color, faceUp, hasPrism });

describe('Scoring — Column Bonus', () => {
  it('should award +10 for 3 same-color cards in a column', () => {
    // grid[row][col], column 0 is all blue
    const grid = [
      [c(3, 'blue'), c(1, 'orange'), c(5, 'green'), c(2, 'violet')],
      [c(7, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcColumnBonus(grid), 10);
  });

  it('should count -2 as any color for column bonus', () => {
    const grid = [
      [c(3, 'blue'), c(1, 'orange'), c(5, 'green'), c(2, 'violet')],
      [c(-2, 'multicolor'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcColumnBonus(grid), 10);
  });

  it('should NOT count 15 (no color) for column bonus', () => {
    const grid = [
      [c(3, 'blue'), c(1, 'orange'), c(5, 'green'), c(2, 'violet')],
      [c(15, null), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcColumnBonus(grid), 0);
  });

  it('should NOT count column with face-down card', () => {
    const grid = [
      [c(3, 'blue', false), c(1, 'orange'), c(5, 'green'), c(2, 'violet')],
      [c(7, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcColumnBonus(grid), 0);
  });

  it('should award +10 for three -2 cards in same column', () => {
    const grid = [
      [c(-2, 'multicolor'), c(1, 'orange'), c(5, 'green'), c(2, 'violet')],
      [c(-2, 'multicolor'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(-2, 'multicolor'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcColumnBonus(grid), 10);
  });
});

describe('Scoring — Row Bonus', () => {
  it('should award +10 for strictly increasing row', () => {
    const grid = [
      [c(1, 'blue'), c(3, 'orange'), c(7, 'green'), c(12, 'violet')],
      [c(2, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(5, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcRowBonus(grid), 10); // row 0: 1 < 3 < 7 < 12
  });

  it('should NOT award for non-strictly increasing', () => {
    const grid = [
      [c(1, 'blue'), c(3, 'orange'), c(3, 'green'), c(12, 'violet')],
      [c(2, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(5, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcRowBonus(grid), 0);
  });

  it('should count -2 and 15 as their numeric values', () => {
    const grid = [
      [c(-2, 'multicolor'), c(1, 'orange'), c(5, 'green'), c(15, null)],
      [c(2, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(5, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcRowBonus(grid), 10); // -2 < 1 < 5 < 15
  });

  it('should NOT count row with face-down card', () => {
    const grid = [
      [c(1, 'blue'), c(3, 'orange'), c(7, 'green', false), c(12, 'violet')],
      [c(2, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(5, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcRowBonus(grid), 0);
  });
});

describe('Scoring — Prism Bonus', () => {
  it('should award +10 if prismed card is in valid column', () => {
    const grid = [
      [c(3, 'blue', true, true), c(1, 'orange'), c(5, 'green'), c(2, 'violet')],
      [c(7, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcPrismBonus(grid), 10);
  });

  it('should award +10 only once even if prismed card in both row and column', () => {
    const grid = [
      [c(1, 'blue', true, true), c(3, 'blue'), c(7, 'green'), c(12, 'violet')],
      [c(7, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'blue'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    // Prism on [0][0] which is in valid column (all blue col 0) AND valid row (1<3<7<12)
    assert.equal(calcPrismBonus(grid), 10); // only 10, not 20
  });

  it('should award 0 if prismed card is NOT in any valid structure', () => {
    const grid = [
      [c(3, 'blue', true, true), c(1, 'orange'), c(5, 'green'), c(2, 'violet')],
      [c(7, 'orange'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'green'), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    assert.equal(calcPrismBonus(grid), 0);
  });
});

describe('Scoring — Round Score', () => {
  it('should sum visible card values and penalize face-down cards', () => {
    const grid = [
      [c(5, 'blue'), c(3, 'orange'), c(7, 'green'), c(2, 'violet')],
      [c(1, 'blue'), c(4, 'violet'), c(8, 'orange'), c(1, 'green')],
      [c(9, 'blue', false), c(2, 'green'), c(6, 'violet'), c(3, 'orange')]
    ];
    // visible sum: 5+3+7+2+1+4+8+1+2+6+3 = 42, face-down: 1 × -5 = -5
    // no bonuses
    const result = calcRoundScore(grid);
    assert.equal(result.baseScore, 37); // 42 - 5
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/scoring.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write scoring.js implementation**

Create `public/scoring.js`:

```js
import { COLORS } from './cards.js';

/**
 * Check if a column of 3 cards qualifies for color bonus.
 * -2 (multicolor) matches any color. 15 (null color) never matches.
 * All cards must be face-up.
 */
function isValidColorColumn(cards) {
  if (cards.some(c => !c.faceUp)) return false;
  if (cards.some(c => c.color === null)) return false; // 15 kills it

  const realColors = cards.filter(c => c.color !== 'multicolor').map(c => c.color);
  if (realColors.length === 0) return true; // all multicolor — valid

  const targetColor = realColors[0];
  return realColors.every(c => c === targetColor);
}

export function calcColumnBonus(grid) {
  let bonus = 0;
  for (let col = 0; col < 4; col++) {
    const column = [grid[0][col], grid[1][col], grid[2][col]];
    if (isValidColorColumn(column)) bonus += 10;
  }
  return bonus;
}

export function calcRowBonus(grid) {
  let bonus = 0;
  for (let row = 0; row < 3; row++) {
    const cards = grid[row];
    if (cards.some(c => !c.faceUp)) continue;
    let valid = true;
    for (let i = 1; i < 4; i++) {
      if (cards[i].value <= cards[i - 1].value) {
        valid = false;
        break;
      }
    }
    if (valid) bonus += 10;
  }
  return bonus;
}

/**
 * Check which columns and rows are valid structures.
 * Then for each prismed card, if it belongs to at least one valid structure, +10 once.
 */
export function calcPrismBonus(grid) {
  const validCols = new Set();
  for (let col = 0; col < 4; col++) {
    const column = [grid[0][col], grid[1][col], grid[2][col]];
    if (isValidColorColumn(column)) validCols.add(col);
  }

  const validRows = new Set();
  for (let row = 0; row < 3; row++) {
    const cards = grid[row];
    if (cards.some(c => !c.faceUp)) continue;
    let valid = true;
    for (let i = 1; i < 4; i++) {
      if (cards[i].value <= cards[i - 1].value) { valid = false; break; }
    }
    if (valid) validRows.add(row);
  }

  let bonus = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const card = grid[row][col];
      if (card.hasPrism && card.faceUp) {
        if (validCols.has(col) || validRows.has(row)) {
          bonus += 10;
        }
      }
    }
  }
  return bonus;
}

export function calcRoundScore(grid) {
  let visibleSum = 0;
  let faceDownCount = 0;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      if (grid[row][col].faceUp) {
        visibleSum += grid[row][col].value;
      } else {
        faceDownCount++;
      }
    }
  }

  const baseScore = visibleSum + (faceDownCount * -5);
  const columnBonus = calcColumnBonus(grid);
  const rowBonus = calcRowBonus(grid);
  const prismBonus = calcPrismBonus(grid);

  return {
    visibleSum,
    faceDownCount,
    faceDownPenalty: faceDownCount * -5,
    baseScore,
    columnBonus,
    rowBonus,
    prismBonus,
    total: baseScore + columnBonus + rowBonus + prismBonus
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/scoring.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/scoring.js tests/scoring.test.js
git commit -m "feat: add scoring engine with column, row, and prism bonuses"
```

---

### Task 6: Game state machine

**Files:**
- Create: `public/game.js`
- Create: `tests/game.test.js`

- [ ] **Step 1: Write failing tests for game state machine**

Create `tests/game.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, ACTION } from '../public/game.js';

describe('Game — Setup', () => {
  it('should create a game with correct number of players', () => {
    const game = createGame({ botCount: 2, botDifficulties: ['easy', 'medium'] });
    assert.equal(game.players.length, 3); // 1 human + 2 bots
  });

  it('should deal 12 face-down cards per player', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    for (const player of game.players) {
      const totalCards = player.grid.flat().length;
      assert.equal(totalCards, 12);
      assert.ok(player.grid.flat().every(c => !c.faceUp));
    }
  });

  it('should give each player 3 prisms', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    for (const player of game.players) {
      assert.equal(player.prismsRemaining, 3);
    }
  });

  it('should have a discard pile with 1 card', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    assert.equal(game.discard.length, 1);
  });

  it('should have remaining cards in deck', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // 112 - (2 players × 12 cards) - 1 discard = 87
    assert.equal(game.deck.length, 87);
  });
});

describe('Game — Reveal Phase', () => {
  it('should allow player to reveal 2 cards', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    game.revealCard(0, 0, 0); // player 0, row 0, col 0
    game.revealCard(0, 1, 2); // player 0, row 1, col 2
    const revealed = game.players[0].grid.flat().filter(c => c.faceUp);
    assert.equal(revealed.length, 2);
  });
});

describe('Game — Construct', () => {
  it('should replace a grid card with drawn card', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // Reveal 2 cards for all players to start game
    game.revealCard(0, 0, 0);
    game.revealCard(0, 1, 1);
    game.revealCard(1, 0, 0);
    game.revealCard(1, 1, 1);
    game.startGame();

    const currentPlayer = game.currentPlayerIndex;
    const deckBefore = game.deck.length;
    const drawnCard = game.deck[game.deck.length - 1]; // top of deck

    game.constructFromDeck(currentPlayer, 0, 0);

    assert.equal(game.deck.length, deckBefore - 1);
    assert.equal(game.players[currentPlayer].grid[0][0].faceUp, true);
  });
});

describe('Game — LUMINA trigger', () => {
  it('should detect when all cards are face up', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // Force all cards face up for player 0
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        game.players[0].grid[r][c].faceUp = true;
      }
    }
    assert.equal(game.isLumina(0), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/game.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write game.js implementation**

Create `public/game.js`:

```js
import { createDeck } from './cards.js';
import { calcRoundScore } from './scoring.js';

export const PHASE = { REVEAL: 'reveal', PLAYING: 'playing', FINAL_TURNS: 'final_turns', SCORING: 'scoring' };
export const ACTION = { CONSTRUCT: 'construct', ATTACK: 'attack', SECURE: 'secure' };

export function createGame({ botCount, botDifficulties }) {
  const deck = createDeck();
  const totalPlayers = 1 + botCount;
  const players = [];

  for (let i = 0; i < totalPlayers; i++) {
    const grid = [];
    for (let row = 0; row < 3; row++) {
      const rowCards = [];
      for (let col = 0; col < 4; col++) {
        const card = deck.pop();
        card.faceUp = false;
        card.hasPrism = false;
        card.immune = false;
        rowCards.push(card);
      }
      grid.push(rowCards);
    }

    players.push({
      name: i === 0 ? 'Player' : `Bot ${i}`,
      isBot: i !== 0,
      difficulty: i === 0 ? null : botDifficulties[i - 1],
      grid,
      prismsRemaining: 3,
      revealsLeft: 2,
      stats: { attacksMade: 0, prismsUsed: 0 }
    });
  }

  // Discard pile: flip top card of deck
  const discardCard = deck.pop();
  discardCard.faceUp = true;

  const game = {
    players,
    deck,
    discard: [discardCard],
    phase: PHASE.REVEAL,
    currentPlayerIndex: 0,
    luminaCaller: null,
    finalTurnsRemaining: 0,
    round: 1,
    cumulativeScores: new Array(totalPlayers).fill(0),
    actionLog: [],

    revealCard(playerIndex, row, col) {
      const player = this.players[playerIndex];
      if (player.revealsLeft <= 0) return false;
      const card = player.grid[row][col];
      if (card.faceUp) return false;
      card.faceUp = true;
      player.revealsLeft--;
      return true;
    },

    startGame() {
      this.phase = PHASE.PLAYING;
      // Determine first player: highest visible sum
      let maxSum = -Infinity;
      let firstPlayer = 0;
      for (let i = 0; i < this.players.length; i++) {
        const sum = this.players[i].grid.flat()
          .filter(c => c.faceUp)
          .reduce((s, c) => s + c.value, 0);
        if (sum > maxSum) {
          maxSum = sum;
          firstPlayer = i;
        }
      }
      this.currentPlayerIndex = firstPlayer;
    },

    isLumina(playerIndex) {
      return this.players[playerIndex].grid.flat().every(c => c.faceUp);
    },

    _checkLumina(playerIndex) {
      if (this.phase === PHASE.FINAL_TURNS) return;
      if (this.isLumina(playerIndex)) {
        this.luminaCaller = playerIndex;
        this.phase = PHASE.FINAL_TURNS;
        this.finalTurnsRemaining = this.players.length - 1;
        this.actionLog.push({ type: 'lumina', player: this.players[playerIndex].name });
      }
    },

    _isFullyRevealed(playerIndex) {
      return this.players[playerIndex].grid.flat().every(c => c.faceUp);
    },

    _canBeAttacked(playerIndex) {
      if (this.phase === PHASE.FINAL_TURNS && this._isFullyRevealed(playerIndex)) return false;
      return true;
    },

    _reshuffleDeck() {
      if (this.deck.length > 0) return;
      if (this.discard.length <= 1) return; // keep top discard
      const topDiscard = this.discard.pop();
      // Shuffle remaining discard into deck
      for (const card of this.discard) {
        card.faceUp = false;
        this.deck.push(card);
      }
      this.discard = [topDiscard];
      // Fisher-Yates shuffle
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
    },

    constructFromDeck(playerIndex, row, col) {
      this._reshuffleDeck();
      if (this.deck.length === 0) return false;
      const drawn = this.deck.pop();
      drawn.faceUp = true;
      return this._placeCard(playerIndex, drawn, row, col);
    },

    constructFromDiscard(playerIndex, row, col) {
      if (this.discard.length === 0) return false;
      const drawn = this.discard.pop();
      return this._placeCard(playerIndex, drawn, row, col);
    },

    constructDiscardDraw(playerIndex, revealRow, revealCol) {
      // Draw from deck but discard it, then reveal a face-down card
      this._reshuffleDeck();
      if (this.deck.length === 0) return false;
      const drawn = this.deck.pop();
      drawn.faceUp = true;
      this.discard.push(drawn);

      const card = this.players[playerIndex].grid[revealRow][revealCol];
      if (card.faceUp) return false;
      card.faceUp = true;

      this._checkLumina(playerIndex);
      this._endTurn();
      return true;
    },

    _placeCard(playerIndex, newCard, row, col) {
      const player = this.players[playerIndex];
      const old = player.grid[row][col];
      if (old.hasPrism) return false; // can't replace prismed card

      old.faceUp = true;
      old.hasPrism = false;
      old.immune = false;
      this.discard.push(old);

      newCard.faceUp = true;
      newCard.hasPrism = false;
      newCard.immune = false;
      player.grid[row][col] = newCard;

      this._checkLumina(playerIndex);
      this._endTurn();
      return true;
    },

    attack(attackerIndex, attackerRow, attackerCol, defenderIndex, defenderRow, defenderCol, revealRow, revealCol) {
      const attacker = this.players[attackerIndex];
      const defender = this.players[defenderIndex];

      // Must have a face-down card to reveal
      const revealCard = attacker.grid[revealRow][revealCol];
      if (revealCard.faceUp) return false;

      // Can't attack fully revealed player during final turns
      if (!this._canBeAttacked(defenderIndex)) return false;

      const aCard = attacker.grid[attackerRow][attackerCol];
      const dCard = defender.grid[defenderRow][defenderCol];

      // Both must be face up, neither prismed, defender card not immune
      if (!aCard.faceUp || !dCard.faceUp) return false;
      if (aCard.hasPrism || dCard.hasPrism) return false;
      if (dCard.immune) return false;

      // Reveal cost
      revealCard.faceUp = true;

      // Swap
      attacker.grid[attackerRow][attackerCol] = dCard;
      defender.grid[defenderRow][defenderCol] = aCard;

      // Immunity on received card
      dCard.immune = true;

      attacker.stats.attacksMade++;
      this.actionLog.push({
        type: 'attack',
        attacker: attacker.name,
        defender: defender.name,
        got: { value: dCard.value, color: dCard.color },
        gave: { value: aCard.value, color: aCard.color }
      });

      this._checkLumina(attackerIndex);
      this._endTurn();
      return true;
    },

    secure(playerIndex, row, col, fromRow = null, fromCol = null) {
      const player = this.players[playerIndex];
      const card = player.grid[row][col];

      if (!card.faceUp) return false;
      if (player.prismsRemaining <= 0 && fromRow === null) return false;

      // Move prism from another card
      if (fromRow !== null && fromCol !== null) {
        const source = player.grid[fromRow][fromCol];
        if (!source.hasPrism) return false;
        source.hasPrism = false;
      } else {
        player.prismsRemaining--;
      }

      card.hasPrism = true;
      player.stats.prismsUsed++;
      this.actionLog.push({ type: 'secure', player: player.name, row, col });

      this._endTurn();
      return true;
    },

    clearImmunity(playerIndex) {
      for (const row of this.players[playerIndex].grid) {
        for (const card of row) {
          card.immune = false;
        }
      }
    },

    _endTurn() {
      // Clear immunity for current player (their turn is starting again next cycle)
      this.clearImmunity(this.currentPlayerIndex);

      if (this.phase === PHASE.FINAL_TURNS) {
        this.finalTurnsRemaining--;
        if (this.finalTurnsRemaining <= 0) {
          this.phase = PHASE.SCORING;
          return;
        }
      }

      // Advance to next player
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

      // Skip the LUMINA caller during final turns
      if (this.phase === PHASE.FINAL_TURNS && this.currentPlayerIndex === this.luminaCaller) {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.finalTurnsRemaining--;
        if (this.finalTurnsRemaining <= 0) {
          this.phase = PHASE.SCORING;
        }
      }
    },

    scoreRound() {
      const scores = this.players.map((player, i) => {
        const result = calcRoundScore(player.grid);
        return {
          playerName: player.name,
          ...result,
          calledLumina: this.luminaCaller === i,
          hiddenCardsAtLumina: player.grid.flat().filter(c => !c.faceUp).length
        };
      });

      // Apply LUMINA caller bonus/penalty
      if (this.luminaCaller !== null) {
        const callerScore = scores[this.luminaCaller].total;
        const otherScores = scores.filter((_, i) => i !== this.luminaCaller).map(s => s.total);
        const isHighest = otherScores.every(s => callerScore > s);
        scores[this.luminaCaller].luminaBonus = isHighest ? 10 : -10;
        scores[this.luminaCaller].total += scores[this.luminaCaller].luminaBonus;
      }

      // Apply to cumulative scores (negative rounds count as 0)
      scores.forEach((s, i) => {
        this.cumulativeScores[i] += Math.max(0, s.total);
        s.cumulativeScore = this.cumulativeScores[i];
      });

      return scores;
    },

    isGameOver() {
      return this.cumulativeScores.some(s => s >= 200);
    },

    getWinner() {
      let maxScore = -1;
      let winner = null;
      this.cumulativeScores.forEach((s, i) => {
        if (s > maxScore) {
          maxScore = s;
          winner = this.players[i].name;
        }
      });
      return winner;
    },

    getAvailableActions(playerIndex) {
      const player = this.players[playerIndex];
      const actions = [ACTION.CONSTRUCT]; // always available (deck reshuffle handles empty deck)
      const hasFaceDown = player.grid.flat().some(c => !c.faceUp);
      if (hasFaceDown) actions.push(ACTION.ATTACK);
      const hasVisibleUnprismed = player.grid.flat().some(c => c.faceUp && !c.hasPrism);
      if (hasVisibleUnprismed && (player.prismsRemaining > 0 || player.grid.flat().some(c => c.hasPrism))) {
        actions.push(ACTION.SECURE);
      }
      return actions;
    }
  };

  return game;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/game.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/game.js tests/game.test.js
git commit -m "feat: add game state machine with construct, attack, secure, and LUMINA detection"
```

---

## Chunk 3: Bot AI

### Task 7: Bot AI module

**Files:**
- Create: `public/bot.js`
- Create: `tests/bot.test.js`

- [ ] **Step 1: Write failing tests for bot AI**

Create `tests/bot.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../public/game.js';
import { chooseBotAction, chooseBotReveal } from '../public/bot.js';

describe('Bot — Reveal Phase', () => {
  it('should choose 2 valid positions to reveal', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    const reveals = chooseBotReveal(game, 1);
    assert.equal(reveals.length, 2);
    reveals.forEach(([r, c]) => {
      assert.ok(r >= 0 && r < 3);
      assert.ok(c >= 0 && c < 4);
    });
  });
});

describe('Bot — Easy', () => {
  it('should return a valid action', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // Setup reveals
    game.revealCard(0, 0, 0); game.revealCard(0, 1, 1);
    game.revealCard(1, 0, 0); game.revealCard(1, 1, 1);
    game.startGame();
    game.currentPlayerIndex = 1; // force bot turn

    const action = chooseBotAction(game, 1);
    assert.ok(action);
    assert.ok(['construct', 'attack', 'secure'].includes(action.type));
  });

  it('should never secure a -2 card', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['easy'] });
    // Force a -2 visible on bot grid
    game.players[1].grid[0][0] = { value: -2, color: 'multicolor', faceUp: true, hasPrism: false, immune: false };
    game.players[1].grid[0][1] = { value: 10, color: 'blue', faceUp: true, hasPrism: false, immune: false };
    game.revealCard(0, 0, 0); game.revealCard(0, 1, 1);
    game.revealCard(1, 0, 2); game.revealCard(1, 1, 1);
    game.startGame();
    game.currentPlayerIndex = 1;

    // Run many times — should never secure the -2
    for (let i = 0; i < 50; i++) {
      const action = chooseBotAction(game, 1);
      if (action.type === 'secure') {
        const card = game.players[1].grid[action.row][action.col];
        assert.notEqual(card.value, -2);
      }
    }
  });
});

describe('Bot — Medium', () => {
  it('should prefer discard card when it is high value', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['medium'] });
    game.discard = [{ value: 12, color: 'blue', faceUp: true, hasPrism: false, immune: false }];
    game.players[1].grid[0][0] = { value: 1, color: 'orange', faceUp: true, hasPrism: false, immune: false };
    game.revealCard(0, 0, 0); game.revealCard(0, 1, 1);
    game.revealCard(1, 0, 1); game.revealCard(1, 1, 1);
    game.startGame();
    game.currentPlayerIndex = 1;

    const action = chooseBotAction(game, 1);
    assert.equal(action.type, 'construct');
    assert.equal(action.source, 'discard');
  });
});

describe('Bot — Hard', () => {
  it('should return a valid action with utility reasoning', () => {
    const game = createGame({ botCount: 1, botDifficulties: ['hard'] });
    game.revealCard(0, 0, 0); game.revealCard(0, 1, 1);
    game.revealCard(1, 0, 0); game.revealCard(1, 1, 1);
    game.startGame();
    game.currentPlayerIndex = 1;

    const action = chooseBotAction(game, 1);
    assert.ok(action);
    assert.ok(['construct', 'attack', 'secure'].includes(action.type));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/bot.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write bot.js implementation**

Create `public/bot.js`:

```js
import { calcRoundScore } from './scoring.js';
import { COLORS } from './cards.js';

export function chooseBotReveal(game, playerIndex) {
  // Pick 2 random positions to reveal
  const positions = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      positions.push([r, c]);
    }
  }
  // Shuffle and pick first 2
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions.slice(0, 2);
}

export function chooseBotAction(game, playerIndex) {
  const player = game.players[playerIndex];
  const difficulty = player.difficulty;

  if (difficulty === 'easy') return chooseEasy(game, playerIndex);
  if (difficulty === 'medium') return chooseMedium(game, playerIndex);
  return chooseHard(game, playerIndex);
}

function getVisibleCards(player) {
  const cards = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (player.grid[r][c].faceUp) {
        cards.push({ row: r, col: c, card: player.grid[r][c] });
      }
    }
  }
  return cards;
}

function getFaceDownPositions(player) {
  const positions = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (!player.grid[r][c].faceUp) {
        positions.push([r, c]);
      }
    }
  }
  return positions;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- EASY BOT ----
function chooseEasy(game, playerIndex) {
  const player = game.players[playerIndex];
  const actions = game.getAvailableActions(playerIndex);

  // 70% construct, 20% secure, 10% attack
  const roll = Math.random();
  if (roll < 0.7 || !actions.includes('attack')) {
    return easyConstruct(game, playerIndex);
  }
  if (roll < 0.9 && actions.includes('secure')) {
    return easySecure(game, playerIndex);
  }
  if (actions.includes('attack')) {
    return easyAttack(game, playerIndex);
  }
  return easyConstruct(game, playerIndex);
}

function easyConstruct(game, playerIndex) {
  const player = game.players[playerIndex];
  // Random: deck or discard
  const useDiscard = game.discard.length > 0 && Math.random() < 0.3;
  // Random position
  const allPositions = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (!player.grid[r][c].hasPrism) allPositions.push([r, c]);
    }
  }
  const [row, col] = randomPick(allPositions);

  if (useDiscard) {
    return { type: 'construct', source: 'discard', row, col };
  }
  // 20% chance to just discard the drawn card and reveal
  const faceDown = getFaceDownPositions(player);
  if (faceDown.length > 0 && Math.random() < 0.2) {
    const [rr, rc] = randomPick(faceDown);
    return { type: 'construct', source: 'deck_discard', revealRow: rr, revealCol: rc };
  }
  return { type: 'construct', source: 'deck', row, col };
}

function easySecure(game, playerIndex) {
  const player = game.players[playerIndex];
  const visible = getVisibleCards(player).filter(v => !v.card.hasPrism && v.card.value !== -2);
  if (visible.length === 0) return easyConstruct(game, playerIndex);
  const target = randomPick(visible);
  return { type: 'secure', row: target.row, col: target.col };
}

function easyAttack(game, playerIndex) {
  const player = game.players[playerIndex];
  const faceDown = getFaceDownPositions(player);
  if (faceDown.length === 0) return easyConstruct(game, playerIndex);

  // Find a valid target
  const myVisible = getVisibleCards(player).filter(v => !v.card.hasPrism);
  if (myVisible.length === 0) return easyConstruct(game, playerIndex);

  for (let d = 0; d < game.players.length; d++) {
    if (d === playerIndex) continue;
    if (!game._canBeAttacked(d)) continue;
    const theirVisible = getVisibleCards(game.players[d]).filter(v => !v.card.hasPrism && !v.card.immune);
    if (theirVisible.length === 0) continue;

    const myCard = randomPick(myVisible);
    const theirCard = randomPick(theirVisible);

    // Stupidity floor: don't swap for a worse card
    if (theirCard.card.value < myCard.card.value) continue;

    const [rr, rc] = randomPick(faceDown);
    return {
      type: 'attack',
      attackerRow: myCard.row, attackerCol: myCard.col,
      defenderIndex: d, defenderRow: theirCard.row, defenderCol: theirCard.col,
      revealRow: rr, revealCol: rc
    };
  }
  return easyConstruct(game, playerIndex);
}

// ---- MEDIUM BOT ----
function chooseMedium(game, playerIndex) {
  const player = game.players[playerIndex];
  const discard = game.discard;

  // If discard has a high-value card (>= 8), grab it and replace lowest visible
  if (discard.length > 0) {
    const topDiscard = discard[discard.length - 1];
    const visible = getVisibleCards(player).filter(v => !v.card.hasPrism);
    const lowest = visible.reduce((min, v) => v.card.value < min.card.value ? v : min, visible[0]);

    if (topDiscard.value >= 8 && lowest && topDiscard.value > lowest.card.value) {
      return { type: 'construct', source: 'discard', row: lowest.row, col: lowest.col };
    }
  }

  // Check if we can complete a column bonus
  const secureAction = mediumCheckColumnBonus(game, playerIndex);
  if (secureAction) return secureAction;

  // 15% chance to attack for visible improvement
  if (Math.random() < 0.15) {
    const attack = mediumAttack(game, playerIndex);
    if (attack) return attack;
  }

  // Default: construct from deck, replace lowest value visible card
  return mediumConstruct(game, playerIndex);
}

function mediumConstruct(game, playerIndex) {
  const player = game.players[playerIndex];
  const visible = getVisibleCards(player).filter(v => !v.card.hasPrism);
  const faceDown = getFaceDownPositions(player);

  // Replace lowest visible card or a random face-down
  if (visible.length > 0) {
    const lowest = visible.reduce((min, v) => v.card.value < min.card.value ? v : min, visible[0]);
    // Only replace if the card is low (< 5)
    if (lowest.card.value < 5) {
      return { type: 'construct', source: 'deck', row: lowest.row, col: lowest.col };
    }
  }

  // Replace a face-down card
  if (faceDown.length > 0) {
    const [r, c] = randomPick(faceDown);
    return { type: 'construct', source: 'deck', row: r, col: c };
  }

  // Fallback
  const allUnprismed = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (!player.grid[r][c].hasPrism) allUnprismed.push([r, c]);
  const [r, c] = randomPick(allUnprismed);
  return { type: 'construct', source: 'deck', row: r, col: c };
}

function mediumCheckColumnBonus(game, playerIndex) {
  const player = game.players[playerIndex];
  // Check if any column has 2/3 same color and we have a prism available
  for (let col = 0; col < 4; col++) {
    const column = [player.grid[0][col], player.grid[1][col], player.grid[2][col]];
    const visibleColored = column.filter(c => c.faceUp && c.color && c.color !== 'multicolor');
    if (visibleColored.length >= 2) {
      const color = visibleColored[0].color;
      if (visibleColored.every(c => c.color === color)) {
        // Column is close — secure a card in it if possible
        const target = column.find(c => c.faceUp && !c.hasPrism && c.value >= 5);
        if (target && player.prismsRemaining > 0) {
          const row = column.indexOf(target);
          return { type: 'secure', row, col };
        }
      }
    }
  }
  return null;
}

function mediumAttack(game, playerIndex) {
  const player = game.players[playerIndex];
  const faceDown = getFaceDownPositions(player);
  if (faceDown.length === 0) return null;

  const myVisible = getVisibleCards(player).filter(v => !v.card.hasPrism);
  if (myVisible.length === 0) return null;

  const lowest = myVisible.reduce((min, v) => v.card.value < min.card.value ? v : min, myVisible[0]);

  for (let d = 0; d < game.players.length; d++) {
    if (d === playerIndex) continue;
    if (!game._canBeAttacked(d)) continue;
    const theirVisible = getVisibleCards(game.players[d]).filter(v => !v.card.hasPrism && !v.card.immune);
    if (theirVisible.length === 0) continue;

    const best = theirVisible.reduce((max, v) => v.card.value > max.card.value ? v : max, theirVisible[0]);
    if (best.card.value - lowest.card.value >= 5) {
      const [rr, rc] = randomPick(faceDown);
      return {
        type: 'attack',
        attackerRow: lowest.row, attackerCol: lowest.col,
        defenderIndex: d, defenderRow: best.row, defenderCol: best.col,
        revealRow: rr, revealCol: rc
      };
    }
  }
  return null;
}

// ---- HARD BOT ----
function chooseHard(game, playerIndex) {
  const player = game.players[playerIndex];
  const candidates = [];

  // Evaluate construct actions
  candidates.push(...evaluateConstructActions(game, playerIndex));

  // Evaluate attack actions
  candidates.push(...evaluateAttackActions(game, playerIndex));

  // Evaluate secure actions
  candidates.push(...evaluateSecureActions(game, playerIndex));

  if (candidates.length === 0) {
    return { type: 'construct', source: 'deck', row: 0, col: 0 };
  }

  // Pick highest utility
  candidates.sort((a, b) => b.utility - a.utility);
  return candidates[0].action;
}

function evaluateConstructActions(game, playerIndex) {
  const player = game.players[playerIndex];
  const candidates = [];

  // Evaluate discard pickup
  if (game.discard.length > 0) {
    const discardCard = game.discard[game.discard.length - 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (player.grid[r][c].hasPrism) continue;
        const valueDelta = discardCard.value - (player.grid[r][c].faceUp ? player.grid[r][c].value : 0);
        const structureBonus = estimateStructureGain(player, r, c, discardCard);
        const utility = valueDelta * 1.0 + structureBonus * 1.5;
        candidates.push({
          utility,
          action: { type: 'construct', source: 'discard', row: r, col: c }
        });
      }
    }
  }

  // Deck draw — estimate with average expected value (6.5 for standard cards)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (player.grid[r][c].hasPrism) continue;
      const currentValue = player.grid[r][c].faceUp ? player.grid[r][c].value : 0;
      const expectedDelta = 6.5 - currentValue;
      const riskPenalty = player.grid[r][c].faceUp ? 0 : 1.2; // risk of revealing bad card
      const utility = expectedDelta * 1.0 - riskPenalty;
      candidates.push({
        utility,
        action: { type: 'construct', source: 'deck', row: r, col: c }
      });
    }
  }

  return candidates;
}

function evaluateAttackActions(game, playerIndex) {
  const player = game.players[playerIndex];
  const faceDown = getFaceDownPositions(player);
  if (faceDown.length === 0) return [];

  const myVisible = getVisibleCards(player).filter(v => !v.card.hasPrism);
  if (myVisible.length === 0) return [];

  const candidates = [];

  for (let d = 0; d < game.players.length; d++) {
    if (d === playerIndex) continue;
    if (!game._canBeAttacked(d)) continue;

    const theirVisible = getVisibleCards(game.players[d]).filter(v => !v.card.hasPrism && !v.card.immune);

    for (const my of myVisible) {
      for (const their of theirVisible) {
        const valueDelta = their.card.value - my.card.value;
        const disruption = estimateDisruption(game.players[d], their.row, their.col);
        const revealRisk = 1.2;
        const utility = valueDelta * 1.0 + disruption * 0.8 - revealRisk;

        if (utility > 0) {
          const [rr, rc] = faceDown[0];
          candidates.push({
            utility,
            action: {
              type: 'attack',
              attackerRow: my.row, attackerCol: my.col,
              defenderIndex: d, defenderRow: their.row, defenderCol: their.col,
              revealRow: rr, revealCol: rc
            }
          });
        }
      }
    }
  }

  return candidates;
}

function evaluateSecureActions(game, playerIndex) {
  const player = game.players[playerIndex];
  if (player.prismsRemaining <= 0) return [];

  const candidates = [];
  const visible = getVisibleCards(player).filter(v => !v.card.hasPrism);

  for (const v of visible) {
    if (v.card.value < 5) continue; // don't secure low cards
    const inStructure = isPartOfValidStructure(player, v.row, v.col);
    const utility = (v.card.value * 0.3) + (inStructure ? 8 : 0);
    candidates.push({
      utility,
      action: { type: 'secure', row: v.row, col: v.col }
    });
  }

  return candidates;
}

function estimateStructureGain(player, row, col, newCard) {
  // Check if placing newCard at [row][col] would complete or contribute to a structure
  let bonus = 0;

  // Column check
  const column = [0, 1, 2].map(r => r === row ? newCard : player.grid[r][col]);
  if (column.every(c => c.faceUp !== false)) {
    const realColors = column.filter(c => c.color && c.color !== 'multicolor' && c.color !== null).map(c => c.color);
    if (realColors.length > 0 && realColors.every(c => c === realColors[0]) && !column.some(c => c.color === null)) {
      bonus += 10;
    }
  }

  // Row check
  const rowCards = [0, 1, 2, 3].map(c => c === col ? newCard : player.grid[row][c]);
  if (rowCards.every(c => c.faceUp !== false)) {
    let increasing = true;
    for (let i = 1; i < 4; i++) {
      if (rowCards[i].value <= rowCards[i - 1].value) { increasing = false; break; }
    }
    if (increasing) bonus += 10;
  }

  return bonus;
}

function estimateDisruption(defender, row, col) {
  return isPartOfValidStructure({ grid: defender.grid }, row, col) ? 5 : 0;
}

function isPartOfValidStructure(player, row, col) {
  // Check column
  const column = [player.grid[0][col], player.grid[1][col], player.grid[2][col]];
  if (column.every(c => c.faceUp)) {
    const realColors = column.filter(c => c.color && c.color !== 'multicolor' && c.color !== null).map(c => c.color);
    if (!column.some(c => c.color === null) && (realColors.length === 0 || realColors.every(c => c === realColors[0]))) {
      return true;
    }
  }

  // Check row
  const rowCards = player.grid[row];
  if (rowCards.every(c => c.faceUp)) {
    let increasing = true;
    for (let i = 1; i < 4; i++) {
      if (rowCards[i].value <= rowCards[i - 1].value) { increasing = false; break; }
    }
    if (increasing) return true;
  }

  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/bot.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add public/bot.js tests/bot.test.js
git commit -m "feat: add bot AI with easy, medium, and hard difficulty levels"
```

---

## Chunk 4: UI — Screens, Rendering, Interactions

### Task 8: CSS theme (Retro Arcade)

**Files:**
- Create: `public/style.css`

- [ ] **Step 1: Write the Retro Arcade stylesheet**

Create `public/style.css` with the full retro arcade theme:
- Deep space gradient background
- Card styles per color with neon borders
- Face-down card pattern
- Prism and immunity indicators
- Grid layout for game board
- Action buttons
- Bot tab system
- Action log panel
- Setup screen, round end screen, game end screen, history screen
- Animations: card flip (3D transform), swap translate, prism drop, LUMINA flash
- Responsive layout

*(Full CSS file — too long to inline in plan, implement based on spec color values and layout wireframe)*

- [ ] **Step 2: Verify styles load in browser**

```bash
npm run dev
```
Open `http://localhost:3000`, inspect that styles apply.

- [ ] **Step 3: Commit**

```bash
git add public/style.css
git commit -m "feat: add Retro Arcade CSS theme with card styles and animations"
```

---

### Task 9: UI rendering module

**Files:**
- Create: `public/ui.js`

- [ ] **Step 1: Write ui.js — DOM rendering for all screens**

Create `public/ui.js` implementing:
- `renderSetupScreen()` — bot count selector (1–5), difficulty per bot, Start button
- `renderGameBoard(game)` — player grid, bot tabs, deck/discard, action buttons, action log
- `renderCard(card)` — individual card element with color, value, face-up/down, prism, immunity
- `renderRoundEnd(scores)` — score breakdown table with bonus highlights
- `renderGameEnd(scores, winner)` — leaderboard + winner announcement
- `renderHistory(sessions)` — table of past games
- `showConfirmDialog(message, onConfirm, onCancel)` — for attack confirmations
- `logAction(message)` — append to action log
- Click handlers for: card selection, action buttons, deck/discard draw

- [ ] **Step 2: Verify rendering in browser**

```bash
npm run dev
```
Open `http://localhost:3000`, verify all screens render correctly.

- [ ] **Step 3: Commit**

```bash
git add public/ui.js
git commit -m "feat: add UI rendering module with all game screens"
```

---

### Task 10: Stats API client

**Files:**
- Create: `public/stats.js`

- [ ] **Step 1: Write stats.js**

Create `public/stats.js`:

```js
export async function saveGameStats(session, rounds) {
  const res = await fetch('/api/stats/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, rounds })
  });
  return res.json();
}

export async function fetchHistory() {
  const res = await fetch('/api/stats/history');
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add public/stats.js
git commit -m "feat: add stats API client module"
```

---

### Task 11: Main game controller (index.html + app.js)

**Files:**
- Modify: `public/index.html`
- Create: `public/app.js`

- [ ] **Step 1: Write index.html with full structure**

Update `public/index.html` with:
- All screen containers (setup, game, round-end, game-end, history)
- ES module script imports for app.js
- Meta tags and title

- [ ] **Step 2: Write app.js — main game controller**

Create `public/app.js` implementing the game flow:
- Setup screen → create game → reveal phase (player picks 2 cards, bots auto-reveal)
- Game loop: human turn (click actions) → bot turns (delayed auto-play with action log)
- LUMINA detection → final turns → scoring → round end screen
- Next round or game end
- Stats save on game end
- History screen navigation

- [ ] **Step 3: Test full game flow in browser**

```bash
npm run dev
```
Play through a full game: setup → play → score → game end → check history.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat: add main game controller with full game flow"
```

---

## Chunk 5: Deployment

### Task 12: Docker setup

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create Dockerfile**

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Create .dockerignore**

Create `.dockerignore`:

```
node_modules
data/*.db
.superpowers
.omc
.git
tests
```

- [ ] **Step 3: Test Docker build locally**

```bash
docker build -t lumina .
docker run -p 3000:3000 -v lumina-data:/app/data lumina
```
Open `http://localhost:3000` and verify the game works.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Docker configuration for deployment"
```

---

### Task 13: Deploy to Dokploy

**Files:** None (API operations)

- [ ] **Step 1: Push code to GitHub**

```bash
git remote add origin <github-repo-url>
git push -u origin main
```

- [ ] **Step 2: Configure Dokploy**

Via Dokploy dashboard at `http://72.61.4.99:3000/`:
1. Create new Application
2. Set source: GitHub repo
3. Set build: Dockerfile
4. Set port: 3000
5. Add persistent volume: `/app/data` for SQLite
6. Deploy

- [ ] **Step 3: Verify deployment**

Open the deployed URL and play a full game to verify everything works.

- [ ] **Step 4: Commit any deployment tweaks**

```bash
git add -A
git commit -m "chore: finalize deployment configuration"
```

---

### Task 14: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md with project commands and architecture**

Update with:
- Build/run commands (`npm start`, `npm run dev`, `npm test`)
- Architecture overview referencing this plan
- Key module boundaries

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with project commands and architecture"
```
