#!/usr/bin/env node

// Run the checked-in matrix for shift-direction runs that start and end inside
// one room through fresh C recordings. Every segment contains replay inputs
// only; runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// One keystroke drives a whole run, so each case names the square the run
// stops on and the reason hack.c stops it there. Together the segments cover
// every stop hack.c can reach at svc.context.run == 1 from a room:
// lookaround()'s monster-in-front arm, domove_core()'s IS_DOOR and
// IS_FURNITURE arm, its failed test_move() arm, and check_here()'s object
// stop. They also cover all four flags.runmode cadences, because
// runmode_delay_output() calls nh_delay_output() a different number of times
// in each, and the recorder captures one animation frame per call.

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
        ...(options ? [`OPTIONS=${options}`] : []),
        '',
    ].join('\n');
}

// Each entry names the stop hack.c reaches and the run length the port takes
// to reach it. A leading space dismisses the welcome message, so the run is
// always the segment's second keystroke.
const CASES = [
    {
        // Twelve squares west, ending on a square that holds an object:
        // pickup.c check_here() calls nomul(0) before look_here() prints.
        // Twelve turns crosses one moves % 7 boundary, so the default
        // RUN_LEAP cadence emits its two frames.
        seed: 6000045,
        role: 'Wizard', race: 'elf', gender: 'female', align: 'chaotic',
        moves: ' H',
    },
    {
        // Eleven squares east into a wall: test_move() fails and
        // domove_core() takes its zero-time refusal arm mid-run.
        seed: 6000003,
        role: 'Healer', race: 'gnome', gender: 'male', align: 'neutral',
        moves: ' L',
    },
    {
        // The same run under runmode:walk (RUN_STEP), which delays after
        // every step instead of every seventh.
        seed: 6000003,
        role: 'Healer', race: 'gnome', gender: 'male', align: 'neutral',
        options: 'runmode:walk',
        moves: ' L',
    },
    {
        // runmode:crawl adds four more nh_delay_output() calls per delay.
        seed: 6000008,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        options: 'runmode:crawl',
        moves: ' L',
    },
    {
        // runmode:teleport suppresses every intermediate frame.
        seed: 6000045,
        role: 'Wizard', race: 'elf', gender: 'female', align: 'chaotic',
        options: 'runmode:teleport',
        moves: ' H',
    },
    {
        // flags.time changes what runmode_delay_output() writes to
        // disp.time_botl and what moveloop_core() suppresses while running.
        seed: 6000003,
        role: 'Healer', race: 'gnome', gender: 'male', align: 'neutral',
        options: 'time',
        moves: ' L',
    },
    {
        // flags.time with a delay after every step.
        seed: 6000020,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        options: 'time,runmode:walk',
        moves: ' H',
    },
    {
        // The run's very first square is a doorway, so domove_core()'s
        // IS_DOOR arm ends it after one step and lookaround() never runs.
        seed: 5150211,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' L',
    },
    {
        // Four squares west onto a doorway: the same arm after lookaround()
        // has passed the run three times.
        seed: 6000041,
        role: 'Rogue', race: 'orc', gender: 'female', align: 'chaotic',
        moves: ' H',
    },
    {
        // A run followed by two walks: the walks must resume with
        // context.run back at zero and no leftover multi.
        seed: 6000003,
        role: 'Healer', race: 'gnome', gender: 'male', align: 'neutral',
        moves: ' Lll',
    },
];

const MORE_CASES = [
    {
        // A walk before the run, so u.last_str_turn and multi start from a
        // command that set neither.
        seed: 6000003,
        role: 'Healer', race: 'gnome', gender: 'male', align: 'neutral',
        moves: ' lL',
    },
    {
        // Two runs in a row; the second starts where the first stopped.
        seed: 6000045,
        role: 'Wizard', race: 'elf', gender: 'female', align: 'chaotic',
        moves: ' HH',
    },
    {
        // Running south rather than east or west.
        seed: 6000015,
        role: 'Rogue', race: 'orc', gender: 'female', align: 'chaotic',
        moves: ' J',
    },
    {
        // Running west six squares.
        seed: 6000026,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        moves: ' H',
    },
    {
        // flags.mention_walls on. lookaround()'s door and monster messages
        // are refused rather than printed, so this pins that an ordinary
        // room run never reaches either.
        seed: 6000003,
        role: 'Healer', race: 'gnome', gender: 'male', align: 'neutral',
        options: 'mention_walls',
        moves: ' L',
    },
    {
        // lookaround() stops the run because a monster the hero can see
        // stands on the next square.
        seed: 7000042,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        moves: ' L',
    },
    {
        // The same stop five squares in.
        seed: 7000045,
        role: 'Knight', race: 'human', gender: 'female', align: 'lawful',
        moves: ' L',
    },
    {
        // And running west.
        seed: 7000076,
        role: 'Archeologist', race: 'dwarf', gender: 'male', align: 'lawful',
        moves: ' H',
    },
    {
        // The starting pet stands on the run's first square. domove_core()
        // does not stop for a safemon, so the hero swaps with it and the run
        // continues; lookaround() then ignores the square it moved away from.
        seed: 7100003,
        role: 'Wizard', race: 'elf', gender: 'female', align: 'chaotic',
        moves: ' L',
    },
];

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ name: 'RoomRun', ...entry }),
        moves: entry.moves,
    };
}

export function loadRoomRunsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [...CASES, ...MORE_CASES].map(segment),
    });
}

async function main() {
    const result = await runFreshMatrix({
        entries: [{ label: 'room runs', recipe: loadRoomRunsRecipe() }],
        summaryLabel: 'ROOM RUNS',
    });
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main().then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`run-room-runs: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
