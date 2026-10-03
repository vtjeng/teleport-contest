import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BLINDED,
    FORCETRAP,
    HALLUC,
    LEVITATION,
    SQKY_BOARD,
    Trap_Effect_Finished,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    dotrap,
    preflight_dotrap,
    trapeffect_selector,
} from '../js/trap_effects.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/trap.c', 'utf8');
const JS_SOURCE = readFileSync('js/trap_effects.js', 'utf8');
const C_START = C_SOURCE.indexOf('staticfn int\ntrapeffect_sqky_board(\n');
const C_END = C_SOURCE.indexOf('\nstaticfn int\ntrapeffect_bear_trap(', C_START);
const JS_START = JS_SOURCE.indexOf('async function trapeffect_sqky_board(');
const JS_END = JS_SOURCE.indexOf('// C ref: trap.c t_missile()', JS_START);
const C_BODY = C_SOURCE.slice(C_START, C_END);
const JS_BODY = JS_SOURCE.slice(JS_START, JS_END);

const NORMAL_RECIPE = JSON.parse(readFileSync(
    'recipes/trap.c/squeaky-board-monster-wakes-goblin-welcome-corrected-c67.session.json',
    'utf8',
)).segments[0];
const NORMAL_RECORDING = JSON.parse(readFileSync(
    'recordings/trap.c/squeaky-board-monster-wakes-goblin-welcome-corrected-c67.session.json',
    'utf8',
)).segments[0];
const DEAF_RECORDING = JSON.parse(readFileSync(
    'recordings/trap.c/squeaky-board-monster-wakes-goblin-deaf-variation-welcome-corrected-c67.session.json',
    'utf8',
)).segments[0];

async function initializedState() {
    // One leading space dismisses the startup welcome pager in this C-first
    // configuration; it leaves the game initialized without taking a turn.
    await runSegment({ ...NORMAL_RECIPE, moves: ' ' });
    return game;
}

function makeBoard(state) {
    // tnote 5 selects the F squeak used by the independent monster recordings;
    // false/zero defaults exercise a fresh, previously unseen SQKY_BOARD.
    return {
        ttyp: SQKY_BOARD,
        tseen: false,
        once: false,
        tx: state.u.ux,
        ty: state.u.uy,
        tnote: 5,
        madeby_u: false,
    };
}

test('trapeffect_sqky_board preserves C hero and monster branch order', () => {
    assert.ok(C_START >= 0 && C_END > C_START);
    assert.ok(JS_START >= 0 && JS_END > JS_START);

    const cHero = C_BODY.indexOf('if (mtmp == &gy.youmonst)');
    const cAir = C_BODY.indexOf('(Levitation || Flying) && !forcetrap');
    const cBlind = C_BODY.indexOf('if (!Blind)');
    const cReveal = C_BODY.indexOf('seetrap(trap);', cBlind);
    const cHallucination = C_BODY.indexOf('if (Hallucination)', cReveal);
    const cDeaf = C_BODY.indexOf('Deaf ? "vibrates"', cReveal);
    const cWakeHero = C_BODY.indexOf('wake_nearby(FALSE);', cDeaf);
    const cMonster = C_BODY.indexOf('boolean in_sight = canseemon(mtmp)', cWakeHero);
    const cAirborneMonster = C_BODY.indexOf('if (m_in_air(mtmp))', cMonster);
    const cWakeMonster = C_BODY.indexOf('wake_nearto(mtmp->mx, mtmp->my, 40);', cAirborneMonster);
    assert.ok([cHero, cAir, cBlind, cReveal, cHallucination, cDeaf,
        cWakeHero, cMonster, cAirborneMonster, cWakeMonster]
        .every((position) => position >= 0));
    assert.ok(cHero < cAir && cAir < cBlind && cBlind < cReveal
        && cReveal < cHallucination && cHallucination < cDeaf
        && cDeaf < cWakeHero && cWakeHero < cMonster
        && cMonster < cAirborneMonster && cAirborneMonster < cWakeMonster);

    const jsHero = JS_BODY.indexOf('if (monster === state.youmonst)');
    const jsAir = JS_BODY.indexOf('(Levitation(state) || Flying(state)) && !forcetrap');
    const jsBlind = JS_BODY.indexOf('if (!heroIsBlind(state))', jsAir);
    const jsHeroWake = JS_BODY.indexOf('wake_nearby(false', jsBlind);
    const jsMonster = JS_BODY.indexOf('// stepped on a squeaky board', jsHeroWake);
    const jsInSight = JS_BODY.indexOf('const inSight = canseemon(monster, state)', jsMonster);
    const jsAirborne = JS_BODY.indexOf('if (mInAir(monster, state))', jsInSight);
    const jsWake = JS_BODY.indexOf('wake_nearto(monster.mx, monster.my, 40', jsAirborne);
    assert.ok([jsHero, jsAir, jsBlind, jsHeroWake, jsMonster, jsInSight,
        jsAirborne, jsWake].every((position) => position >= 0));
    assert.ok(jsHero < jsAir && jsAir < jsBlind && jsBlind < jsHeroWake
        && jsHeroWake < jsMonster && jsMonster < jsInSight
        && jsInSight < jsAirborne && jsAirborne < jsWake);
    assert.match(JS_BODY, /await wake_nearby\(false, \{ \.\.\.env, state \}\);/u);
});

