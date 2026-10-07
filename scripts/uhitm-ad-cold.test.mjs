import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BLINDED, COLD_RES, MSLOW, OBJ_MINVENT } from '../js/const.js';
import { isok } from '../js/cmd_isok.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { canseemon } from '../js/display.js';
import {
    AD_COLD, AT_CLAW, PM_FLESH_GOLEM, PM_ICE_TROLL, PM_STONE_GIANT,
} from '../js/monsters.js';
import { POT_HEALING, POT_OIL, POTION_CLASS } from '../js/objects.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const C_SOURCE = readFileSync(new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8');
const JS_SOURCE = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');

async function fixture() {
    // Independent Wizard startup supplies canonical property, vision, and object
    // tables. The fixed seed is a test fixture, not a recording-derived input.
    await runSegment({ seed: 713201, datetime: '20381015103000',
        nethackrc: 'OPTIONS=name:ColdTest,role:Wizard,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '' });
    game.gv ??= {};
    game.gv.vis = true;
    return game;
}

function monster(state, species, id) {
    // Adjacent offsets keep the source visibility checks active; unique IDs
    // distinguish the attacker and defender in the canonical monster list.
    const [mx, my] = [[1, 0], [-1, 0], [0, -1], [0, 1]]
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([x, y]) => isok(x, y) && !state.level.monsters[x][y]);
    // Thirty HP keeps these damage-helper fixtures independent of death handling.
    const mon = newMonster({ data: state.mons[species], mnum: species,
        m_id: id, mx, my, mhp: 30, mhpmax: 30, minvent: null,
        mcanmove: true, mfrozen: 0, meating: 0, mcansee: true, mcan: false });
    place_monster(mon, mx, my, state);
    mon.nmon = state.level.monlist;
    state.level.monlist = mon;
    return mon;
}

function operations(answers) {
    const draws = [];
    const lines = [];
    return { draws, lines, env: {
        random: Object.fromEntries(['rn2', 'rnd'].map(name => [name, bound => {
            draws.push([name, bound]);
            const answer = answers.shift();
            assert.ok(answer, `unexpected ${name}(${bound})`);
            assert.deepEqual([name, bound], answer.slice(0, 2));
            return answer[2];
        }])),
        message: async text => { lines.push(String(text)); },
        unsupported: reason => assert.fail(reason),
    } };
}

const COLD_CLAW = { aatyp: AT_CLAW, adtyp: AD_COLD }; // Ice troll's cold claw.

async function attack(attacker, defender, state, ops, damage = 7) {
    // Seven damage leaves remainder two for destroy_items' rn2(5) threshold.
    const mhm = { damage, done: false, hitflags: 0, specialdmg: 0 };
    await mhitm_adtyping(attacker, COLD_CLAW, defender, mhm, state, ops.env);
    return mhm;
}

test('cold helper keeps the complete C directions, call order, and type dispatcher', () => {
    const source = C_SOURCE.match(/void\nmhitm_ad_cold\([\s\S]*?\n\}\n\nvoid\nmhitm_ad_elec/u)?.[0];
    assert.ok(source);
    assert.match(source, /magr == &gy\.youmonst[\s\S]*?mhitm_mgc_atk_negated[\s\S]*?shieldeff[\s\S]*?frost doesn't chill[\s\S]*?golemeffects[\s\S]*?damage = 0;[\s\S]*?damage \+= destroy_items[\s\S]*?mdef == &gy\.youmonst[\s\S]*?hitmsg[\s\S]*?rn2\(20\)[\s\S]*?\(void\) destroy_items[\s\S]*?else \{[\s\S]*?frost doesn't seem to chill[\s\S]*?shieldeff[\s\S]*?golemeffects[\s\S]*?damage \+= destroy_items/u);
    assert.match(C_SOURCE, /case AD_COLD:\s*mhitm_ad_cold\(magr, mattk, mdef, mhm\);/u);
    assert.match(JS_SOURCE, /case AD_COLD:\s*await mhitm_ad_cold\(magr, mattk, mdef, mhm, state, env\);/u);
    const body = JS_SOURCE.slice(JS_SOURCE.indexOf('export async function mhitm_ad_cold('), JS_SOURCE.indexOf('export async function mhitm_ad_elec('));
    assert.doesNotMatch(body, /unsupported/u);
});

test('hero cold attack consumes cancellation and inventory draws without a level gate', async () => {
    const state = await fixture();
    const target = monster(state, PM_STONE_GIANT, 13201); // Non-resistant defender.
    // Nine clears cancellation; four fails the damage remainder increment.
    const ops = operations([['rn2', 10, 9], ['rn2', 5, 4]]);
    const mhm = await attack(state.youmonst, target, state, ops);
    assert.equal(mhm.damage, 7); // Empty inventory adds no shattering damage.
    assert.deepEqual(ops.draws, [['rn2', 10], ['rn2', 5]]);
    assert.deepEqual(ops.lines, ['The stone giant is covered in frost!']);
});

test('blind hero still applies frost damage and item destruction without frost messages', async () => {
    const state = await fixture();
    // A positive blindness timeout activates the C Blind condition.
    state.u.uprops[BLINDED].intrinsic = 1;
    const target = monster(state, PM_STONE_GIANT, 13202);
    const ops = operations([['rn2', 10, 9], ['rn2', 5, 4]]);
    assert.equal((await attack(state.youmonst, target, state, ops)).damage, 7);
    assert.deepEqual(ops.lines, []);
    assert.deepEqual(ops.draws, [['rn2', 10], ['rn2', 5]]);
});

test('cold-resistant golem slows before inventory destruction uses the original damage', async () => {
    const state = await fixture();
    const target = monster(state, PM_FLESH_GOLEM, 13203); // Source fire/cold golem slowing.
    // Bypass starts set so the required destroy_items dependency must clear it.
    const oil = { otyp: POT_OIL, oclass: POTION_CLASS, o_id: 13209,
        quan: 1, where: OBJ_MINVENT, ocarry: target, owornmask: 0,
        nobj: null, bypass: true }; // Oil is ineligible for C cold destruction.
    const potion = { otyp: POT_HEALING, oclass: POTION_CLASS, o_id: 13203,
        quan: 1, where: OBJ_MINVENT, ocarry: target, owornmask: 0,
        nobj: oil, bypass: true };
    target.minvent = potion;
    // Nine clears cancellation, four preserves limit=1 from damage 7,
    // rnd(4)=3 is shattering damage, and rn2(3)=0 destroys the potion.
    const ops = operations([['rn2', 10, 9], ['rn2', 5, 4], ['rnd', 4, 3], ['rn2', 3, 0]]);
    const draw = ops.env.random.rn2;
    ops.env.random.rn2 = bound => {
        if (bound === 5) // destroy_items begins with this damage-scaling draw.
            assert.equal(target.mspeed, MSLOW, 'golem effects precede inventory damage');
        return draw(bound);
    };
    const mhm = await attack(state.youmonst, target, state, ops);
    assert.equal(target.mspeed, MSLOW);
    assert.equal(mhm.damage, 3); // Resistance zeroes frost, not potion shattering.
    assert.equal(target.minvent, oil);
    assert.equal(Boolean(oil.bypass), false); // Every surviving inventory bit clears.
    assert.deepEqual(ops.draws, [['rn2', 10], ['rn2', 5], ['rnd', 4], ['rn2', 3]]);
    assert.ok(ops.lines.some(line => line.includes("frost doesn't chill")));
    assert.ok(ops.lines.some(line => line.includes('shatters')));
});

test('cancelled monster attacker returns before frost and inventory effects', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_ICE_TROLL, 13204);
    const target = monster(state, PM_STONE_GIANT, 13205);
    attacker.mcan = true;
    const ops = operations([]);
    assert.equal((await attack(attacker, target, state, ops)).damage, 0);
    assert.deepEqual(ops.draws, []);
    assert.deepEqual(ops.lines, []);
});

