# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**LUMINA** — a browser-based card game where a human player competes against 1-5 AI bots across three difficulty levels (easy/medium/hard). Players manage a 3x4 grid of cards, using Construct/Attack/Secure actions to maximize their score. First to 200 points wins.

## Commands

- `npm start` — Start the server on port 3000
- `npm run dev` — Start with `--watch` for auto-reload
- `npm test` — Run all tests (Node.js built-in test runner)
- `node --test tests/game.test.js` — Run a single test file

## Architecture

```
server.js          Express server — static files + 2 API routes
db.js              SQLite (better-sqlite3) — sessions + round_stats tables
public/
  app.js           Main controller — game flow, user input, bot scheduling
  game.js          State machine — phases (reveal/playing/final_turns/scoring),
                   turn management, actions (construct/attack/secure), LUMINA detection
  bot.js           AI — easy (random), medium (heuristic), hard (utility scoring)
  cards.js         112-card deck — 96 vector + 8 multicolor(-2) + 8 colorless(15)
  scoring.js       Round scoring — base sum, column bonus, row bonus, prism bonus
  ui.js            DOM rendering — setup, game board, round-end, game-end, history screens
  stats.js         Fetch wrapper for /api/stats/save and /api/stats/history
  style.css        Retro Arcade theme — neon glows, scanlines, card animations
  index.html       Shell with 5 screen divs, loads app.js as ES module
```

## Data Flow

1. `app.js` creates a game via `createGame()` from `game.js`
2. User/bot actions call methods on the game object (e.g., `constructFromDeck`, `attack`, `secure`)
3. After each action, `app.js` re-renders the board via `ui.js`
4. Bot turns are scheduled with `setTimeout` using difficulty-based delays
5. At round end, `scoring.js` calculates breakdowns, cumulative scores update
6. At game end, stats are POSTed to `/api/stats/save` which writes to SQLite via `db.js`

## Key Design Decisions

- Game state is a mutable object with methods (not Redux/immutable) — simplicity over ceremony
- All game logic runs client-side; server only persists stats
- Bot AI returns action objects that `app.js` executes — bots use the same game methods as the player
- Cards use `faceUp`, `hasPrism`, `immune` booleans on each grid cell
- LUMINA triggers `PHASE.FINAL_TURNS` — each other player gets exactly one more turn

## Deployment

- **Dockerfile**: `node:20-slim`, installs build tools for `better-sqlite3`, exposes port 3000
- **Volume**: `/app/data` for persistent SQLite database
- **Dokploy**: Deploy from GitHub repo `airdropster/lumina-game`, branch `master`
