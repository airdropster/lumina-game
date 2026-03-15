# LUMINA Web Game — Design Spec
**Date:** 2026-03-15
**Status:** Approved

---

## Overview

Browser-based implementation of the LUMINA card game, playable solo against 1–5 bots on a local/hosted website. Built with Vanilla JS frontend + Node.js/Express backend + SQLite for stats persistence. Deployed via Dokploy on a VPS.

---

## Game Rules (Complete)

### Components
- **112 cards:** 96 Vector cards (values 1–12, 4 colors: Blue, Violet, Orange, Green × 2 copies each), 8 cards value -2 (multicolor), 8 cards value 15 (no color)
- **18 Prisms:** 3 per player
- **Players:** 2–6 (1 human + 1–5 bots)

### Setup
1. Each player receives 3 Prisms
2. Shuffle deck, deal 12 cards face-down per player, arranged in a 4-column × 3-row grid
3. Place remaining cards as the Deck (face down). Flip the top card to start the Discard pile
4. All players simultaneously reveal 2 cards of their choice from their grid
5. Highest visible sum starts; clockwise. Tiebreaker: random (youngest in physical game)

### Turn Actions (pick exactly one)

**A — Construct:** Improve your grid by drawing a card.
1. Draw the top card from the Deck (face down) OR the Discard pile (face visible)
2. Place it in any grid position, replacing an existing card (visible or face-down). Prismed cards cannot be replaced.
3. The replaced card goes face-up on the Discard pile.
4. *Exception — Deck draw only:* You may discard the drawn card immediately instead of placing it. If you do, you must reveal one of your face-down cards.

**B — Attack:** Steal a card from an opponent.
1. *Cost:* You must first reveal one of your own face-down cards. **If you have no face-down cards, Attack is unavailable.**
2. Swap one of your visible cards with one of an opponent's visible cards. Prismed cards cannot be targeted (yours or theirs).
3. *Immunity:* The card you received is protected from any Attack action until the start of your next turn. It can still be replaced via Construct or Secured via a Prism.

**C — Secure:** Lock a position.
1. Place or move one of your Prisms onto any of your visible cards.
2. That card is locked: it cannot be replaced (Construct), attacked (Attack), or have its prism moved by opponents.
3. Moving a prism from Card A to Card B unlocks Card A immediately (available for all actions on future turns).

### Deck Exhaustion
When the deck is empty and a player needs to draw, shuffle the entire discard pile to form a new deck, then flip the top card to start a new discard pile.

### End of Round — LUMINA
LUMINA triggers automatically when any action causes a player's last face-down card to be revealed (via Construct replace, Attack reveal cost, or Construct discard-and-reveal). There is no manual "call LUMINA" button.
1. All other players get one final turn each
2. During final turns, no player whose grid is fully revealed can be attacked (including the LUMINA caller)
3. Then scoring happens

### Scoring per Round
**A. Card Values:**
- Sum all visible card values
- Each face-down card remaining = −5 pts

**B. Structure Bonuses (only visible cards count):**
- **Column bonus (+10):** 3 cards in a column share the same color. The -2 (multicolor) can adopt any color. The 15 (no color) never satisfies a column bonus. Three -2 cards in a column do qualify (they all adopt the same color).
- **Row bonus (+10):** 4 cards in a row are strictly increasing left-to-right. Each value must be greater than the one to its left (no duplicates). Both -2 and 15 participate as their numeric values.
- Column and row bonuses stack. A column or row containing any face-down card cannot qualify.

**C. Prism Bonus:**
- If a prismed card is part of at least one valid structure (column or row), add +10 points **once total** (not per structure).

**D. LUMINA Caller Bonus/Penalty:**
- If the caller has the strictly highest round score: +10
- Otherwise: −10

**E. Round Total:**
- If positive → adds to cumulative score
- If negative or zero → counts as 0

