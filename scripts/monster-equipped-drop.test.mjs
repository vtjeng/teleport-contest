import assert from 'node:assert/strict';
import test from 'node:test';

import { W_ARMH } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    CORPSE,
    CHEST,
    DWARVISH_CLOAK,
    ORCISH_DAGGER,
    ORCISH_HELM,
    POT_SLEEPING,
    SCR_IDENTIFY,
} from '../js/objects.js';
import {
    DROP_DATETIME,
    loadEquippedDropRecipe,
} from './run-monster-equipped-drop.mjs';

// cmd.c's vi-key bindings, restricted to the directions these segments press.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

// monsters.h PM_GOBLIN. makemon.c m_initweap():410-412 is the only thing on
// D:1 that puts armor on a monster, and it only ever reaches an orc.
const PM_GOBLIN = 70;

test('the equipped-drop matrix contains only source-selected inputs', () => {
    const recipe = loadEquippedDropRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 7);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.equal(segment.datetime, DROP_DATETIME);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // A pet next to a hostile reaches dogmove.c's own attack, which is
        // refused, and autopickup would lift the pile the last key reads back.
        assert.match(segment.nethackrc, /pettype:none,!acoustics,!autopickup/u);
        // Movement keys up to the last, which is always ':' for dolook().
        assert.equal(segment.moves.at(-1), ':');
        assert.ok(
            [...segment.moves.slice(0, -1)]
                .every((key) => Object.hasOwn(DIRECTIONS, key)),
            'the keys before the look are movement keys',
        );
    }
});

// One row per segment, in recipe order. Every figure was read off a port replay
// and then confirmed against a fresh C recording by
// `node scripts/run-monster-equipped-drop.mjs`, which passed with 7 segments,
// 19301 PRNG calls, 29 screens and 29 cursors.
//
// `pack` is the target's minvent before the first key, head first, as
// [otyp, owornmask]; relobj() walks it in that order. `before` is what the
// target's square already held. `pile` is what it holds after the last key,
// outermost first, which is the order place_object()'s prepend leaves: the
// object dropped last is the head, and xkilled()'s own treasure drop and
// corpse land after everything relobj() put down.
const ROWS = [
    {
        // A bare square, a pack holding nothing but the worn helm, and no
        // corpse: one object leaves minvent equipped and nothing else moves.
        seed: 3146311,
        target: [24, 4],
        pack: [[ORCISH_HELM, W_ARMH]],
        before: [],
        pile: [ORCISH_HELM],
        hero: [24, 4],
    },
    {
        // The corpse goes down after the release, so it is the pile head and
        // the helm sits below it.
        seed: 3141874,
        target: [24, 15],
        pack: [[ORCISH_HELM, W_ARMH]],
        before: [],
        pile: [CORPSE, ORCISH_HELM],
        hero: [24, 15],
    },
    {
        // Both kinds of drop on one turn. The dagger is minvent's head and is
        // not worn, so relobj() releases it through the path that already
        // worked and the helm through the new one; the helm ends up above it.
        // The scroll is xkilled()'s treasure drop, placed after both.
        seed: 3142918,
        target: [15, 5],
        pack: [[ORCISH_DAGGER, 0], [ORCISH_HELM, W_ARMH]],
        before: [],
        pile: [SCR_IDENTIFY, ORCISH_HELM, ORCISH_DAGGER],
        hero: [15, 5],
    },
    {
        // The square already holds a chest, so stackobj() walks a pile that is
        // not empty; the helm cannot merge with it and settles above it.
        seed: 4770760,
        target: [15, 14],
        pack: [[ORCISH_HELM, W_ARMH]],
        before: [CHEST],
        pile: [CORPSE, ORCISH_HELM, CHEST],
        hero: [15, 14],
    },
    {
        // The same two-object pack under a Samurai's katana.
        seed: 4772000,
        target: [42, 4],
        pack: [[ORCISH_DAGGER, 0], [ORCISH_HELM, W_ARMH]],
        before: [],
        pile: [CORPSE, ORCISH_HELM, ORCISH_DAGGER],
        hero: [42, 4],
    },
    {
        // A Rogue's short sword, a potion already on the square, and no corpse.
        seed: 8880650,
        target: [33, 4],
        pack: [[ORCISH_DAGGER, 0], [ORCISH_HELM, W_ARMH]],
        before: [POT_SLEEPING],
        pile: [ORCISH_HELM, ORCISH_DAGGER, POT_SLEEPING],
        hero: [33, 4],
    },
    {
        // A goblin that survives the first blow, so the release happens on the
        // turn after the one every row above uses. The cloak is the treasure
        // drop and the corpse follows it.
        seed: 8880472,
        target: [6, 4],
        pack: [[ORCISH_HELM, W_ARMH]],
        before: [],
        pile: [CORPSE, DWARVISH_CLOAK, ORCISH_HELM],
        hero: [6, 4],
    },
];

function pileAt(x, y) {
    const otyps = [];
    for (let obj = game.level.objects[x][y]; obj; obj = obj.nexthere)
        otyps.push(obj.otyp);
    return otyps;
}

test('every matrix segment lands the worn helm on the square', async () => {
    const segments = loadEquippedDropRecipe().segments;
    assert.equal(segments.length, ROWS.length);

    for (const [index, segment] of segments.entries()) {
        const row = ROWS[index];
        assert.equal(segment.seed, row.seed, `row ${index} seed`);
        const label = `seed ${row.seed}`;

        // The setup half: replay the same segment with no keys, so the target
        // and its pack are read before any blow lands.
        await runSegment({ ...segment, moves: '' });
        const [dx, dy] = DIRECTIONS[segment.moves[0]];
        assert.deepEqual(
            [game.u.ux + dx, game.u.uy + dy], row.target, `${label} target`,
        );
        const [tx, ty] = row.target;
        const target = game.level.monsters[tx][ty];
        assert.equal(target.mnum, PM_GOBLIN, `${label} species`);
        // mon.h stores mtame as a small count of tameness, so a hostile is 0.
        assert.equal(target.mtame, 0, `${label} hostility`);
        assert.equal(target.misc_worn_check & W_ARMH, W_ARMH, `${label} worn`);
        const pack = [];
        for (let obj = target.minvent; obj; obj = obj.nobj)
            pack.push([obj.otyp, obj.owornmask]);
        assert.deepEqual(pack, row.pack, `${label} pack`);
        assert.deepEqual(pileAt(tx, ty), row.before, `${label} before`);

        // The kill itself, followed by the step onto the square that runs
        // pickup.c look_here() and the ':' that runs dolook().
        const boundaries = [];
        await runSegment(segment, {
            onBoundary: (error) => boundaries.push(String(error?.message)),
        });
        assert.deepEqual(boundaries, [], `${label} boundaries`);
        assert.equal(game.level.monsters[tx][ty], null, `${label} corpse gone`);
        assert.deepEqual(pileAt(tx, ty), row.pile, `${label} pile`);
        assert.deepEqual([game.u.ux, game.u.uy], row.hero, `${label} hero`);
        // worn.c extract_from_minvent():1403 clears owornmask on the way out,
        // so nothing on the floor is still marked as worn.
        for (let obj = game.level.objects[tx][ty]; obj; obj = obj.nexthere)
            assert.equal(obj.owornmask, 0, `${label} owornmask cleared`);
    }
});
