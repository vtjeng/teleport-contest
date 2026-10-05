import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isok } from '../js/cmd_isok.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { AD_FIRE, AT_BITE, AT_CLAW, PM_FIRE_ANT, PM_ORC } from '../js/monsters.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const UHITM_JS = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');
const DATETIME = '20360412121530';
const RC = [
    'OPTIONS=name:C86FireTest,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame() {
    // A fixed ordinary Wizard game gives the direct helper the same initialized
    // monster, map and resistance state as the recorded C86 combat route.
    await runSegment({ seed: 860413, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    game.gv ??= {};
    game.gv.vis = false;
    return game;
}

function nearbyMonster(state, species, id) {
    // Adjacent offsets exercise the source's monster-square and message-location
    // paths while keeping the helper test independent of a recorded recipe.
    const offsets = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]];
    const [mx, my] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([x, y]) => isok(x, y) && !state.level.monsters[x][y]);
    assert.ok(Number.isInteger(mx));
    const monster = newMonster({
        data: state.mons[species], mnum: species, m_id: id, mx, my,
        mhp: 30, mhpmax: 30, minvent: null,
        mcanmove: true, mfrozen: 0, meating: 0, mcansee: true, mcan: false,
    });
    place_monster(monster, mx, my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attackEnv(bounds, messages) {
    const calls = [];
    let index = 0;
    return {
        calls,
        env: {
            random: {
                rn2(bound) {
                    calls.push(bound);
                    const result = bounds[index++];
                    assert.notEqual(result, undefined, 'unexpected C random draw');
                    return result;
                },
            },
            message: async (line) => { messages.push(line); },
            unsupported: (reason) => assert.fail(reason),
        },
    };
}

test('mhitm_ad_fire retains all C directions and the AD_FIRE dispatcher arm', () => {
    const helper = UHITM_C.match(
        /void\s+mhitm_ad_fire\([\s\S]*?\n\}\n\nvoid\nmhitm_ad_cold/u,
    )?.[0];
    assert.ok(helper, 'uhitm.c contains the complete fire helper');
    assert.match(helper,
        /if \(magr == &gy\.youmonst\)[\s\S]*?mhitm_mgc_atk_negated[\s\S]*?completelyburns[\s\S]*?xkilled[\s\S]*?destroy_items[\s\S]*?ignite_items[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg[\s\S]*?Fire_resistance[\s\S]*?rn2\(20\)[\s\S]*?burn_away_slime[\s\S]*?else \{[\s\S]*?monkilled[\s\S]*?grow_up[\s\S]*?destroy_items[\s\S]*?ignite_items/u);
    assert.match(UHITM_C,
        /case AD_FIRE:\s*mhitm_ad_fire\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(UHITM_JS,
        /case AD_FIRE:\s*await mhitm_ad_fire\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
});

test('monster fire attack to the hero applies the source resistance roll order', async () => {
    const state = await startGame();
    const attacker = nearbyMonster(state, PM_FIRE_ANT, 86041);
    attacker.m_lev = 3;
    const messages = [];
    const draw = attackEnv([9, 19], messages);
    const mhm = { damage: 7, done: false, hitflags: 0, specialdmg: 0 };

    await mhitm_adtyping(
        attacker, { aatyp: AT_BITE, adtyp: AD_FIRE }, state.youmonst, mhm,
        state, draw.env,
    );

    assert.deepEqual(draw.calls, [10, 20]);
    assert.equal(mhm.damage, 7); // No fire resistance: C leaves attack damage intact.
    assert.ok(messages.some((line) => String(line).includes('on fire')));
});

test('monster fire item effects ignite the active hero inventory list', async () => {
    const state = await startGame();
    const attacker = nearbyMonster(state, PM_FIRE_ANT, 86043); // Unique nearby test monster ID.
    attacker.m_lev = 3; // C's source gate compares this level with the next rn2(20).
    const messages = [];
    // 9 avoids cancellation, 0 passes the level-vs-rn2(20) gate, and 4 makes
    // destroy_items' damage-7 remainder (2) fail its rn2(5) threshold.
    const draw = attackEnv([9, 0, 4], messages);
    const inventoryHead = { marker: 'state.invent' };
    state.invent = inventoryHead;
    const calls = [];
    draw.env.igniteItems = async (head, env) => {
        calls.push({ operation: 'ignite_items', head, state: env.state });
    };
    const mhm = { damage: 7, done: false, hitflags: 0, specialdmg: 0 };

    await mhitm_adtyping(
        attacker, { aatyp: AT_BITE, adtyp: AD_FIRE }, state.youmonst, mhm,
        state, draw.env,
    );

    assert.deepEqual(draw.calls, [10, 20, 5]);
    assert.deepEqual(calls.map(({ operation }) => operation), ['ignite_items']);
    assert.equal(calls[0].head, inventoryHead);
    assert.equal(calls[0].state, state);
});

test('hero fire attack keeps ordinary target damage and skips empty inventories', async () => {
    const state = await startGame();
    const defender = nearbyMonster(state, PM_ORC, 86042);
    const messages = [];
    // Nine clears the Wizard's starting magic negation; four is the
    // `destroy_items` damage remainder roll (rn2(5)) for damage 4.
    const draw = attackEnv([9, 4], messages);
    const mhm = { damage: 4, done: false, hitflags: 0, specialdmg: 0 };

    await mhitm_adtyping(
        state.youmonst, { aatyp: AT_CLAW, adtyp: AD_FIRE }, defender, mhm,
        state, draw.env,
    );

    assert.deepEqual(draw.calls, [10, 5]);
    assert.equal(mhm.damage, 4); // Empty inventory gives destroy_items no extra loss.
    assert.ok(messages.some((line) => String(line).includes('on fire')));
});
