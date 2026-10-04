import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    AD_STUN,
    AT_BITE,
    PM_BROWN_PUDDING,
    PM_ORC,
} from '../js/monsters.js';
import { STUNNED, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { mhitm_adtyping } from '../js/uhitm.js';
import { runSegment } from '../js/jsmain.js';
import { isok } from '../js/cmd_isok.js';
import { newMonster, place_monster } from '../js/monst.js';

const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);
const MHITU_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitu.c', import.meta.url), 'utf8',
);
const MHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/mhitm.c', import.meta.url), 'utf8',
);
const DATETIME = '20320415093000';
const RC = [
    'OPTIONS=name:A85StunTest,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function startGame() {
    // This independent fixture initializes ordinary combat state; individual
    // source draws are injected below rather than inferred from this seed.
    await runSegment({ seed: 710281, datetime: DATETIME, nethackrc: RC, moves: '' });
    game.program_state.in_moveloop = true;
    return game;
}

function adjacentMonster(state, species, id) {
    // The first unoccupied neighboring square is enough for C's visibility
    // and monster-pair source predicates in these focused tests.
    const offsets = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]];
    const [x, y] = offsets
        .map(([dx, dy]) => [state.u.ux + dx, state.u.uy + dy])
        .find(([mx, my]) => isok(mx, my) && !state.level.monsters[mx][my]);
    assert.ok(Number.isInteger(x));
    const monster = newMonster({
        data: state.mons[species], mnum: species, m_id: id, mx: x, my: y,
        mhp: 20, mhpmax: 20, mcanmove: true, mfrozen: 0, meating: 0,
        mcansee: true, mcan: false,
    });
    place_monster(monster, x, y, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function fixedRandom(method, bound, value) {
    const calls = [];
    return {
        calls,
        random: {
            [method](actualBound) {
                calls.push([method, actualBound]);
                assert.equal(actualBound, bound);
                return value;
            },
        },
    };
}

function environment(random, messages) {
    return {
        random,
        message: async (line) => { messages.push(line); },
        unsupported: (reason) => assert.fail(reason),
    };
}

test('mhitm_ad_stun follows all C arms and is dispatched by AD_STUN', () => {
    const source = UHITM_C.match(
        /void\s+mhitm_ad_stun\([\s\S]*?\n\}\n\nvoid\nmhitm_ad_legs/u,
    )?.[0];
    assert.ok(source, 'uhitm.c defines the complete selected function');
    assert.match(source,
        /if \(magr == &gy\.youmonst\)[\s\S]*?!Blind[\s\S]*?makeplural\(stagger\(pd, "stagger"\)\)[\s\S]*?mdef->mstun = 1;[\s\S]*?mhitm_ad_phys\(magr, mattk, mdef, mhm\);[\s\S]*?if \(mhm->done\)\s*return;[\s\S]*?else if \(mdef == &gy\.youmonst\)[\s\S]*?hitmsg\(magr, mattk\)[\s\S]*?!magr->mcan && !rn2\(4\)[\s\S]*?make_stunned\(\(HStun & TIMEOUT\) \+ \(long\) mhm->damage, TRUE\)[\s\S]*?mhm->damage \/= 2;[\s\S]*?else \{[\s\S]*?if \(magr->mcan\)\s*return;[\s\S]*?if \(canseemon\(mdef\)\)[\s\S]*?mdef->mstun = 1;[\s\S]*?mhitm_ad_phys\(magr, mattk, mdef, mhm\);[\s\S]*?if \(mhm->done\)\s*return;/u);
    assert.match(UHITM_C,
        /case AD_STUN:\s*mhitm_ad_stun\(magr, mattk, mdef, mhm\);\s*break;/u);
    assert.match(MHITU_C,
        /mhitm_adtyping\(mtmp, mattk, &gy\.youmonst, &mhm\);/u);
    assert.match(MHITM_C,
        /mhitm_adtyping\(magr, mattk, mdef, &mhm\);/u);
    const js = readFileSync(new URL('../js/uhitm.js', import.meta.url), 'utf8');
    assert.match(js,
        /case AD_STUN:\s*await mhitm_ad_stun\(magr, mattk, mdef, mhm, state, env\);\s*break;/u);
});

test('monster-to-hero stun truncates odd damage after the one-in-four draw', async () => {
    const state = await startGame();
    // This ID only distinguishes the inserted attacker from generated actors.
    const attacker = adjacentMonster(state, PM_BROWN_PUDDING, 98501);
    state.u.uprops[STUNNED].intrinsic = 0;
    const draw = fixedRandom('rn2', 4, 0); // C zero passes its rn2(4) gate.
    const messages = [];
    const mhm = { damage: 5, done: false, hitflags: 0, specialdmg: 0 };

    await mhitm_adtyping(
        attacker, { aatyp: AT_BITE, adtyp: AD_STUN }, state.youmonst, mhm,
        state, environment(draw.random, messages),
    );

    assert.deepEqual(draw.calls, [['rn2', 4]]);
    assert.equal(mhm.damage, 2); // C int division truncates 5 / 2 toward zero.
    assert.equal(state.u.uprops[STUNNED].intrinsic & TIMEOUT, 5);
    assert.match(messages[0], /The brown pudding bites!/u);
    assert.match(messages[1], /You stagger\.\.\./u);
});

test('a monster-pair stun uses the defender verb and physical follow-up', async () => {
    const state = await startGame();
    // These IDs only distinguish the inserted pair from generated actors.
    const attacker = adjacentMonster(state, PM_ORC, 98502);
    const defender = adjacentMonster(state, PM_BROWN_PUDDING, 98503);
    const messages = [];
    const mhm = { damage: 3, done: false, hitflags: 0, specialdmg: 0 }; // C M→M attack test damage.

    await mhitm_adtyping(
        attacker, { aatyp: AT_BITE, adtyp: AD_STUN }, defender, mhm,
        state, environment({ rn2: () => assert.fail('no stun RNG in C M→M arm') }, messages),
    );

    assert.equal(defender.mstun, 1);
    assert.equal(mhm.damage, 3); // This unarmed AT_BITE has no extra physical damage.
    assert.equal(messages.length, 1);
    assert.match(messages[0], /The brown pudding trembles for a moment\./u);
    assert.equal(game.unported.has('uhitm.c mhitm_ad_phys'), false);
});
