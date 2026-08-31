import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { COLNO, ROWNO } from '../js/const.js';
import {
    glyph_is_invisible,
    glyph_is_monster,
    glyph_is_object,
    glyph_is_trap,
} from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';

const recipe = JSON.parse(readFileSync(
    'recipes/terrain-known-map-projection-fresh.session.json',
    'utf8',
));

test('terrain recipe is a fresh save/restore witness with no answers', () => {
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 2);
    assert.equal(recipe.segments[0].moves.at(-2), 'S');
    assert.equal(recipe.segments[0].moves.at(-1), 'y');
    assert.equal(recipe.segments[1].moves, '\x7f ');
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('DEL opens terrain and TER_MAP strips live display layers without time', async () => {
    assert.ok(ADMITTED_COMMANDS.includes('terrain'));
    const storage = new InMemoryStorage();
    await runSegment({ ...recipe.segments[0], storage });
    const savedMoves = game.moves;
    let boundary = null;
    await runSegment({ ...recipe.segments[1], storage }, {
        onBoundary: (error) => { boundary = error; },
    });

    assert.match(
        boundary?.reason ?? '',
        /browse_map\/getpos integration/u,
    );
    assert.equal(game.moves, savedMoves);
    assert.equal(game.context.move, 0);
    assert.equal(game.u.uinwater, 0);
    assert.equal(game.u.uburied, 0);
    assert.equal(game.u.uswallow, 0);
    assert.equal(game.nhDisplay.topMessage, 'Showing known terrain only...');

    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const glyph = game.level.at(x, y).disp_glyph?.glyph;
            assert.equal(glyph_is_monster(glyph), false, `${x},${y}`);
            assert.equal(glyph_is_object(glyph), false, `${x},${y}`);
            assert.equal(glyph_is_trap(glyph), false, `${x},${y}`);
            assert.equal(glyph_is_invisible(glyph), false, `${x},${y}`);
        }
    }
});

test('a non-default terrain choice remains fail-closed', async () => {
    let boundary = null;
    await runSegment({
        seed: 1789,
        datetime: '20001018090000',
        nethackrc: 'OPTIONS=name:TerrainChoice,role:Rogue,race:human,gender:male,align:chaotic\nOPTIONS=!legacy,!tutorial,!splash_screen\n',
        moves: '   \x7fb',
    }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.match(boundary?.reason ?? '', /terrain menu choice 2/u);
});
