import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ANTIMAGIC, POLY_TRAP, W_ARMC } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_RABID_RAT, PM_WIZARD } from '../js/monsters.js';
import { CLOAK_OF_MAGIC_RESISTANCE } from '../js/objects.js';
import { floor_trigger, preflight_dotrap } from '../js/trap_effects.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/trap.c', 'utf8');
const JS_SOURCE = readFileSync('js/trap_effects.js', 'utf8');
const C_START = C_SOURCE.indexOf(
    'trapeffect_poly_trap(\n    struct monst *mtmp,',
);
const C_END = C_SOURCE.indexOf('\nstaticfn int\ntrapeffect_landmine(', C_START);
const JS_START = JS_SOURCE.indexOf('async function trapeffect_poly_trap(');
const JS_END = JS_SOURCE.indexOf('// C ref: trap.c trapeffect_web()', JS_START);
const C_BODY = C_SOURCE.slice(C_START, C_END);
const JS_BODY = JS_SOURCE.slice(JS_START, JS_END);

const RECORDING = JSON.parse(readFileSync(
    'recordings/trap.c/hero-polymorph-trap-barbarian-polyself-independent-a47.session.json',
    'utf8',
)).segments[0];
const WIZARD_RECIPE = JSON.parse(readFileSync(
    'recipes/trap.c/hero-polymorph-trap-returns-over-trap-independent-a47.session.json',
    'utf8',
)).segments[0];

test('trapeffect_poly_trap keeps the ordinary hero source order', () => {
    assert.ok(C_START >= 0 && C_END > C_START);
    assert.ok(JS_START >= 0 && JS_END > JS_START);

    const cOrdinaryArm = C_BODY.slice(
        C_BODY.indexOf('(void) steedintrap(trap, (struct obj *) 0);'),
    );
    const jsOrdinaryArm = JS_BODY.slice(
        JS_BODY.indexOf('await steedintrap(trap, null, env);'),
    );
    const cOrder = [
        '(void) steedintrap(trap, (struct obj *) 0);',
        'deltrap(trap);',
        'newsym(u.ux, u.uy);',
        'You_feel("a change coming over you.");',
        'polyself(POLY_NOFLAGS);',
    ].map((part) => cOrdinaryArm.indexOf(part));
    const jsOrder = [
        'await steedintrap(trap, null, env);',
        'deltrap(trap, state);',
        'newsym(state.u.ux, state.u.uy);',
        "await message('You feel a change coming over you.', state, env);",
        'await polyself(POLY_NOFLAGS, state);',
    ].map((part) => jsOrdinaryArm.indexOf(part));
    assert.ok(cOrder.every((position) => position >= 0));
    assert.ok(jsOrder.every((position) => position >= 0));
    assert.ok(cOrder.every((position, i) => i === 0 || cOrder[i - 1] < position));
    assert.ok(jsOrder.every((position, i) => i === 0 || jsOrder[i - 1] < position));

    // C discards steedintrap(), polyself(), and newcham() results. The monster
    // call still carries NC_SHOW_MSG through the ported shape-change owner.
    assert.match(C_BODY, /\(void\) newcham\(mtmp, \(struct permonst \*\) 0, NC_SHOW_MSG\);/u);
    assert.match(JS_BODY,
        /await newcham\(mtmp, null, \{ \.\.\.env, ncflags: NC_SHOW_MSG \}\);/u);
});

test('hero POLY_TRAP preflight admits unmounted and mounted source arms', () => {
    assert.equal(floor_trigger(POLY_TRAP), false);
    assert.doesNotThrow(() => preflight_dotrap(
        { ttyp: POLY_TRAP, tseen: false },
        { u: { usteed: null } },
    ));
    assert.doesNotThrow(() => preflight_dotrap(
        { ttyp: POLY_TRAP, tseen: false },
        { u: { usteed: {} } },
    ));
});

test('an independent hero trap activation enters polyself in production', async () => {
    await runSegment(RECORDING);
    assert.equal(game.youmonst.data.pmidx, PM_RABID_RAT);
    assert.equal(game.u.uconduct.polyselfs, 1);
    assert.match(game.nhDisplay.topMessage,
        /^You feel a change coming over you\.\s+You turn into a rabid rat!/u);
});

test('the Wizard starting cloak supplies Antimagic to polymorph traps', async () => {
    const output = await runSegment(WIZARD_RECIPE);
    assert.equal(game.uarmc?.otyp, CLOAK_OF_MAGIC_RESISTANCE);
    assert.equal(game.uarmc?.owornmask & W_ARMC, W_ARMC);
    assert.equal(game.u.uprops[ANTIMAGIC]?.extrinsic & W_ARMC, W_ARMC);
    assert.equal(game.youmonst.mnum, PM_WIZARD);
    assert.ok(output.getScreens().some((screen) =>
        screen.includes('You feel momentarily different.')));
});
