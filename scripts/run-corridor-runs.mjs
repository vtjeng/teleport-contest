#!/usr/bin/env node

// Run the checked-in matrix for shift-direction runs that pass through a
// corridor through fresh C recordings. Every segment contains replay inputs
// only; runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// scripts/run-room-runs.mjs covers a run that starts and ends inside one room.
// A hero standing in a room makes hack.c lookaround() skip its bcorr label
// entirely, so that matrix exercises none of the corridor half of the
// function. This matrix supplies it: every segment starts its run on a doorway
// or a corridor square, where `levl[u.ux][u.uy].typ != ROOM` holds and bcorr
// counts the corridor squares around the hero. Between them the segments reach
// corrct 0 through 5, both i0 distances, noturn, the `i <= 2 && i >= -2` guard
// that refuses a turn that would turn too far, and corner turns that leave
// u.dx and u.dy both non-zero.
//
// A run reads no input, so one shift keystroke is one recorded step whose
// screen is where the run stopped, and the per-turn refreshes land in
// animation_frames.
//
// Every character is human. A race with infravision makes C draw a monster
// the hero cannot see, which `js/display.js newsym()` does not do; that
// mismatch is recorded in ROADMAP.md and belongs to the infravision work.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

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

// A leading space dismisses the welcome message. The lower-case keys that
// follow walk the hero to a doorless doorway that opens onto a corridor, so
// the shift key is always the last keystroke of that prefix. Each comment
// names the lookaround() behavior the case was chosen for; the counts come
// from replaying the case with lookaround() instrumented, and the recorder is
// the authority on what the run actually does.
const CORRIDOR_ARMS = [
    {
        // The doorway's only corridor neighbour is the square in front, so
        // bcorr counts nothing: corrct stays 0 and the corner turn cannot
        // fire. The run stops one square later.
        seed: 6100003,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' lkK',
    },
    {
        // A straight corridor over ten lookaround() calls. corrct is 1 each
        // time and i0 is 0, because the single corridor square counted is the
        // one the hero is already moving onto, so the corner turn's `i0` term
        // leaves u.dx/u.dy alone.
        seed: 6100001,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        moves: ' jJ',
    },
    {
        // Two half turns (i0 == 1), each leaving u.dx and u.dy both non-zero.
        // These are the diagonal directions lookaround() chooses rather than
        // ones the player pressed, and they reach test_move() as such.
        seed: 6100006,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' kK',
    },
    {
        // The same corridor for a faster hero, so the run lasts longer: four
        // turns mixing i0 == 1 and i0 == 2, ending orthogonally in front of an
        // open door, which bcorr counted through lookaround()'s last branch
        // rather than its CORR branch.
        seed: 6100006,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        moves: ' kK',
    },
    {
        // A straight turn (i0 == 2, so `i` is +2 or -2 before u.last_str_turn
        // is added), with corrct reaching 5 and noturn set on a later step.
        seed: 6100005,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        moves: ' jJ',
    },
    {
        // Straight turns only, with no half turn anywhere in the run.
        seed: 6100023,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' lL',
    },
    {
        // Sixteen lookaround() calls covering both turn distances, with
        // noturn set part-way through.
        seed: 6100009,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        moves: ' hH',
    },
    {
        // A junction where bcorr counts two to four squares and sets noturn,
        // which suppresses every corner turn. The run keeps the direction the
        // keystroke gave it until something else stops it.
        seed: 6100011,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        moves: ' bhH',
    },
    {
        // corrct reaches 5. The widening stop that fires on a count above 1
        // belongs to svc.context.run == 2, so a run must ignore it.
        seed: 6100028,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        moves: ' jJ',
    },
    {
        // A turn the `i <= 2 && i >= -2` guard refuses because u.last_str_turn
        // has already accumulated. u.dx/u.dy stay as they were and the run
        // ends by failing test_move() against stone.
        seed: 6100048,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        moves: ' hH',
    },
];

const DOORWAYS_AND_LENGTHS = [
    {
        // A corner turn that leaves u.dx/u.dy pointing diagonally at a
        // doorway. test_move() allows it because doorless_door() holds for a
        // D_NODOOR doorway, and domove_core() then ends the run on it.
        seed: 6100024,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        moves: ' khH',
    },
    {
        // The same diagonal entry with noturn set earlier in the run.
        seed: 6100041,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' hhkK',
    },
    {
        // A turn that points the run orthogonally at an open door, which
        // domove_core()'s IS_DOOR arm then stops it on.
        seed: 6100037,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        moves: ' unlL',
    },
    {
        // The longest run in the matrix: 22 lookaround() calls and 10 corner
        // turns, ending on a doorway.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' hhH',
    },
    {
        // 21 lookaround() calls whose last turn the guard refuses, so the run
        // finishes against stone rather than on a feature.
        seed: 6100039,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        moves: ' hhH',
    },
    {
        // The run starts on a corridor square rather than a doorway, so its
        // very first domove() already has bcorr's counts behind it.
        seed: 6100009,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        moves: ' hhH',
    },
    {
        // Eleven lookaround() calls ending on a doorway.
        seed: 6100017,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        moves: ' hH',
    },
    {
        // Seven corner turns, the most of any single run here.
        seed: 6100041,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        moves: ' llL',
    },
    {
        // Five corner turns and then stone.
        seed: 6100047,
        role: 'Tourist', race: 'human', gender: 'female', align: 'neutral',
        moves: ' llL',
    },
    {
        // Two runs in a row. The second starts where the first stopped, with
        // u.last_str_turn reset by cmd.c's DOMOVE_RUSH arm, and its first
        // lookaround() counts corrct 0.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' hhHH',
    },
];

const CADENCES = [
    {
        // runmode:walk delays after every step instead of every seventh, so
        // the recorder captures one animation frame per corridor square.
        seed: 6100009,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        options: 'runmode:walk',
        moves: ' hH',
    },
    {
        // runmode:crawl adds four more nh_delay_output() calls per delay.
        seed: 6100009,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        options: 'runmode:crawl',
        moves: ' hH',
    },
    {
        // runmode:teleport suppresses every intermediate frame.
        seed: 6100009,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        options: 'runmode:teleport',
        moves: ' hH',
    },
    {
        // flags.time changes what runmode_delay_output() writes to
        // disp.time_botl and what moveloop_core() suppresses while running.
        seed: 6100009,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        options: 'time',
        moves: ' hH',
    },
    {
        // A walk immediately after a run that turned corners: context.run and
        // multi must both be back at zero, and the walk takes the direction
        // its own key gives it rather than the one the run ended on.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' hhHh',
    },
    {
        // A second run out of the square the first stopped on.
        seed: 6100005,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        moves: ' jJJ',
    },
    {
        // A run whose corner turns end it on a corridor square, then a walk
        // back the way it came.
        seed: 6100047,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        moves: ' kKk',
    },
];

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ name: 'CorrRun', ...entry }),
        moves: entry.moves,
    };
}

export function loadCorridorRunsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            ...CORRIDOR_ARMS,
            ...DOORWAYS_AND_LENGTHS,
            ...CADENCES,
        ].map(segment),
    });
}

export async function runCorridorRunsMatrix() {
    return runFreshMatrix({
        entries: [{ label: 'corridor runs', recipe: loadCorridorRunsRecipe() }],
        summaryLabel: 'CORRIDOR RUNS',
    });
}

runMatrixCli(import.meta.url, runCorridorRunsMatrix, 'run-corridor-runs');
