import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { createDb, saveSession, saveRoundStat, getHistory } from '../db.js';

const TEST_DB_PATH = 'data/test-lumina.db';

describe('Database module', () => {
  let db;

  before(() => {
    mkdirSync('data', { recursive: true });
    // Remove leftover test db if present
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
    db = createDb(TEST_DB_PATH);
  });

  after(() => {
    if (db) db.close();
    // Clean up test database files
    for (const suffix of ['', '-wal', '-shm']) {
      const f = TEST_DB_PATH + suffix;
      if (existsSync(f)) unlinkSync(f);
    }
  });

  describe('createDb', () => {
    it('should return an open database object', () => {
      assert.ok(db, 'db should be truthy');
      assert.equal(db.open, true, 'db should be open');
    });

    it('should enable WAL mode', () => {
      const row = db.pragma('journal_mode', { simple: true });
      assert.equal(row, 'wal');
    });

    it('should enable foreign keys', () => {
      const row = db.pragma('foreign_keys', { simple: true });
      assert.equal(row, 1);
    });

    it('should create sessions table', () => {
      const table = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        )
        .get();
      assert.ok(table, 'sessions table should exist');
    });

    it('should create round_stats table', () => {
      const table = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='round_stats'"
        )
        .get();
      assert.ok(table, 'round_stats table should exist');
    });
  });

  describe('saveSession', () => {
    it('should insert a session and return its id', () => {
      const id = saveSession(db, {
        numPlayers: 3,
        numRounds: 5,
        winner: 'Alice',
        playerFinalScore: 42,
      });
      assert.equal(typeof id, 'number');
      assert.ok(id >= 1, 'id should be a positive integer');
    });

    it('should persist the session data correctly', () => {
      const id = saveSession(db, {
        numPlayers: 2,
        numRounds: 3,
        winner: 'Bob',
        playerFinalScore: 17,
      });
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
      assert.equal(row.num_players, 2);
      assert.equal(row.num_rounds, 3);
      assert.equal(row.winner, 'Bob');
      assert.equal(row.player_final_score, 17);
      assert.ok(row.played_at, 'played_at should be set automatically');
    });
  });

  describe('saveRoundStat', () => {
    let sessionId;

    before(() => {
      sessionId = saveSession(db, {
        numPlayers: 2,
        numRounds: 4,
        winner: 'Carol',
        playerFinalScore: 30,
      });
    });

    it('should insert a round stat row', () => {
      const id = saveRoundStat(db, {
        sessionId,
        roundNumber: 1,
        playerName: 'Carol',
        roundScore: 8,
        attacksMade: 2,
        prismsUsed: 1,
        hiddenCardsAtLumina: 3,
        calledLumina: 1,
      });
      assert.equal(typeof id, 'number');
      assert.ok(id >= 1);
    });

    it('should persist round stat data correctly', () => {
      const id = saveRoundStat(db, {
        sessionId,
        roundNumber: 2,
        playerName: 'Dave',
        roundScore: 5,
        attacksMade: 0,
        prismsUsed: 0,
        hiddenCardsAtLumina: 0,
        calledLumina: 0,
      });
      const row = db.prepare('SELECT * FROM round_stats WHERE id = ?').get(id);
      assert.equal(row.session_id, sessionId);
      assert.equal(row.round_number, 2);
      assert.equal(row.player_name, 'Dave');
      assert.equal(row.round_score, 5);
      assert.equal(row.attacks_made, 0);
      assert.equal(row.prisms_used, 0);
      assert.equal(row.hidden_cards_at_lumina, 0);
      assert.equal(row.called_lumina, 0);
    });

    it('should default optional numeric fields to 0', () => {
      const id = saveRoundStat(db, {
        sessionId,
        roundNumber: 3,
        playerName: 'Eve',
        roundScore: 12,
      });
      const row = db.prepare('SELECT * FROM round_stats WHERE id = ?').get(id);
      assert.equal(row.attacks_made, 0);
      assert.equal(row.prisms_used, 0);
      assert.equal(row.hidden_cards_at_lumina, 0);
      assert.equal(row.called_lumina, 0);
    });
  });

  describe('getHistory', () => {
    let db2;

    before(() => {
      // Use a separate database so we control the data exactly
      const path = 'data/test-history.db';
      if (existsSync(path)) unlinkSync(path);
      db2 = createDb(path);

      // Create 3 sessions with round stats
      for (let s = 1; s <= 3; s++) {
        const sid = saveSession(db2, {
          numPlayers: 2,
          numRounds: 2,
          winner: `Player${s}`,
          playerFinalScore: s * 10,
        });
        for (let r = 1; r <= 2; r++) {
          saveRoundStat(db2, {
            sessionId: sid,
            roundNumber: r,
            playerName: `Player${s}`,
            roundScore: s + r,
            attacksMade: r,
            prismsUsed: 0,
            hiddenCardsAtLumina: 1,
            calledLumina: r === 2 ? 1 : 0,
          });
        }
      }
    });

    after(() => {
      if (db2) db2.close();
      for (const suffix of ['', '-wal', '-shm']) {
        const f = 'data/test-history.db' + suffix;
        if (existsSync(f)) unlinkSync(f);
      }
    });

    it('should return an array of sessions', () => {
      const history = getHistory(db2, 10);
      assert.ok(Array.isArray(history));
      assert.equal(history.length, 3);
    });

    it('should respect the limit parameter', () => {
      const history = getHistory(db2, 2);
      assert.equal(history.length, 2);
    });

    it('should return sessions in descending order (most recent first)', () => {
      const history = getHistory(db2, 10);
      assert.ok(history[0].id > history[1].id);
      assert.ok(history[1].id > history[2].id);
    });

    it('should include round_stats for each session', () => {
      const history = getHistory(db2, 10);
      for (const session of history) {
        assert.ok(Array.isArray(session.rounds), 'session should have rounds array');
        assert.equal(session.rounds.length, 2, 'each session should have 2 rounds');
      }
    });

    it('should include correct round stat fields', () => {
      const history = getHistory(db2, 10);
      const round = history[0].rounds[0];
      assert.ok('roundNumber' in round);
      assert.ok('playerName' in round);
      assert.ok('roundScore' in round);
      assert.ok('attacksMade' in round);
      assert.ok('prismsUsed' in round);
      assert.ok('hiddenCardsAtLumina' in round);
      assert.ok('calledLumina' in round);
    });

    it('should return empty array when no sessions exist', () => {
      const emptyPath = 'data/test-empty.db';
      if (existsSync(emptyPath)) unlinkSync(emptyPath);
      const emptyDb = createDb(emptyPath);
      const history = getHistory(emptyDb, 10);
      assert.deepEqual(history, []);
      emptyDb.close();
      for (const suffix of ['', '-wal', '-shm']) {
        const f = emptyPath + suffix;
        if (existsSync(f)) unlinkSync(f);
      }
    });
  });
});
