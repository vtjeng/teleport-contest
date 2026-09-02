#!/usr/bin/env node

// Run the checked-in matrix for mon.c restrap() through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// restrap() lets an unwatched M1_HIDE monster hide again. It writes no message
// and calls no display function, so nothing it does shows on a screen: what it
// produces is one rn2(3) at the fourth position of an eight-term guard, and
// every segment below is therefore read on the random-number log. The watched
// segment is the one that pins the roll's position -- a port that rolled before
// it tested cansee() would draw the same screens and add seven calls C never
// makes.
//
// Only the piercers can be recorded. #wizgenesis reaches makemon.c
// create_particular_creation(), and of the eight M1_HIDE species the port
// admits at runtime only those whose difficulty is at most 9: the trapper (14)
// and the lurker above (12) are refused by species, and a mimic is refused by
// js/makemon_create.js's 'runtime mimic appearance message', which is the arm
// makemon.c:1483-1484 owns. The three guard terms no piercer can reach --
// mcan, M_AP_TYPE and the sensemon pair -- are pinned in
// scripts/monster-hiding.test.mjs instead, and seed5002-wizard-coverage-pair
// is the recorded C game that runs M_AP_TYPE on a real mimic.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20260214031500';

// C('g'), the "wizgenesis" row's key, and the species name read.c
// create_particular_parse() matches against mons[].
export const GENESIS_KEY = '\x07';
const GENESIS = `${GENESIS_KEY}rock piercer\n`;
const WAIT = '.';

// playmode:debug is what cmd.c can_do_extcmd() wants before it admits the
// WIZMODECMD row that C('g') is bound to.
const DEBUG_OPTIONS = 'pettype:none,!acoustics,playmode:debug,time';

function nethackrc() {
    return [
        'OPTIONS=name:Hidr,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${DEBUG_OPTIONS}`,
        '',
    ].join('\n');
}

function segment(seed, moves) {
    return { seed, datetime: DATETIME, nethackrc: nethackrc(), moves };
}

// Two seeds, chosen by reading the map each one draws rather than by copying
// any recorded session. 9130009 starts the hero in a lit room 14 squares wide,
// so she can walk clear of a piercer and still watch it; 9130095 is the first
// seed at or above 9130001 whose starting room mklev() left unlit, which is
// what lets a hero three squares away stop seeing anything at all.
const LIT_SEED = 9130009;
const DARK_SEED = 9130095;

export function loadMonsterHidingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Watched. The hero walks five squares east inside a lit room and
            // waits; the piercer crosses the room after her, and restrap()
            // answers FALSE on cansee() seven times over without spending a
            // single draw. Every one of those seven is a call a port with the
            // roll one term higher would add to the log.
            segment(LIT_SEED, `${WAIT}${GENESIS}${GENESIS}lllll`
                + WAIT.repeat(30)),
            // Unwatched, on ROOM. Three piercers in an unlit room, with the
            // hero eight squares east of them, which in an unlit room is far
            // enough to see nothing. Both outcomes of the roll land here: two
            // of the three set mundetected and forfeit every later turn, the
            // third rolls nonzero each time and keeps walking. A hidden
            // piercer still enters restrap() on every action afterwards, so
            // the draws continue after the hiding stops.
            segment(DARK_SEED, `${WAIT}${GENESIS}${GENESIS}${GENESIS}llllllll`
                + WAIT.repeat(20)),
            // Unwatched, off ROOM. The hero walks out of the same room into
            // the corridor beyond its east door and creates the piercer there,
            // then walks back west. The piercer rolls nonzero on a CORR square
            // and zero on the DOOR square below it, and the zero is the one
            // that matters: the guard passes, neither arm applies, and
            // mon.c:4692 returns FALSE with mundetected untouched.
            segment(DARK_SEED, `nlllllllllll${GENESIS}${GENESIS}hhhhhhhhh`
                + WAIT.repeat(6)),
        ],
    }, 'monster hiding recipe');
}

export async function runMonsterHidingMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster hiding',
            recipe: loadMonsterHidingRecipe(),
        }],
        summaryLabel: 'MONSTER HIDING',
        // Every segment plays in debug mode, and
        // scripts/record-session.mjs:445 clears the install directory only
        // before a chunk's first segment, so a second debug segment in one
        // chunk would restore the first segment's save.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runMonsterHidingMatrix, 'monster hiding');