test('preflight_dotrap admits the completed SQKY_BOARD hero source arms', async () => {
    const state = await initializedState();
    // The unseen normal trap reaches the hero arm without FORCETRAP flags.
    const unseen = { ttyp: SQKY_BOARD, tseen: false };
    assert.doesNotThrow(() => preflight_dotrap(unseen, state));

    // C dotrap() has no steed-specific SQKY_BOARD arm: it still triggers the
    // hero's trap effect after mon_learns_traps() handles the mount.
    state.u.usteed = {};
    assert.doesNotThrow(() => preflight_dotrap(unseen, state));

    // The already-seen trap uses dotrap()'s existing source escape gate.
    assert.doesNotThrow(() => preflight_dotrap(
        { ...unseen, tseen: true },
        state,
    ));
    state.u.usteed = null;
});

test('dotrap calls the hero squeak arm and reveals the board', async () => {
    const state = await initializedState();
    const trap = makeBoard(state);
    state.level.traps.push(trap);
    const messages = [];
    await dotrap(trap, 0, state, {
        message: async (line) => messages.push(line),
        redraw: () => {},
    });

    // The fixture's tnote 5 maps to note F in trapnote(), so this pins the
    // ordinary hero message from trap.c:1420-1423.
    assert.deepEqual(messages, ['A board beneath you squeaks an F note loudly.']);
    assert.equal(trap.tseen, true);
});

test('airborne hero arm reveals only when visible and keeps C Hallucination text', async () => {
    const state = await initializedState();
    state.u.uprops[LEVITATION].intrinsic = 1;
    state.u.uprops[HALLUC].intrinsic = 1;
    const trap = makeBoard(state);
    const messages = [];
    const env = {
        state,
        message: async (line) => messages.push(line),
        redraw: () => {},
    };

    // Zero means no forced-trap flag; Levitation therefore takes C's early
    // visible airborne branch.
    assert.equal(await trapeffect_selector(state.youmonst, trap, 0, env),
        Trap_Effect_Finished);
    // Hallucination selects the source's crease message for an airborne hero.
    assert.deepEqual(messages, ['You notice a crease in the linoleum.']);
    assert.equal(trap.tseen, true);

    state.u.uprops[BLINDED].intrinsic = 1;
    const blindTrap = makeBoard(state);
    messages.length = 0;
    await trapeffect_selector(state.youmonst, blindTrap, 0, env);
    assert.deepEqual(messages, []);
    assert.equal(blindTrap.tseen, false);

    // FORCETRAP overrides the ordinary Levitation branch in trap.c:1409;
    // the Deaf role-play flag selects the vibration message from the hero arm.
    const forcedTrap = makeBoard(state);
    state.u.uroleplay.deaf = true;
    messages.length = 0;
    await trapeffect_selector(state.youmonst, forcedTrap, FORCETRAP, env);
    assert.deepEqual(messages, ['A board beneath you vibrates.']);
    assert.equal(forcedTrap.tseen, true);
});

test('independent monster recording reaches the normal squeak through mintrap', async () => {
    // This C-first recording places a non-Deaf monster on the note-F board.
    const output = await runSegment(NORMAL_RECORDING);
    assert.ok(output.getScreens().some((screen) =>
        screen.includes('A board beneath the newt squeaks an F note loudly.')));
    assert.equal(game.level.traps.find((trap) => trap.ttyp === SQKY_BOARD)?.tseen,
        true);
});

test('permadeaf monster variation reaches the C cringing branch through mintrap', async () => {
    // This independently frozen variation changes only the Deaf option, so
    // the same visible SQKY_BOARD source arm reaches its Deaf response.
    const output = await runSegment(DEAF_RECORDING);
    assert.ok(output.getScreens().some((screen) =>
        screen.includes('The newt stops momentarily and appears to cringe.')));
    assert.equal(game.level.traps.find((trap) => trap.ttyp === SQKY_BOARD)?.tseen,
        false);
});
