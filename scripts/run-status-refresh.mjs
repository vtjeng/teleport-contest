#!/usr/bin/env node

// Run the checked-in matrix for when the status line refreshes through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// allmain.c moveloop_core() (473-478) and display.c flush_screen() (2235-2239)
// share one gate: `if (disp.botl || disp.botlx) bot(); else if
// (disp.time_botl) timebot();`. The three arms are what these segments cover.
//
//   * The whole-status arm runs on any turn a writer marked, which is most
//     commands, so every segment reaches it.
//   * The turn-counter arm runs on every turn of a game with the 'time'
//     option on, because allmain.c sets disp.time_botl whenever svm.moves
//     changes outside a run and hack.c runmode_delay_output() sets it on
//     every delayed step inside one. botl.c timebot() refreshes BL_TIME
//     alone, so a field that moved with nothing marking the status line keeps
//     the text the last whole-status pass left.
//   * Neither arm runs on a turn nothing marked, which is every quiet turn of
//     a game with 'time' off. C then skips curs_on_u() too, so the screen
//     stands until cmd.c parse() flushes before the next key.
//
// The stale field these cases measure is the terrain word. classify_terrain()
// (botl.c:2295-2316) suppresses its own disp.botl write while svc.context.run
// is set, so a run that crosses terrain must leave the word from before the
// run standing on every frame until hack.c end_running() makes it up.
//
// The 'time'-on side of a multi-turn meal lives in
// scripts/run-eat-occupation.mjs, whose segments all set the option; the meal
// below is the 'time'-off counterpart, where no arm runs for the whole meal.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc({ name, role, race, gender, align, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// A leading space dismisses the welcome message, so a run is always the
// segment's second keystroke, and the trailing wait shows the status line the
// run left behind.
const RUN_WEST = ' L.';
const RUN_EAST = ' H.';

// A game starts on turn 1, so the ninth of these searches gives the counter
// its second digit: the first turn on which a status field's own width
// changes with nothing else marked. The searches after it keep the widened
// counter on screen. detect.c dosearch0() writes no disp.botl of its own, so
// the turn-counter arm handles every one of these turns.
const SEARCHES_PAST_TEN_TURNS = 's'.repeat(14);

// eat.c fprefx()'s food ration arm says "This satiates your stomach!" below
// 700 nutrition. A hero starts at 900 and gethungry() spends one point a turn,
// so 205 waits carry the meal past that threshold, and the second bite then
// crosses 1000 and moves u.uhs with nothing marking the status line.
const WAITS_PAST_SATIATION_MESSAGE = '.'.repeat(205);
// u_init.c gives the Valkyrie one food ration, in this slot.
const VALKYRIE_FOOD_RATION = 'd';

const CASES = [
    {
        // The turn-counter arm on every step of a run that crosses terrain,
        // under runmode:walk, which delays after every step and so captures a
        // frame from inside the run. The terrain word must not follow the
        // hero.
        seed: 6000003,
        name: 'TerRun',
        role: 'Healer',
        race: 'gnome',
        gender: 'male',
        align: 'neutral',
        options: 'time,terrainstatus,runmode:walk',
        moves: RUN_WEST,
    },
    {
        // The same run with 'time' off, where neither arm runs on any step.
        seed: 6000003,
        name: 'TerRun',
        role: 'Healer',
        race: 'gnome',
        gender: 'male',
        align: 'neutral',
        options: 'terrainstatus,runmode:walk',
        moves: RUN_WEST,
    },
    {
        // The default RUN_LEAP cadence, which delays only on a step where the
        // turn counter is a multiple of seven, so the arm runs on a small
        // subset of the run's steps. This run ends on a square holding an
        // object, where pickup.c check_here() stops it.
        seed: 6000045,
        name: 'TerRun',
        role: 'Wizard',
        race: 'elf',
        gender: 'female',
        align: 'chaotic',
        options: 'time,terrainstatus',
        moves: RUN_EAST,
    },
    {
        // runmode:crawl calls nh_delay_output() five times per step, so the
        // arm runs five times as often and each frame is compared.
        seed: 6000008,
        name: 'TerRun',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'lawful',
        options: 'time,terrainstatus,runmode:crawl',
        moves: RUN_WEST,
    },
    {
        // Quiet turns with 'time' on: the turn-counter arm and nothing else,
        // five times over.
        seed: 4410007,
        name: 'Quiet',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        options: 'pettype:none,!acoustics,time',
        moves: '.....',
    },
    {
        // The same turns with 'time' off, where the gate takes no arm at all
        // and C makes no flush_screen() call of its own.
        seed: 4410007,
        name: 'Quiet',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        options: 'pettype:none,!acoustics',
        moves: '.....',
    },
    {
        // The turn the counter itself widens, with 'showvers' on. wintty.c
        // render_status() right justifies BL_VERS at cw->cols - lth
        // (5185-5210), a column BL_TIME's width does not enter, so the version
        // must stay put while the fields between it and the counter move.
        seed: 6200025,
        name: 'Quiet',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        options: 'pettype:none,!acoustics,time,showvers',
        moves: SEARCHES_PAST_TEN_TURNS,
    },
    {
        // The same widening on a three-row status line, where render_status()
        // (5036-5062) indents BL_CONDITION to BL_HUNGER's column on the row
        // above instead. 'deaf' is the one condition a hero can hold from turn
        // one: botl.c:1193 fills BL_MASK_DEAF from the Deaf macro, which
        // youprop.h:125 spells to include u.uroleplay.deaf.
        seed: 6400001,
        name: 'Quiet',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        options: 'pettype:none,!acoustics,time,statuslines:3,deaf',
        moves: SEARCHES_PAST_TEN_TURNS,
    },
    {
        // Both placements at once. BL_VERS pads from its own nominal column,
        // so it erases the indented conditions on its way to the right margin;
        // wintty.c:5194-5196 records that as a FIXME, and it is the row C
        // draws.
        seed: 6400001,
        name: 'Quiet',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        options: 'pettype:none,!acoustics,time,statuslines:3,showvers,deaf',
        moves: SEARCHES_PAST_TEN_TURNS,
    },
    {
        // A meal of more than one turn with 'time' off. C reads no key between
        // the first bite and the last, so no arm runs for the whole meal even
        // though u.uhs moves in the middle of it; the hunger word appears only
        // once done_eating() clears the occupation and its newuhs() marks the
        // status line.
        seed: 5820079,
        name: 'EatOcc',
        role: 'Valkyrie',
        race: 'human',
        gender: 'female',
        align: 'neutral',
        options: 'pettype:none,!acoustics,!autopickup',
        moves: `${WAITS_PAST_SATIATION_MESSAGE}e${VALKYRIE_FOOD_RATION}.`,
    },
];

export function loadStatusRefreshRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: CASES.map(({ seed, moves, ...character }) => ({
            seed,
            datetime: DATETIME,
            nethackrc: nethackrc(character),
            moves,
        })),
    }, 'status refresh recipe');
}

export async function runStatusRefreshMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'status line refresh',
            recipe: loadStatusRefreshRecipe(),
        }],
        summaryLabel: 'STATUS LINE REFRESH',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStatusRefreshMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `status refresh: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
