import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    HOLE, IN_SIGHT, MIGR_LADDER_UP, MIGR_NOWHERE, MIGR_RANDOM, MIGR_WITH_HERO,
    MIGR_SSTAIRS, MIGR_STAIRS_UP, OBJ_CONTAINED, OBJ_DELETED,
    OBJ_FLOOR, OBJ_MIGRATING, TRAPDOOR,
} from '../js/const.js';
import {
    container_impact_dmg, down_gate, drop_to, otransit_msg,
    really_kick_object, ship_object,
} from '../js/dokick.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj, objectType, place_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { add_to_container } from '../js/invent.js';
import {
    BAG_OF_HOLDING, BAG_OF_TRICKS, BOULDER, CORPSE, DAGGER, EGG,
    GLASS, LARGE_BOX, MIRROR, POT_WATER,
} from '../js/objects.js';
import { PM_NEWT, PM_SHOPKEEPER } from '../js/monsters.js';

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

test('really_kick_object keeps a gate-broken object cleared', async () => {
    const state = await setup();
    const x = state.u.ux + 1;
    const y = state.u.uy;
    const gateX = x + 1;
    state.level.at(x, y).typ = state.level.at(state.u.ux, state.u.uy).typ;
    state.level.at(gateX, y).typ = state.level.at(state.u.ux, state.u.uy).typ;
    state.stairs = {
        sx: gateX,
        sy: y,
        up: false,
        isladder: true,
        tolev: { dnum: 0, dlevel: 2 },
        next: null,
    };
    state.u.dx = 1;
    state.u.dy = 0;
    const obj = mksobj(MIRROR, false, false, { state });
    place_object(obj, x, y, { state });
    state.gk = { kickedobj: obj };
    const rolls = [0, 1];
    assert.equal(await really_kick_object(x, y, state, {
        message: async () => {},
        norepMessage: async () => {},
        redraw: () => {},
        random: {
            rn2(n) {
                assert.equal(n, 100);
                return rolls.shift();
            },
        },
    }), 1);
    assert.deepEqual(rolls, []);
    assert.equal(state.gk.kickedobj, null);
    assert.equal(obj.where, OBJ_DELETED);
    assert.notEqual(state.gm.migrating_objs, obj);
    assert.notEqual(state.level.objects[gateX][y], obj);
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
    // the missile intact; impact_drop's rn2(3)=1 keeps the floor pile upstairs.
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
        'impact_drop tested the pile and left it upstairs');
});

test('impact_drop preserves protected objects, quantities and boulder draw order', async () => {
    const { impact_drop } = await import('../js/dokick.js');
    const state = await setup();
    const { ux: x, uy: y } = state.u;
    stair(state);
    const floor = [];
    // The head-to-tail pile contains a missile, attached objects, a boulder,
    // then two daggers. Protected objects count toward oct but never draw.
    for (const type of [DAGGER, BOULDER, DAGGER, DAGGER, DAGGER]) {
        const obj = mksobj(type, false, false, { state });
        place_object(obj, x, y, objectGenerationEnv({ state }));
        floor.unshift(obj);
    }
    const [missile, ball, chain, boulder, daggers] = floor;
    state.uball = ball;
    state.uchain = chain;
    daggers.quan = 2; // dct counts quantity, not the number of object nodes.
    const draws = [];
    await impact_drop(missile, x, y, 7, { state,
        random: { rn2: n => { draws.push(n); return 0; } },
    });
    assert.deepEqual(draws, [30, 3]); // C boulder denominator30, ordinary3.
    assert.equal(state.gm.migrating_objs, daggers);
    assert.equal(daggers.nobj, boulder);
    assert.equal(state.level.objects[x][y], missile);
    assert.deepEqual([daggers.ox, daggers.oy, daggers.owornmask], [0, 7, MIGR_WITH_HERO]);
    assert.deepEqual([daggers.omigr_from_dnum, daggers.omigr_from_dlevel], [0, 1]);
    assert.equal(ball.where, OBJ_FLOOR); // Attached objects remain upstairs.
    assert.equal(chain.where, OBJ_FLOOR);
});

