import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as traps from '../js/trap.js';
import {
    ARROW_TRAP, BEAR_TRAP, DART_TRAP, GETOBJ_DOWNPLAY, GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST, HOLE, LANDMINE, LEVEL_TELEP, MAGIC_PORTAL, PIT,
    SPIKED_PIT, TELEP_TRAP, WEB,
} from '../js/const.js';
import {
    CAN_OF_GREASE, DAGGER, POT_OIL, POT_SICKNESS, POTION_CLASS,
    objects_globals_init,
} from '../js/objects.js';

const source = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const cTrap = source('../nethack-c/upstream/src/trap.c');
const cArtifact = source('../nethack-c/upstream/src/artifact.c');
const cLock = source('../nethack-c/upstream/src/lock.c');
const jsTrap = source('../js/trap.js');
const jsArtifact = source('../js/artifacts.js');
const jsLock = source('../js/lock.js');

test('invocation consumes untrap before selecting cancellation or elapsed time', () => {
    assert.match(cArtifact,
        /if \(!untrap\(TRUE, 0, 0, \(struct obj \*\) 0\)\) \{\s*obj->age = 0;/u);
    const start = jsArtifact.indexOf('async function invoke_untrap(');
    const end = jsArtifact.indexOf('// C ref: artifact.c invoke_charge_obj', start);
    const body = jsArtifact.slice(start, end);
    assert.match(body, /if \(!await untrap\(true, 0, 0, null, state\)\) \{/u);
    assert.match(body, /obj\.age = 0;[\s\S]*return ECMD_CANCEL;[\s\S]*return ECMD_TIME;/u);
    assert.doesNotMatch(body, /note_unported/u);
});

test('untrap walks the canonical per-square object chain in both box loops', () => {
    const start = cTrap.indexOf('\nuntrap(\n');
    const body = cTrap.slice(start, cTrap.indexOf('\n/* for magic unlocking', start));
    assert.equal((body.match(/otmp = svl\.level\.objects\[x\]\[y\]/gu) ?? []).length, 2);
    const jsStart = jsTrap.indexOf('export async function untrap(');
    const jsBody = jsTrap.slice(jsStart, jsTrap.indexOf('// Trap opening/closing', jsStart));
    assert.equal((jsBody.match(/state\.level\.objects\[x\]\[y\]/gu) ?? []).length, 2);
    assert.doesNotMatch(jsBody, /\.at\(x, y\)\?\.objects/u);
    assert.equal((jsBody.match(/otmp = otmp\.nexthere/gu) ?? []).length, 2);
});

test('door-mimic detection completes the canonical action before returning', () => {
    assert.match(cLock, /stumble_onto_mimic\(mtmp\);\s*return TRUE;/u);
    const start = jsLock.indexOf('export async function stumble_on_door_mimic(');
    assert.ok(start >= 0, 'the message-producing owner is awaited');
    const body = jsLock.slice(start, jsLock.indexOf('// C ref: monst.h', start));
    assert.match(body, /await stumble_onto_mimic\(mtmp, state, \{ state, pline: ttyPline \}\);\s*return true;/u);
    assert.doesNotMatch(body, /throw/u);
    // C consumes the helper in open, close and untrap; Promise truthiness
    // would suppress those commands even when no mimic occupies the square.
    assert.equal((jsLock.match(/if \(await stumble_on_door_mimic\(/gu) ?? []).length, 2);
    assert.match(jsTrap, /if \(await stumble_on_door_mimic\(x, y, state\)\)/u);
});

test('into_vs_onto pins every true trap type and ordinary false types to C', () => {
    // These eight cases are the entire TRUE switch arm at trap.c:5375-5390.
    for (const type of [BEAR_TRAP, PIT, SPIKED_PIT, HOLE, TELEP_TRAP,
        LEVEL_TELEP, MAGIC_PORTAL, WEB]) assert.equal(traps.into_vs_onto(type), true);
    // Land mines and shooting traps use the source default FALSE arm.
    for (const type of [LANDMINE, ARROW_TRAP, DART_TRAP])
        assert.equal(traps.into_vs_onto(type), false);
});

test('unsqueak_ok pins grease, known oil, other potions and exclusions to C', () => {
    assert.equal(typeof traps.unsqueak_ok, 'function');
    const state = {};
    objects_globals_init(state);
    // getobj tests empty-hand selection before objects; C excludes it.
    assert.equal(traps.unsqueak_ok(null, state), GETOBJ_EXCLUDE);
    assert.equal(traps.unsqueak_ok({ otyp: CAN_OF_GREASE }, state), GETOBJ_SUGGEST);
    const oil = { otyp: POT_OIL, oclass: POTION_CLASS, dknown: true };
    state.objects[POT_OIL].oc_name_known = true;
    assert.equal(traps.unsqueak_ok(oil, state), GETOBJ_SUGGEST);
    oil.dknown = false; // Unknown appearance downplays oil just like other potions.
    assert.equal(traps.unsqueak_ok(oil, state), GETOBJ_DOWNPLAY);
    oil.dknown = true;
    state.objects[POT_OIL].oc_name_known = false;
    assert.equal(traps.unsqueak_ok(oil, state), GETOBJ_DOWNPLAY);
    assert.equal(traps.unsqueak_ok({ otyp: POT_SICKNESS, oclass: POTION_CLASS }, state),
        GETOBJ_DOWNPLAY);
    assert.equal(traps.unsqueak_ok({ otyp: DAGGER }, state), GETOBJ_EXCLUDE);
});


test('failed untrap preserves C ball/chain and final-death ordering', () => {
    const start = jsTrap.indexOf('async function move_into_trap(');
    const body = jsTrap.slice(start, jsTrap.indexOf('async function try_disarm(', start));
    // trap.c:5406 evaluates movement legality before the punished drag.
    assert.match(body, /await test_move[\s\S]*&& \(!Punished\(state\)[\s\S]*await drag_ball/u);
    assert.match(body, /move_bc\(0, bc\.value, bx\.value, by\.value, cx\.value, cy\.value, state\)/u);
    // C death cannot return from spoteffects; don't publish later trap state.
    assert.match(body, /await spoteffects\(true, state\);[\s\S]*gameover\) return;[\s\S]*failing_untrap--/u);
    assert.match(body, /note_unported\('apply.c check_leash'\)/u);
});

test('untrap uses source indefinite articles and canonical mimic output', () => {
    assert.match(cTrap, /Strcat\(the_trap, an\(trapdescr\)\)/u);
    assert.match(jsTrap, /the_trap \+= an\(trapdescr\)/u);
    assert.match(jsTrap, /and \$\{an\(trapdescr\)\} here/u);
    // The existing uhitm owner emits identification through env.pline.
    assert.match(jsTrap, /await stumble_onto_mimic\(mtmp, state, \{ state, pline: ttyPline \}\)/u);
});


test('melting ice releases the monster before source trap conversion', () => {
    const start = cTrap.indexOf('trap_ice_effects(coordxy');
    const cBody = cTrap.slice(start, cTrap.indexOf('/* sanity check traps */', start));
    assert.match(cBody, /mtmp->mtrapped = 0;[\s\S]*cnv_trap_obj\(otyp, 1, ttmp, TRUE\)/u);
    const jsBody = jsTrap.slice(jsTrap.indexOf('export async function trap_ice_effects('));
    assert.match(jsBody, /if \(trap && ice_is_melting\)/u);
    assert.match(jsBody, /mon\.mtrapped = 0;[\s\S]*await cnv_trap_obj\(type, 1, trap, true, state, env\)/u);
    assert.match(jsBody, /else if \(!undestroyable_trap\(trap\.ttyp\)\)/u);
    const zap = source('../js/zap.js');
    const melt = zap.slice(zap.indexOf('export async function melt_ice('),
        zap.indexOf('export function start_melt_ice_timeout('));
    assert.match(melt, /spot_stop_timers[\s\S]*await trap_ice_effects\(x, y, true, state, env\);[\s\S]*obj_ice_effects[\s\S]*await unearth_objs/u);
    assert.doesNotMatch(melt, /note_unported\('trap.c trap_ice_effects'\)/u);
});
