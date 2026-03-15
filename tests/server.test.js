import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../server.js';

const TEST_DB = 'data/test-server.db';

describe('Express server', () => {
  let server;
  let port;
  let db;
  let baseUrl;

  before(async () => {
    // Clean up any leftover test DB
    try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }

    const result = await startServer(0, TEST_DB);
    server = result.server;
    port = result.port;
    db = result.db;
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (db) {
      db.close();
    }
    try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
  });

  it('GET / serves index.html', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes('<title>LUMINA</title>'), 'should contain LUMINA title');
    assert.ok(body.includes('setup-screen'), 'should contain setup screen element');
  });

  it('POST /api/stats/save saves session and returns sessionId', async () => {
    const payload = {
      session: {
        numPlayers: 2,
        numRounds: 3,
        winner: 'Player',
        playerFinalScore: 205,
      },
      rounds: [
        {
          roundNumber: 1,
          playerName: 'Player',
          roundScore: 80,
          attacksMade: 1,
          prismsUsed: 2,
          hiddenCardsAtLumina: 0,
          calledLumina: 1,
        },
        {
          roundNumber: 2,
          playerName: 'Player',
          roundScore: 65,
          attacksMade: 0,
          prismsUsed: 1,
          hiddenCardsAtLumina: 1,
          calledLumina: 0,
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/stats/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(typeof data.sessionId === 'number', 'sessionId should be a number');
    assert.ok(data.sessionId > 0, 'sessionId should be positive');
  });

  it('GET /api/stats/history returns saved sessions with rounds', async () => {
    const res = await fetch(`${baseUrl}/api/stats/history`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data), 'response should be an array');
    assert.ok(data.length >= 1, 'should have at least one session');

    const session = data[0];
    assert.equal(session.numPlayers, 2);
    assert.equal(session.numRounds, 3);
    assert.equal(session.winner, 'Player');
    assert.equal(session.playerFinalScore, 205);
    assert.ok(Array.isArray(session.rounds), 'session should have rounds array');
    assert.equal(session.rounds.length, 2, 'should have 2 rounds');

    const round = session.rounds[0];
    assert.equal(round.roundNumber, 1);
    assert.equal(round.playerName, 'Player');
    assert.equal(round.roundScore, 80);
    assert.equal(round.attacksMade, 1);
    assert.equal(round.prismsUsed, 2);
    assert.equal(round.calledLumina, 1);
  });

  it('POST /api/stats/save returns 400 on missing session data', async () => {
    const res = await fetch(`${baseUrl}/api/stats/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rounds: [] }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error, 'should have an error message');
  });
});
