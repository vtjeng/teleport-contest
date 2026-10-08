import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ALTAR,
    BLINDED,
    CORR,
    IN_SIGHT,
    LAVAPOOL,
    OBJ_FLOOR,
    OBJ_DELETED,
    OBJ_LUAFREE,
    OBJ_FREE,
    PIT,
    POOL,
    ROOM,
    THRONE,
} from '../js/const.js';
import { boulder_hits_pool, flooreffects } from '../js/do.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { objects_globals_init } from '../js/objects.js';
import { init_objects } from '../js/o_init.js';
import { initRng, enableRngLog, getRngLog } from '../js/rng.js';
import { newObject, place_object } from '../js/obj.js';
import { start_glob_timeout, timeout_globals_init } from '../js/timeout.js';
import {
    BOULDER,
    GLOB_OF_GRAY_OOZE,
    FOOD_CLASS,
    POTION_CLASS,
    POT_WATER,
    ROCK,
    ROCK_CLASS,
} from '../js/objects.js';

const DROP_X = 12;
const DROP_Y = 8;
const AWAY_X = 30;
const AWAY_Y = 3;

const C_DO = readFileSync(
    new URL('../nethack-c/upstream/src/do.c', import.meta.url), 'utf8',
);
const JS_DO = readFileSync(new URL('../js/do.js', import.meta.url), 'utf8');

