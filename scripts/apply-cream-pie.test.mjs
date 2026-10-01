import assert from 'node:assert/strict';
import test from 'node:test';

import { doapply } from '../js/apply.js';
import {
    BLINDED,
    ECMD_OK,
    HALLUC,
    OBJ_DELETED,
    OBJ_INVENT,
    TIMEOUT,
    W_TOOL,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { can_blnd, haseyes } from '../js/mondata.js';
import { AT_WEAP, M1_NOEYES } from '../js/monsters.js';
import { CREAM_PIE } from '../js/objects.js';
import { splitobj, weight } from '../js/obj.js';
import { make_blinded } from '../js/potion.js';
import { getRngLog } from '../js/rng.js';
import {
    loadApplyCreamPieRecipe,
    WISH_ONLY,
} from './run-apply-cream-pie.mjs';

function recipeSegment() {
    // The matrix has one segment because debug recordings cannot share an
    // install chunk. Pinning that cardinality prevents this helper from
    // silently selecting a different case if the matrix later changes.
    const recipe = loadApplyCreamPieRecipe();
    assert.equal(recipe.segments.length, 1);
    return recipe.segments[0];
}

async function wishForPie() {
    await runSegment({ ...recipeSegment(), moves: WISH_ONLY });
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === CREAM_PIE) return obj;
    }
    assert.fail('the wizard wish did not create a cream pie');
    return null;
}

function queue(...keys) {
    for (const key of keys) game.nhDisplay.pushKey(key.charCodeAt(0));
}

test('can_blnd admits a cream pie against an unprotected hero with eyes',
    async () => {
    const pie = await wishForPie();

    // mondata.c:305-354. AT_WEAP with a cream pie admits the sighted hero;
    // W_TOOL in EBlinded models the blindfold that rejects the same attack.
    assert.equal(haseyes(game.youmonst.data), true);
    assert.equal(can_blnd(null, game.youmonst, AT_WEAP, pie, game), true);
    game.u.uprops[BLINDED].extrinsic = W_TOOL;
    assert.equal(can_blnd(null, game.youmonst, AT_WEAP, pie, game), false);

    // M1_NOEYES is can_blnd()'s first guard, before attack type or object.
    game.u.uprops[BLINDED].extrinsic = 0;
    const originalSpecies = game.youmonst.data;
    game.youmonst.data = {
        ...originalSpecies,
        mflags1: originalSpecies.mflags1 | M1_NOEYES,
    };
    assert.equal(can_blnd(null, game.youmonst, AT_WEAP, pie, game), false);
});

test('make_blinded performs the talk-false sighted-to-blind transition',
    async () => {
    await runSegment({ ...recipeSegment(), moves: '.' });

    // Seven is an interior timeout that exercises replacement without either
    // itimeout() clamp. potion.c:261-331 sets it and toggles vision once.
    await make_blinded(7, false, game);

    assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 7);
    assert.equal(game.u.uprops[BLINDED].extrinsic, 0);
    assert.equal(game.disp.botl, true);
});

test('doapply creams and blinds the hero before deleting one ordinary pie',
    async () => {
    const pie = await wishForPie();
    const drawsBefore = getRngLog().length;

    // The first space clears the wish message left pending by the direct
    // replay. The pie's actual inventory letter answers getobj(); the second
    // space dismisses the More prompt between the two source-ordered lines.
    queue(' ', pie.invlet, ' ');
    assert.equal(await doapply(game), ECMD_OK);

    const timeout = game.u.uprops[BLINDED].intrinsic & TIMEOUT;
    assert.equal(game.u.ucreamed, timeout);
    assert.ok(timeout >= 1 && timeout <= 25,
        `rnd(25) produced an out-of-range timeout: ${timeout}`);
    assert.equal(game.u.uprops[BLINDED].extrinsic, 0);
    assert.equal(pie.where, OBJ_DELETED);
    assert.ok(!Array.from(function* inventory() {
        for (let obj = game.invent; obj; obj = obj.nobj) yield obj;
    }()).includes(pie));
    assert.equal(
        game._pending_message,
        "You can't see through all the sticky goop on your face.",
    );

    // apply.c draws the duration before invent.c delobj() reaches
    // zap.c obj_resists(). No other random call belongs to the command.
    const calls = getRngLog().slice(drawsBefore).map(
        (entry) => entry.slice(0, entry.indexOf('=')),
    );
    assert.deepEqual(calls, ['rnd(25)', 'rn2(100)']);
});

