import assert from 'node:assert/strict';
import test from 'node:test';

import {
    doapply,
    UnsupportedApplyError,
} from '../js/apply.js';
import {
    BLINDED,
    ECMD_OK,
    HALLUC,
    OBJ_DELETED,
    TIMEOUT,
    W_TOOL,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { can_blnd, haseyes } from '../js/mondata.js';
import { AT_WEAP, M1_NOEYES } from '../js/monsters.js';
import { CREAM_PIE } from '../js/objects.js';
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

test('doapply keeps cream-pie states outside this slice fail-closed',
    async () => {
    const cases = [
        {
            label: 'a stack',
            // Two is the smallest quantity that enters C's splitobj branch.
            setup: (pie) => { pie.quan = 2; },
        },
        {
            label: 'hallucination',
            // One is the smallest nonzero HALLUC timeout.
            setup: () => { game.u.uprops[HALLUC].intrinsic = 1; },
        },
        {
            label: 'existing blindness',
            // One is the smallest nonzero BLINDED timeout.
            setup: () => { game.u.uprops[BLINDED].intrinsic = 1; },
        },
        {
            label: 'a blindfold',
            setup: () => { game.u.uprops[BLINDED].extrinsic = W_TOOL; },
        },
        {
            label: 'an unpaid pie',
            setup: (pie) => { pie.unpaid = true; },
        },
    ];

    for (const { label, setup } of cases) {
        const pie = await wishForPie();
        setup(pie);
        const before = {
            draws: getRngLog().length,
            intrinsic: game.u.uprops[BLINDED].intrinsic,
            ucreamed: game.u.ucreamed,
            quan: pie.quan,
            where: pie.where,
        };
        // Direct entry into doapply() must first dismiss the wish line that
        // moveloop_core() would clear before reading the apply command.
        queue(' ', pie.invlet);

        await assert.rejects(
            doapply(game),
            (error) => error instanceof UnsupportedApplyError
                && /cream pie/u.test(error.branch),
            label,
        );
        assert.deepEqual({
            draws: getRngLog().length,
            intrinsic: game.u.uprops[BLINDED].intrinsic,
            ucreamed: game.u.ucreamed,
            quan: pie.quan,
            where: pie.where,
        }, before, label);
    }
});