test('unseen monster pair applies resistance and destruction without visible frost text', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_ICE_TROLL, 13206);
    const target = monster(state, PM_ICE_TROLL, 13207); // Cold-resistant species.
    state.gv.vis = false;
    const ops = operations([['rn2', 10, 9], ['rn2', 5, 4]]);
    assert.equal((await attack(attacker, target, state, ops)).damage, 0);
    assert.deepEqual(ops.draws, [['rn2', 10], ['rn2', 5]]);
    assert.deepEqual(ops.lines, []);
});

test('visible monster pair reports cold resistance before item damage', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_ICE_TROLL, 13210);
    const target = monster(state, PM_ICE_TROLL, 13211);
    assert.ok(canseemon(target, state), 'fixture defender is visible');
    const ops = operations([['rn2', 10, 9], ['rn2', 5, 4]]);
    assert.equal((await attack(attacker, target, state, ops)).damage, 0);
    assert.deepEqual(ops.lines, [
        'The ice troll is covered in frost!',
        "The frost doesn't seem to chill the ice troll!",
    ]);
    assert.deepEqual(ops.draws, [['rn2', 10], ['rn2', 5]]);
});

test('hero resistance still spends the attacker level roll and original inventory damage', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_ICE_TROLL, 13208);
    // Source intrinsic cold resistance; remove inventory to isolate the draw gate.
    state.u.uprops[COLD_RES].intrinsic = 1;
    state.invent = null;
    attacker.m_lev = 9; // Ice troll's source level exceeds a zero rn2(20).
    const ops = operations([['rn2', 10, 9], ['rn2', 20, 0], ['rn2', 5, 4]]);
    assert.equal((await attack(attacker, state.youmonst, state, ops)).damage, 0);
    assert.deepEqual(ops.draws, [['rn2', 10], ['rn2', 20], ['rn2', 5]]);
    assert.ok(ops.lines.includes("The frost doesn't seem cold!"));
});
