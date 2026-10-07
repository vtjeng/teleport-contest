import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport } from './diff-fresh.mjs';

import {
    ECMD_TIME,
    GLIB,
    OBJ_FLOOR,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_SUGGEST,
    W_RINGL,
} from '../js/const.js';
import { grease_ok, use_grease } from '../js/apply.js';
import { CAN_OF_GREASE, COIN_CLASS, RING_CLASS } from '../js/objects.js';
import { game } from '../js/gstate.js';
import { getRngLog } from '../js/rng.js';
import { runSegment } from '../js/jsmain.js';

const applyC = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const greaseOkC = applyC.slice(
    applyC.indexOf('grease_ok(struct obj *obj)'),
    applyC.indexOf('/* getobj callback for object to rub on a known touchstone */'),
);

test('grease_ok preserves the source callback classifications', () => {
    assert.match(greaseOkC, /if \(!obj\)\s*return GETOBJ_SUGGEST;/u);
    assert.match(greaseOkC, /obj->oclass == COIN_CLASS\)\s*return GETOBJ_EXCLUDE;/u);
    assert.match(greaseOkC, /inaccessible_equipment\(obj, \(const char \*\) 0, FALSE\)/u);
    assert.match(greaseOkC, /return GETOBJ_EXCLUDE_INACCESS;/u);
    assert.match(greaseOkC, /return GETOBJ_SUGGEST;/u);

    assert.equal(grease_ok(null), GETOBJ_SUGGEST);
    assert.equal(grease_ok({ oclass: COIN_CLASS }), GETOBJ_EXCLUDE);

    const gloves = { owornmask: 1 };
    const ring = {
        oclass: RING_CLASS,
        owornmask: W_RINGL,
        cursed: 0,
        bknown: 0,
    };
    assert.equal(
        grease_ok(ring, { uarmg: gloves, uleft: ring }),
        GETOBJ_EXCLUDE_INACCESS,
    );
    assert.equal(grease_ok({ oclass: RING_CLASS }), GETOBJ_SUGGEST);
});

// C apply.c:use_grease checks Glib before charges or its rn2(2) gate. These
// ordinary-floor tests use the same canonical placement as the command caller.
test('Glib grease drops without injected operations or spending a charge', async () => {
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/apply.c/grease-cursed-slip-independent.session.json',
        import.meta.url), 'utf8'));
    await runSegment({ ...recipe.segments[0],
        moves: '\u0017uncursed can of grease (7)\n ' });
    const can = inventoryCan();
    const charges = can.spe;
    game.u.uprops[GLIB].intrinsic = 30; // Glib preempts the charged RNG arm.
    const rngBefore = getRngLog().length;
    assert.equal(await use_grease(can, game), ECMD_TIME);
    assert.equal(can.spe, charges);
    assert.equal(getRngLog().length, rngBefore);
    assert.equal(can.where, OBJ_FLOOR);
    assert.equal(can.ox, game.u.ux);
    assert.equal(can.oy, game.u.uy);
    assert.ok(game.level.objects[game.u.ux][game.u.uy]);
    assert.equal(inventoryCan(), undefined);
});

function inventoryCan() {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === CAN_OF_GREASE) return obj;
    return undefined;
}

test('grease slip retains caller overrides and redraws before encumbrance', async () => {
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/apply.c/grease-glib-slip-independent.session.json',
        import.meta.url), 'utf8'));
    await runSegment({ ...recipe.segments[0],
        moves: '\u0017uncursed can of grease (9)\n ' });
    const can = inventoryCan();
    game.u.uprops[GLIB].intrinsic = 30; // Enter C's first slip arm.
    const operations = [];
    await use_grease(can, game, { hooks: {
        newsym(x, y, state) {
            assert.equal(state, game);
            assert.deepEqual([x, y], [game.u.ux, game.u.uy]);
            assert.equal(can.where, OBJ_FLOOR); // Placement precedes newsym.
            operations.push('newsym');
        },
        encumberMessage(state) {
            assert.equal(state, game);
            operations.push('encumber_msg');
        },
    } });
    assert.deepEqual(operations, ['newsym', 'encumber_msg']);
});

test('use_grease source keeps Glib and charged slip before target selection', () => {
    const source = applyC.slice(applyC.indexOf('use_grease(struct obj *obj)'),
        applyC.indexOf('touchstone_ok(struct obj *obj)'));
    assert.match(source, /if \(Glib\)[\s\S]*?dropx\(obj\);[\s\S]*?return ECMD_TIME;/u);
    assert.match(source, /if \(\(obj->cursed \|\| Fumbling\) && !rn2\(2\)\) \{\s*consume_obj_charge\(obj, TRUE\);[\s\S]*?dropx\(obj\);\s*return ECMD_TIME;/u);
    assert.ok(source.indexOf('dropx(obj);') < source.indexOf('getobj("grease"'));
});

for (const [name, charges] of [
    ['grease-cursed-slip-independent', 6], // C consumes one of the wished 7 charges.
    ['grease-glib-slip-independent', 8], // Hands consume one of 9; Glib drop consumes none.
]) {
    test(`${name} matches recorded screens, cursors and RNG through doapply`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/apply.c/${name}.session.json`, import.meta.url), 'utf8'));
        const output = await runSegment(recording.segments[0]);
        const result = compareSessionOutputs(recording, {
            rng: output.getRngLog(), screens: output.getScreens(),
            cursors: output.getCursors(),
            animFrames: output.getAnimationFramesByStep(),
        });
        assert.equal(result.passed, true, formatReport(result));
        assert.equal(inventoryCan(), undefined);
        let can;
        for (let obj = game.level.objects[game.u.ux][game.u.uy]; obj;
            obj = obj.nexthere) {
            if (obj.otyp === CAN_OF_GREASE) can = obj;
        }
        assert.ok(can);
        assert.equal(can.where, OBJ_FLOOR);
        assert.equal(can.spe, charges);
    });
}
