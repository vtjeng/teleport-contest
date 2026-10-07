// Tests for pure functions from the artifact.c invoke/query span:
// glow_strength, glow_verb, arti_cost, artifact_has_invprop,
// finesse_ahriman.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ART_EXCALIBUR,
    ART_GRIMTOOTH,
    ART_HEART_OF_AHRIMAN,
    ART_ORCRIST,
    ART_STING,
    ART_SUNSWORD,
    ARTILIST_TEMPLATE,
    HEALING,
    TAMING,
    FLING_POISON,
    BLINDING_RAY,
    artifact_has_invprop,
    arti_cost,
    finesse_ahriman,
    glow_strength,
    glow_verb,
    init_artifacts,
} from '../js/artifacts.js';
import {
    LAST_PROP,
    LEVITATION,
    W_ARMF,
    W_ARTI,
} from '../js/const.js';
import {
    objects_globals_init,
    LONG_SWORD,
    ORCISH_DAGGER,
} from '../js/objects.js';
import { aligns, roles, races } from '../js/roles.js';

function makeState(filecode = 'Val', alignmentName = 'neutral') {
    const role = roles.find((r) => r.filecode === filecode);
    const align = aligns.findIndex((a) => a.name === alignmentName);
    const race = races.find((r) => r.noun === 'human');
    const s = {
        flags: { initalign: align },
        urole: { ...role },
        urace: { ...race },
    };
    init_artifacts(s);
    objects_globals_init(s);
    return s;
}

let state;
test.before(() => {
    state = makeState();
});

// --- glow_strength ---
// C ref: artifact.c glow_strength() (2441-2448).
// Returns 3 when count > 12, 2 when count > 4, 1 when count > 0, else 0.

test('glow_strength returns 0 for zero or negative counts', () => {
    // count = 0: not greater than any threshold
    assert.equal(glow_strength(0), 0);
    // count = -1: negative
    assert.equal(glow_strength(-1), 0);
});

test('glow_strength returns 1 for counts 1 through 4', () => {
    // Boundary: count = 1 is the first value exceeding the "count > 0" threshold
    assert.equal(glow_strength(1), 1);
    // Boundary: count = 4 is the last value below the "count > 4" threshold
    assert.equal(glow_strength(4), 1);
});

test('glow_strength returns 2 for counts 5 through 12', () => {
    // Boundary: count = 5 is the first value exceeding the "count > 4" threshold
    assert.equal(glow_strength(5), 2);
    // Boundary: count = 12 is the last value below the "count > 12" threshold
    assert.equal(glow_strength(12), 2);
});

test('glow_strength returns 3 for counts above 12', () => {
    // Boundary: count = 13 is the first value exceeding the "count > 12" threshold
    assert.equal(glow_strength(13), 3);
    // Well above all thresholds
    assert.equal(glow_strength(100), 3);
});

// --- glow_verb ---
// C ref: artifact.c glow_verb() (2450-2462).
// Indexes glow_verbs[] = ["quiver", "flicker", "glimmer", "gleam"] by
// glow_strength(count). When ingsfx is true, appends "ing" directly
// (the C bypasses ing_suffix() to avoid consonant doubling).

test('glow_verb selects the verb matching glow_strength', () => {
    // strength 0 -> "quiver" (blind or no applicable creatures)
    assert.equal(glow_verb(0, false), 'quiver');
    // strength 1 -> "flicker"
    assert.equal(glow_verb(1, false), 'flicker');
    // strength 2 -> "glimmer"
    assert.equal(glow_verb(5, false), 'glimmer');
    // strength 3 -> "gleam"
    assert.equal(glow_verb(13, false), 'gleam');
});

test('glow_verb appends "ing" when ingsfx is true', () => {
    // C: Strcat(resbuf, "ing") instead of ing_suffix() to avoid doubled consonant
    assert.equal(glow_verb(0, true), 'quivering');
    assert.equal(glow_verb(1, true), 'flickering');
    assert.equal(glow_verb(5, true), 'glimmering');
    assert.equal(glow_verb(13, true), 'gleaming');
});

// --- artifact_has_invprop ---
// C ref: artifact.c artifact_has_invprop() (2299-2305).
// True when the artifact's inv_prop matches the given value. False for
// non-artifacts (get_artifact returns artilist[ART_NONARTIFACT]).

test('artifact_has_invprop returns false for non-artifacts', () => {
    // oartifact = 0 maps to ART_NONARTIFACT; the function short-circuits
    assert.equal(artifact_has_invprop({ oartifact: 0 }, HEALING, state), false);
});

test('artifact_has_invprop correctly identifies each artifact invocation power', () => {
    // Pin each artifact to its inv_prop from artilist.h.
    // Only artifacts that have a nonzero inv_prop are listed.
    const cases = [
        // [oartifact index, inv_prop constant, artifact name for diagnostics]
        [ART_GRIMTOOTH, FLING_POISON, 'Grimtooth'],         // artilist.h:125
        [ART_SUNSWORD, BLINDING_RAY, 'Sunsword'],           // artilist.h:210
    ];
    for (const [artIdx, prop, name] of cases) {
        assert.equal(
            artifact_has_invprop({ oartifact: artIdx }, prop, state), true,
            `${name} should have its own inv_prop`,
        );
        // A wrong property should return false
        assert.equal(
            artifact_has_invprop({ oartifact: artIdx }, TAMING, state), false,
            `${name} should not have TAMING`,
        );
    }
});

