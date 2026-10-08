import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { doengrave_sfx_item_WAN } from '../js/engrave.js';
import { ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { WAN_STASIS } from '../js/objects.js';
import { initRng } from '../js/rng.js';

const engravingC = readFileSync('nethack-c/upstream/src/engrave.c', 'utf8');
const engravingJs = readFileSync('js/engrave.js', 'utf8');
const zapC = readFileSync('nethack-c/upstream/src/zap.c', 'utf8');

test('all six source NODIR engraving arms await the canonical wand effect', () => {
    const c = engravingC.slice(engravingC.indexOf('doengrave_sfx_item_WAN(struct'),
        engravingC.indexOf('case WAN_STRIKING:', engravingC.indexOf('doengrave_sfx_item_WAN(struct')));
    const js = engravingJs.slice(engravingJs.indexOf('export async function doengrave_sfx_item_WAN'),
        engravingJs.indexOf('case WAN_STRIKING:', engravingJs.indexOf('export async function doengrave_sfx_item_WAN')));
    // engrave.c:589-597 groups exactly these charged nondirectional wand arms.
    const types = ['WAN_LIGHT', 'WAN_SECRET_DOOR_DETECTION', 'WAN_STASIS',
        'WAN_CREATE_MONSTER', 'WAN_WISHING', 'WAN_ENLIGHTENMENT'];
    assert.deepEqual([...c.matchAll(/case (WAN_[A-Z_]+):/gu)].map(x => x[1]), types);
    assert.deepEqual([...js.matchAll(/case (WAN_[A-Z_]+):/gu)].map(x => x[1]), types);
    assert.match(c, /zapnodir\(de->otmp\);/u);
    assert.match(js, /await zapnodir\(otmp, state, \{ rn1, rn2, \.\.\.env\.random \}\);/u);
    assert.doesNotMatch(js, /note_unported\('zap\.c zapnodir'\)/u);
});

test('engraving forwards the source stasis draw and publishes its deadline', async () => {
    // An ordinary floor avoids every unrelated engraving terrain branch.
    const level = new GameMap();
    level.at(10, 10).typ = ROOM;
    const state = { moves: 70, level,
        u: { ux: 10, uy: 10, uz: { dnum: 0, dlevel: 1 }, uprops: [] },
        youmonst: { data: {} } };
    // Nonzero move count and shorter existing deadline expose source ordering.
    state.level.flags.stasis_until = 80;
    const calls = [];
    const random = { rn1(range, base) {
        calls.push([range, base]);
        return 25; // Within source rn1(21,10), yielding deadline 95.
    } };
    assert.match(zapC, /svm\.moves \+ \(long\) rn1\(21, 10\)/u);
    await doengrave_sfx_item_WAN({ otmp: { otyp: WAN_STASIS } }, state, { random });
    assert.deepEqual(calls, [[21, 10]]);
    assert.equal(state.level.flags.stasis_until, 95);
    // Source chooses max(current deadline, newly rolled deadline).
    state.level.flags.stasis_until = 120;
    await doengrave_sfx_item_WAN({ otmp: { otyp: WAN_STASIS } }, state, { random });
    assert.deepEqual(calls, [[21, 10], [21, 10]]);
    assert.equal(state.level.flags.stasis_until, 120);
});

test('the production partial engraving RNG admits stasis through canonical rn1', async () => {
    initRng(1402811); // Independently chosen stable seed for the canonical draw.
    const level = new GameMap();
    level.flags.stasis_until = 0; // C initializes a fresh level without stasis.
    level.at(10, 10).typ = ROOM; // Ordinary dry floor, outside specialized terrain.
    const state = { moves: 70, level,
        u: { ux: 10, uy: 10, uz: { dnum: 0, dlevel: 1 }, uprops: [] },
        youmonst: { data: {} } };
    // cmd.c's E-command supplies rn2/rnd but no rn1. The caller completes
    // zapnodir's source RNG contract without changing the command owner.
    await doengrave_sfx_item_WAN({ otmp: { otyp: WAN_STASIS } }, state,
        { random: { rn2: () => assert.fail('STASIS only consumes rn1(21,10)') } });
    assert.ok(state.level.flags.stasis_until >= 80); // moves + source minimum 10.
    assert.ok(state.level.flags.stasis_until <= 100); // moves + source maximum 30.
});