test('do.c boulder lava splash awaits burn_away_slime before damage', () => {
    const cStart = C_DO.indexOf('boulder_hits_pool(\n    struct obj *otmp');
    const cEnd = C_DO.indexOf(
        '\n/* Used for objects which sometimes do special things when dropped',
        cStart,
    );
    assert.ok(cStart >= 0 && cEnd > cStart);
    const cBoulder = C_DO.slice(cStart, cEnd);
    const cOrder = [
        'You("are hit by molten %s%c",',
        'burn_away_slime();',
        'dmg = d((Fire_resistance ? 1 : 3), 6);',
        'losehp(Maybe_Half_Phys(dmg),',
    ].map((text) => cBoulder.indexOf(text));
    assert.ok(cOrder.every((index) => index >= 0));
    assert.deepEqual(cOrder, [...cOrder].sort((a, b) => a - b));

    const jsStart = JS_DO.indexOf('export async function boulder_hits_pool(');
    const jsEnd = JS_DO.indexOf('\n}\n', jsStart) + 3;
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    const jsBoulder = JS_DO.slice(jsStart, jsEnd);
    const jsOrder = [
        'await message(\n                `You are hit by molten',
        'await burn_away_slime(state, rawEnv);',
        'const damage = random.d',
        'await losehp(',
    ].map((text) => jsBoulder.indexOf(text));
    assert.ok(jsOrder.every((index) => index >= 0));
    assert.deepEqual(jsOrder, [...jsOrder].sort((a, b) => a - b));
    assert.doesNotMatch(jsBoulder, /note_unported\(['"]trap\.c burn_away_slime/u);
});

test('boulder_hits_pool keeps the C trap pointer and pushing visibility arms', () => {
    const cStart = C_DO.indexOf('boolean\nboulder_hits_pool(\n');
    const cEnd = C_DO.indexOf(
        '\n/* Used for objects which sometimes do special things when dropped',
        cStart,
    );
    const jsStart = JS_DO.indexOf('export async function boulder_hits_pool(');
    const jsEnd = JS_DO.indexOf('\n}\n', jsStart) + 3;
    assert.ok(cStart >= 0 && cEnd > cStart && jsStart >= 0 && jsEnd > jsStart);
    const cBody = C_DO.slice(cStart, cEnd);
    const jsBody = JS_DO.slice(jsStart, jsEnd);

    assert.match(cBody, /struct trap \*ttmp = t_at\(rx, ry\)/u);
    assert.ok(cBody.indexOf('ttmp = t_at(rx, ry)')
        < cBody.indexOf('mondied(mtmp)'));
    assert.match(cBody, /if \(ttmp\)\s+\(void\) delfloortrap\(ttmp\)/u);
    assert.match(cBody,
        /pushing \? !Blind : cansee\(rx, ry\)/u);
    assert.match(jsBody, /const trap = t_at\(rx, ry, state\)/u);
    assert.ok(jsBody.indexOf('const trap = t_at(rx, ry, state)')
        < jsBody.indexOf('await mondied(monster, state, rawEnv)'));
    assert.match(jsBody, /await delfloortrap\(trap, state\)/u);
    assert.doesNotMatch(jsBody, /const currentTrap = t_at/u);
    assert.match(jsBody,
        /pushing \? !heroIsBlind\(state\) : cansee\(rx, ry, state\)/u);
});

function fixture({
    typ = ROOM, temperature = 0, monMoving = false, seen = true,
} = {}) {
    const level = new GameMap();
    level.at(DROP_X, DROP_Y).typ = typ;
    level.flags.temperature = temperature;
    const state = {
        level,
        context: { mon_moving: monMoving },
        flags: { verbose: true },
        u: {
            ux: AWAY_X,
            uy: AWAY_Y,
            utrap: 0,
            utraptype: 0,
            uinwater: false,
            luck: 0,
        },
        viz_array: Array.from({ length: 21 }, () => new Array(80).fill(0)),
    };
    state.level.traps = [];
    if (seen) state.viz_array[DROP_Y][DROP_X] = IN_SIGHT;
    init_objects(state, () => 0);
    return state;
}

function object(overrides = {}) {
    return {
        otyp: ROCK,
        oclass: ROCK_CLASS,
        where: OBJ_FREE,
        globby: false,
        nobj: {},
        nexthere: {},
        ...overrides,
    };
}

async function land(state, obj, x = DROP_X, y = DROP_Y, env = {}) {
    return flooreffects(obj, x, y, 'fall', { state, ...env });
}

test('globby flooreffects discards the meld survivor and consumes the incoming pointer', async () => {
    const cStart = C_DO.indexOf('} else if (obj->globby)');
    const cEnd = C_DO.indexOf('} else if (svc.context.mon_moving', cStart);
    const cBody = C_DO.slice(cStart, cEnd);
    assert.match(cBody, /\(void\) obj_meld\(&globbyobj, &otmp\)/u);
    assert.match(cBody, /res = \(boolean\) !globbyobj/u);
    // C nulls the consumed pointer even if Lua retains the object allocation.
    for (const luaReferences of [0, 1]) {
        // obj_nexto_xy uses the canonical catalog; initialize a live state.
        const state = Object.assign(resetGame(), fixture());
        objects_globals_init(state);
        init_objects(state, () => 0);
        state.moves = 100; // Both pending shrink timers start from this turn.
        timeout_globals_init(state);
        const incoming = newObject({ otyp: GLOB_OF_GRAY_OOZE,
            oclass: FOOD_CLASS, globby: true, where: OBJ_FREE,
            quan: 1, owt: 100, age: 90, lua_ref_cnt: luaReferences });
        const floor = newObject({ ...incoming, owt: 20, lua_ref_cnt: 0 });
        // A heavier free glob still loses to a lighter floor glob in obj_meld.
        place_object(floor, DROP_X, DROP_Y, { state });
        start_glob_timeout(incoming, 20, { state });
        start_glob_timeout(floor, 40, { state });
        initRng(13927); // Fixed log, without coupling a result to this seed.
        enableRngLog();
        const messages = [];
        assert.equal(await land(state, incoming, DROP_X, DROP_Y, {
            message: async (line) => {
                // The source message precedes absorption and timer cleanup.
                assert.equal(incoming.where, OBJ_FREE);
                assert.equal(floor.owt, 20);
                messages.push(line);
            },
        }), true);
        assert.equal(incoming.where, luaReferences ? OBJ_LUAFREE : OBJ_DELETED);
        assert.equal(incoming.timed, 0);
        assert.equal(floor.where, OBJ_FLOOR);
        assert.equal(floor.owt, 120); // C adds the two original weights.
        assert.equal(floor.quan, 1); // Globs combine by weight, never quantity.
        assert.equal(floor.timed, 1); // Both timers become one averaged timer.
        assert.equal(state.gt.timer_base.arg, floor);
        assert.equal(state.gt.timer_base.next, null);
        assert.equal(state.gt.timer_base.timeout, 130); // Mean(20,40) + turn100.
        assert.equal(state.level.objlist, floor);
        assert.equal(state.level.objects[DROP_X][DROP_Y], floor);
        assert.equal(messages.length, 1); // No second neighbor scan or message.
        assert.deepEqual(getRngLog(), []); // Local match, no weight tie or rescan.
    }
});

test('flooreffects answers FALSE on an ordinary floor and clears links', async () => {
    const state = fixture();
    const obj = object();
    assert.equal(await land(state, obj), false);
    assert.equal(obj.nobj, null);
    assert.equal(obj.nexthere, null);
    assert.deepEqual(state.gb.bhitpos, undefined);
});

test('flooreffects keeps ordinary corridor and altar arms source gated', async () => {
    assert.equal(await land(fixture({ typ: CORR }), object({
        otyp: POT_WATER, oclass: POTION_CLASS,
    })), false);
    assert.equal(await land(fixture({ typ: ALTAR }), object()), false);
    assert.equal(await land(fixture({
        typ: ALTAR, monMoving: true, seen: false,
    }), object()), false);
});

test('boulder_hits_pool fills a visible pool using its single rn2(10)', async () => {
    const state = fixture({ typ: POOL });
    const boulder = object({ otyp: BOULDER });
    const calls = [];
    const result = await land(state, boulder, DROP_X, DROP_Y, {
        random: { rn2: (n) => { calls.push(n); return 1; } },
        message: async () => {},
        newsym: () => {},
        wakeNear: async () => {},
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [10]);
    assert.equal(state.level.at(DROP_X, DROP_Y).typ, ROOM);
    assert.notEqual(boulder.where, OBJ_FREE);
});

test('boulder_hits_pool sinks in lava on rn2(10) zero and consumes the boulder', async () => {
    const state = fixture({ typ: LAVAPOOL });
    const boulder = object({ otyp: BOULDER });
    const calls = [];
    assert.equal(await land(state, boulder, DROP_X, DROP_Y, {
        random: {
            rn2: (n) => { calls.push(n); return 0; },
            rnd: () => 1,
            d: () => 1,
        },
        message: async () => {},
        newsym: () => {},
        wakeNear: async () => {},
    }), true);
    assert.deepEqual(calls, [10]);
    assert.notEqual(boulder.where, OBJ_FREE);
});

test('boulder_hits_pool supplies the C damage die for a partial random owner',
    async () => {
        // do.c:65-73 calls d(3,6) when an adjacent boulder does not fill lava.
        // Only rn2 is overridden here; the selected C helper supplies d/rnd
        // from the initialized core RNG rather than invoking an absent method.
        const state = fixture({ typ: LAVAPOOL });
        state.u.ux = DROP_X - 1;
        state.u.uy = DROP_Y;
        state.u.uhp = 100;
        state.u.uhpmax = 100;
        initRng(20261003);
        const calls = [];
        const boulder = object({ otyp: BOULDER });

        assert.equal(await land(state, boulder, DROP_X, DROP_Y, {
            random: { rn2: (n) => { calls.push(n); return 1; } },
            message: async () => {},
            newsym: () => {},
            wakeNear: async () => {},
        }), true);

        assert.deepEqual(calls, [10]);
        assert.ok(state.u.uhp < 100 && state.u.uhp >= 82,
            'the fallback d(3,6) deals one to eighteen damage');
        assert.notEqual(boulder.where, OBJ_FREE);
    });

test('boulder_hits_pool uses one C d(3,6) call for adjacent lava damage',
    async () => {
        const state = fixture({ typ: LAVAPOOL });
        state.u.ux = DROP_X - 1;
        state.u.uy = DROP_Y;
        state.u.uhp = 100;
        state.u.uhpmax = 100;
        const calls = [];
        const boulder = object({ otyp: BOULDER });

        assert.equal(await land(state, boulder, DROP_X, DROP_Y, {
            random: {
                rn2: (n) => { calls.push(['rn2', n]); return 1; },
                d: (count, sides) => {
                    calls.push(['d', count, sides]);
                    return 7;
                },
            },
            message: async () => {},
            newsym: () => {},
            wakeNear: async () => {},
        }), true);

        assert.deepEqual(calls, [['rn2', 10], ['d', 3, 6]]);
        assert.equal(state.u.uhp, 93);
    });

test('pushing pool boulders uses !Blind for both source sink messages', async () => {
    for (const [blind, expectsSink] of [[true, false], [false, true]]) {
        const state = fixture({ typ: POOL, seen: true });
        state.u.uprops = blind ? { [BLINDED]: { intrinsic: 1 } } : {};
        // A floor boulder on ordinary POOL plus rn2(10)=0 selects the C sink
        // branch; only the Blind source predicate varies between cases.
        const boulder = object({
            otyp: BOULDER,
            quan: 1,
            where: OBJ_FLOOR,
            ox: DROP_X,
            oy: DROP_Y,
            nobj: null,
            nexthere: null,
        });
        state.level.objects[DROP_X][DROP_Y] = boulder;
        const messages = [];

        await boulder_hits_pool(boulder, DROP_X, DROP_Y, true, {
            state,
            random: { rn2: () => 0 },
            message: async (text) => { messages.push(text); },
            newsym: () => {},
            wakeNear: async () => {},
            hooks: {
                extractExternalObject(obj) {
                    assert.equal(state.level.objects[DROP_X][DROP_Y], obj);
                    state.level.objects[DROP_X][DROP_Y] = null;
                    obj.where = OBJ_FREE;
                },
            },
        });

        assert.equal(messages.some((text) => text === 'It sinks without a trace!'),
            expectsSink);
    }
});

test('hot ground breaks an unresisting potion after the source survival draw', async () => {
    const state = fixture({ temperature: 1 });
    const potion = object({ otyp: POT_WATER, oclass: POTION_CLASS });
    const calls = [];
    const result = await land(state, potion, DROP_X, DROP_Y, {
        random: {
            rn2: (n) => { calls.push(n); return n === 100 ? 99 : 99; },
            rnd: () => 1,
        },
        message: async () => {},
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [100, 100]);
    assert.notEqual(potion.where, OBJ_FREE);
});

test('the hero pit arm remains conditional on a seen trap beneath the hero', async () => {
    const underHero = fixture();
    underHero.u.ux = DROP_X;
    underHero.u.uy = DROP_Y;
    underHero.u.utrap = 1;
    underHero.u.utraptype = PIT;
    underHero.level.traps = [{
        ttyp: PIT, tx: DROP_X, ty: DROP_Y, tseen: true,
    }];
    assert.equal(await land(underHero, object()), false);
    const elsewhere = fixture();
    elsewhere.level.traps = [{
        ttyp: PIT, tx: DROP_X, ty: DROP_Y, tseen: true,
    }];
    assert.equal(await land(elsewhere, object()), false);
});

test('flooreffects rejects an object that is not free', async () => {
    await assert.rejects(
        () => land(fixture(), object({ where: OBJ_FLOOR })),
        /flooreffects: obj not free/u,
    );
});

// do.c:flooreffects's hot-ground potion arm explicitly admits only ROOM
// or CORR. THRONE retains the initial FALSE even on a hot level.
test('a potion on a hot throne has no floor effect or survival draw', async () => {
    assert.match(C_DO, /obj->oclass == POTION_CLASS && svl.level.flags.temperature > 0\s+&& \(levl\[x\]\[y\].typ == ROOM \|\| levl\[x\]\[y\].typ == CORR\)/u);
    const state = fixture({ temperature: 1 }); // Positive temperature enables the adjacent ROOM/CORR arm.
    state.level.at(DROP_X, DROP_Y).typ = THRONE;
    const potion = object({ otyp: POT_WATER, oclass: POTION_CLASS });
    const priorHit = { x: AWAY_X, y: AWAY_Y }; // A distinct coordinate detects bhitpos restoration.
    state.gb = { bhitpos: { ...priorHit } };
    const forbidden = () => { throw new Error('a throne has no hot-potion draw or message'); };
    assert.equal(await land(state, potion, DROP_X, DROP_Y, {
        random: { rn2: forbidden }, message: forbidden,
    }), false);
    assert.equal(potion.where, OBJ_FREE);
    assert.equal(potion.nobj, null);
    assert.equal(potion.nexthere, null);
    assert.deepEqual(state.gb.bhitpos, priorHit);
});