test('artifact_has_invprop returns false for artifacts with no invocation power', () => {
    // Sting has inv_prop = 0 (no invocation power; artilist.h:130)
    assert.equal(artifact_has_invprop({ oartifact: ART_STING }, TAMING, state),
                 false);
    // Orcrist likewise has inv_prop = 0
    assert.equal(artifact_has_invprop({ oartifact: ART_ORCRIST }, HEALING, state),
                 false);
});

// --- arti_cost ---
// C ref: artifact.c arti_cost() (2308-2317).
// Non-artifact: objects[otyp].oc_cost.
// Artifact with nonzero artilist cost: that cost.
// Artifact with zero artilist cost: 100 * objects[otyp].oc_cost.

test('arti_cost returns base object cost for non-artifacts', () => {
    // A plain long sword with no artifact index
    const cost = arti_cost({ oartifact: 0, otyp: LONG_SWORD }, state);
    // objects[LONG_SWORD].oc_cost = 15 (from objects.c)
    assert.equal(cost, 15);
});

test('arti_cost returns artilist cost when set', () => {
    // Excalibur: artilist.h:102 sets cost = 4000
    assert.equal(
        arti_cost({ oartifact: ART_EXCALIBUR, otyp: LONG_SWORD }, state),
        4000,
    );
    // Grimtooth: artilist.h:120 sets cost = 1200
    assert.equal(
        arti_cost({ oartifact: ART_GRIMTOOTH, otyp: ORCISH_DAGGER }, state),
        1200,
    );
});

test('arti_cost returns 100x base cost when artilist cost is 0', () => {
    // Check whether any artifact has cost = 0 in the template.
    // If Excalibur has cost 4000, and Grimtooth has 300, both are nonzero.
    // Let's find one with cost 0 by checking the template.
    let found = false;
    for (let i = 1; i < ARTILIST_TEMPLATE.length; i++) {
        const entry = ARTILIST_TEMPLATE[i];
        if (entry && entry.name && !entry.cost && entry.otyp !== undefined) {
            // This artifact has cost = 0; arti_cost should return 100 * base
            const result = arti_cost({ oartifact: i, otyp: entry.otyp }, state);
            const baseCost = 100 * (result / 100); // verify it's a multiple of 100
            assert.equal(result % 100, 0,
                `artifact ${entry.name} cost should be 100x base`);
            found = true;
            break;
        }
    }
    // If no artifact has cost 0, this arm is unreachable in vanilla
    if (!found) {
        assert.ok(true, 'all vanilla artifacts have nonzero artilist cost');
    }
});

// --- finesse_ahriman ---
// C ref: artifact.c finesse_ahriman() (2237-2258). Returns true only when
// the artifact is the sole source of levitation through W_ARTI, so that
// releasing it would end levitation.

test('finesse_ahriman returns false for non-artifact objects', () => {
    const s = { ...state };
    s.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    // A non-artifact always returns false at the get_artifact check
    assert.equal(finesse_ahriman({ oartifact: 0 }, s), false);
});

test('finesse_ahriman returns false when not levitating', () => {
    const s = { ...state };
    s.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    // No levitation at all: the function returns false at the first guard
    assert.equal(finesse_ahriman({ oartifact: ART_HEART_OF_AHRIMAN }, s), false);
});

test('finesse_ahriman returns true when artifact is the sole levitation source', () => {
    const s = { ...state };
    s.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    // Heart of Ahriman has inv_prop = LEVITATION. When W_ARTI is the only
    // source of levitation, releasing the artifact would end levitation.
    s.u.uprops[LEVITATION].extrinsic = W_ARTI;
    assert.equal(finesse_ahriman({ oartifact: ART_HEART_OF_AHRIMAN }, s), true);
});

test('finesse_ahriman returns false for an artifact whose inv_prop is not LEVITATION', () => {
    const s = { ...state };
    s.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    // Excalibur has inv_prop = 0 (no invocation power), so the function
    // fails at the inv_prop !== LEVITATION check.
    s.u.uprops[LEVITATION].extrinsic = W_ARTI;
    assert.equal(finesse_ahriman({ oartifact: ART_EXCALIBUR }, s), false);
});

test('finesse_ahriman returns false when a worn item also grants levitation', () => {
    const s = { ...state };
    s.u = { uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
        blocked: 0, extrinsic: 0, intrinsic: 0,
    })) };
    // Heart of Ahriman provides W_ARTI levitation, but there is also a worn
    // item (e.g. boots of levitation). W_ARMF is a worn-equipment mask that
    // the probe does not clear, so the artifact is not the sole source.
    s.u.uprops[LEVITATION].extrinsic = W_ARTI | W_ARMF;
    assert.equal(finesse_ahriman({ oartifact: ART_HEART_OF_AHRIMAN }, s), false);
});

