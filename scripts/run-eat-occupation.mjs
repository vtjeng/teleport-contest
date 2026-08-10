#!/usr/bin/env node

// Run the checked-in matrix for a meal that takes more than one turn through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The path is eat.c start_eating() -> cmd.c set_occupation(eatfood) ->
// allmain.c moveloop_core()'s occupation block -> eat.c eatfood() ->
// done_eating(). C reads no key between the first bite and the last, so the
// whole meal produces a single screen; what covers the turns in between is the
// random-number log, which every segment compares in full. Each meal turn draws
// maybe_generate_rnd_mon()'s rn2(70), gethungry()'s rn2(20) and the monster
// scan's own calls, so a meal that spends the wrong number of turns diverges
// inside that log even when the closing screen would agree.
//
// Every segment also turns the `time` option on and ends with a wait, so a meal
// that spent the wrong number of turns moves T: away from C's.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

export const EAT_KEY = 'e';
export const WAIT = '.';
// topl.c more() accepts quitchars[]; a space is the one this port's recorder
// can send that leaves no other trace.
const DISMISS_MORE = ' ';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

const PLAIN = 'pettype:none,!acoustics,!autopickup,time';
// A starting pet stands beside the hero for the whole meal. C's occupation
// block calls monster_nearby() after every bite, and that predicate ignores a
// peaceful monster, so the meal must run to its end regardless.
const WITH_PET = 'pettype:dog,!acoustics,!autopickup,time,showexp';
const DECORATED = 'pettype:none,!acoustics,!autopickup,time,showscore,'
    + 'symset:DECgraphics,msg_window:reversed';

function segment(seed, moves, character = {}, options = PLAIN) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'EatOcc',
            role: 'Valkyrie',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

// u_init.c gives the Valkyrie one food ration and the Ranger four cram
// rations. objects.h gives them oc_delay 5 and 3, so each is a meal of more
// than one turn, and both are VEGGY, which keeps doeat() out of the FLESH arm
// that violated_vegetarian() owns. The letters below are the ones u_init.c's
// fixed object order produces for each role.
const VALKYRIE_FOOD_RATION = 'd';
const RANGER_CRAM_RATION = 'f';

const RANGER = { role: 'Ranger', gender: 'male' };
const DWARF = { race: 'dwarf', align: 'lawful' };

// eat.c fprefx()'s food ration arm says nothing above 700 nutrition, and
// "This satiates your stomach!" below it. A hero starts at 900 and
// gethungry() spends one point a turn, so the meal has to wait 201 turns to
// cross that threshold; these waits carry it a few turns past. segment()
// supplies the last of them.
const WAITS_PAST_SATIATION_MESSAGE = WAIT.repeat(204);

export function loadEatOccupationRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The ordinary case, and the longest meal an ordinary pack holds.
            // 900 nutrition plus a food ration's 800 crosses 1500 on the
            // fourth bite, so lesshungry() prints its nearly-full warning and
            // sets gn.nomovemsg; done_eating() then prints that instead of
            // "You finish eating". The two messages do not share the top line,
            // so the second one forces a --More-- with no command boundary
            // between them, and the space after the food letter answers it.
            segment(5820011,
                `${EAT_KEY}${VALKYRIE_FOOD_RATION}${DISMISS_MORE}`),
            // A three-turn meal that stays below every threshold: fprefx()
            // takes its give_feedback label for the cram ration, and
            // done_eating() prints "You finish eating the cram ration."
            // The pack holds four, so touchfood() splits one off and draws
            // mkobj.c next_ident()'s rnd(2).
            segment(5820023, `${EAT_KEY}${RANGER_CRAM_RATION}`, RANGER),
            // Two three-turn meals in a row, so the occupation is installed,
            // run down and cleared twice and svc.context.victual is reused
            // after done_eating() zeroed it.
            segment(5820041,
                [`${EAT_KEY}${RANGER_CRAM_RATION}`,
                    `${EAT_KEY}${RANGER_CRAM_RATION}`].join(WAIT),
                RANGER),
            // The same five-turn meal with a pet beside the hero.
            segment(5820037,
                `${EAT_KEY}${VALKYRIE_FOOD_RATION}${DISMISS_MORE}`,
                DWARF, WITH_PET),
            // fprefx()'s "This satiates your stomach!" arm. Ending at 1491
            // nutrition, this meal stays under the choking threshold, so
            // done_eating() prints "You finish eating the food ration." and
            // both messages fit on one top line with no --More--.
            segment(5820079,
                `${WAITS_PAST_SATIATION_MESSAGE}`
                + `${EAT_KEY}${VALKYRIE_FOOD_RATION}`),
        ],
    }, 'eat occupation recipe');
}

export function loadEatOccupationOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The five-turn meal under a different symbol set and message
            // window, so the map repaint around the --More-- is checked too.
            segment(5820011,
                `${EAT_KEY}${VALKYRIE_FOOD_RATION}${DISMISS_MORE}`,
                {}, DECORATED),
        ],
    }, 'eat occupation options recipe');
}