### Game End
The game ends at the conclusion of any round where at least one player has ≥200 cumulative points. The player with the highest cumulative total wins. Tie: shared victory.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML5 / CSS3 / JavaScript (ES modules) |
| Backend | Node.js 20 + Express |
| Database | SQLite via `better-sqlite3` |
| Containerization | Docker (node:20-alpine) |
| Deployment | Dokploy on VPS (http://72.61.4.99:3000/) |

---

## File Structure

```
lumina/
├── public/
│   ├── index.html        — game shell (setup, game, scores screens)
│   ├── game.js           — state machine
│   ├── bot.js            — bot AI per difficulty
│   ├── ui.js             — DOM rendering + animations
│   ├── stats.js          — API calls for stats
│   └── style.css         — Retro Arcade visual theme
├── server.js             — Express server (static + API)
├── db.js                 — SQLite setup + queries
├── data/
│   └── lumina.db         — SQLite database (volume-mounted in prod)
├── Dockerfile
└── package.json
```

---

## Visual Style: Retro Arcade

- **Background:** Deep space gradient (`#1a0a2e` → `#0d1b2a`)
- **Cards:** Gradient fills per color + matching neon border
  - Blue: `#1e3a5f` / border `#60a5fa`
  - Violet: `#312e81` / border `#a78bfa`
  - Orange: `#431407` / border `#fb923c`
  - Green: `#14532d` / border `#4ade80`
  - -2 (multicolor): rainbow border
  - 15 (no color): white/silver border
- **Font:** Monospace (system-ui fallback)
- **Face-down card:** Dark block with textured pattern
- **Prism:** Diamond overlay badge on card
- **Immune card:** Shield glow indicator (fades at start of owner's next turn)

---

## Game Board Layout

```
┌─────────────────────────────────────────────────────┐
│  LUMINA          Round 2       Score: Player 45pts  │
├─────────────────────────────────────────────────────┤
│  [Bot 1 tab] [Bot 2 tab] [Bot 3 tab] ...           │
│  BOT 1 (Hard)  ░░ ░░ ░░ ░░   Score: 30             │
│                ░░  7  ░░  3                          │
│                ░░  ░░  2  ░░                         │
├──────────────────────┬──────────────────────────────┤
│   DECK  [52]   [?]  │  DISCARD   [8]               │
├──────────────────────┴──────────────────────────────┤
│  YOUR GRID                          Prismes: 3       │
│  ░░   5   ░░  12                                    │
│   3  [P]   8   ░░                                   │
│  ░░   1   ░░   ░░                                   │
├─────────────────────────────────────────────────────┤
│  [ CONSTRUCT ]   [ ATTACK ]   [ SECURE ]            │
├─────────────────────────────────────────────────────┤
│  Action Log: Bot 2 drew from deck, replaced [2,1]  │
└─────────────────────────────────────────────────────┘
```

- Bot grids shown via tabs/carousel (scales to 5 bots without cramping)
- Active player's grid highlighted with a border glow
- Action log at bottom shows recent actions so human can follow bot turns
- Unavailable actions grayed out (e.g., Attack when no face-down cards)
- Confirmation dialog on Attack ("Swap your [card] for [opponent card]?")

---

## Animations

- **Card flip:** CSS 3D transform (face-down → face-up)
- **Attack swap:** Cards translate between grids with a trail effect
- **Prism placement:** Drop-in with a locking pulse
- **LUMINA trigger:** Screen flash + "LUMINA!" text overlay
- **Score tally:** Values count up with structure bonuses highlighted

---

## Bot AI

### Easy
- Random valid action each turn
- Stupidity floor: never secures a -2, never attacks to get a worse card
- Does not intentionally pursue LUMINA

### Medium
- Prefers drawing low-value cards from discard to replace low-value visible cards
- Replaces lowest-value visible cards when a higher card is drawn
- Completes column bonus when 2/3 same color already visible
- Attacks occasionally when visible gain is obvious
- Pursues LUMINA when its visible score is above average among all players

### Hard
- Evaluates all valid actions via utility scoring function:
  ```
  utility(action) =
    card_value_delta × 1.0
    + structure_bonus_potential × 1.5
    + opponent_disruption × 0.8
    − risk_of_revealing_bad_card × 1.2
  ```
- Maximizes: potential line/column bonus, net card value improvement
- Places prisms on cards that are part of valid structures
- Attacks when net point gain ≥ 2 or when it disrupts opponent's structure
- Calls LUMINA only when utility function predicts it will win the round bonus

### Bot Thinking Delay
- Easy: 800ms
- Medium: 1200ms
- Hard: 1800ms

---

## SQLite Schema

```sql
CREATE TABLE sessions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  num_players     INTEGER NOT NULL,
  num_rounds      INTEGER NOT NULL,
  winner          TEXT NOT NULL,
  player_final_score INTEGER NOT NULL
);

CREATE TABLE round_stats (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id              INTEGER NOT NULL REFERENCES sessions(id),
  round_number            INTEGER NOT NULL,
  player_name             TEXT NOT NULL,
  round_score             INTEGER NOT NULL,
  attacks_made            INTEGER NOT NULL DEFAULT 0,
  prisms_used             INTEGER NOT NULL DEFAULT 0,
  hidden_cards_at_lumina  INTEGER NOT NULL DEFAULT 0,
  called_lumina           INTEGER NOT NULL DEFAULT 0  -- boolean 0/1
);
```

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serve `index.html` |
| GET | `/api/stats/history` | Return last 50 sessions with round stats |
| POST | `/api/stats/save` | Save a completed game session + all round stats |

---

## Deployment

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Dokploy Setup
1. Push code to GitHub repo
2. Create app in Dokploy pointing to repo, port `3000`
3. Mount `/app/data` as persistent volume for `lumina.db`
4. Dokploy auto-deploys on each `git push`
5. Dokploy API token needed for automated deployment step

---

## Screens

1. **Setup screen** — choose number of bots (1–5), difficulty per bot, click Start
2. **Game screen** — main board (layout above)
3. **Round end screen** — score breakdown per player with bonus highlights
4. **Game end screen** — final leaderboard, winner announcement, stats summary
5. **History screen** — table of past games from SQLite
