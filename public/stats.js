/** @module stats – Stats API client for LUMINA */

/**
 * Save game statistics to the server.
 * @param {object} session – session metadata (date, players, winner, etc.)
 * @param {Array} rounds – array of round-by-round scoring data
 * @returns {Promise<object>}
 */
export async function saveGameStats(session, rounds) {
  const res = await fetch('/api/stats/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, rounds }),
  });
  return res.json();
}

/**
 * Fetch game history from the server.
 * @returns {Promise<object>}
 */
export async function fetchHistory() {
  const res = await fetch('/api/stats/history');
  return res.json();
}
