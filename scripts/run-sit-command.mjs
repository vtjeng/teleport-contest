#!/usr/bin/env node

// Run the checked-in #sit recipes through fresh C recordings. Every segment
// contains replay inputs only; runFreshMatrix() records reference output in
// an isolated temporary workspace.
//
// cmd.c doextcmd() reaches sit.c dosit(), which covers the full guard and
// terrain chain here. The independent egg recipes also reach its return-valued
// lay_an_egg() helper through the real command dispatcher.
//
// Seeds were chosen by generating D:1 with the port and reading the square the
// case needs, not by copying any recorded session:
//
//   * 4404011 and 5300004 are the first seeds of their scans whose upstairs
//     room offers, respectively, one step of plain floor to the east and a
//     doorway two steps west with corridor beyond it.
//   * 5800074 is the first seed of a 1000-seed scan (5800001 upward) that
//     starts a lichen next to the Valkyrie on trap-free, object-free room
//     floor, so one forced attack leaves a corpse the hero can step onto.
//     Killing for the corpse is necessary: every corpse D:1 generates belongs
//     to a mktrap() victim and therefore shares its square with a trap, and
//     the port does not yet activate traps.
//   * 5700001 is the first Knight seed whose pony stands due east, so #ride
//     needs no walk before it.
//   * 8300002 and 8300010 come from a fresh seed scan for red-dragon
//     polymorphs. They vary role and seed while both taking #sit into
//     lay_an_egg() through the extended-command caller.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_RED_DRAGON } from '../js/monsters.js';
import { EGG } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed Friday afternoon, away from the calendar dates that add a startup
// message of their own.
const DATETIME = '20240517131415';

// cmd.c doextcmd()'s prompt takes the command name and a newline. decl.c
// binds 'd' to dodrop() and 'F' to the fight prefix; wizcmds.c binds ^W to
// #wizwish and ^V to #levelport.
export const SIT = '#sit\n';
export const WAIT = '.';
export const WISH_KEY = '\x17';

// `time` puts the turn counter on the status line, which is what separates
// dosit()'s two answers: ECMD_TIME spends the turn and ECMD_OK does not.
// `showexp` is a second status field that must not move with it.
const PLAIN = 'pettype:none,!acoustics,!autopickup,time,showexp';
const DEBUG = `${PLAIN},playmode:debug`;

function nethackrc({ name, role, race, gender, align, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

const ROGUE = {
    name: 'Sitter', role: 'Rogue', race: 'human', gender: 'female',
    align: 'chaotic', options: PLAIN,
};
const VALKYRIE = {
    name: 'Sitter', role: 'Valkyrie', race: 'human', gender: 'female',
    align: 'lawful', options: PLAIN,
};
const KNIGHT = {
    name: 'Sitter', role: 'Knight', race: 'human', gender: 'male',
    align: 'lawful', options: PLAIN,
};
const DEBUG_ROGUE = { ...ROGUE, options: DEBUG };

// Every segment ends with a wait, so a command that wrongly spent or wrongly
// saved a turn shows up in the screen after it.
function segment(seed, character, moves) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(character),
        moves: `${moves}${WAIT}`,
    };
}