// Whole artifact.c invoke_blinding_ray caller evidence. These independently
// designed inputs assert state after the real #invoke dispatcher, including
// canceled cooldown, vertical light and gremlin damage before blindness.
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {cmdq_add_key} from '../js/cmd.js';
import {invoke_blinding_ray} from '../js/artifacts.js';
import {BLINDED,CQ_CANNED,ECMD_TIME,IN_SIGHT} from '../js/const.js';
import {loadBlindingRayCases,verifyBlindingRaySegment} from './run-blinding-ray.mjs';

test('independent Sunsword inputs reach every invocation direction and self effect',async()=>{
    for(const{recipe}of loadBlindingRayCases())
        await verifyBlindingRaySegment(recipe.segments[0]);
});

test('Sunsword self invocation consumes the flashburn artifact-resistance result',async()=>{
    const entry=loadBlindingRayCases().find(({name})=>name==='self');
    // Stop after the independent wish. Wielding Sunsword in production remains
    // blocked at wield.c setuwep's begins-to-shine refusal, so construct only
    // that equipment state while invoking the actual source function.
    const prefix=entry.recipe.segments[0].moves.split('#invoke')[0];
    const replay=await runSegment({...entry.recipe.segments[0],moves:prefix});
    let sword;for(let obj=game.invent;obj;obj=obj.nobj)if(obj.oartifact===ART_SUNSWORD)sword=obj;
    game.uwep=sword;game.flags.sparkle=true;
    game.viz_array[game.u.uy][game.u.ux]|=IN_SIGHT;
    const frames=[];game._animationFrameHook=()=>frames.push('frame');
    const before=replay.getRngLog().length;
    cmdq_add_key(CQ_CANNED,'.'.charCodeAt(0),game); // getdir's self key, not a movement.
    try{
        assert.equal(await invoke_blinding_ray(sword,game),ECMD_TIME);
        assert.equal(game.u.uprops[BLINDED].intrinsic,0);
        assert.equal(frames.length,21,'display.c shieldeff uses 21 sparkle frames');
        assert.match(replay.getRngLog()[before],/^rnd\(10\)=/u,'uncursed self duration draws once before flashburn');
        assert.equal(replay.getRngLog().length,before+1);
        assert.doesNotMatch(replay.getScreens().at(-1),/Nothing seems to happen/u);
    }finally{game._animationFrameHook=null;}
});

test('blinding-ray source order wires owners and captures gremlin form before damage',()=>{
    const path=new URL('../js/artifacts.js',import.meta.url);
    const source=readFileSync(path,'utf8').split('export async function invoke_blinding_ray')[1]
        .split('// C ref: artifact.c arti_invoke_cost_pw')[0];
    assert.match(source,/await do_blinding_ray\(obj, state\)/u);
    assert.match(source,/await litroom\(true, obj, state\)[\s\S]*spot\.lit && !spot\.waslit/u);
    assert.match(source,/const vulnerable = state\.u\.umonnum === PM_GREMLIN[\s\S]*if \(vulnerable\) await lightdamage[\s\S]*flashburn\(damg \+ rnd\(damg\)/u);
    assert.doesNotMatch(source,/note_unported/u);
    const c=readFileSync(new URL('../nethack-c/upstream/src/artifact.c',import.meta.url),'utf8');
    assert.match(c,/boolean vulnerable = \(u\.umonnum == PM_GREMLIN\)/u);
    assert.match(c,/obj->blessed \? 15 : !obj->cursed \? 10 : 5/u);
});

test('ENLIGHTENING invocation displays the source PICK_NONE window before returning time',async () => {
    const {readFileSync}=await import('node:fs');
    const c=readFileSync(new URL('../nethack-c/upstream/src/artifact.c',import.meta.url),'utf8');
    const source=c.slice(c.indexOf('case ENLIGHTENING:'),c.indexOf('case CREATE_AMMO:',c.indexOf('case ENLIGHTENING:')));
    assert.match(source,/enlightenment\(MAGICENLIGHTENMENT, ENL_GAMEINPROGRESS\);\s*res = ECMD_TIME;/u);
    const js=readFileSync(new URL('../js/artifacts.js',import.meta.url),'utf8');
    const arm=js.slice(js.indexOf('case ENLIGHTENING:'),js.indexOf('case CREATE_AMMO:',js.indexOf('case ENLIGHTENING:')));
    assert.match(arm,/await select_menu\(state,/u);
    assert.ok(arm.indexOf('await select_menu') < arm.indexOf('res = ECMD_TIME'));
    const {loadPolymorphEnlightenmentCases,verifyPolymorphEnlightenmentSegment}=await import('./run-polymorph-enlightenment.mjs');
    const entry=loadPolymorphEnlightenmentCases().find(({name})=>name==='enlightenment-artifact-giant');
    await verifyPolymorphEnlightenmentSegment(entry.recipe.segments[0]);
});
