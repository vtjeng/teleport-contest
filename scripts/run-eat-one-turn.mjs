#!/usr/bin/env node

// Run the checked-in matrix for a meal that takes one turn through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The command is eat.c doeat() through start_eating() and done_eating(). Each
// segment picks a role whose starting pack holds a comestible with oc_delay 1,
// so svc.context.victual.reqtime is 1 and the meal ends on the turn it starts.
//
// The three random-number outcomes the path can have are each covered: a stack
// of more than one draws mkobj.c next_ident()'s rnd(2) through touchfood()'s
// splitobj(); a single item draws nothing at all; and a food older than thirty
// turns reaches doeat()'s rn2(7) rot test.
//
// Every segment that eats an apple needs a recorder built on Darwin, the host
// that produced the reference sessions. eat.c fprefx() (2179-2190) answers an
// apple from its `#if defined(MACOS9) || defined(MACOS)` arm, and
// include/config1.h:43-45 defines MACOS from clang's __APPLE__ and __MACH__
// alone, so a recorder built by build-recorder.sh's Linux branch compiles that
// arm out and prints the Unix arm's "Core dumped." for an apple instead. The
// wolfsbane segment is the one here that does not depend on the host.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

export const EAT_KEY = 'e';
export const WAIT = '.';

function nethackrc({ name, role, race = 'human', gender = 'male',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

const PLAIN = 'pettype:none,!acoustics,!autopickup';
// A pet on the level and a visible turn counter: a meal that spent the wrong
// number of turns moves T: away from C's.
const PET_AND_CLOCK = 'pettype:dog,!acoustics,!autopickup,time,showexp';
const DECORATED =
    'pettype:none,!acoustics,!autopickup,time,showscore,symset:DECgraphics,'
    + 'msg_window:reversed';

// Every segment opens and closes with a wait, so a meal that spent no turn or
// spent two shows up in the screen after it.
function segment(seed, moves, character = {}, options = PLAIN) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'EatOne',
            role: 'Healer',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

// u_init.c gives the Healer five apples and the Knight ten apples and ten
// carrots, all with an explicit uncursed row, and the Priest one clove of
// garlic and one sprig of wolfsbane. objects.h gives the apple and the sprig
// oc_delay 1 and material VEGGY.
//
// The inventory letters below are the ones u_init.c's fixed object order
// produces for each role. A Healer's shifts by one when a pet is present,
// because the pet's food ration is not in the pack but the starting gold is.
const HEALER_APPLES = 'k';
const HEALER_APPLES_WITH_PET = 'l';
const KNIGHT_APPLES = 'g';
const PRIEST_WOLFSBANE = 'f';

const KNIGHT = { role: 'Knight', align: 'lawful' };
const PRIEST = { role: 'Priest' };

// mkobj.c gives a new comestible age = svm.moves, and doeat() tests
// `(svm.moves - otmp->age) > 30` for an uncursed non-lembas, non-cram food.
// The game starts at move 1 and each wait advances it by one, so eating after
// N waits tests N > 30: thirty waits fall short of the rot test and
// thirty-one reach it, along with the rn2(7) draw that decides whether the
// food has actually gone bad. segment() supplies the first of those waits
// itself, so the counts below are one short of the totals they name.
const WAITS_AT_ROT_THRESHOLD = WAIT.repeat(29);
const WAITS_PAST_ROT_THRESHOLD = WAIT.repeat(30);

// Three apples leave a Knight above 1000 nutrition and gethungry() spends about
// one point a turn, so u.uhs falls back out of SATIATED some forty turns later.
// These waits carry the segment past that crossing with several turns to spare,
// so the recording pins the turn "Satiated" leaves the status line and that
// newuhs() prints nothing when it does. segment() supplies the last of them.
const WAITS_PAST_SATIATION = WAIT.repeat(47);

export function loadEatOneTurnRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // One apple out of a stack: touchfood() splits it, which draws
            // rnd(2), and fprefx() takes the apple's MACOS arm. 900
            // nutrition plus 50 stays inside NOT_HUNGRY, so the status line
            // does not move.
            segment(4510001, `${EAT_KEY}${HEALER_APPLES}`),
            // A stack of one: no split, and therefore no random number at all
            // on the whole path. fprefx() falls through to give_feedback.
            segment(4510003, `${EAT_KEY}${PRIEST_WOLFSBANE}`, PRIEST),
            // Three apples in a row. The third takes u.uhunger over 1000, so
            // newuhs() moves u.uhs to SATIATED and bot() writes it to the
            // status line. The Knight also has a saddled pony beside him.
            segment(4510002,
                [`${EAT_KEY}${KNIGHT_APPLES}`,
                    `${EAT_KEY}${KNIGHT_APPLES}`,
                    `${EAT_KEY}${KNIGHT_APPLES}`].join(WAIT),
                KNIGHT, '!acoustics,!autopickup'),
            // The same three apples, then waits until the hunger clock spends
            // the meal back down through 1000. newuhs()'s switch has no
            // SATIATED and no NOT_HUNGRY case, so that transition writes the
            // status line and says nothing.
            segment(4510002,
                [`${EAT_KEY}${KNIGHT_APPLES}`,
                    `${EAT_KEY}${KNIGHT_APPLES}`,
                    `${EAT_KEY}${KNIGHT_APPLES}${WAITS_PAST_SATIATION}`,
                ].join(WAIT),
                KNIGHT, '!acoustics,!autopickup'),
            // The same apple on each side of the rot threshold: at thirty
            // waits the test short-circuits and draws nothing, and at
            // thirty-one it reaches rn2(7).
            segment(4510001,
                `${WAITS_AT_ROT_THRESHOLD}${EAT_KEY}${HEALER_APPLES}`),
            segment(4510001,
                `${WAITS_PAST_ROT_THRESHOLD}${EAT_KEY}${HEALER_APPLES}`),
        ],
    }, 'eat one-turn recipe');
}

export function loadEatOneTurnOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A pet on the level and a visible clock, twice over: each meal
            // must advance T: by exactly one.
            segment(4510021,
                `${EAT_KEY}${HEALER_APPLES_WITH_PET}${WAIT}`
                + `${EAT_KEY}${HEALER_APPLES_WITH_PET}`,
                {}, PET_AND_CLOCK),
            // The same two meals under a different symbol set and message
            // window, so the map repaint after the meal is checked as well.
            segment(4510021,
                `${EAT_KEY}${HEALER_APPLES}${WAIT}${EAT_KEY}${HEALER_APPLES}`,
                {}, DECORATED),
        ],
    }, 'eat one-turn options recipe');
}

export async function runEatOneTurnMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'eat one-turn food',
            recipe: loadEatOneTurnRecipe(),
        }],
        summaryLabel: 'EAT ONE-TURN FOOD',
        chunkLimit: 6,
    });
    if (!ordinary.passed) return ordinary;
    return runFreshMatrix({
        entries: [{
            label: 'eat one-turn food (option variations)',
            recipe: loadEatOneTurnOptionsRecipe(),
        }],
        summaryLabel: 'EAT ONE-TURN FOOD (OPTION VARIATIONS)',
        chunkLimit: 2,
    });
}

runMatrixCli(import.meta.url, runEatOneTurnMatrix, 'eat one-turn');
