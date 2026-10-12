import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { M_SEEN_ELEC, SHOCK_RES } from '../js/const.js';
import { isok } from '../js/cmd_isok.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_ELEC, AT_BITE, PM_GRID_BUG, PM_NEWT, PM_STONE_GIANT,
} from '../js/monsters.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const JS_SOURCE = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');

async function fixture() {
    await runSegment({
        seed: 713207,
        datetime: '20381015103000',
        nethackrc: [
            'OPTIONS=name:ElectricTest,role:Wizard,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.gv ??= {};
    game.gv.vis = true;
    game.invent = null;
    return game;
}

function monster(state, species, id) {
    const offsets = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, 1], [-1, -1]];
    const [mx, my] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([x, y]) => isok(x, y) && !state.level.monsters[x][y]);
    assert.ok(Number.isInteger(mx));
    const result = newMonster({
        data: state.mons[species], mnum: species, m_id: id, mx, my,
        mhp: 30, mhpmax: 30, minvent: null,
        mcanmove: true, mfrozen: 0, meating: 0, mcansee: true, mcan: false,
    });
    place_monster(result, mx, my, state);
    result.nmon = state.level.monlist;
    state.level.monlist = result;
    return result;
}

function operations(answers) {
    const draws = [];
    const lines = [];
    return {
        draws,
        lines,
        env: {
            random: {
                rn2(bound) {
                    draws.push(bound);
                    const answer = answers.shift();
                    assert.notEqual(answer, undefined, `unexpected rn2(${bound})`);
                    assert.equal(answer.bound, bound);
                    return answer.value;
                },
            },
            message: async (line) => { lines.push(String(line)); },
            unsupported: (reason) => assert.fail(reason),
        },
    };
}

const ELECTRIC_BITE = { aatyp: AT_BITE, adtyp: AD_ELEC };

async function attack(attacker, defender, state, ops, damage = 7) {
    const mhm = { damage, done: false, hitflags: 0, specialdmg: 0 };
    await mhitm_adtyping(attacker, ELECTRIC_BITE, defender, mhm, state, ops.env);
    return mhm;
}

test('mhitm_ad_elec preserves all C arms and the type dispatcher', () => {
    const helper = C_SOURCE.match(
        /void\s+mhitm_ad_elec\([\s\S]*?\n\}\n\nvoid\nmhitm_ad_acid/u,
    )?.[0];
    assert.ok(helper, 'uhitm.c contains the complete electric helper');
    assert.match(helper,
        /if \(magr == &gy\.youmonst\)[\s\S]*?mhitm_mgc_atk_negated[\s\S]*?is zapped[\s\S]*?resists_elec[\s\S]*?golemeffects[\s\S]*?damage \+= destroy_items[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg[\s\S]*?monstseesu\(M_SEEN_ELEC\)[\s\S]*?rn2\(20\)[\s\S]*?\(void\) destroy_items[\s\S]*?else \{[\s\S]*?gets zapped[\s\S]*?shieldeff[\s\S]*?golemeffects[\s\S]*?damage \+= destroy_items/u);
    assert.equal((helper.match(/destroy_items\(/gu) ?? []).length, 3);
    assert.match(C_SOURCE,
        /case AD_ELEC:\s*mhitm_ad_elec\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(JS_SOURCE,
        /case AD_ELEC:\s*await mhitm_ad_elec\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
    const body = JS_SOURCE.slice(
        JS_SOURCE.indexOf('export async function mhitm_ad_elec('),
        JS_SOURCE.indexOf('// C\'s helper is used only when a poison attack'),
    );
    assert.doesNotMatch(body, /unsupported/u);
});

test('hero electric attack zaps a monster and then checks its inventory', async () => {
    const state = await fixture();
    const target = monster(state, PM_STONE_GIANT, 13271);
    const ops = operations([
        { bound: 10, value: 9 }, // Magic cancellation.
        { bound: 5, value: 4 }, // Empty target still receives destroy_items.
    ]);

    const mhm = await attack(state.youmonst, target, state, ops);

    assert.equal(mhm.damage, 7);
    assert.deepEqual(ops.draws, [10, 5]);
    assert.deepEqual(ops.lines, ['The stone giant is zapped!']);
});

test('electric monster attack preserves the hero resistance observation and level gate', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_GRID_BUG, 13272);
    attacker.m_lev = 9;
    state.u.uprops[SHOCK_RES] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const ops = operations([
        { bound: 10, value: 9 }, // Magic cancellation.
        { bound: 20, value: 0 }, // Attacker level passes.
        { bound: 5, value: 4 }, // Empty hero inventory.
    ]);

    const mhm = await attack(attacker, state.youmonst, state, ops);

    assert.equal(mhm.damage, 0);
    assert.ok(attacker.seen_resistance & M_SEEN_ELEC);
    assert.deepEqual(ops.draws, [10, 20, 5]);
    assert.deepEqual(ops.lines, ['The grid bug bites!', 'You get zapped!', "The zap doesn't shock you!"]);
});

test('monster-to-monster electric attack reaches zap inventory handling', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_GRID_BUG, 13273);
    const defender = monster(state, PM_NEWT, 13274);
    const ops = operations([
        { bound: 10, value: 9 }, // Magic cancellation.
        { bound: 5, value: 4 }, // Empty defender still receives destroy_items.
    ]);

    const mhm = await attack(attacker, defender, state, ops);

    assert.equal(mhm.damage, 7);
    assert.deepEqual(ops.draws, [10, 5]);
    assert.deepEqual(ops.lines, ['The newt gets zapped!']);
});
