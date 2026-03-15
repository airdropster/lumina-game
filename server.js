import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb, saveSession, saveRoundStat, getHistory } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Starts the Express server.
 *
 * @param {number} port - Port to listen on (0 for random)
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Promise<{ server: import('http').Server, port: number, db: import('better-sqlite3').Database }>}
 */
export function startServer(port = 3000, dbPath = 'data/lumina.db') {
  const db = createDb(dbPath);
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, 'public')));

  // Save a game session with round stats
  app.post('/api/stats/save', (req, res) => {
    const { session, rounds } = req.body;

    if (!session || !session.numPlayers || !session.winner) {
      return res.status(400).json({ error: 'Missing required session data' });
    }

    try {
      const sessionId = saveSession(db, {
        numPlayers: session.numPlayers,
        numRounds: session.numRounds,
        winner: session.winner,
        playerFinalScore: session.playerFinalScore,
      });

      if (Array.isArray(rounds)) {
        for (const round of rounds) {
          saveRoundStat(db, { sessionId, ...round });
        }
      }

      res.json({ sessionId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Return last 50 sessions with round stats
  app.get('/api/stats/history', (_req, res) => {
    try {
      const history = getHistory(db, 50);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const actualPort = server.address().port;
      console.log(`LUMINA server listening on http://localhost:${actualPort}`);
      resolve({ server, port: actualPort, db });
    });
  });
}

// Auto-start when run directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startServer();
}
