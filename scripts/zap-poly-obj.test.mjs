import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    OBJ_INVENT,
    W_ARM,
    W_ARMG,
    W_AMUL,
    W_RINGL,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { addinv } from '../js/invent.js';
import { mksobj } from '../js/obj.js';
import { poly_obj } from '../js/zap.js';
import {
    d, rn1, rn2, rnd, rne, rnl, rnz,
} from '../js/rng.js';
import { runSegment } from '../js/jsmain.js';
import { disintegrate_arm, setwornEnv } from '../js/do_wear.js';
import { setworn } from '../js/worn.js';
import {
    AMULET_OF_ESP,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_REFLECTION,
    CRYSTAL_PLATE_MAIL,
    LEATHER_GLOVES,
    RIN_REGENERATION,
    RIN_WARNING,
    STUDDED_LEATHER_ARMOR,
} from '../js/objects.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/zap.c', 'utf8');
const DO_WEAR_C_SOURCE = readFileSync(
    'nethack-c/upstream/src/do_wear.c', 'utf8',
);
const JS_SOURCE = readFileSync('js/zap.js', 'utf8');
const DO_WEAR_JS_SOURCE = readFileSync('js/do_wear.js', 'utf8');
const C_CALL_START = C_SOURCE.indexOf('setworn(otmp, new_wornmask);');
const C_CALL_END = C_SOURCE.indexOf(
    'otmp = wearmask_to_obj(new_wornmask);',
    C_CALL_START,
) + 'otmp = wearmask_to_obj(new_wornmask);'.length;
const C_CALL = C_SOURCE.slice(C_CALL_START, C_CALL_END);
const JS_START = JS_SOURCE.indexOf('export async function poly_obj(');
const JS_END = JS_SOURCE.indexOf(
    '\n}\n\n// C ref: zap.c stone_to_flesh_obj',
    JS_START,
) + 2;
const JS_FUNCTION = JS_SOURCE.slice(JS_START, JS_END);

const random = { d, rn1, rn2, rnd, rne, rnl, rnz };

function queueMoreResponses() {
    // The direct polymorph tests can emit several independent --More-- pages;
    // leave enough blank responses in the display-owned queue to finish them.
    for (const key of '                ')
        game.nhDisplay.terminal.pushKey(key.charCodeAt(0));
}

test('poly_obj removes worn items before restoring them in C order', () => {
    // zap.c:1930 and 1945-1949 remove the old item before assigning the
    // replacement, then call set_wear and reread the slot.
    const cPolyToSetWorn = C_SOURCE.slice(
        C_SOURCE.indexOf('poly_obj(struct obj *obj, int id)\n{'),
        C_CALL_END,
    );
    assert.match(cPolyToSetWorn, /remove_worn_item\(obj, TRUE\);/u);
    assert.match(C_CALL, /setworn\(otmp, new_wornmask\);/u);
    assert.match(C_CALL, /set_wear\(otmp\);/u);
    assert.match(C_CALL, /otmp = wearmask_to_obj\(new_wornmask\);/u);
    assert.ok(C_CALL.indexOf('setworn(') < C_CALL.indexOf('set_wear('));
    assert.ok(C_CALL.indexOf('set_wear(')
        < C_CALL.indexOf('wearmask_to_obj('));

    const jsRemoveCall = JS_FUNCTION.indexOf(
        'await remove_worn_item(obj, true, state, env);',
    );
    const jsSetWorn = JS_FUNCTION.indexOf(
        'await setworn(replacement, newWornMask, env);',
    );
    assert.ok(jsRemoveCall >= 0 && jsRemoveCall < jsSetWorn);
    assert.match(
        JS_FUNCTION,
        /await set_wear\(state, replacement, \{ \.\.\.rawEnv, random \}\);/u,
    );
    assert.doesNotMatch(JS_FUNCTION, /note_unported\('steal\.c remove_worn_item'\)/u);
    assert.doesNotMatch(JS_FUNCTION, /note_unported\('do_wear\.c set_wear'\)/u);
    assert.match(JS_FUNCTION, /replacement = wearmask_to_obj\(newWornMask, state\);/u);
    assert.ok(JS_FUNCTION.indexOf('await set_wear(')
        < JS_FUNCTION.indexOf('replacement = wearmask_to_obj('));
});

