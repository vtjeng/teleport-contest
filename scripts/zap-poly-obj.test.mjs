import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    OBJ_INVENT,
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
import { setwornEnv } from '../js/do_wear.js';
import { setworn } from '../js/worn.js';
import { RIN_REGENERATION, RIN_WARNING } from '../js/objects.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/zap.c', 'utf8');
const JS_SOURCE = readFileSync('js/zap.js', 'utf8');
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

test('poly_obj calls target set_wear only for a worn ring in C order', () => {
    // zap.c:1946-1949 sets the replacement in the worn slot, calls set_wear,
    // then rereads the slot because an amulet callback can replace its object.
    assert.match(C_CALL, /setworn\(otmp, new_wornmask\);/u);
    assert.match(C_CALL, /set_wear\(otmp\);/u);
    assert.match(C_CALL, /otmp = wearmask_to_obj\(new_wornmask\);/u);
    assert.ok(C_CALL.indexOf('setworn(') < C_CALL.indexOf('set_wear('));
    assert.ok(C_CALL.indexOf('set_wear(')
        < C_CALL.indexOf('wearmask_to_obj('));

    assert.match(JS_FUNCTION, /if \(newWornMask & W_RING\)/u);
    assert.match(
        JS_FUNCTION,
        /await set_wear\(state, replacement, \{ \.\.\.rawEnv, random \}\);/u,
    );
    assert.match(JS_FUNCTION, /replacement = wearmask_to_obj\(newWornMask, state\);/u);
    assert.ok(JS_FUNCTION.indexOf('await set_wear(')
        < JS_FUNCTION.indexOf('replacement = wearmask_to_obj('));
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