// A runtime random group member completes makemon.c's async output tail while
// a meal occupation is active.  This seed was the first qualifying case in an
// independently selected ascending scan from 8400000; no recorded session
// supplied it.  The outer sewer rat takes its small-group gate, the one
// recursive MM_NOGRP child appears beside the hero, and dochugw() stops the
// meal only after that child's Norep() prompt has completed.
export function loadRuntimeMonsterInterruptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 8400223,
            datetime: '20330517091113',
            nethackrc: nethackrc({
                name: 'WaitScan',
                role: 'Valkyrie',
                gender: 'female',
                align: 'lawful',
                options: 'pettype:none,!acoustics,!autopickup',
            }),
            moves: 'ed ',
        }],
    }, 'runtime monster occupation interruption recipe');
}

// A plain Valkyrie, on a date whose moon phase adds no startup message. The
// scan that found these seeds first ran on 16 July 2034, where C prints
// "Be careful!  New moon tonight." behind a --More-- and the food letter
// answers that instead of the prompt; three days later the moon says nothing.
function stopSegment(seed, moves) {
    return {
        seed,
        datetime: '20340719102030',
        nethackrc: nethackrc({
            name: 'MealStop',
            role: 'Valkyrie',
            options: 'pettype:none,!acoustics,!autopickup,time',
        }),
        moves,
    };
}

// allmain.c stop_occupation()'s printing arms, under both callers that
// interrupt a meal already under way: moveloop_core():505-508, whose
// monster_nearby() scans the eight adjacent squares after the turn's bite, and
// monmove.c dochugw():223-235, whose radius is nine squares, so it fires during
// the monster scan and that turn's bite never happens.
//
// The first three seeds came from an ascending scan of the port alone from
// 3100000 in steps of three, taking the first case of each arm; the fourth is
// the seed the go.occupation repoint used to demonstrate dochugw()'s radius,
// which until now had only a boundary assertion behind it. No recorded session
// supplied any of them, and all four were recorded fresh with the C program on
// 10 August 2026.
export function loadOccupationInterruptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A hostile arrives beside the hero two bites in, so
            // stop_occupation() prints "You stop eating the food ration." and
            // reset_eat() flags the abandoned meal. T: stops at 3.
            stopSegment(3100021, `${EAT_KEY}${VALKYRIE_FOOD_RATION}`),
            // The same caller on the one turn per meal where usedtime has
            // already reached reqtime, so maybe_finished_meal() runs eatfood()
            // a second time and the meal ends rather than stopping. This meal
            // crossed 1500 nutrition, so done_eating() prints lesshungry()'s
            // gn.nomovemsg instead of "You finish eating"; the warning itself
            // forces the --More-- the trailing space answers.
            stopSegment(3100246,
                `${EAT_KEY}${VALKYRIE_FOOD_RATION}${DISMISS_MORE}`),
            // dochugw()'s own stop, which the elapsed turn runs twice: once
            // against the planning clone and once live.
            stopSegment(3101719, `${EAT_KEY}${VALKYRIE_FOOD_RATION}`),
            // The same dochugw() stop with two quiet waits after it, so the
            // turns that follow an abandoned meal are compared as well. A
            // lichen crosses distu 82 to 81 while the hero stands at <13,8>,
            // which is the "or it was too far away" clause, and it never
            // becomes adjacent.
            segment(5900020, `${EAT_KEY}${VALKYRIE_FOOD_RATION}${WAIT}`),
        ],
    }, 'occupation interruption recipe');
}

export async function runEatOccupationMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'eat multi-turn food',
            recipe: loadEatOccupationRecipe(),
        }],
        summaryLabel: 'EAT MULTI-TURN FOOD',
        chunkLimit: 5,
    });
    if (!ordinary.passed) return ordinary;
    const options = await runFreshMatrix({
        entries: [{
            label: 'eat multi-turn food (option variations)',
            recipe: loadEatOccupationOptionsRecipe(),
        }],
        summaryLabel: 'EAT MULTI-TURN FOOD (OPTION VARIATIONS)',
        chunkLimit: 1,
    });
    if (!options.passed) return options;
    const interrupted = await runFreshMatrix({
        entries: [{
            label: 'occupation interruption',
            recipe: loadOccupationInterruptRecipe(),
        }],
        summaryLabel: 'OCCUPATION INTERRUPTION',
        chunkLimit: 4,
    });
    if (!interrupted.passed) return interrupted;
    return runFreshMatrix({
        entries: [{
            label: 'runtime monster occupation interruption',
            recipe: loadRuntimeMonsterInterruptRecipe(),
        }],
        summaryLabel: 'RUNTIME MONSTER OCCUPATION INTERRUPTION',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runEatOccupationMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `eat occupation: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
