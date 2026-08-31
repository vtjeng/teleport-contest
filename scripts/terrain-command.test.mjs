import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { TIP_GETPOS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';

const recipe = JSON.parse(readFileSync(
    'recipes/terrain-browse-map-getpos-tip-redisplay-fresh.session.json',
    'utf8',
));

test('terrain recipe is a fresh witness with no recorded answers', () => {
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(recipe.segments[0].moves, '   \x7f : \n ');
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('DEL browses TER_MAP and restores the live map without time', async () => {
    assert.ok(ADMITTED_COMMANDS.includes('terrain'));
    const storage = new InMemoryStorage();
    let boundary = null;
    const result = await runSegment({ ...recipe.segments[0], storage }, {
        onBoundary: (error) => { boundary = error; },
    });

    assert.equal(boundary, null);
    assert.equal(game.context.move, 1);
    assert.equal(game.iflags.terrainmode, 0);
    assert.equal(game.iflags.autodescribe, true);
    assert.equal(game.context.tips & (1 << TIP_GETPOS), 1 << TIP_GETPOS);
    assert.equal(game.nhDisplay.topMessage, 'Done.');
    assert.equal(result.getScreens().length, 10);
    assert.equal(Boolean(game.u.uinwater), false);
    assert.equal(Boolean(game.u.uburied), false);
    assert.equal(Boolean(game.u.uswallow), false);
    assert.ok(game.level.at(game.u.ux, game.u.uy).disp_glyph);
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
