/** @module cards – Card and Deck utilities for LUMINA */

export const COLORS = ['blue', 'violet', 'orange', 'green'];

/**
 * Fisher-Yates (Knuth) in-place shuffle.
 * @param {Array} array
 * @returns {Array} the same array, shuffled
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Create and shuffle a 112-card LUMINA deck.
 *
 * Composition:
 *  - 96 Vector cards: values 1-12, 4 colors, 2 copies each
 *  -  8 Multicolor -2 cards
 *  -  8 Colorless 15 cards
 *
 * @returns {{ value: number, color: string|null }[]}
 */
export function createDeck() {
  const deck = [];

  // 96 vector cards: 12 values x 4 colors x 2 copies
  for (const color of COLORS) {
    for (let value = 1; value <= 12; value++) {
      deck.push({ value, color });
      deck.push({ value, color });
    }
  }

  // 8 multicolor -2 cards
  for (let i = 0; i < 8; i++) {
    deck.push({ value: -2, color: 'multicolor' });
  }

  // 8 colorless 15 cards
  for (let i = 0; i < 8; i++) {
    deck.push({ value: 15, color: null });
  }

  return shuffle(deck);
}
