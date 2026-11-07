// attrib.c exercise() ends with encumber_msg() for Strength and
// Constitution (attrib.c:520-521). When a monster's attack on the hero
// exercises one of them during the port's planning pass, the burden line
// must go to the attack's own message operation, which is silent while
// planning, and never to the live terminal.
import assert from 'node:assert/strict';
import test from 'node:test';

import { A_CON } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { AD_FAMN, PM_FAMINE } from '../js/monsters.js';
import { mhitm_ad_famn } from '../js/uhitm.js';

// Independent fixture values for an ordinary in-moveloop hero.
const SEED = 6610427;
const DATETIME = '20380309141500';
const NETHACKRC = [
    'OPTIONS=name:Burdened,role:Healer,race:gnome,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!autopickup',
    '',
].join('\n');

test('a planned exercise reports a burden change through env.message', async () => {
    await runSegment({ seed: SEED, datetime: DATETIME, nethackrc: NETHACKRC, moves: '' });
    const state = game;
    state.program_state.in_moveloop = true;
    state.moves = 1; // exercise() calls encumber_msg() only once play began.
    state.u.aexe[A_CON] = 0; // Below AVAL, so exercise() draws rn2(2).
    // The hero carries little, so near_capacity() is UNENCUMBERED (0); a
    // stale oldcap of 1 (Burdened) makes encumber_msg() print its
    // "unencumbered" line.
    state.go.oldcap = 1;
    const famine = newMonster({
        data: state.mons[PM_FAMINE], mnum: PM_FAMINE,
        mx: state.u.ux + 1, my: state.u.uy, // Adjacent to the hero.
    });
    const messages = [];
    const liveTop = state.nhDisplay.topMessage;
    await mhitm_ad_famn(famine, { adtyp: AD_FAMN }, state.youmonst,
        { damage: 9, hitflags: 0, done: false }, state, {
            planning: true,
            random: { rn2: () => 0, rn1: (_bound, base) => base },
            message: async (text) => messages.push(text),
            statusRefresh: () => {},
        });
    assert.deepEqual(messages.slice(0, 2), [
        'Famine reaches out, and your body shrivels.',
        'Your movements are now unencumbered.',
    ]);
    assert.equal(state.nhDisplay.topMessage, liveTop);
});
