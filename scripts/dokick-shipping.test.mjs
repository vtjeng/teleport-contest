import assert from 'node:assert/strict';
import test from 'node:test';
import {
    HOLE, IN_SIGHT, MIGR_LADDER_UP, MIGR_NOWHERE, MIGR_RANDOM,
    MIGR_SSTAIRS, MIGR_STAIRS_UP, OBJ_DELETED, OBJ_MIGRATING, TRAPDOOR,
} from '../js/const.js';
import { down_gate, drop_to, otransit_msg, ship_object } from '../js/dokick.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj, place_object } from '../js/obj.js';
import { BOULDER, CORPSE, DAGGER, EGG, MIRROR } from '../js/objects.js';
import { PM_NEWT } from '../js/monsters.js';

async function setup() {
    // Reuse the independently preselected Healer recipe's seed/date. It starts
    // on dungeon 0, level 1; clear only gates and visibility for isolated cases.
    await runSegment({ seed: 8450001, datetime: '20320415101723', moves: '',
        nethackrc: 'OPTIONS=name:Shipping,role:Healer,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n' });
    game.stairs = null;
    game.level.traps = [];
    game.viz_array = game.viz_array.map((row) => row.map(() => 0));
    return game;
}

function stair(state, isladder = false) {
    // An ordinary downward gate joins dungeon 0 levels 1 and 2 (drop_to).
    state.stairs = { sx: state.u.ux, sy: state.u.uy, up: false, isladder,
        tolev: { dnum: 0, dlevel: 2 }, next: null };
    return state.stairs;
}

test('drop_to pins all destination arms to dokick.c:1473-1506', () => {
    // Choose level 3 of a nine-level dungeon so the default destination is 4.
    // (4,5) is an arbitrary gate coordinate reused in every destination arm.
    const state = { u: { uz: { dnum: 0, dlevel: 3 } },
        dungeons: [{ num_dunlevs: 9 }], stairs: null };
    const cc = {};
    for (const loc of [MIGR_RANDOM, MIGR_STAIRS_UP, MIGR_LADDER_UP, MIGR_SSTAIRS]) {
        drop_to(cc, loc, 4, 5, state);
        assert.deepEqual(cc, { x: 0, y: 4 });
    }
    // A branch staircase must use its explicit dungeon 2, level 7 destination.
    state.stairs = { sx: 4, sy: 5, tolev: { dnum: 2, dlevel: 7 } };
    drop_to(cc, MIGR_SSTAIRS, 4, 5, state);
    assert.deepEqual(cc, { x: 2, y: 7 });
    // Stronghold holes use the valley tuple, independently of the staircase.
    state.stronghold_level = { ...state.u.uz };
    state.valley_level = { dnum: 3, dlevel: 1 };
    drop_to(cc, MIGR_RANDOM, 4, 5, state);
    assert.deepEqual(cc, { x: 3, y: 1 });
    state.stronghold_level = null;
    // In_endgame compares dungeon numbers; level 1 itself is immaterial.
    state.astral_level = { dnum: 0, dlevel: 1 };
    drop_to(cc, MIGR_RANDOM, 4, 5, state);
    assert.deepEqual(cc, { x: 0, y: 0 });
    state.astral_level = null;
    // Level 9 is the declared bottom; both it and MIGR_NOWHERE yield (0,0).
    state.u.uz.dlevel = 9;
    drop_to(cc, MIGR_RANDOM, 4, 5, state);
    assert.deepEqual(cc, { x: 0, y: 0 });
    drop_to(cc, MIGR_NOWHERE, 4, 5, state);
    assert.deepEqual(cc, { x: 0, y: 0 });
});

test('down_gate distinguishes stairs, ladder, quest gate, and seen shafts', async () => {
    const state = await setup();
    const { ux: x, uy: y } = state.u;
    const gate = stair(state);
    assert.equal(down_gate(x, y, state), MIGR_STAIRS_UP);
    assert.equal(state.gg.gate_str, 'down the stairs');
    // Any other dungeon number selects MIGR_SSTAIRS (dokick.c:1958).
    gate.tolev.dnum = 2;
    assert.equal(down_gate(x, y, state), MIGR_SSTAIRS);
    gate.isladder = true;
    assert.equal(down_gate(x, y, state), MIGR_LADDER_UP);
    assert.equal(state.gg.gate_str, 'down the ladder');
    state.qstart_level = { ...state.u.uz };
    state.svq.quest_status.got_quest = false;
    state.svq.quest_status.got_thanks = false;
    state.svq.quest_status.killed_leader = false;
    assert.equal(down_gate(x, y, state), MIGR_NOWHERE);
    assert.equal(state.gg.gate_str, null);
    state.svq.quest_status.killed_leader = true;
    assert.equal(down_gate(x, y, state), MIGR_LADDER_UP);
    state.qstart_level = null;
    gate.up = true;
    assert.equal(down_gate(x, y, state), MIGR_NOWHERE);
    for (const type of [TRAPDOOR, HOLE]) {
        const trap = { tx: x, ty: y, ttyp: type, tseen: false };
        state.level.traps = [trap];
        assert.equal(down_gate(x, y, state), MIGR_NOWHERE);
        trap.tseen = true;
        assert.equal(down_gate(x, y, state), MIGR_RANDOM);
        assert.equal(state.gg.gate_str,
            type === TRAPDOOR ? 'through the trap door' : 'through the hole');
    }
    // The adjacent square has no gate and must clear the previous description.
    assert.equal(down_gate(x + 1, y, state), MIGR_NOWHERE);
    assert.equal(state.gg.gate_str, null);
});