export function loadSitCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // sit.c:535-536. The hero starts on the up staircase, so this is
            // the shortest #sit a game can reach.
            segment(4404011, ROGUE, SIT),
            // sit.c:561-563 through dungeon.c surface(), whose IS_ROOM arm
            // answers "floor". One step east leaves the staircase behind.
            segment(4404011, ROGUE, `l${SIT}`),
            // The same else arm over surface()'s IS_DOOR arm, "doorway".
            segment(5300004, ROGUE, `hh${SIT}`),
            // And over its final arm, "ground", one step further into the
            // corridor past that doorway.
            segment(5300004, ROGUE, `hhh${SIT}`),
            // sit.c:452 and :459-461. u_init.c gives every Rogue a short
            // sword in slot a; objects.c makes it oc_material IRON, so the
            // "not very comfortable" tail prints. The drop lands it on the
            // staircase, which also shows the object arm beating the STAIRS
            // arm below it.
            segment(4404011, ROGUE, `da${SIT}`),
            // The same arm with the tail suppressed: slot f is the Rogue's
            // sack, oc_material CLOTH.
            segment(4404011, ROGUE, `df${SIT}`),
            // sit.c:456-457. objnam.c:2097 records that xname() on a corpse
            // omits the monster type, so this line reads "the corpse" while
            // the look one keystroke earlier reads "a lichen corpse".
            segment(5800074, VALKYRIE, `Fjj${SIT}`),
            // sit.c:406-409, the steed guard, which returns ECMD_OK and so
            // must not move the turn counter.
            segment(5700001, KNIGHT, `#ride\nl${SIT}`),
        ],
    }, 'sit command recipe');
}

// scripts/record-session.mjs clears the install directory only before a
// chunk's first segment, and a debug game the recorder terminates leaves a
// save behind, so each debug segment needs its own recipe and fresh install.
export function loadSitCommandDebugRecipes() {
    const segments = [
        // sit.c:449-450. Slot h is where the wish lands for a debug-mode
        // Rogue, who starts with a blindfold in g on top of the six items
        // u_init.c gives every Rogue.
        segment(4404011, DEBUG_ROGUE, `${WISH_KEY}towel\ndh${SIT}`),
        // sit.c:463-468. The pie prints "Squelch!" and then useupf() deletes
        // it, so the look after the sit must find bare staircase.
        segment(4404011, DEBUG_ROGUE, `${WISH_KEY}cream pie\ndh${SIT}:`),
    ];
    return segments.map((one, index) => validateCleanRecipe({
        version: 5,
        segments: [one],
    }, `sit command debug recipe ${index + 1}`));
}

function eggLayingRecipe(filename, label) {
    const recipe = JSON.parse(readFileSync(
        new URL(`../recipes/sit.c/${filename}`, import.meta.url), 'utf8',
    ));
    return validateCleanRecipe(recipe, label);
}

export function loadSitEggLayingRecipes() {
    return [
        {
            label: 'sit egg laying',
            recipe: eggLayingRecipe(
                'egg-laying-red-dragon-independent.session.json',
                'sit egg-laying recipe',
            ),
        },
        {
            label: 'sit egg laying role variation',
            recipe: eggLayingRecipe(
                'egg-laying-red-dragon-role-variation.session.json',
                'sit egg-laying role variation recipe',
            ),
        },
    ];
}

async function verifyEggLayingSegment(segmentInput) {
    await runSegment(segmentInput);
    assert.equal(
        game.youmonst.data.pmidx,
        PM_RED_DRAGON,
        'the independent recipe polymorphs the hero to a red dragon',
    );
    let egg = game.level.objects[game.u.ux][game.u.uy];
    while (egg && egg.otyp !== EGG) egg = egg.nexthere;
    assert.equal(egg?.otyp, EGG, 'dosit() drops the produced egg at the hero');
    assert.equal(egg.corpsenm, PM_RED_DRAGON);
    assert.equal(egg.spe, 1);
}

export async function runSitCommandMatrix() {
    const command = await runFreshMatrix({
        entries: [
            { label: 'sit command', recipe: loadSitCommandRecipe() },
            ...loadSitCommandDebugRecipes().map((recipe, index) => ({
                label: `sit command debug ${index + 1}`,
                recipe,
            })),
        ],
        summaryLabel: 'SIT COMMAND',
        chunkLimit: 8,
    });
    if (!command.passed) return command;
    return runFreshMatrix({
        entries: loadSitEggLayingRecipes(),
        summaryLabel: 'SIT EGG LAYING',
        verifySegment: verifyEggLayingSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runSitCommandMatrix, 'sit command');
