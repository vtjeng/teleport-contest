#!/usr/bin/env node

// Run the checked-in matrix for the map memory display.c newsym() corrects
// while a square is out of sight, through fresh C recordings. Every segment
// contains replay inputs only; runFreshMatrix() records new reference output
// in an isolated temporary workspace.
//
// newsym()'s "can't see the location" arm (display.c:1077-1097) rewrites a
// square the hero remembers as lit but cannot see now. Its outer condition is
// `!lev->waslit || (flags.dark_room && iflags.use_color)`, and the two arms
// inside it look at what map memory already holds, so three inputs decide the
// whole thing: 'lit_corridor', 'dark_room' and 'color'. Each group below
// varies one of them and holds the other two still.
//
// Every segment walks the hero along one axis and back, or straight past the
// square under test, because the correction runs on the pass where the square
// has just left sight. In an unlit corridor or an unlit room the hero sees one
// square in every direction, so the second step away from a square is where
// its memory is corrected and drawn.
//
// Every character is a human Valkyrie. Neither role nor race reaches this arm
// -- it reads only terrain, map memory and three options -- and a race with
// infravision would make C draw a monster the hero cannot see, a separate
// mismatch scripts/run-corridor-runs.mjs already records.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

function nethackrc(options) {
    return [
        'OPTIONS=name:CorrMem,role:Valkyrie,race:human,gender:female,'
        + 'align:lawful',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// A leading space dismisses the welcome message. The keys that follow walk out
// of the starting room and along a corridor, so every square behind the hero
// leaves sight one step after it entered it. Each seed's path was chosen by
// walking the generated map for the shortest route that crosses at least five
// corridor squares; the recorder is the authority on what each walk does.
// The counts below are what replaying each walk in the port leaves in map
// memory, and scripts/corridor-memory.test.mjs rereads them.
const CORRIDOR_WALKS = [
    // A corridor leaving the starting room westward. Six of its squares are
    // remembered, and the walk ends with half of them still beside the hero.
    { seed: 7710005, moves: ' hhhhhhh' },
    // Seven squares with one southward step part-way, so the square that
    // leaves sight is diagonally behind the hero rather than straight behind.
    { seed: 7710006, moves: ' hhhhjh' },
    // Eight squares over a walk that changes axis four times, which puts a
    // corridor square out of sight from a different direction each time.
    { seed: 7710029, moves: ' hhhkkhkh' },
    // Seven squares of an eastward corridor with a single southward step.
    { seed: 7710036, moves: ' llljlll' },
    // Eleven squares: the walk goes east, turns north and comes back west, so
    // squares corrected earlier in the walk are seen again later. Memory the
    // arm has already corrected has to be promoted afresh, not left dark.
    { seed: 7710062, moves: ' klllkkhhh' },
    // Twelve squares, the longest walk here, and the one that leaves the most
    // corrected memory behind: eight of the twelve end the walk dark.
    { seed: 7710088, moves: ' jjjlljj' },
];

// display.c:1086-1089, the corridor arm. 'lit_corridor' makes back_to_glyph()
// (display.c:2302) answer S_litcorr for every corridor square in sight
// whatever its own lighting, so the hero remembers a lit corridor and newsym()
// puts S_corr back the moment the square leaves sight. reset_glyphmap()
// (display.c:2938-2940) recolours S_litcorr to CLR_WHITE while the two cmaps
// draw the same byte, so the correction is visible on the wire as a colour.
const LIT_CORRIDOR = CORRIDOR_WALKS.map((walk) => ({
    ...walk, options: 'color,lit_corridor',
}));

// The same walks with 'lit_corridor' off. back_to_glyph() then answers
// S_litcorr only for a corridor the hero has seen permanently lit, which none
// of these levels has, so map memory holds S_corr throughout and the arm must
// leave every square alone. This is the control: it fails if the correction
// fires on memory that was never promoted.
const DARK_CORRIDOR = CORRIDOR_WALKS.map((walk) => ({
    ...walk, options: 'color',
}));

// display.c:1090-1092, the S_room arm, over squares of an unlit room. Its
// replacement is DARKROOMSYM, which sym.h:96 resolves to S_darkroom off the
// rogue level; reglyph_darkroom() (display.c:1850-1853) points that cmap at
// the S_room byte under 'dark_room' and colour together and at SYM_NOTHING
// otherwise. Only the second shape is observable, because the first makes the
// two draw the same byte in the same colour, so each seed here turns off one
// of the pair and the corrected square draws blank.
//
// Each seed was chosen for an unlit room square next to the hero's start on
// dungeon level 1; the walk steps onto it and then two squares away.
const DARK_ROOM = [
    // 'dark_room' off, colour on.
    { seed: 7710212, moves: ' hll', options: 'color,!dark_room' },
    { seed: 7710241, moves: ' lhh', options: 'color,!dark_room' },
    { seed: 7710321, moves: ' lhh', options: 'color,!dark_room' },
    // Colour off, 'dark_room' left at its default of on.
    { seed: 7710339, moves: ' hll', options: '!color' },
    { seed: 7710366, moves: ' lhh', options: '!color' },
    { seed: 7710395, moves: ' lhh', options: '!color' },
];

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc(entry.options),
        moves: entry.moves,
    };
}

export function loadCorridorMemoryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            ...LIT_CORRIDOR,
            ...DARK_CORRIDOR,
            ...DARK_ROOM,
        ].map(segment),
    });
}

export async function runCorridorMemoryMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'corridor and room memory',
            recipe: loadCorridorMemoryRecipe(),
        }],
        summaryLabel: 'CORRIDOR MEMORY',
    });
}

runMatrixCli(import.meta.url, runCorridorMemoryMatrix, 'run-corridor-memory');