test('ship_object preserves no-gate, ladder, stairs, and attached-object RNG order', async () => {
    const state = await setup();
    const { ux: x, uy: y } = state.u;
    const obj = mksobj(DAGGER, false, false, { state });
    const draws = [];
    // rn2(3)=1 keeps an unattached object upstairs; ladders skip that draw.
    // breaktest's obj_resists then draws rn2(100), also answered with 1.
    const env = { state, random: { rn2: (n) => { draws.push(n); return 1; } } };
    assert.equal(await ship_object(null, x, y, false, env), false);
    assert.equal(await ship_object(obj, x, y, false, env), false);
    assert.deepEqual(draws, []);
    const gate = stair(state);
    assert.equal(await ship_object(obj, x, y, false, env), false);
    assert.deepEqual(draws, [3]);
    draws.length = 0;
    state.uball = obj;
    assert.equal(await ship_object(obj, x, y, false, env), false);
    assert.deepEqual(draws, []);
    state.uball = null;
    gate.isladder = true;
    assert.equal(await ship_object(obj, x, y, false, env), true);
    assert.deepEqual(draws, [100]);
    assert.equal(obj.where, OBJ_MIGRATING);
    assert.equal(state.gm.migrating_objs, obj);
    assert.deepEqual([obj.ox, obj.oy, obj.owornmask], [0, 2, MIGR_LADDER_UP]);
    assert.deepEqual([obj.omigr_from_dnum, obj.omigr_from_dlevel], [0, 1]);
});

test('ship_object breaks mirrors and hero-laid eggs before migration', async () => {
    // dokick.c:1721/1726: mirror luck loss is 2; seven hero-laid eggs exceed
    // the five-point cap. spe=1 and a valid newt species mark laid eggs.
    for (const [type, penalty, result] of [[MIRROR, 2, 'crash'], [EGG, 5, 'splat']]) {
        const state = await setup();
        stair(state, true);
        const obj = mksobj(type, false, false, { state });
        obj.spe = 1;
        obj.corpsenm = PM_NEWT;
        obj.quan = 7;
        state.flags.acoustics = true;
        const before = state.u.uluck;
        const messages = [], draws = [];
        const env = { state, message: (text) => { messages.push(text); },
            random: { rn2: (n) => { draws.push(n); return 1; } } };
        assert.equal(await ship_object(obj, state.u.ux, state.u.uy, false, env), true);
        assert.equal(state.u.uluck, before - penalty);
        assert.equal(obj.where, OBJ_DELETED);
        assert.deepEqual(draws, [100]);
        assert.deepEqual(messages, [`You hear a muffled ${result}.`]);
    }
});

test('ship_object leaves a boulder over a hole after the stay-here roll', async () => {
    // rn2(3)=0 selects falling, but the subsequent boulder/hole guard wins.
    const state = await setup();
    const { ux: x, uy: y } = state.u;
    state.level.traps = [{ tx: x, ty: y, ttyp: HOLE, tseen: true }];
    const obj = mksobj(BOULDER, false, false, { state });
    const draws = [];
    assert.equal(await ship_object(obj, x, y, false,
        { state, random: { rn2: (n) => { draws.push(n); return 0; } } }), false);
    assert.deepEqual(draws, [3]);
});

test('otransit_msg names corpses and agrees impact, chain, and fall verbs', async () => {
    // Impact counts 0,1,3 select no pile, singular, plural. Quantity 2 selects
    // plural verbs; num=0 with a chain selects the separate rattle wording.
    const state = await setup();
    state.gg = { gate_str: 'down the stairs' };
    const messages = [];
    const env = { state, message: (text) => { messages.push(text); } };
    const obj = mksobj(DAGGER, false, false, { state });
    obj.dknown = true;
    await otransit_msg(obj, false, false, 0, env);
    await otransit_msg(obj, true, false, 1, env);
    obj.quan = 2;
    await otransit_msg(obj, false, false, 3, env);
    await otransit_msg(obj, true, true, 0, env);
    const corpse = mksobj(CORPSE, false, false, { state });
    corpse.corpsenm = PM_NEWT;
    await otransit_msg(corpse, false, false, 0, env);
    assert.deepEqual(messages, ['The dagger falls down the stairs.',
        'The dagger hits another object.',
        'The daggers hit other objects and fall down the stairs.',
        'The daggers rattle your chain.', 'The newt corpse falls down the stairs.']);
});

test('ship_object reports pile impact before migration', async () => {
    // One visible dagger on a ladder hits one floor object. rn2(100)=1 leaves
    // the missile intact; the missing void impact_drop cannot move the pile.
    const state = await setup();
    const { ux: x, uy: y } = state.u;
    stair(state, true);
    state.viz_array[y][x] = IN_SIGHT;
    const pile = mksobj(DAGGER, false, false, { state });
    place_object(pile, x, y, { state });
    const obj = mksobj(DAGGER, false, false, { state });
    obj.dknown = true;
    const messages = [];
    assert.equal(await ship_object(obj, x, y, false, { state, planning: true,
        random: { rn2: () => 1 }, message: (text) => { messages.push(text); } }), true);
    assert.deepEqual(messages,
        ['The dagger hits another object and falls down the ladder.']);
    assert.equal(state.gm.migrating_objs, obj);
    assert.equal(state.level.objects[x][y], pile,
        'unported impact_drop is recorded, not replaced with invented pile movement');
});
