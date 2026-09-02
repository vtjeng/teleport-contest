#!/usr/bin/env node

// Run the checked-in matrix for a floor corpse rotting away, through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// timeout.c run_timers() (2216-2240) drains the expiry-ordered timer queue at
// the end of every nh_timeout(), and dig.c rot_corpse() (2146-2189) is what
// timeout_funcs[ROT_CORPSE] runs over each corpse that comes due. For a corpse
// whose `where` is OBJ_FLOOR that call writes no message and draws no random
// number: the corpse leaves both floor indexes through obj_extract_self(), is
// freed by obfree(), and the square is redrawn by newsym(). The only thing a
// player can see is the map cell, which is why these cases are chosen by what
// lies under the corpse.
//
// mkobj.c start_corpse_timeout() schedules a corpse for ROT_AGE minus its age,
// plus rnz(rot_adjust) minus rot_adjust, so a corpse mklev() placed comes due
// somewhere past turn 230. No shorter route to a due timer exists: nothing the
// hero can do brings one forward. Each case therefore rests in place until its
// corpse's own turn arrives, and the seeds are the ones where a level's own
// monsters leave the hero alone for that long.
//
// `m` before the rest is hack.c's no-op prefix. Plain `.` refuses with "Are you
// waiting to get hit?" whenever a monster stands next to the hero, and plain
// `s` stops on the first "You find a ..." message, whose --More-- no later `s`
// dismisses.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20000110090000';

function nethackrc({ name, role, race, gender, align, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// One turn of standing still. The turn counter on the status line is what says
// which turn each map change happened on, so every case turns 'time' on, and
// every case sends the pet away: dog.c dog_eat() would otherwise be free to
// eat the corpse the case is waiting for.
function restsInPlace(turns) {
    return 'm.'.repeat(turns);
}

const CASES = [
    {
        // Three corpses on Dlvl 1, due on turns 235, 236 and 268. The middle
        // one lies at <52,17>, in sight of the hero's starting square, and the
        // can of grease under it keeps OBJ_AT() true after the extraction, so
        // the cell changes from a comestible to a tool rather than to floor.
        // The other two are out of sight, where newsym() redraws memory and no
        // cell moves.
        seed: 334,
        name: 'CorpseRot',
        role: 'Healer',
        race: 'human',
        gender: 'male',
        align: 'neutral',
        options: 'pettype:none,time',
        turns: 280,
    },
    {
        // A corpse in sight at <30,17> due on turn 234, over a second
        // comestible. The pile's top glyph is a comestible either side of the
        // rot, so this is the case where the arm must fire and change nothing
        // a player can see -- the counterpart of the visible change above.
        seed: 139,
        name: 'CorpseRot',
        role: 'Healer',
        race: 'human',
        gender: 'male',
        align: 'neutral',
        options: 'pettype:none,time',
        turns: 250,
    },
    {
        // Two corpses due 10 turns apart, one out of sight at <70,15> on turn
        // 252 and one in sight at <9,11> on turn 262. Two elements leaving the
        // same queue on different turns is what the witness session could not
        // reach, since it stops on the first.
        seed: 42,
        name: 'CorpseRot',
        role: 'Healer',
        race: 'human',
        gender: 'male',
        align: 'neutral',
        options: 'pettype:none,time',
        turns: 280,
    },
];

export function loadCorpseRotRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CASES.map(({ seed, turns, ...character }) => ({
            seed,
            datetime: DATETIME,
            nethackrc: nethackrc(character),
            moves: restsInPlace(turns),
        })),
    }, 'corpse rot recipe');
}

export async function runCorpseRotMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'floor corpse rot',
            recipe: loadCorpseRotRecipe(),
        }],
        summaryLabel: 'FLOOR CORPSE ROT',
    });
}

runMatrixCli(import.meta.url, runCorpseRotMatrix, 'corpse rot');
