import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { game, resetGame } from '../js/gstate.js';
import { initUnported, note_unported } from '../js/unported.js';

describe('unported', () => {
    test('initUnported creates an empty set on game', () => {
        resetGame();
        initUnported();
        assert.ok(game.unported instanceof Set);
        assert.equal(game.unported.size, 0);
    });

    test('note_unported records a function name', () => {
        resetGame();
        initUnported();
        note_unported('some_function');
        assert.ok(game.unported.has('some_function'));
        assert.equal(game.unported.size, 1);
    });

    test('note_unported deduplicates repeated calls', () => {
        resetGame();
        initUnported();
        note_unported('dosit');
        note_unported('dosit');
        assert.equal(game.unported.size, 1);
    });

    test('note_unported creates the set when initUnported was not called', () => {
        resetGame();
        note_unported('fallback');
        assert.ok(game.unported instanceof Set);
        assert.ok(game.unported.has('fallback'));
    });
});
