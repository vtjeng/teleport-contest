import assert from 'node:assert/strict';
import test from 'node:test';

import { init_artifacts } from '../js/artifacts.js';
import {
    ARROW_TRAP,
    BEAR_TRAP,
    DART_TRAP,
    FOUNTAIN,
    HATCH_EGG,
    MAGIC_TRAP,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOVICTIM,
    OBJ_FLOOR,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    ROOM,
    TAINT_AGE,
    TIMER_OBJECT,
    WEB,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { add_to_container } from '../js/invent.js';
import { light_globals_init } from '../js/light.js';
import { mktrap } from '../js/mktrap.js';
import {
    PM_ARCHEOLOGIST,
    PM_DWARF,
    PM_ELF,
    PM_GNOME,
    PM_GIANT_SPIDER,
    PM_HUMAN,
    PM_ORC,
    PM_WIZARD,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { objectGenerationHooks } from '../js/object_generation.js';
import {
    curseFreeObject,
    mksobj,
    obj_no_longer_held,
    place_object,
    weight,
} from '../js/obj.js';
import {
    ARROW,
    BAG_OF_HOLDING,
    BOULDER,
    CORPSE,
    EGG,
    ROCK,
    objects_globals_init,
} from '../js/objects.js';
import { initRng } from '../js/rng.js';
import {
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

function generationState(seed = 424242) {
    const state = resetGame();
    Object.assign(state, {
        astral_level: { dnum: 0, dlevel: 0 },
        branches: [],
        context: { current_fruit: 1, ident: 2, mon_moving: false },
        dungeons: [{
            depth_start: 1,
            dunlev_ureached: 1,
            entry_lev: 1,
            flags: { align: 0, hellish: false },
            num_dunlevs: 20,
        }],
        flags: { initalign: 0 },
        gz: { zombify: false },
        in_mklev: true,
        moves: 2,
        program_state: { gameover: false },
        quest_dnum: 1,
        rogue_level: { dnum: 0, dlevel: 0 },
        sanctum_level: { dnum: 0, dlevel: 0 },
        specialLevels: [],
        u: {
            uhave: { amulet: 0 },
            ulevel: 1,
            uz: { dnum: 0, dlevel: 1 },
        },
        urole: { mnum: PM_ARCHEOLOGIST, questarti: 0 },
    });
    state.level = new GameMap();
    state.level.at(10, 5).typ = ROOM;
    state.level.at(11, 5).typ = ROOM;
    objects_globals_init(state);
    init_objects(state, () => 0);
    monst_globals_init(state);
    reset_mvitals(state);
    init_artifacts(state);
    timeout_globals_init(state);
    light_globals_init(state);
    initRng(seed);
    return state;
}

function floorPile(state, x, y) {
    const result = [];
    for (let obj = state.level.objects[x][y]; obj; obj = obj.nexthere)
        result.push(obj);
    return result;
}

test('mktrap retries an occupied room coordinate without consuming RNG', () => {
    const state = generationState();
    state.level.at(10, 5).typ = FOUNTAIN;
    const choices = [
        { x: 10, y: 5 },
        { x: 11, y: 5 },
    ];
    const random = {
        rn1: () => assert.fail('unexpected rn1'),
        rn2: () => assert.fail('unexpected rn2'),
        rnd: () => assert.fail('unexpected rnd'),
    };
    let calls = 0;

    const trap = mktrap(
        ARROW_TRAP,
        MKTRAP_NOVICTIM,
        {},
        null,
        {
            state,
            random,
            hooks: {
                somexyspace(_room, coordinate) {
                    Object.assign(coordinate, choices[calls++]);
                    return true;
                },
            },
        },
    );

    assert.equal(calls, 2);
    assert.deepEqual([trap.tx, trap.ty, trap.ttyp], [11, 5, ARROW_TRAP]);
    assert.deepEqual(state.level.traps, [trap]);
    assert.deepEqual(floorPile(state, 11, 5), []);
});

test('rolling-boulder traps create symmetric source launch geometry', () => {
    const state = generationState();
    state.u.uz.dlevel = 4;
    state.dungeons[0].dunlev_ureached = 4;
    for (let x = 6; x <= 14; ++x)
        state.level.at(x, 5).typ = ROOM;
    const existing = mksobj(BOULDER, true, false, { state });
    place_object(existing, 14, 5, { state });
    const calls = [];
    const random = {
        rn1(bound, base) {
            calls.push(['rn1', bound, base]);
            return 4;
        },
        rn2(bound) {
            calls.push(['rn2', bound]);
            return 4; // east in the source direction arrays
        },
        rnd(bound) {
            calls.push(['rnd', bound]);
            return 1;
        },
        rne: () => assert.fail('unexpected rne'),
    };

    const trap = mktrap(
        ROLLING_BOULDER_TRAP,
        MKTRAP_MAZEFLAG,
        null,
        { x: 10, y: 5 },
        {
            state,
            random,
            hooks: objectGenerationHooks({
                newsym(x, y) {
                    calls.push(['newsym', x, y]);
                },
            }),
        },
    );

    assert.deepEqual(calls, [
        ['rn1', 5, 4],
        ['rn2', 8],
        ['rnd', 2],
        ['newsym', 14, 5],
        ['rnd', 4],
    ]);
    assert.deepEqual(trap.launch, { x: 14, y: 5 });
    assert.deepEqual(trap.launch2, { x: 6, y: 5 });
    const launchPile = floorPile(state, 14, 5);
    // objects.h declares Boulder with merge=0. stackobj() therefore preserves
    // two quantity-one boulders and the newly launched one remains pile head.
    assert.equal(launchPile.length, 2);
    assert.equal(launchPile[0].otyp, BOULDER);
    assert.deepEqual([launchPile[0].quan, launchPile[0].where], [1, OBJ_FLOOR]);
    assert.equal(launchPile[0].owt, weight(launchPile[0], { state }));
    assert.equal(launchPile[0].nexthere, existing);
    assert.equal(launchPile[1], existing);
    assert.equal(existing.where, OBJ_FLOOR);
    assert.equal(state.level.objlist, launchPile[0]);
    assert.equal(launchPile[0].nobj, existing);
    assert.equal(existing.nobj, null);
});

test('rolling launch wraps directions before accepting a later path', () => {
    const state = generationState();
    state.u.uz.dlevel = 4;
    state.dungeons[0].dunlev_ureached = 4;
    for (let x = 6; x <= 14; ++x)
        state.level.at(x, 5).typ = ROOM;
    const calls = [];
    const random = {
        rn1(bound, base) {
            calls.push(['rn1', bound, base]);
            return 4;
        },
        rn2(bound) {
            calls.push(['rn2', bound]);
            return 6; // south, southwest, then wrapped west
        },
        rnd(bound) {
            calls.push(['rnd', bound]);
            return 1;
        },
        rne: () => assert.fail('unexpected rne'),
    };

    const trap = mktrap(
        ROLLING_BOULDER_TRAP,
        MKTRAP_MAZEFLAG,
        null,
        { x: 10, y: 5 },
        { state, random, hooks: objectGenerationHooks() },
    );

    assert.deepEqual(calls, [
        ['rn1', 5, 4],
        ['rn2', 8],
        ['rnd', 2],
        ['rnd', 4],
    ]);
    assert.deepEqual(trap.launch, { x: 6, y: 5 });
    assert.deepEqual(trap.launch2, { x: 14, y: 5 });
    assert.equal(floorPile(state, 6, 5).length, 1);
});

test('rolling launch reduces distance only after all eight directions fail', () => {
    const state = generationState();
    state.u.uz.dlevel = 4;
    state.dungeons[0].dunlev_ureached = 4;
    for (let x = 7; x <= 13; ++x)
        state.level.at(x, 5).typ = ROOM;
    const calls = [];
    const random = {
        rn1(bound, base) {
            calls.push(['rn1', bound, base]);
            return 4;
        },
        rn2(bound) {
            calls.push(['rn2', bound]);
            return 4; // east fails at distance four, succeeds at three
        },
        rnd(bound) {
            calls.push(['rnd', bound]);
            return 1;
        },
        rne: () => assert.fail('unexpected rne'),
    };

    const trap = mktrap(
        ROLLING_BOULDER_TRAP,
        MKTRAP_MAZEFLAG,
        null,
        { x: 10, y: 5 },
        { state, random, hooks: objectGenerationHooks() },
    );

    assert.deepEqual(calls, [
        ['rn1', 5, 4],
        ['rn2', 8],
        ['rnd', 2],
        ['rnd', 4],
    ]);
    assert.deepEqual(trap.launch, { x: 13, y: 5 });
    assert.deepEqual(trap.launch2, { x: 7, y: 5 });
    assert.equal(floorPile(state, 13, 5).length, 1);
});

test('blocked rolling-boulder traps keep an ammo-free local launch', () => {
    const state = generationState();
    state.u.uz.dlevel = 4;
    state.dungeons[0].dunlev_ureached = 4;
    const calls = [];
    const random = {
        rn1(bound, base) {
            calls.push(['rn1', bound, base]);
            return 4;
        },
        rn2(bound) {
            calls.push(['rn2', bound]);
            return 0;
        },
        rnd(bound) {
            calls.push(['rnd', bound]);
            return 1;
        },
        rne: () => assert.fail('unexpected rne'),
    };

    const trap = mktrap(
        ROLLING_BOULDER_TRAP,
        MKTRAP_MAZEFLAG,
        null,
        { x: 10, y: 5 },
        { state, random, hooks: objectGenerationHooks() },
    );

    assert.deepEqual(calls, [
        ['rn1', 5, 4],
        ['rn2', 8],
        ['rnd', 4],
    ]);
    assert.deepEqual(trap.launch, { x: 10, y: 5 });
    assert.deepEqual(trap.launch2, { x: 10, y: 5 });
    assert.deepEqual(floorPile(state, 10, 5), []);
});

test('every eligible dungeon-level-one trap receives a prior victim', () => {
    // This fresh seed is unrelated to either evaluation corpus. D:1 always
    // satisfies level_difficulty() <= rnd(4), independent of the draw result.
    const state = generationState(271828);
    const trap = mktrap(
        ARROW_TRAP,
        0,
        null,
        { x: 10, y: 5 },
        { state, hooks: objectGenerationHooks() },
    );
    const objects = floorPile(state, 10, 5);
    // place_object() prepends later non-boulders, so the trap's arrow—the
    // first object placed by mktrap_victim()—is the deepest arrow in the pile.
    const arrow = objects.filter((obj) => obj.otyp === ARROW).at(-1);
    const corpse = objects.find((obj) => obj.otyp === CORPSE);

    assert.equal(trap.ttyp, ARROW_TRAP);
    assert.ok(arrow, 'the fired arrow is left at the trap');
    assert.equal(Boolean(arrow.opoisoned), false);
    assert.ok(corpse, 'the shallow-level victim leaves a corpse');
    assert.equal(corpse.age, state.moves - (TAINT_AGE + 1));
    assert.ok(
        [PM_ELF, PM_DWARF, PM_ORC, PM_GNOME, PM_HUMAN]
            .includes(corpse.corpsenm)
        || (corpse.corpsenm >= PM_ARCHEOLOGIST
            && corpse.corpsenm < PM_WIZARD),
        `unexpected victim species ${corpse.corpsenm}`,
    );
    assert.ok(
        objects.some((obj) => obj !== corpse && obj !== arrow && obj.cursed),
        'the victim has at least one cursed possession',
    );
    for (const obj of objects) {
        assert.equal(obj.where, OBJ_FLOOR);
        assert.deepEqual([obj.ox, obj.oy], [10, 5]);
    }
});

test('fresh seeds cover every dungeon-level-one victim-bearing trap', () => {
    const kinds = [
        ARROW_TRAP,
        DART_TRAP,
        ROCKTRAP,
        BEAR_TRAP,
        MAGIC_TRAP,
    ];
    for (let kindIndex = 0; kindIndex < kinds.length; ++kindIndex) {
        const kind = kinds[kindIndex];
        for (let sample = 0; sample < 8; ++sample) {
            const seed = 910001 + kindIndex * 100 + sample;
            const state = generationState(seed);
            const trap = mktrap(
                kind,
                0,
                null,
                { x: 10, y: 5 },
                { state, hooks: objectGenerationHooks() },
            );
            const objects = floorPile(state, 10, 5);
            assert.equal(trap.ttyp, kind, `kind ${kind}, seed ${seed}`);
            assert.ok(
                objects.some((obj) => obj.otyp === CORPSE),
                `missing victim corpse for kind ${kind}, seed ${seed}`,
            );
            assert.ok(
                objects.some((obj) => obj.otyp !== CORPSE && obj.cursed),
                `missing cursed possession for kind ${kind}, seed ${seed}`,
            );
        }
    }
});

test('cursing a generated bag updates its source-defined content weight', () => {
    const state = generationState(314159);
    const bag = mksobj(BAG_OF_HOLDING, false, false, { state });
    const rock = mksobj(ROCK, false, false, { state });
    add_to_container(bag, rock, {
        state,
        hooks: { objectNoLongerHeld: obj_no_longer_held },
    });
    const neutralWeight = bag.owt;

    curseFreeObject(bag, { state });

    assert.equal(bag.cursed, true);
    assert.ok(bag.owt > neutralWeight);
    assert.equal(
        bag.owt,
        state.objects[BAG_OF_HOLDING].oc_weight + 2 * rock.owt,
    );
});

test('level object hooks can discard a timed land-mine possession', () => {
    const state = generationState(161803);
    const egg = mksobj(EGG, false, false, { state });
    start_timer(10, TIMER_OBJECT, HATCH_EGG, egg, state);
    const hooks = objectGenerationHooks();

    hooks.stopObjectTimers(egg, { state, hooks });

    assert.equal(egg.timed, 0);
    assert.equal(state.gt.timer_base, null);
});

test('normal webs delegate their source-ordered giant-spider creation', () => {
    const state = generationState(141421);
    let call = null;
    const hooks = objectGenerationHooks({
        makeMonster(species, x, y, flags, env) {
            call = { species, x, y, flags, env };
            return {};
        },
    });

    const trap = mktrap(
        WEB,
        0,
        null,
        { x: 10, y: 5 },
        { state, hooks },
    );

    assert.equal(trap.ttyp, WEB);
    assert.equal(call.species.pmidx, PM_GIANT_SPIDER);
    assert.deepEqual([call.x, call.y, call.flags], [10, 5, 0]);
    assert.equal(call.env.state, state);
});
