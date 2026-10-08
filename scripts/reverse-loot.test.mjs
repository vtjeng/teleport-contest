import assert from 'node:assert/strict';
import test from 'node:test';
import * as pickup from '../js/pickup.js';

test('pickup.c reverse_loot has a canonical callable owner', () => {
    assert.equal(typeof pickup.reverse_loot, 'function');
});

import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj, place_object, weight } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { CHEST, GOLD_PIECE } from '../js/objects.js';
import { OBJ_INVENT, ROOM, THRONE, T_LOOTED, W_QUIVER } from '../js/const.js';
import { rn2 } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';

async function stateForTest() {
    await runSegment({seed: 15630022, datetime: '20400617120122',
        nethackrc: 'OPTIONS=name:Reverse,role:Barbarian,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup', moves: ''});
    game.invent = null;
    game.level.objlist = null;
    game.level.at(game.u.ux, game.u.uy).typ = ROOM;
    clearTtyMessageWindow(game);
    return game;
}
function coins(state, quantity) {
    const obj = mksobj(GOLD_PIECE, false, false, {state});
    Object.assign(obj, {quan: quantity, where: OBJ_INVENT, invlet: '$'});
    obj.owt = weight(obj, {state});
    state.invent = obj;
    return obj;
}
function messagesAndDraws(values) {
    const draws = [], messages = [];
    return { draws, messages, env: {message: async text => messages.push(text),
        random: {rn2: n => {draws.push(n); assert.ok(values.length); return values.shift();}}}};
}

test('reverse_loot old inventory selection draws once per object with decreasing bounds', async () => {
    const state = await stateForTest();
    const obj = coins(state, 13);
    const second = mksobj(CHEST, false, false, {state});
    Object.assign(second, {where: OBJ_INVENT, invlet: 'a'});
    obj.nobj = second;
    const ops = messagesAndDraws([0, 1, 0]);
    assert.equal(await pickup.reverse_loot(state, ops.env), true);
    assert.deepEqual(ops.draws, [3, 3, 2]);
    assert.match(ops.messages[0], /^You find old loot: a - /);
    assert.equal(state.invent, obj);
    const miss = messagesAndDraws([0, 1, 1]);
    assert.equal(await pickup.reverse_loot(state, miss.env), false);
    assert.deepEqual(miss.draws, [3, 3, 2]);
    assert.deepEqual(miss.messages, []);
});

test('reverse_loot no-gold arm returns false without drawing a contribution', async () => {
    const state = await stateForTest();
    const ops = messagesAndDraws([1]);
    assert.equal(await pickup.reverse_loot(state, ops.env), false);
    assert.deepEqual(ops.draws, [3]);
});

test('reverse_loot contribution uses C positive integer division for all fifths', async () => {
    for (let fifth = 1; fifth <= 5; ++fifth) {
        const state = await stateForTest();
        const gold = coins(state, 13);
        const ops = messagesAndDraws([2]);
        ops.env.random.rnd = n => n === 5 ? fifth : 1;
        const chest = mksobj(CHEST, false, false, {state});
        Object.assign(chest, {spe: 2, olocked: 1, cknown: 1});
        place_object(chest, state.u.ux + 1, state.u.uy, objectGenerationEnv({state}));
        state.level.at(state.u.ux, state.u.uy).typ = THRONE;
        assert.equal(await pickup.reverse_loot(state, ops.env), true);
        const expected = Math.trunc((fifth * 13 + 4) / 5);
        assert.equal(chest.cobj.quan, expected);
        assert.equal(state.invent?.quan ?? 0, 13 - expected);
        assert.equal(chest.cknown, 0);
        assert.equal(chest.owt, weight(chest, {state}));
        if (fifth === 5) assert.equal(chest.cobj, gold);
        assert.deepEqual(ops.messages, ['"Thank you for your contribution to reduce the debt."']);
    }
});

test('reverse_loot treasury chest beats nearest chest and nearest distance ties retain fobj order', async () => {
    const state = await stateForTest();
    const {ux, uy} = state.u;
    const env = objectGenerationEnv({state});
    const far = mksobj(CHEST, false, false, env);
    Object.assign(far, {spe: 2, olocked: 1});
    place_object(far, ux + 3, uy, env);
    const near = mksobj(CHEST, false, false, env);
    Object.assign(near, {olocked: 1});
    place_object(near, ux + 1, uy, env);
    state.level.at(ux, uy).typ = THRONE;
    coins(state, 1);
    await pickup.reverse_loot(state, {...messagesAndDraws([1]).env, random: {rn2: () => 1, rnd: () => 5}});
    assert.equal(far.cobj.quan, 1);
    assert.equal(near.cobj, null);
    far.spe = 0;
    far.ox = ux - 1;
    coins(state, 1);
    await pickup.reverse_loot(state, {...messagesAndDraws([1]).env, random: {rn2: () => 1, rnd: () => 5}});
    assert.equal(near.cobj.quan, 1);
    assert.equal(far.cobj.quan, 1);
});

test('reverse_loot full quivered gold clears the slot before already-looted throne drop', async () => {
    const state = await stateForTest();
    const gold = coins(state, 1);
    gold.owornmask = W_QUIVER;
    state.uquiver = gold;
    Object.assign(state.level.at(state.u.ux, state.u.uy), {typ: THRONE, flags: T_LOOTED});
    const ops = messagesAndDraws([2]);
    ops.env.random.rnd = () => 5;
    assert.equal(await pickup.reverse_loot(state, ops.env), true);
    assert.equal(state.uquiver, null);
    assert.equal(gold.owornmask, 0);
    assert.equal(state.invent, null);
    assert.equal(state.level.objects[state.u.ux][state.u.uy], gold);
    assert.deepEqual(ops.draws, [3], 'looted throne skips courtmon and the rn2(10) gate');
});

test('doloot_core pins the source short-circuit gates and time result', () => {
    const source = readFileSync('nethack-c/upstream/src/pickup.c', 'utf8');
    assert.match(source, /if \(rn2\(6\) && reverse_loot\(\)\)\s*return ECMD_TIME;/);
    const js = readFileSync('js/pickup.js', 'utf8');
    assert.match(js, /if \(rn2\(6\) && await reverse_loot\(state\)\) return ECMD_TIME;/);
    assert.match(js, /if \(rn2\(2\)\) \{\s*await ttyPline\('Being confused, you find nothing to loot\.'/);
});

// pickup.c:2413-2419 consumes the real courtmon/makemon result before
// transferring gold and drawing the looted-state gate. The fresh chestless
// route covers creation; this pin forces the rare rn2(10)==0 update.
test('reverse_loot successful court creation transfers gold before setting throne looted', async () => {
    const state = await stateForTest();
    const gold = coins(state, 1);
    const location = state.level.at(state.u.ux, state.u.uy);
    Object.assign(location, {typ: THRONE, flags: 0});
    const messages = [], draws = [];
    await pickup.reverse_loot(state, {message: async text => messages.push(text),
        random: {rn2: n => {
            draws.push(n);
            if (n === 60) return 50; // mkroom.c courtmon: bugbear threshold.
            if (n === 10) return 0;
            if (n === 3) return 1;
            return rn2(n);
        }, rnd: () => 5}});
    assert.equal(location.flags, T_LOOTED);
    assert.equal(state.invent, null);
    assert.equal(gold.ocarry.minvent, gold);
    assert.equal(draws.at(-1), 10);
    assert.equal(messages.at(-1), 'The exchequer accepts your contribution.');
});
