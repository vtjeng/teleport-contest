// Source-pinned tests for end.c's life-saving amulet arm and savelife().
// The production-style case puts a wished-for equivalent object in the worn
// slot, then reaches done() through the same lethal self-zap setup used by the
// independent recording. This keeps object cleanup and the in-memory event in
// the test rather than treating the LIFESAVED property as a fixture toggle.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DIED,
    LIFESAVED,
    OBJ_DELETED,
    W_AMUL,
} from '../js/const.js';
import { done } from '../js/end.js';
import { game } from '../js/gstate.js';
import { addinv } from '../js/invent.js';
import { mksobj } from '../js/obj.js';
import { runSegment } from '../js/jsmain.js';
import { AMULET_OF_LIFE_SAVING } from '../js/objects.js';
import { _doWearInternals } from '../js/do_wear.js';

const { Amulet_on } = _doWearInternals;
const END_C = readFileSync(
    new URL('../nethack-c/upstream/src/end.c', import.meta.url), 'utf8',
);

const NETHACKRC = [
    'OPTIONS=name:LifePinned,role:Wizard,race:human,gender:male,align:neutral,playmode:debug',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup',
    '',
].join('\n');

function dismissMore(count = 100) {
    for (let i = 0; i < count; i++)
        game.nhDisplay.pushKey(0x20);
}

async function freshHero() {
    await runSegment({
        seed: 922000,
        datetime: '20310922101500',
        nethackrc: NETHACKRC,
        moves: '',
    });
}

test('end.c life-saving arm keeps its source order', () => {
    const start = END_C.indexOf('if (Lifesaved && (how <= GENOCIDED))');
    const end = END_C.indexOf(
        '/* explore and wizard modes offer', start,
    );
    assert.ok(start >= 0 && end > start, 'life-saving arm exists in C');
    const arm = END_C.slice(start, end);
    let previous = -1;
    for (const sourceCall of [
        'pline("But wait...")',
        'makeknown(AMULET_OF_LIFE_SAVING)',
        'Your("medallion %s!"',
        'useup(uamul)',
        'adjattrib(A_CON, -1, TRUE)',
        'savelife(how)',
        'livelog_printf(LL_LIFESAVE',
    ]) {
        const offset = arm.indexOf(sourceCall);
        assert.ok(offset > previous, `${sourceCall} stays source-ordered`);
        previous = offset;
    }
});

test('a worn life-saving amulet is consumed by done and restores the hero',
    async () => {
    await freshHero();
    dismissMore();
    const amulet = mksobj(
        AMULET_OF_LIFE_SAVING, false, false, { state: game },
    );
    addinv(amulet, { state: game });
    await Amulet_on(amulet, game);
    assert.equal(game.uamul, amulet);
    assert.equal(amulet.owornmask & W_AMUL, W_AMUL);
    assert.ok(game.u.uprops[LIFESAVED].extrinsic & W_AMUL);

    dismissMore();
    game.killer = { name: 'a falling rock trap', format: 1 };
    await done(DIED, game);

    assert.equal(game.uamul, null, 'useup removes the worn amulet');
    assert.equal(amulet.where, OBJ_DELETED, 'useup frees the object');
    assert.equal(amulet.owornmask, 0);
    assert.equal(game.u.uprops[LIFESAVED].extrinsic, 0);
    assert.ok(game.u.uhp > 0, 'savelife restores positive hit points');
    assert.equal(game.u.umortality, 1);
    assert.equal(game.killer.name, '');
    assert.equal(game.nomovemsg, 'You survived that attempt on your life.');
    assert.ok(game.gamelog.some((entry) => (
        entry.text === 'averted death (killed by a falling rock trap)'
    )));
});

test('the blind message is selected before the life-saving glow', async () => {
    await freshHero();
    dismissMore();
    const amulet = mksobj(
        AMULET_OF_LIFE_SAVING, false, false, { state: game },
    );
    addinv(amulet, { state: game });
    await Amulet_on(amulet, game);
    game.u.uprops[15].intrinsic = 1;
    dismissMore();
    game.killer = { name: 'a falling rock trap', format: 1 };
    await done(DIED, game);
    assert.match(game._ttyToplines, /medallion crumbles to dust/u);
    assert.equal(game.uamul, null);
});