test('impact_drop gates precede dlev override and rock skips boulder RNG', async () => {
    const { impact_drop } = await import('../js/dokick.js');
    const { ROCK } = await import('../js/objects.js');
    const state = await setup();
    const { ux: x, uy: y } = state.u;
    const boulder = mksobj(BOULDER, false, false, { state });
    place_object(boulder, x, y, objectGenerationEnv({ state }));
    const missile = mksobj(ROCK, false, false, { state });
    const draws = [];
    const env = { state, random: { rn2: n => { draws.push(n); return 0; } } };
    await impact_drop(null, x, y, 7, env); // No gate still returns before dlev7.
    stair(state);
    await impact_drop(missile, x, y, 0, env);
    assert.deepEqual(draws, []);
    assert.equal(state.level.objects[x][y], boulder);
    assert.equal(state.gm.migrating_objs ?? null, null);
});

test('impact_drop pins literal source singular and partial-pile messages', async () => {
    const { impact_drop } = await import('../js/dokick.js');
    for (const [missilePresent, quantity, partial, expected] of [
        [false, 1, false, 'The adjacent object falls down the stairs.'],
        [false, 2, false, 'All the adjacent objects fall down the stairs.'],
        [false, 1, true, 'One of the adjacent objects falls down the stairs.'],
        [false, 2, true, 'Some of the adjacent objects fall down the stairs.'],
        [true, 1, false, 'From the impact, the other object falls.'],
        [true, 1, true, 'From the impact, another object falls.'],
        [true, 2, true, 'From the impact, other objects fall.'],
    ]) {
        const state = await setup();
        const { ux: x, uy: y } = state.u;
        stair(state);
        state.viz_array[y][x] = IN_SIGHT;
        if (partial) {
            const protectedObject = mksobj(DAGGER, false, false, { state });
            place_object(protectedObject, x, y, { state });
            state.uball = protectedObject; // Count it, but don't drop it.
        }
        const obj = mksobj(DAGGER, false, false, { state });
        obj.quan = quantity;
        place_object(obj, x, y, { state });
        const messages = [];
        const missile = missilePresent ? mksobj(DAGGER, false, false, { state }) : null;
        await impact_drop(missile, x, y, 0, { state,
            random: { rn2: () => 0 }, message: text => messages.push(text) });
        assert.deepEqual(messages, [expected]);
    }
});

