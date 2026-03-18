import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, createDeck } from '../public/cards.js';

describe('Card and Deck module', () => {
  describe('COLORS', () => {
    it('should export exactly 4 colors', () => {
      assert.equal(COLORS.length, 4);
    });

    it('should contain blue, violet, orange, green', () => {
      assert.deepEqual(COLORS.slice().sort(), ['blue', 'green', 'orange', 'violet']);
    });
  });

  describe('createDeck', () => {
    it('should return a deck of exactly 112 cards', () => {
      const deck = createDeck();
      assert.equal(deck.length, 112);
    });

    it('should contain 96 vector cards (values 1-12, 4 colors, 2 copies)', () => {
      const deck = createDeck();
      const vectors = deck.filter(
        (c) => c.value >= 1 && c.value <= 12 && COLORS.includes(c.color)
      );
      assert.equal(vectors.length, 96);
    });

    it('should have exactly 2 copies of each value/color combination', () => {
      const deck = createDeck();
      for (const color of COLORS) {
        for (let v = 1; v <= 12; v++) {
          const count = deck.filter(
            (c) => c.value === v && c.color === color
          ).length;
          assert.equal(count, 2, `expected 2 copies of ${color} ${v}, got ${count}`);
        }
      }
    });

    it('should contain 8 multicolor -2 cards', () => {
      const deck = createDeck();
      const multi = deck.filter(
        (c) => c.value === -2 && c.color === 'multicolor'
      );
      assert.equal(multi.length, 8);
    });

    it('should contain 8 colorless 15 cards', () => {
      const deck = createDeck();
      const colorless = deck.filter(
        (c) => c.value === 15 && c.color === null
      );
      assert.equal(colorless.length, 8);
    });

    it('should shuffle the deck (different order on successive calls)', () => {
      const deck1 = createDeck();
      const deck2 = createDeck();
      // With 112 cards, the probability of identical order is astronomically low.
      // Compare stringified versions.
      const s1 = JSON.stringify(deck1);
      const s2 = JSON.stringify(deck2);
      assert.notEqual(s1, s2, 'two decks should not have the same order');
    });

    it('should return plain objects with only value and color properties', () => {
      const deck = createDeck();
      for (const card of deck) {
        const keys = Object.keys(card).sort();
        assert.deepEqual(keys, ['color', 'value']);
      }
    });

    it('should accept config to customize card range', () => {
      const deck = createDeck({ cardMin: 1, cardMax: 5 });
      const vectors = deck.filter(
        (c) => c.value >= 1 && c.value <= 5 && COLORS.includes(c.color)
      );
      assert.equal(vectors.length, 40);
      assert.equal(deck.length, 56);
    });

    it('should accept config to customize negative card value', () => {
      const deck = createDeck({ negativeValue: -5 });
      const multi = deck.filter((c) => c.value === -5 && c.color === 'multicolor');
      assert.equal(multi.length, 8);
      const oldMulti = deck.filter((c) => c.value === -2 && c.color === 'multicolor');
      assert.equal(oldMulti.length, 0);
    });

    it('should accept config to customize top card value', () => {
      const deck = createDeck({ topValue: 20 });
      const top = deck.filter((c) => c.value === 20 && c.color === null);
      assert.equal(top.length, 8);
      const oldTop = deck.filter((c) => c.value === 15 && c.color === null);
      assert.equal(oldTop.length, 0);
    });

    it('should use defaults when config is empty or omitted', () => {
      const deck1 = createDeck();
      const deck2 = createDeck({});
      assert.equal(deck1.length, 112);
      assert.equal(deck2.length, 112);
    });
  });
});