test('doapply splits a cream-pie stack and consumes only the returned child',
    async () => {
    const pie = await wishForPie();
    pie.quan = 2;
    pie.owt = weight(pie, { state: game });
    const drawsBefore = getRngLog().length;
    queue(' ', pie.invlet, ' ');

    assert.equal(await doapply(game), ECMD_OK);

    // apply.c splits one object before describing it, then destroys the
    // returned child. The remaining inventory object keeps its original id.
    assert.equal(pie.quan, 1);
    assert.equal(pie.where, OBJ_INVENT);
    assert.equal(pie.nobj, null);
    assert.equal(pie.owt, weight(pie, { state: game }));
    assert.equal(game.u.ucreamed,
        game.u.uprops[BLINDED].intrinsic & TIMEOUT);
    assert.equal(game._pending_message,
        "You can't see through all the sticky goop on your face.");

    // splitobj -> nextoid's rnd(2), use_cream_pie's rnd(25), then delobj's
    // obj_resists rn2(100), in the exact source order.
    const calls = getRngLog().slice(drawsBefore).map(
        (entry) => entry.slice(0, entry.indexOf('=')),
    );
    assert.deepEqual(calls, ['rnd(2)', 'rnd(25)', 'rn2(100)']);
});

test('splitobj preserves the returned child and names C splitbill as a void gap',
    async () => {
    const pie = await wishForPie();
    pie.quan = 2;
    pie.unpaid = true;
    pie.owt = weight(pie, { state: game });

    const child = splitobj(pie, 1, { state: game });

    // mkobj.c splitobj returns the child after setting context IDs and placing
    // it immediately after its parent. shk.c splitbill is void and absent, so
    // the call is recorded as a gap rather than replaced with a fake bill.
    assert.equal(pie.quan, 1);
    assert.equal(child.quan, 1);
    assert.equal(child.unpaid, true);
    assert.equal(pie.nobj, child);
    assert.equal(game.context.objsplit.parent_oid, pie.o_id);
    assert.equal(game.context.objsplit.child_oid, child.o_id);
    assert.ok(game.unported.has('shk.c splitbill'));
});

test('doapply follows the hallucinated cream-pie message branch', async () => {
    const pie = await wishForPie();
    game.u.uprops[HALLUC].intrinsic = 1;
    const drawsBefore = getRngLog().length;
    queue(' ', pie.invlet, ' ');
    const toplineDescriptor = Object.getOwnPropertyDescriptor(
        game, '_ttyToplines',
    );
    let toplines = game._ttyToplines ?? '';
    const toplineWrites = [];
    Object.defineProperty(game, '_ttyToplines', {
        configurable: true,
        enumerable: toplineDescriptor?.enumerable ?? true,
        get: () => toplines,
        set(value) {
            toplines = value;
            toplineWrites.push(value);
        },
    });
    let result;
    try {
        result = await doapply(game);
    } finally {
        if (toplineDescriptor) {
            Object.defineProperty(game, '_ttyToplines', {
                ...toplineDescriptor,
                value: toplines,
            });
        } else {
            delete game._ttyToplines;
            game._ttyToplines = toplines;
        }
    }

    assert.equal(result, ECMD_OK);
    assert.equal(game._pending_message,
        "You can't see through all the sticky goop on your face.");
    assert.ok(toplineWrites.some((line) =>
        line.includes('You give yourself a facial.')));
    const calls = getRngLog().slice(drawsBefore).map(
        (entry) => entry.slice(0, entry.indexOf('=')),
    );
    assert.deepEqual(calls, ['rnd(25)', 'rn2(100)']);
});

test('doapply keeps the source sticky-goop message when already blind',
    async () => {
    const pie = await wishForPie();
    game.u.uprops[BLINDED].intrinsic = 1;
    game.u.ucreamed = 1;
    queue(' ', pie.invlet, ' ');

    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(game._pending_message,
        "There's more sticky goop all over your face.");
    assert.equal(pie.where, OBJ_DELETED);
});

test('doapply still consumes a pie when can_blnd rejects the eyes', async () => {
    const pie = await wishForPie();
    game.u.uprops[BLINDED].extrinsic = W_TOOL;
    const drawsBefore = getRngLog().length;
    queue(' ', pie.invlet);

    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(game.u.ucreamed, 0);
    assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
    assert.equal(pie.where, OBJ_DELETED);
    assert.equal(game._pending_message,
        'You immerse your face in the cream pie.');
    const calls = getRngLog().slice(drawsBefore).map(
        (entry) => entry.slice(0, entry.indexOf('=')),
    );
    assert.deepEqual(calls, ['rn2(100)']);
});
