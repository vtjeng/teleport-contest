// restore.c getlev() rebuilds several of a level's lists with readers that
// push each saved record onto the front of the list, so a restored list is
// the reverse of the one savelev() wrote. These tests pin that order for the
// lists whose order no cheap recorded play shows; the recipes under
// recipes/restore.c/ cover the others.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';

const source = (file) => readFileSync(
    new URL(`../nethack-c/upstream/src/${file}`, import.meta.url), 'utf8');

// A debug Tourist, so that ^V can leave and re-enter the first level and a
// restore needs no account check. Seed 6620417 is the first seed tried whose
// first level has three random engravings; the date is arbitrary.
const SCRIBE = {
    seed: 6620417,
    datetime: '20360205140000',
    nethackrc: 'OPTIONS=name:Scribe,role:Tourist,race:human,gender:male,'
        + 'align:neutral,playmode:debug\n'
        + 'OPTIONS=!tutorial,!legacy,!splash_screen,pettype:none,!autopickup\n',
};

function engravingSquares(state = game) {
    const squares = [];
    for (let ep = state.head_engr; ep; ep = ep.nxt_engr)
        squares.push(`${ep.engr_x},${ep.engr_y}`);
    return squares;
}

// engrave.c rest_engravings() pushes each engraving it reads onto
// head_engr. An engraving's place in the chain decides nothing a player
// sees: make_engr_at() keeps one engraving per square, so engr_at() finds
// the same one in any order, and the other walks only count them or mark
// each one. The order is pinned here instead of by a recipe.
test('a level the hero returns to has its engravings in reverse', async () => {
    assert.match(source('engrave.c'),
        /ep->nxt_engr = head_engr;\s*head_engr = ep;\s*ep->engr_txt\[actual_text\] = engr_text_space\(ep\);/u);
    // ESC dismisses the welcome message's --More--.
    await runSegment({ ...SCRIBE, moves: '\u001b', storage: new InMemoryStorage() });
    const made = engravingSquares();
    assert.equal(made.length, 3);
    // ^V2 and ^V1: savelev() keeps the first level, getlev() reads it back.
    await runSegment({ ...SCRIBE, moves: '\u001b\u00162\n\u001b\u00161\n\u001b',
        storage: new InMemoryStorage() });
    assert.equal(game.u.uz.dlevel, 1);
    assert.deepEqual(engravingSquares(), [...made].reverse());
});

test('a whole-game restore has the hero level\'s engravings in reverse', async () => {
    const storage = new InMemoryStorage();
    await runSegment({ ...SCRIBE, moves: '\u001bSy', storage });
    const saved = engravingSquares();
    assert.equal(saved.length, 3);
    // The second process restores; n declines to keep the debug save file.
    await runSegment({ ...SCRIBE, seed: SCRIBE.seed + 1, moves: ' n', storage });
    assert.deepEqual(engravingSquares(), [...saved].reverse());
});
