import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ACID_RES, M_SEEN_ACID } from '../js/const.js';
import { isok } from '../js/cmd_isok.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_ACID, AT_BITE, PM_GRAY_OOZE, PM_OCHRE_JELLY, PM_STONE_GIANT,
} from '../js/monsters.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const JS_SOURCE = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');

async function fixture() {
    await runSegment({
        // A fixed setup seed keeps the source-pinned helper fixture stable.
        seed: 713245,
        datetime: '20381015103000',
        nethackrc: [
            'OPTIONS=name:AcidTest,role:Wizard,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.gv ??= {};
    game.gv.vis = true;
    return game;
}

function monster(state, species, id) {
    // Keep test combatants adjacent, as required by the production melee path.
    const offsets = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, 1], [-1, -1]];
    const [mx, my] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([x, y]) => isok(x, y) && !state.level.monsters[x][y]);
    assert.ok(Number.isInteger(mx));
    const result = newMonster({
        data: state.mons[species], mnum: species, m_id: id, mx, my,
        // Thirty HP keeps these source fixtures alive through one test attack.
        mhp: 30, mhpmax: 30, minvent: null, mw: null,
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

// C uses AD_ACID independently of the physical delivery form in this helper.
const ACID_BITE = { aatyp: AT_BITE, adtyp: AD_ACID };

// Seven is a nonzero seed damage value so source zeroing is observable.
async function attack(attacker, defender, state, ops, damage = 7) {
    const mhm = { damage, done: false, hitflags: 0, specialdmg: 0 };
    await mhitm_adtyping(attacker, ACID_BITE, defender, mhm, state, ops.env);
    return mhm;
}

test('mhitm_ad_acid matches the complete C branches and AD_ACID dispatch', () => {
    const start = C_SOURCE.indexOf('\nmhitm_ad_acid(');
    const end = C_SOURCE.indexOf('\n}\n', start) + 2;
    assert.notEqual(start, -1);
    assert.ok(end > start);
    const body = C_SOURCE.slice(start, end);
    assert.match(body,
        /magr == &gy\.youmonst[\s\S]*?resists_acid\(mdef\) \|\| defended\(mdef, AD_ACID\)[\s\S]*?mdef == &gy\.youmonst[\s\S]*?hitmsg[\s\S]*?rn2\(3\)[\s\S]*?Acid_resistance[\s\S]*?monstseesu\(M_SEEN_ACID\)[\s\S]*?exercise\(A_STR, FALSE\)[\s\S]*?else \{[\s\S]*?magr->mcan[\s\S]*?rn2\(30\)[\s\S]*?rn2\(6\)/u);
    assert.match(C_SOURCE,
        /case AD_ACID:\s*mhitm_ad_acid\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(JS_SOURCE,
        /case AD_ACID:\s*await mhitm_ad_acid\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
    const jsStart = JS_SOURCE.indexOf('export async function mhitm_ad_acid(');
    const jsEnd = JS_SOURCE.indexOf('\n}\n', jsStart) + 2;
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    assert.doesNotMatch(JS_SOURCE.slice(jsStart, jsEnd), /unsupported|unported/u);
});

test('resistant monster defender still receives both source acid checks', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_OCHRE_JELLY, 13291); // acid attacker
    const defender = monster(state, PM_GRAY_OOZE, 13292); // source-resistant target
    const ops = operations([
        { bound: 30, value: 11 }, // C rn2(30): no corrosion on this witness.
        { bound: 6, value: 1 }, // C rn2(6): no weapon damage on this witness.
    ]);

    const mhm = await attack(attacker, defender, state, ops, 14); // nonzero input damage

    assert.equal(mhm.damage, 0);
    assert.deepEqual(ops.draws, [30, 6]);
    assert.deepEqual(ops.lines, [
        'The gray ooze is covered in acid, but it seems harmless.',
    ]);
});

test('cancelled acid attacker exits before resistance messages or erosion draws', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_OCHRE_JELLY, 13293); // acid attacker
    const defender = monster(state, PM_STONE_GIANT, 13294); // vulnerable target
    attacker.mcan = 1;
    const ops = operations([]);

    const mhm = await attack(attacker, defender, state, ops);

    assert.equal(mhm.damage, 0);
    assert.deepEqual(ops.draws, []);
    assert.deepEqual(ops.lines, []);
});

test('hero acid attack clears damage only for a resistant monster', async () => {
    const state = await fixture();
    const defender = monster(state, PM_GRAY_OOZE, 13295); // source-resistant target
    const ops = operations([]);

    const mhm = await attack(state.youmonst, defender, state, ops);

    assert.equal(mhm.damage, 0);
    assert.deepEqual(ops.draws, []);
    assert.deepEqual(ops.lines, []);
});

test('acid resistance against a monster attack records the observed property', async () => {
    const state = await fixture();
    const attacker = monster(state, PM_OCHRE_JELLY, 13296); // acid attacker
    state.u.uprops[ACID_RES] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const ops = operations([{ bound: 3, value: 0 }]);

    const mhm = await attack(attacker, state.youmonst, state, ops);

    assert.equal(mhm.damage, 0);
    assert.deepEqual(ops.draws, [3]);
    assert.ok(attacker.seen_resistance & M_SEEN_ACID);
    assert.ok(ops.lines.some(line => line.includes('but it seems harmless.')));
});