test('impact_drop and all seven direct calls retain upstream order', () => {
    const source = readFileSync('nethack-c/upstream/src/dokick.c', 'utf8');
    const js = readFileSync('js/dokick.js', 'utf8');
    assert.match(source, /obj2 = obj->nexthere;[\s\S]*oct \+= obj->quan;[\s\S]*rn2\(obj->otyp == BOULDER \? 30 : 3\)/u);
    assert.match(js, /export async function impact_drop[\s\S]*obj_extract_self[\s\S]*await stolen_value[\s\S]*add_to_migration[\s\S]*obj\.owornmask = toloc/u);
    const owners = ['js/dokick.js', 'js/do.js', 'js/dig.js', 'js/trap.js']
        .map(path => readFileSync(path, 'utf8')).join('\n');
    assert.equal((owners.match(/await impact_drop\(/gu) ?? []).length, 7);
    assert.doesNotMatch(owners, /note_unported\('dokick\.c impact_drop'\)/u);
});

test('impact_drop snapshots shop debit and bills silent lost goods before migration', async () => {
    const { impact_drop } = await import('../js/dokick.js');
    const { GOLD_PIECE } = await import('../js/objects.js');
    const { ROOMOFFSET, SHOPBASE } = await import('../js/const.js');
    const state = await setup();
    const { ux: x, uy: y } = state.u;
    stair(state);
    state.level.flags.has_shop = true;
    // A single interior shop contains hero/gate and keeper, with its free
    // entrance square one column away. Five existing debt plus nine lost
    // gold pieces verifies that the message names the delta, not total14.
    const keeper = { mx: x, my: y, mpeaceful: true, isshk: true,
        data: state.mons[PM_SHOPKEEPER], mnum: PM_SHOPKEEPER,
        mextra: { eshk: { shoplevel: { ...state.u.uz }, shoproom: ROOMOFFSET,
            shk: { x: x + 1, y }, shknam: 'Asidonhopo', debit: 5, robbed: 0,
            credit: 0, billct: 0, bill_p: [] } } };
    state.level.rooms[0] = { rtype: SHOPBASE, resident: keeper };
    state.level.at(x, y).roomno = ROOMOFFSET;
    state.level.at(x, y).edge = false;
    state.u.urooms = [ROOMOFFSET];
    const coins = mksobj(GOLD_PIECE, false, false, { state });
    coins.quan = 9;
    place_object(coins, x, y, { state });
    const messages = [];
    await impact_drop(null, x, y, 0, { state,
        random: { rn2: () => 0 }, message: text => messages.push(text) });
    assert.equal(keeper.mextra.eshk.debit, 14);
    assert.equal(keeper.mextra.eshk.robbed, 0);
    assert.equal(state.gm.migrating_objs, coins);
    assert.equal(coins.where, OBJ_MIGRATING);
    assert.equal(messages.length, 1); // No impact text for the invisible gate.
    assert.deepEqual(messages, ['You owe Asidonhopo 9 zorkmids for goods lost.']);
});

test('impact_drop reports theft after silent billing with prior anger and visibility', async () => {
    const { impact_drop } = await import('../js/dokick.js');
    const { GOLD_PIECE } = await import('../js/objects.js');
    const { ROOMOFFSET, SHOPBASE } = await import('../js/const.js');
    for (const [angry, visible, report] of [
        [false, true, '"Shipping, you are a thief!"'],
        [true, true, 'Asidonhopo is infuriated!'],
        [false, false, 'You hear a scream, "Thief!"'],
    ]) {
        const state = await setup();
        const { ux: x, uy: y } = state.u;
        stair(state);
        state.level.flags.has_shop = true;
        state.plname = 'Shipping';
        const keeper = { mx: x, my: y, mpeaceful: !angry, isshk: true,
            data: state.mons[PM_SHOPKEEPER], mnum: PM_SHOPKEEPER,
            mextra: { eshk: { shoplevel: { ...state.u.uz }, shoproom: ROOMOFFSET,
                shk: { x: x + 1, y }, shknam: 'Asidonhopo', debit: 5,
                robbed: 7, credit: 0, billct: 0, bill_p: [], customer: '' } } };
        state.level.rooms[0] = { rtype: SHOPBASE, resident: keeper };
        state.level.at(x, y).roomno = ROOMOFFSET;
        state.level.at(x, y).edge = false;
        // Outside the shop, silent stolen_value adds nine to existing robbed7.
        state.u.ux = x + 2;
        state.level.at(x + 2, y).roomno = 0;
        state.u.urooms = [];
        if (visible) state.viz_array[y][x] = IN_SIGHT;
        const coins = mksobj(GOLD_PIECE, false, false, { state });
        coins.quan = 9;
        place_object(coins, x, y, { state });
        const messages = [];
        await impact_drop(null, x, y, 0, { state,
            random: { rn2: () => 0 }, message: text => messages.push(text) });
        assert.equal(keeper.mextra.eshk.robbed, 16);
        assert.deepEqual(messages, [
            ...(visible ? ['All the adjacent objects fall down the stairs.'] : []),
            'You removed 9 zorkmids worth of goods!', report,
        ]);
        if (visible) assert.equal(keeper.mextra.eshk.customer, 'Shipping');
        assert.ok(state.unported.has('shk.c hot_pursuit'));
    }
});


test('container_impact_dmg breaks non-gem glass in C order', async () => {
    const state = await setup();
    const box = mksobj(LARGE_BOX, false, false, { state });
    const potion = mksobj(POT_WATER, false, false, { state });
    assert.equal(objectType(potion, state).oc_material, GLASS);
    add_to_container(box, potion, {
        state, hooks: { objectNoLongerHeld() {} },
    });
    state.flags.acoustics = true;
    box.cknown = true;
    const draws = [];
    const messages = [];
    await container_impact_dmg(box, state.u.ux, state.u.uy, {
        state,
        message: (text) => { messages.push(text); },
        random: { rn2: (n) => { draws.push(n); return 99; } },
    });
    assert.deepEqual(draws, [100]);
    assert.equal(box.cobj, null);
    assert.equal(box.cknown, 0);
    assert.equal(potion.where, OBJ_DELETED);
    assert.deepEqual(messages, ['You hear a muffled shatter.']);
    assert.equal(state.unported?.has('sounds.c Soundeffect'), true);
});

test('container_impact_dmg skips bags of holding and tricks', async () => {
    const state = await setup();
    const draws = [];
    for (const type of [BAG_OF_HOLDING, BAG_OF_TRICKS]) {
        const bag = mksobj(type, false, false, { state });
        const potion = mksobj(POT_WATER, false, false, { state });
        add_to_container(bag, potion, {
            state, hooks: { objectNoLongerHeld() {} },
        });
        await container_impact_dmg(bag, state.u.ux, state.u.uy, {
            state,
            random: { rn2: (n) => { draws.push(n); return 99; } },
        });
        assert.equal(bag.cobj, potion);
        assert.equal(potion.where, OBJ_CONTAINED);
    }
    assert.deepEqual(draws, []);
});
