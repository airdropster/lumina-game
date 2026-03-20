import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb, saveSession, saveRoundStat, getHistory } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function buildAnalysisPrompt(summary, config) {
  const playerLines = summary.perPlayer
    ? summary.perPlayer.map((p, i) =>
      `  Bot ${i + 1}: wins=${p.wins} (${(p.winRate * 100).toFixed(1)}%), avg=${Math.round(p.avgScore)}, median=${Math.round(p.medianScore)}, stdDev=${p.stdDev.toFixed(1)}`
    ).join('\n')
    : '  (no per-player data)';

  const bonusLines = summary.bonusContributions
    ? summary.bonusContributions.map((b, i) =>
      `  Bot ${i + 1}: base=${(b.base * 100).toFixed(0)}%, col=${(b.column * 100).toFixed(0)}%, row=${(b.row * 100).toFixed(0)}%, prism=${(b.prism * 100).toFixed(0)}%`
    ).join('\n')
    : '  (no bonus data)';

  return `You are a game balance analyst for LUMINA, a card game where players build a 3x4 grid to maximize their score. First to the win threshold wins.

Current parameters:
- Card range: ${config.cardMin}-${config.cardMax}, Negative: ${config.negativeValue}, Top: ${config.topValue}
- Win threshold: ${config.winThreshold}
- Bonuses: Column=${config.columnBonus}, Row=${config.rowBonus}, Prism=${config.prismBonus}, LUMINA=${config.luminaBonus}

Simulation results (${summary.totalGames} games):
${playerLines}

LUMINA call rate: ${(summary.luminaCallRate * 100).toFixed(0)}%
Avg rounds per game: ${summary.avgRounds.toFixed(1)}

Bonus contributions:
${bonusLines}

Provide a concise balance analysis:
1. Are difficulties well-separated? (hard should win more than easy)
2. Is any bonus overpowered or useless?
3. Is the win threshold appropriate? (too many/few rounds?)
4. Is the LUMINA mechanic impactful enough?
5. Specific parameter change suggestions with reasoning.

Keep it under 300 words. Use bullet points.`;
}

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

  // Serve simulator at clean URL
  app.get('/simulator', (_req, res) => {
    res.sendFile(join(__dirname, 'public', 'simulator.html'));
  });

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

  // AI Analysis — Gemini Flash proxy
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const analyzeTimestamps = new Map();

  app.get('/api/analyze/status', (_req, res) => {
    res.json({ available: !!GEMINI_API_KEY });
  });

  app.post('/api/analyze', async (req, res) => {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI analysis not configured.' });
    }

    const ip = req.ip;
    const now = Date.now();
    const last = analyzeTimestamps.get(ip) || 0;
    if (now - last < 10000) {
      return res.status(429).json({ error: 'Please wait 10 seconds between analyses.' });
    }
    analyzeTimestamps.set(ip, now);

    const { summary, config } = req.body;
    if (!summary || !config) {
      return res.status(400).json({ error: 'Missing summary or config.' });
    }

    try {
      const prompt = buildAnalysisPrompt(summary, config);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini API error:', response.status, errText);
        return res.status(502).json({ error: 'AI service unavailable. Try again.' });
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Analysis unavailable.';
      res.json({ analysis: text });
    } catch (err) {
      console.error('Gemini fetch error:', err.message);
      res.status(502).json({ error: 'AI service unavailable. Try again.' });
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
