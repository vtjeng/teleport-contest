#!/usr/bin/env node

// Run the checked-in matrix for a monster that steps on a squeaky board,
// through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The behavior is trap.c mintrap() (3732-3840), reached from monmove.c
// postmov():1509, through trapeffect_selector() (2936) into the monster arm of
// trapeffect_sqky_board() (1439-1475). What a recording can show is the top
// line, the trap glyph seetrap() exposes, the rn2(4) at trap.c:3812, and the
// screens the monsters wake_nearto() woke go on to produce. The matrix
// therefore spreads over the three gates that select the line -- whether the
// hero can see the monster, whether the hero is deaf, and whether acoustics is
// on -- plus a pet, which reaches the same postmov() through dog_move().
//
// The hero searches for the whole segment. Standing still keeps the hero's own
// moves out of the recording, gives the monsters turns in which to find a
// board, and fixes the hero's square, which is what the near/far threshold in
// the out-of-sight arm measures against.
//
// Seeds were found by running the port over seed ranges and keeping those
// whose dungeon level one holds a SQKY_BOARD that some monster later stepped
// on, read from `mtrapseen`; none was copied from a recorded session. Each
// segment's move count is the largest that stays inside behavior this slice
// owns: most of these games later reach monmove.c distfleeck()'s refused
// monster-flight boundary, and the counts stop one key short of it.
//
// One arm has no segment here: `nearby` rather than `in the distance`. The
// threshold needs an unseen monster within nine squares of a hero who could
// see its square, or within five of one who could not. A waiting hero stands
// in a lit room, where a monster that close is visible instead and takes the
// in-sight arm, so this wants a dark room -- and mklev.c's
// `rnd(1 + depth) < 11 && rn2(77)` makes one out of about 77 dungeon level one
// rooms. 11,000 scanned seeds produced no board in such a room within range.
// scripts/monmove.test.mjs pins both sides of the threshold against postmov()
// directly.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

function nethackrc(pettype, extra) {
    return [
        'OPTIONS=name:Prober,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype}`,
        ...(extra ? [extra] : []),
        '',
    ].join('\n');
}

function waiting({ seed, pettype = 'none', extra = null, turns }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(pettype, extra),
        moves: 's'.repeat(turns),
    };
}

export function loadMonsterSqueakyBoardRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The plain case, and the one the two development sessions that
            // opened this goal stop on: a monster the hero cannot see steps on
            // a board and the hero hears it in the distance.
            waiting({ seed: 6200257, turns: 250 }),
            // The in-sight arm, `A board beneath the newt squeaks an F note
            // loudly.` It is the only arm that calls seetrap(), so this is
            // also the case in which the trap glyph appears on the map.
            waiting({ seed: 6200225, turns: 250 }),
            // The same game with a permanently deaf hero. youprop.h:125 folds
            // u.uroleplay.deaf into Deaf, and the arm answers with `The newt
            // stops momentarily and appears to cringe.` It calls no seetrap(),
            // so the board stays off the map.
            waiting({ seed: 6200225, extra: 'OPTIONS=deaf', turns: 250 }),
            // A deaf hero on the out-of-sight arm. C still calls You_hear(),
            // which returns without printing, so the board fires silently and
            // only the woken monsters show that it did.
            waiting({ seed: 6200257, extra: 'OPTIONS=deaf', turns: 250 }),
            // !acoustics silences the same line through pline.c You_hear()'s
            // other early return (436-451), which is a separate test from
            // Deaf.
            waiting({ seed: 6200257, extra: 'OPTIONS=!acoustics', turns: 250 }),
            // Two boards fire in one game 26 turns apart, and a second monster
            // ends up knowing the type: mondata.c mons_see_trap() teaches
            // every eyed, sighted, non-mindless monster within 7x7 of a lit
            // trap square, which nothing else in the port exercises.
            waiting({ seed: 6200333, turns: 60 }),
            // A board that fires twice late in a long game, after 100 turns of
            // monster movement have rearranged the level.
            waiting({ seed: 6300280, turns: 250 }),
            // A pet in the same scan as the monster that steps on the board.
            // The pet acts through dog_move() rather than m_move(), so this is
            // the second route into the same postmov() call.
            waiting({ seed: 6400318, pettype: 'dog', turns: 120 }),
            waiting({ seed: 6400692, pettype: 'dog', turns: 250 }),
            // The pet itself on the board, four times over 144 turns. Because
            // the same dog triggers it repeatedly, this is the only segment
            // that reaches mintrap()'s `already_seen && rn2(4)` escape, and it
            // reaches both outcomes: C draws 3 at step 21 and 1 at step 90,
            // where the board stays silent, and 0 at step 68, where it
            // squeaks again.
            waiting({ seed: 6905575, pettype: 'dog', turns: 144 }),
        ],
    }, 'monster squeaky board recipe');
}

export async function runMonsterSqueakyBoardMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster squeaky board',
            recipe: loadMonsterSqueakyBoardRecipe(),
        }],
        summaryLabel: 'MONSTER SQUEAKY BOARD',
    });
}

runMatrixCli(import.meta.url, runMonsterSqueakyBoardMatrix, 'monster squeaky board');