test('disintegrate_arm calls selftouch after gloves are removed', () => {
    const cStart = DO_WEAR_C_SOURCE.indexOf('disintegrate_arm(struct obj *atmp)\n{');
    const cEnd = DO_WEAR_C_SOURCE.indexOf('\n/* return ERODE_foo', cStart);
    const cFunction = DO_WEAR_C_SOURCE.slice(cStart, cEnd);
    assert.match(
        cFunction,
        /wornarm_destroyed\(otmp\);[\s\S]*?if \(losing_gloves\)\s*selftouch\("You"\);[\s\S]*?stop_occupation\(\);/u,
    );

    const jsStart = DO_WEAR_JS_SOURCE.indexOf(
        'export async function disintegrate_arm(',
    );
    const jsEnd = DO_WEAR_JS_SOURCE.indexOf(
        '\n}\n\n// C ref: do_wear.c obj_erode_type',
        jsStart,
    ) + 2;
    const jsFunction = DO_WEAR_JS_SOURCE.slice(jsStart, jsEnd);
    assert.match(
        jsFunction,
        /await wornarm_destroyed\(armor, state\);[\s\S]*?if \(losingGloves\)\s*await selftouch\('You', state, rawEnv\);[\s\S]*?await stop_occupation\(state, \{ message: ttyPline \}\);/u,
    );
    assert.doesNotMatch(jsFunction, /note_unported\('trap\.c selftouch'\)/u);
});

test('disintegrate_arm reaches the existing selftouch helper after glove loss',
    async () => {
        await runSegment({
            seed: 9102477,
            datetime: '20330708101112',
            nethackrc: [
                'OPTIONS=name:ArmorTouch,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
                '',
            ].join('\n'),
            moves: '.',
        });

        const gloves = mksobj(
            LEATHER_GLOVES, false, false, { state: game, ...random },
        );
        addinv(gloves, { state: game });
        setworn(gloves, W_ARMG, setwornEnv(game));

        assert.equal(await disintegrate_arm(gloves, { state: game, random }), 1);
        assert.equal(game.uarmg, null);
        assert.equal(game.unported.has('trap.c selftouch'), false);
    });

test('poly_obj removes and restores worn armor around polymorph', async () => {
    const segment = {
        seed: 9102474,
        datetime: '20330708101112',
        nethackrc: [
            'OPTIONS=name:ArmorSwap,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
            '',
        ].join('\n'),
        moves: '.',
    };
    await runSegment(segment);

    const oldArmor = mksobj(
        CRYSTAL_PLATE_MAIL, false, false, { state: game, ...random },
    );
    addinv(oldArmor, { state: game });
    setworn(oldArmor, W_ARM, setwornEnv(game));

    const replacement = await poly_obj(
        oldArmor,
        STUDDED_LEATHER_ARMOR,
        game,
        random,
        { state: game },
    );

    assert.equal(replacement.otyp, STUDDED_LEATHER_ARMOR);
    assert.equal(game.uarm, replacement);
    assert.equal(replacement.owornmask, W_ARM);
    assert.equal(oldArmor.owornmask, 0);
    assert.equal(game.unported.has('steal.c remove_worn_item'), false);
    assert.equal(game.unported.has('do_wear.c set_wear'), false);
});

test('poly_obj removes and restores a worn ESP amulet around polymorph',
    async () => {
        // This independent wizard setup reaches zap.c:poly_obj's W_AMUL arm;
        // the explicit replacement keeps the test focused on worn-slot order.
        const segment = {
            seed: 9102475,
            datetime: '20330708101112',
            nethackrc: [
                'OPTIONS=name:AmuletSwap,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
                '',
            ].join('\n'),
            moves: '.',
        };
        await runSegment(segment);
        queueMoreResponses();

        const oldAmulet = mksobj(
            AMULET_OF_ESP, false, false, { state: game, ...random },
        );
        addinv(oldAmulet, { state: game });
        setworn(oldAmulet, W_AMUL, setwornEnv(game));

        const replacement = await poly_obj(
            oldAmulet,
            AMULET_OF_LIFE_SAVING,
            game,
            random,
            { state: game },
        );

        assert.equal(replacement.otyp, AMULET_OF_LIFE_SAVING);
        assert.equal(game.uamul, replacement);
        assert.equal(replacement.owornmask, W_AMUL);
        assert.equal(oldAmulet.owornmask, 0);
        assert.equal(game.unported.has('steal.c remove_worn_item'), false);
        assert.equal(game.unported.has('do_wear.c set_wear'), false);
    });

