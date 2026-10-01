// Source-pinned behavior checks for potion.c:peffect_full_healing(). The
// admitted v16 quaff replay supplies the independent production-path evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { A_CON, A_STR, BLINDED, DEAF, HALLUC, HALLUC_RES, SICK, VOMITING,
    WOUNDED_LEGS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { POT_FULL_HEALING } from '../js/objects.js';
import { peffects } from '../js/potion.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/potion.c', 'utf8');
const JS_SOURCE = readFileSync('js/potion.js', 'utf8');

function cFullHealingSource() {
    const start = C_SOURCE.indexOf(
        '\npeffect_full_healing(struct obj *otmp)\n{',
    );
    const end = C_SOURCE.indexOf('\nstaticfn void\npeffect_levitation', start);
    assert.ok(start > 0 && end > start);
    return C_SOURCE.slice(start, end);
}

function jsFullHealingSource() {
    const start = JS_SOURCE.indexOf('async function peffect_full_healing(');
    const end = JS_SOURCE.indexOf(
        '\n}\n\n// C ref: potion.c peffect_polymorph', start,
    );
    assert.ok(start > 0 && end > start);
    return JS_SOURCE.slice(start, end + 2);
}

test('full-healing effect keeps the C helper and dispatch order', () => {
    const c = cFullHealingSource();
    const js = jsFullHealingSource();
    const cOrder = [
        'You_feel("completely healed.");',
        'healup(400, 4 + 4 * bcsign(otmp), !otmp->cursed, TRUE);',
        'u.ulevelmax -= 1;',
        'pluslvl(FALSE);',
        'make_hallucinated(0L, TRUE, 0L);',
        'exercise(A_STR, TRUE);',
        'exercise(A_CON, TRUE);',
        'if (Wounded_legs && (otmp->blessed || (!otmp->cursed && !u.usteed)))',
        'heal_legs(0);',
    ];
    const jsOrder = [
        "await message('You feel completely healed.', state);",
        'await healup(',
        'state.u.ulevelmax -= 1;',
        'await pluslvl(false, state, { message, random });',
        'await make_hallucinated(0, true, 0, state, env);',
        'await exercise(A_STR, true, state, random, { encumberMessage });',
        'await exercise(A_CON, true, state, random, { encumberMessage });',
        'const wounded = state.u.uprops[WOUNDED_LEGS];',
        'if ((wounded.intrinsic || wounded.extrinsic)',
        'await heal_legs(state, { message });',
    ];
    const positions = (source, needles) => needles.map((needle) => {
        const position = source.indexOf(needle);
        assert.ok(position >= 0, `missing source expression: ${needle}`);
        return position;
    });
    assert.deepEqual(positions(c, cOrder), [...positions(c, cOrder)].sort((a, b) => a - b),
        'the C helper keeps message, healup, level, cure, exercise and legs order');
    assert.deepEqual(positions(js, jsOrder), [...positions(js, jsOrder)].sort((a, b) => a - b),
        'the JS helper awaits each effect in the C order');
    assert.match(c,
        /if \(otmp->blessed && u\.ulevel < u\.ulevelmax\) \{[\s\S]*?u\.ulevelmax -= 1;\s*pluslvl\(FALSE\);/u,
        'C restores one lost level only for a blessed potion');
    assert.match(js,
        /if \(otmp\.blessed && state\.u\.ulevel < state\.u\.ulevelmax\) \{\s*\/\/ C lowers[\s\S]*?state\.u\.ulevelmax -= 1;\s*await pluslvl\(false, state, \{ message, random \}\);/u,
        'JS keeps the same blessing guard and max-level order');
    assert.match(c,
        /if \(Wounded_legs && \(otmp->blessed \|\| \(!otmp->cursed && !u\.usteed\)\)\)\s*heal_legs\(0\);/u);
    assert.match(js,
        /if \(\(wounded\.intrinsic \|\| wounded\.extrinsic\)\s*&& \(otmp\.blessed \|\| \(!otmp\.cursed && !state\.u\.usteed\)\)\) \{\s*await heal_legs\(state, \{ message \}\);/u);

    const cDispatch = C_SOURCE.slice(
        C_SOURCE.indexOf('case POT_FULL_HEALING:', C_SOURCE.indexOf('peffects(struct obj *otmp)')),
        C_SOURCE.indexOf('case POT_LEVITATION:', C_SOURCE.indexOf('peffects(struct obj *otmp)')),
    );
    const jsDispatchStart = JS_SOURCE.indexOf('export async function peffects(');
    const jsDispatch = JS_SOURCE.slice(
        JS_SOURCE.indexOf('case POT_FULL_HEALING:', jsDispatchStart),
        JS_SOURCE.indexOf('case POT_LEVITATION:', jsDispatchStart),
    );
    assert.match(cDispatch, /case POT_FULL_HEALING:\s*peffect_full_healing\(otmp\);\s*break;/u);
    assert.match(jsDispatch, /case POT_FULL_HEALING:\s*await peffect_full_healing\(otmp, state, potionEffectEnvironment\(env\)\);\s*break;/u);
});

async function startHealer() {
    // This independent fixed seed/date only builds the game state for the
    // direct effect assertion; the admitted C replay covers production input.
    await runSegment({
        seed: 8460781,
        datetime: '20260724120000',
        nethackrc: 'OPTIONS=name:FullHealingOrder,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
}

test('uncursed full healing uses C hp cap and both exercise calls in order',
    async () => {
        await startHealer();
        // potion.c passes nxtra=4 for an uncursed dose; these HP values make
        // healup(400,4,...) reach the source cap of 12+4 rather than saturate.
        game.u.uhp = 8;
        game.u.uhpmax = 12;
        game.u.uhppeak = 12;
        game.moves = 1;
        game.u.aexe[A_STR] = 0;
        game.u.aexe[A_CON] = 0;
        for (const index of [BLINDED, DEAF, HALLUC, HALLUC_RES, SICK,
            VOMITING, WOUNDED_LEGS]) {
            const property = game.u.uprops[index];
            property.intrinsic = 0;
            property.extrinsic = 0;
        }
        game.u.usick_type = 0;
        game.gp.potion_nothing = 0;
        game.gp.potion_unkn = 0;

        const events = [];
        const potion = { otyp: POT_FULL_HEALING, blessed: false, cursed: false };
        const result = await peffects(potion, game, {
            message: async (line) => events.push(['message', line]),
            random: {
                // Zero is below the current STR/CON scores, so C's rn2(19)
                // exercise checks still draw but do not change the attributes.
                rn2: (bound) => {
                    events.push(['rn2', bound]);
                    return 0;
                },
            },
            encumberMessage: async () => events.push(['encumber']),
        });

        assert.equal(result, -1,
            'C peffects returns -1 so dopotion continues its normal tail');
        assert.equal(game.u.uhp, 16);
        assert.equal(game.u.uhpmax, 16);
        assert.equal(game.u.uhppeak, 16);
        assert.deepEqual(events, [
            ['message', 'You feel completely healed.'],
            ['rn2', 19],
            ['encumber'],
            ['rn2', 19],
            ['encumber'],
        ], 'C heals first, then exercises STR and CON, each with encumber_msg');
    });
