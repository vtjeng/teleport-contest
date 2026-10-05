import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { AD_SAMU, AT_CLAW, PM_GRID_BUG } from '../js/monsters.js';
import { mhitm_ad_samu, mhitm_adtyping } from '../js/uhitm.js';

// Fixed fixture time and seed make the direct helper setup reproducible.
const DATETIME = '20300102030405';
const RC = [
    'OPTIONS=name:Source,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');
const UHITM_C = readFileSync(
    new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8',
);

async function freshState(seed) {
    await runSegment({
        seed,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    game.unported = new Set();
    return game;
}

function fixtureMonster(state, id, dx, dy = 0) {
    const monster = newMonster({
        data: state.mons[PM_GRID_BUG],
        mnum: PM_GRID_BUG,
        m_id: id,
        mx: state.u.ux + dx,
        my: state.u.uy + dy,
        mux: state.u.ux,
        muy: state.u.uy,
        m_lev: state.mons[PM_GRID_BUG].mlevel,
        mcansee: true,
        mcanmove: true,
        mhp: 5,
        mhpmax: 5,
    });
    place_monster(monster, monster.mx, monster.my, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    return monster;
}

function attackEnv(events, roll) {
    return {
        unsupported: (reason) => assert.fail(reason),
        message: async (line) => { events.push(`message:${line}`); },
        random: {
            rn2: (bound) => {
                events.push(`rn2:${bound}`);
                return roll;
            },
        },
    };
}

test('mhitm_ad_samu matches all C direction arms and dispatches only its arm',
    async () => {
    assert.match(UHITM_C,
        /void\s+mhitm_ad_samu\([\s\S]*?if\s*\(magr == &gy\.youmonst\)\s*\{\s*\/\* uhitm \*\/\s*mhm->damage = 0;\s*\} else if\s*\(mdef == &gy\.youmonst\)\s*\{\s*\/\* mhitu \*\/\s*hitmsg\(magr, mattk\);[\s\S]*?if\s*\(!rn2\(20\)\)\s*stealamulet\(magr\);\s*\} else\s*\{\s*\/\* mhitm \*\/\s*mhm->damage = 0;\s*\}\s*\}/u);
    assert.match(UHITM_C,
        /case AD_SAMU:\s*mhitm_ad_samu\(magr, mattk, mdef, mhm\); break;/u);

    // This seed initializes the shared game fixture; it does not encode C output.
    const state = await freshState(7711051);
    // The attack selects the C AD_SAMU arm; monster ids below are unique fixture keys.
    const attack = { aatyp: AT_CLAW, adtyp: AD_SAMU };
    // Nonzero sentinel damage shows the M-to-H branch leaves C damage intact.
    const heroMhm = { damage: 6 };
    const heroEvents = [];
    await mhitm_adtyping(
        fixtureMonster(state, 1051, -1),
        attack,
        state.youmonst,
        heroMhm,
        state,
        attackEnv(heroEvents, 1),
    );
    assert.equal(heroMhm.damage, 6);
    assert.deepEqual(heroEvents.map((event) => event.split(':')[0]),
        ['message', 'rn2']);
    assert.equal(heroEvents[1], 'rn2:20');
    assert.equal(state.unported.has('steal.c stealamulet'), false);

    // C's void theft call is reached only after the successful gate; its
    // behavior remains a named gap, and the preceding hit message still runs.
    const stolenGateEvents = [];
    await mhitm_ad_samu(
        fixtureMonster(state, 1052, 1),
        attack,
        state.youmonst,
        { damage: 4 }, // Sentinel survives the M-to-H branch unchanged.
        state,
        attackEnv(stolenGateEvents, 0),
    );
    assert.deepEqual(stolenGateEvents.map((event) => event.split(':')[0]),
        ['message', 'rn2']);
    assert.equal(state.unported.has('steal.c stealamulet'), true);

    const target = fixtureMonster(state, 1053, 0, 1);
    const heroAttack = { damage: 9 }; // Sentinel for the H-to-M zeroing branch.
    const heroAttackEvents = [];
    await mhitm_ad_samu(
        state.youmonst,
        attack,
        target,
        heroAttack,
        state,
        attackEnv(heroAttackEvents, 0),
    );
    assert.equal(heroAttack.damage, 0);
    assert.deepEqual(heroAttackEvents, []);

    const pair = { damage: 9 }; // Sentinel for the M-to-M zeroing branch.
    const pairEvents = [];
    await mhitm_ad_samu(
        fixtureMonster(state, 1054, -1, 1),
        attack,
        target,
        pair,
        state,
        attackEnv(pairEvents, 0),
    );
    assert.equal(pair.damage, 0);
    assert.deepEqual(pairEvents, []);
});
