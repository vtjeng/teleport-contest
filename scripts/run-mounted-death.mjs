#!/usr/bin/env node

// Record and replay an ordinary mounted death through end.c really_done()'s
// first disclosure prompt. The segment contains replay inputs only;
// runFreshMatrix() records new C output in an isolated temporary workspace.

import { NO_KILLER_PREFIX, NON_PM } from '../js/const.js';
import { time_from_yyyymmddhhmmss } from '../js/calendar.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A daytime Wednesday avoids night, midnight, Friday-the-13th, and moon-phase
// messages. The fixed time also makes really_done()'s finish_time repeatable.
const DATETIME = '20320415143000';
const RIDE = '#ride\n';
const WAIT = '.';
const PONY_DIRECTION = 'j';
const MORE = ' ';
const INVALID_DISCLOSURE_ANSWER = 'x';

function nethackrc() {
    return [
        'OPTIONS=name:Finale,role:Knight,race:human,gender:female,'
        + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=!acoustics',
        '',
    ].join('\n');
}

export const MOUNTED_DEATH_CASE = Object.freeze({
    // Directly lowering HP would skip doride(), both mount_steed() rolls,
    // losehp(), and done(). Seeds 9140000 through 9140049 were the declared
    // natural-search domain; 9140000 was the first case whose pony remained
    // south after one wait and whose next two mount attempts both slipped.
    seed: 9140000,
    datetime: DATETIME,
    nethackrc: nethackrc(),
    // The wait advances moves beyond really_done()'s first-move death arm.
    // The two spaces dismiss the second slip and the death message. The
    // invalid `x` lets the recorder capture the possessions prompt while
    // tty_yn_function() remains in its answer loop; it takes no answer arm.
    moves: `${WAIT}${RIDE}${PONY_DIRECTION}${RIDE}${PONY_DIRECTION}`
        + MORE.repeat(2) + INVALID_DISCLOSURE_ANSWER,
});

export function loadMountedDeathRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{ ...MOUNTED_DEATH_CASE }],
    }, 'mounted death recipe');
}

export async function verifyMountedDeathSegment(segment) {
    const replay = await runSegment(segment);
    const topLine = game.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
    if (topLine !== 'Do you want your possessions identified? [ynq] (n)')
        throw new Error(`mounted death stopped at ${JSON.stringify(topLine)}`);
    if (game.killer?.name !== 'slipped while mounting a saddled pony'
        || game.killer?.format !== NO_KILLER_PREFIX) {
        throw new Error('mounted death did not preserve its format-2 killer');
    }
    if (game.u.uhp !== 0 || game.u.ugrave_arise !== NON_PM)
        throw new Error('mounted death did not preserve ordinary death state');
    if (game.program_state?.gameover !== 1
        || game.program_state?.something_worth_saving !== 0
        || game.iflags?.vision_inited !== false
        || game.iflags?.perm_invent !== false) {
        throw new Error('really_done did not clear its end-of-game state');
    }
    const expectedEndTime = time_from_yyyymmddhhmmss(
        DATETIME, game.recorderIsDst,
    );
    if (game.urealtime?.finish_time !== expectedEndTime
        || game.iflags?.at_night !== false
        || game.iflags?.at_midnight !== false) {
        throw new Error('really_done did not capture its fixed daytime clock');
    }
    const finalDraw = replay.getRngLog().at(-1);
    if (finalDraw !== 'rn2(1)=0')
        throw new Error(`can_make_bones ended with ${finalDraw ?? 'no draw'}`);
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (!(obj.known && obj.bknown && obj.dknown && obj.rknown))
            throw new Error(`inventory object ${obj.invlet} was not identified`);
    }
}

export async function runMountedDeathMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'ordinary mounted death',
            recipe: loadMountedDeathRecipe(),
        }],
        summaryLabel: 'ORDINARY MOUNTED DEATH',
        verifySegment: verifyMountedDeathSegment,
        // The recorder terminates at a live prompt and leaves a save behind.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runMountedDeathMatrix, 'mounted death');
