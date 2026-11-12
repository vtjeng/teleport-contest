// trap.c trapeffect_hole() (2013-2069) refuses a hole or trap door on a level
// that cannot be fallen through, for the hero (2019-2024) and for a monster
// (2033-2037), and reports each through impossible(), which this build prints
// in every mode (pline.c 584-633).
//
// No game reaches these arms: every C path that makes a hole or trap door
// checks Can_fall_thru() first (mklev.c mktrap() 761 and 2079, objnam.c's
// wizard-mode trap wish 3571, sp_lev.c 5194, dig.c and muse.c through
// Can_dig_down()), so this test builds the state instead: a hard floor on
// level 1 makes Can_fall_thru() false under a hole already in place.

import assert from 'node:assert/strict';
import test from 'node:test';

import { HOLE, TRAPDOOR, Trap_Effect_Finished } from '../js/const.js';
import { Can_fall_thru } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { accessible } from '../js/monmove.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import { NON_PM, PM_JACKAL } from '../js/monsters.js';
import { trapeffect_selector } from '../js/trap_effects.js';

// An ordinary Valkyrie start on level 1; the seed and date only need to
// produce a level with an open square beside the hero.
const RC = [
    'OPTIONS=name:Holey,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
    '',
].join('\n');

async function hardFloorLevel() {
    await runSegment({
        seed: 4417, datetime: '20260311101500', nethackrc: RC, moves: '',
    });
    game.level.traps = [];
    // Level 1 is neither the dungeon's bottom nor the stronghold, so the hard
    // floor alone decides Can_dig_down() and with it Can_fall_thru().
    game.level.flags.hardfloor = true;
    assert.equal(Can_fall_thru(game.u.uz, game), false);
}

function captureEnv() {
    const lines = [];
    const redrawn = [];
    const record = async (text) => { lines.push(text); };
    const env = {
        state: game,
        message: record,
        urgentMessage: record,
        redraw: (x, y) => { redrawn.push([x, y]); },
    };
    return { env, lines, redrawn };
}

// pline.c impossible(): the text, then its two fixed report lines. A game is
// under way, so program_state.something_worth_saving adds the reload hint;
// the recorder's sysconf sets no SUPPORT line.
const reportLines = (text) => [
    text,
    'Program in disorder!  (Saving and reloading may fix this problem.)',
    'Please report these messages to devteam@nethack.org.',
];

test('the hero sees a hole that cannot exist and reports it', async () => {
    await hardFloorLevel();
    const trap = {
        tx: game.u.ux, ty: game.u.uy, ttyp: HOLE, tseen: false,
        madeby_u: false, once: false,
    };
    game.level.traps.push(trap);
    const uz = { ...game.u.uz };
    const { env, lines, redrawn } = captureEnv();

    const result = await trapeffect_selector(game.youmonst, trap, 0, env);

    assert.equal(result, Trap_Effect_Finished);
    // seetrap() runs first (trap.c 2020), then impossible() (2021-2022)
    // with trapname(HOLE, TRUE) pluralised by the format's "%ss".
    assert.equal(trap.tseen, true);
    assert.deepEqual(redrawn, [[trap.tx, trap.ty]]);
    assert.deepEqual(lines,
        reportLines('dotrap: holes cannot exist on this level.'));
    assert.deepEqual(game.u.uz, uz);
});

test('a monster on a trap door that cannot exist is reported', async () => {
    await hardFloorLevel();
    let placed = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = game.u.ux + dx;
        const y = game.u.uy + dy;
        if (!accessible(x, y, game) || m_at(x, y, game)) continue;
        const species = game.mons[PM_JACKAL];
        const monster = newMonster({
            cham: NON_PM, m_lev: species.mlevel, m_id: 901,
            mhp: 3, mhpmax: 3, mcanmove: 1, mcansee: true,
            data: species, mnum: PM_JACKAL, mx: x, my: y,
        });
        place_monster(monster, x, y, game);
        monster.nmon = game.level.monlist;
        game.level.monlist = monster;
        placed = { monster, x, y };
        break;
    }
    assert.ok(placed, 'no open square beside the hero');
    const trap = {
        tx: placed.x, ty: placed.y, ttyp: TRAPDOOR, tseen: false,
        madeby_u: false, once: false,
    };
    game.level.traps.push(trap);
    const { env, lines, redrawn } = captureEnv();

    const result = await trapeffect_selector(placed.monster, trap, 0, env);

    assert.equal(result, Trap_Effect_Finished);
    // The monster arm (trap.c 2033-2037) reports before any seetrap() and
    // leaves the jackal where it stands.
    assert.deepEqual(lines,
        reportLines('mintrap: trap doors cannot exist on this level.'));
    assert.equal(trap.tseen, false);
    assert.deepEqual(redrawn, []);
    assert.equal(m_at(placed.x, placed.y, game), placed.monster);
});
