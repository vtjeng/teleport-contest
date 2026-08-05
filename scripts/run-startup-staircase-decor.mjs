#!/usr/bin/env node

// Record and replay the initial mention_decor staircase description against
// the patched C reference. The cases cross autopickup and verbose wording with
// an ordinary calendar and the maximal full-moon-plus-Friday message sequence.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NORMAL_SPEED, OBJ_INVENT, STAIRS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { stairway_at } from '../js/stairs.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const VERBOSE_STAIRCASE_LINE =
    'There is a staircase up out of the dungeon here.';
const TERSE_STAIRCASE_LINE = 'A staircase up out of the dungeon.';

function nethackrc(name, autopickup, verbose = true) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,`
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,'
            + `mention_decor,${autopickup ? '' : '!'}autopickup,`
            + `${verbose ? '' : '!'}verbose`,
        '',
    ].join('\n');
}

export function loadStartupStaircaseDecorRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 7310501,
                // This Tuesday has lunar phase seven and is not the 13th.
                datetime: '20340117112233',
                nethackrc: nethackrc('DecorQuiet', false),
                // Space dismisses welcome and leaves the staircase line at
                // the first command boundary.
                moves: ' ',
            },
            {
                seed: 7310502,
                // This Friday the 13th is also a full moon.
                datetime: '20300913120000',
                nethackrc: nethackrc('DecorMax', true),
                // The three spaces dismiss welcome, full moon, and Friday.
                moves: '   ',
            },
            {
                seed: 7310503,
                datetime: '20340117112233',
                nethackrc: nethackrc('DecorTerse', false, false),
                moves: ' ',
            },
        ],
    }, 'startup staircase decor recipe');
}

function storageProbe() {
    const values = new Map();
    return {
        values,
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
    };
}

export async function verifyStartupStaircaseDecorSegment(segment) {
    const storage = storageProbe();
    let boundary = null;
    const replay = await runSegment(
        { ...segment, storage },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;

    const { u } = game;
    const stair = stairway_at(u.ux, u.uy, game);
    if (game.level.at(u.ux, u.uy).typ !== STAIRS
        || !stair?.up || !stair.u_traversed || stair.isladder) {
        throw new Error('startup did not retain the traversed up staircase');
    }
    if (u.uz.dnum !== 0 || u.uz.dlevel !== 1
        || u.ux0 !== u.ux || u.uy0 !== u.uy
        || game.moves !== 1 || game.context.move !== 0
        || u.umovement !== NORMAL_SPEED) {
        throw new Error('startup changed the hero position or turn state');
    }
    const staircaseLine = segment.nethackrc.includes('!verbose')
        ? TERSE_STAIRCASE_LINE : VERBOSE_STAIRCASE_LINE;
    if (game._pending_message !== staircaseLine
        || game._ttyToplines !== staircaseLine
        || game._ttyMessageStopped
        || game.nhDisplay.inputQueueLength !== 0) {
        throw new Error('startup did not stop at the staircase command boundary');
    }
    if (game.iflags.prev_decor !== STAIRS) {
        throw new Error('startup did not remember the staircase terrain');
    }

    const inventory = [];
    for (let object = game.invent; object; object = object.nobj)
        inventory.push(object);
    if (inventory.length === 0
        || inventory.some((object) => object.where !== OBJ_INVENT
            || object.pickup_prev)) {
        throw new Error('startup changed inventory ownership or pickup memory');
    }
    for (const field of [
        'uarm', 'uarmc', 'uarmh', 'uarmf', 'uarms', 'uarmg', 'uarmu',
        'uwep', 'uswapwep', 'uquiver',
    ]) {
        if (game[field] && !inventory.includes(game[field])) {
            throw new Error(`startup detached equipped inventory field ${field}`);
        }
    }
    if (game.level.objects[u.ux][u.uy] !== null) {
        throw new Error('startup changed the empty staircase floor chain');
    }
    if (game.disp.botl || game.disp.botlx) {
        throw new Error('startup left the initial status display dirty');
    }
    if (storage.length !== 0) {
        throw new Error('startup changed persisted storage');
    }

    const preambleCalls = replay.getRngLog().filter((entry) =>
        entry.startsWith('rnd(9000)') || entry.startsWith('rnd(30)'));
    if (preambleCalls.length !== 2
        || !preambleCalls[0].startsWith('rnd(9000)')
        || !preambleCalls[1].startsWith('rnd(30)')) {
        throw new Error('startup changed preamble PRNG order');
    }

    const maximal = segment.datetime === '20300913120000';
    if (game.flags.pickup !== maximal
        || game.flags.moonphase !== (maximal ? 4 : 7)
        || game.flags.friday13 !== maximal
        || u.uluck !== 0) {
        throw new Error('startup changed calendar or autopickup state');
    }
}

export async function runStartupStaircaseDecorMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup staircase decor',
            recipe: loadStartupStaircaseDecorRecipe(),
        }],
        summaryLabel: 'STARTUP STAIRCASE DECOR',
        verifySegment: verifyStartupStaircaseDecorSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupStaircaseDecorMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(
            `startup staircase decor: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