test('poly_obj preserves worn hooks while removing an amulet with no off callback',
    async () => {
        // Life saving has no Amulet_off slot-clearing arm, so the generic
        // remove_worn_item/setnotworn path must retain do_wear's injected hooks.
        const segment = {
            seed: 9102476,
            datetime: '20330708101112',
            nethackrc: [
                'OPTIONS=name:AmuletRemoval,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
                '',
            ].join('\n'),
            moves: '.',
        };
        await runSegment(segment);
        queueMoreResponses();

        const oldAmulet = mksobj(
            AMULET_OF_LIFE_SAVING, false, false, { state: game, ...random },
        );
        addinv(oldAmulet, { state: game });
        setworn(oldAmulet, W_AMUL, setwornEnv(game));

        const replacement = await poly_obj(
            oldAmulet,
            AMULET_OF_REFLECTION,
            game,
            random,
            { state: game },
        );

        assert.equal(replacement.otyp, AMULET_OF_REFLECTION);
        assert.equal(game.uamul, replacement);
        assert.equal(replacement.owornmask, W_AMUL);
        assert.equal(oldAmulet.owornmask, 0);
    });

test('poly_obj cancels a replacement egg timer before making it generic', () => {
    const cStart = C_SOURCE.indexOf('poly_obj(struct obj *obj, int id)\n{');
    const cEnd = C_SOURCE.indexOf('\n}\n', cStart) + 2;
    const cFunction = C_SOURCE.slice(cStart, cEnd);
    const cEggBranch = cFunction.slice(cFunction.indexOf('/* avoid abusing eggs laid by you */'));
    assert.match(cEggBranch,
        /if \(otmp->otyp == EGG\)\s*kill_egg\(otmp\);\s*else\s*\{\s*otmp->otyp = EGG;/u);

    const jsEggBranch = JS_FUNCTION.slice(JS_FUNCTION.indexOf('if (obj.otyp === EGG && obj.spe)'));
    assert.match(jsEggBranch,
        /if \(replacement\.otyp === EGG\)\s*kill_egg\(replacement, state, env\);\s*else\s*\{\s*replacement\.otyp = EGG;/u);
    assert.ok(jsEggBranch.indexOf('kill_egg(replacement, state, env)')
        < jsEggBranch.indexOf('replacement.corpsenm = NON_PM;'));
});

test('poly_obj replacement runs Ring_on for the new worn warning ring',
    async () => {
        // The independent seed and time initialize an ordinary wizard game;
        // a regeneration ring keeps the old Ring_off arm free of side effects.
        const segment = {
            seed: 9102473,
            datetime: '20330708101112',
            nethackrc: [
                'OPTIONS=name:RingSwap,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
                '',
            ].join('\n'),
            moves: '.',
        };
        await runSegment(segment);

        const oldRing = mksobj(
            RIN_REGENERATION, false, false, { state: game, ...random },
        );
        addinv(oldRing, { state: game });
        assert.equal(oldRing.where, OBJ_INVENT);
        // The C call arrives after setworn() has assigned the left-ring slot.
        setworn(oldRing, W_RINGL, setwornEnv(game));

        const redraws = [];
        const replacement = await poly_obj(
            oldRing,
            RIN_WARNING,
            game,
            random,
            { redraw: (x, y) => redraws.push([x, y]) },
        );

        assert.equal(replacement.otyp, RIN_WARNING);
        assert.equal(replacement.owornmask, W_RINGL);
        assert.equal(game.uleft, replacement);
        assert.ok(redraws.some(([x, y]) => x === game.u.ux && y === game.u.uy),
            'the Ring_on warning arm redraws the hero square');
        assert.equal(
            game.unported.has('do_wear.c set_wear'),
            false,
            'the source-matching ring mask no longer stops at the caller gap',
        );
    });
