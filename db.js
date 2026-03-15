import Database from 'better-sqlite3';

/**
 * Creates or opens a SQLite database at the given path.
 * Enables WAL mode and foreign keys, and creates tables if they don't exist.
 *
 * @param {string} path - File path for the SQLite database
 * @returns {import('better-sqlite3').Database}
 */
export function createDb(path) {
  const db = new Database(path);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      played_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      num_players        INTEGER NOT NULL,
      num_rounds         INTEGER NOT NULL,
      winner             TEXT NOT NULL,
      player_final_score INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS round_stats (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id             INTEGER NOT NULL REFERENCES sessions(id),
      round_number           INTEGER NOT NULL,
      player_name            TEXT NOT NULL,
      round_score            INTEGER NOT NULL,
      attacks_made           INTEGER NOT NULL DEFAULT 0,
      prisms_used            INTEGER NOT NULL DEFAULT 0,
      hidden_cards_at_lumina INTEGER NOT NULL DEFAULT 0,
      called_lumina          INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

/**
 * Inserts a game session record.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} session
 * @param {number} session.numPlayers
 * @param {number} session.numRounds
 * @param {string} session.winner
 * @param {number} session.playerFinalScore
 * @returns {number} The inserted session id
 */
export function saveSession(db, { numPlayers, numRounds, winner, playerFinalScore }) {
  const stmt = db.prepare(`
    INSERT INTO sessions (num_players, num_rounds, winner, player_final_score)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(numPlayers, numRounds, winner, playerFinalScore);
  return Number(result.lastInsertRowid);
}

/**
 * Inserts a round stat row for a given session.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} stat
 * @param {number} stat.sessionId
 * @param {number} stat.roundNumber
 * @param {string} stat.playerName
 * @param {number} stat.roundScore
 * @param {number} [stat.attacksMade=0]
 * @param {number} [stat.prismsUsed=0]
 * @param {number} [stat.hiddenCardsAtLumina=0]
 * @param {number} [stat.calledLumina=0]
 * @returns {number} The inserted round_stat id
 */
export function saveRoundStat(db, {
  sessionId,
  roundNumber,
  playerName,
  roundScore,
  attacksMade = 0,
  prismsUsed = 0,
  hiddenCardsAtLumina = 0,
  calledLumina = 0,
}) {
  const stmt = db.prepare(`
    INSERT INTO round_stats
      (session_id, round_number, player_name, round_score,
       attacks_made, prisms_used, hidden_cards_at_lumina, called_lumina)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    sessionId, roundNumber, playerName, roundScore,
    attacksMade, prismsUsed, hiddenCardsAtLumina, calledLumina,
  );
  return Number(result.lastInsertRowid);
}

/**
 * Returns the last N sessions with their round stats joined.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} limit - Maximum number of sessions to return
 * @returns {Array<object>} Sessions ordered most-recent first, each with a `rounds` array
 */
export function getHistory(db, limit) {
  const sessions = db.prepare(`
    SELECT id, played_at AS playedAt, num_players AS numPlayers,
           num_rounds AS numRounds, winner, player_final_score AS playerFinalScore
    FROM sessions
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);

  if (sessions.length === 0) return [];

  const roundStmt = db.prepare(`
    SELECT round_number           AS roundNumber,
           player_name            AS playerName,
           round_score            AS roundScore,
           attacks_made           AS attacksMade,
           prisms_used            AS prismsUsed,
           hidden_cards_at_lumina AS hiddenCardsAtLumina,
           called_lumina          AS calledLumina
    FROM round_stats
    WHERE session_id = ?
    ORDER BY round_number
  `);

  for (const session of sessions) {
    session.rounds = roundStmt.all(session.id);
  }

  return sessions;
}
