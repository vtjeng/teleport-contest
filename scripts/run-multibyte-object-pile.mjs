#!/usr/bin/env node

// Record and replay a natural two-object pile containing a custom-named slime
// mold. The generated route crosses object-free ROOM squares, steps onto the
// pile with autopickup disabled, dismisses the hybrid TTY window, and reaches
// the next command boundary. Separate recordings exercise enabled and disabled
// menu overlays because the recorder install permits one debug-free game per
// fresh recipe without sharing state.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OBJ_FLOOR, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import { donameFresh } from '../js/objnam.js';
import { SLIME_MOLD } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 6500803;
// This Monday morning carries no calendar notice that could add a separate
// message boundary to the pile transaction.
const DATETIME = '20330809101112';

function nethackrc(overlay) {
    return [
        'OPTIONS=name:UtfPile,role:Valkyrie,race:human,gender:female,'
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,fruit:caf\u00e9,'
            + 'eight_bit_tty,'
            + `${overlay ? '' : '!'}menu_overlay`,
        '',
    ].join('\n');
}

export function loadMultibyteObjectPileRecipes() {
    return [true, false].map((overlay) => validateCleanRecipe({
        version: 5,
        segments: [{
            seed: SEED,
            datetime: DATETIME,
            nethackrc: nethackrc(overlay),
            // Five object-free moves reach a two-node pile. Space dismisses
            // its menu; rest captures the repaired successor prompt.
            moves: ' lljjj .',
        }],
    }, `${overlay ? 'enabled' : 'disabled'} multibyte pile recipe`));
}

function pileAt(x, y) {
    const pile = [];
    for (let object = game.level.objects[x]?.[y] ?? null;
        object;
        object = object.nexthere) {
        pile.push({
            id: object.o_id,
            type: object.otyp,
            where: object.where,
            x: object.ox,
            y: object.oy,
            known: Boolean(object.dknown),
        });
    }
    return pile;
}

function floorObjectOfType(x, y, type) {
    for (let object = game.level.objects[x]?.[y] ?? null;
        object;
        object = object.nexthere) {
        if (object.otyp === type) return object;
    }
    return null;
}

export async function verifyMultibyteObjectPileSegment(segment) {
    // The first four directions stop one square north of the target pile.
    await runSegment({ ...segment, moves: ' lljj' });
    const target = { x: game.u.ux, y: game.u.uy + 1 };
    if (game.level.at(target.x, target.y).typ !== ROOM)
        throw new Error('setup did not retain the ordinary ROOM destination');
    const expected = pileAt(target.x, target.y);
    if (expected.length !== 2
        || expected.filter(({ type }) => type === SLIME_MOLD).length !== 1) {
        throw new Error('setup did not retain the two-object slime-mold pile');
    }

    // Stop at the pile menu's input boundary so its rows remain on the live
    // terminal. The complete replay below dismisses this window and checks
    // the successor command boundary separately.
    await runSegment({ ...segment, moves: ' lljjj' });
    const pileRows = game.nhDisplay.grid.map(
        (row) => row.map(({ ch }) => ch).join(''),
    );
    const fruitObject = floorObjectOfType(game.u.ux, game.u.uy, SLIME_MOLD);
    if (!fruitObject)
        throw new Error('pile window lost its named slime mold');
    const fruitName = donameFresh(fruitObject, game);
    if (fruitName !== 'a caf\u00e9'
        || encodeUtf8ByteString(fruitName).join(',')
            !== '97,32,99,97,102,195,169') {
        throw new Error('pile window did not preserve the named fruit bytes');
    }
    // Recorder patch 006 advances one cell per source byte but ignores both
    // signed high-bit bytes of the final UTF-8 character. The live shadow row
    // therefore ends in two blank cells after the visible ASCII prefix.
    if (!pileRows.some((row) => row.includes('a caf  ')))
        throw new Error('pile window did not project the named fruit row');

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.u.ux !== target.x || game.u.uy !== target.y)
        throw new Error('replay did not finish on the multibyte pile');
    const actual = pileAt(target.x, target.y);
    if (actual.length !== expected.length)
        throw new Error('arrival changed the pile length');
    for (let index = 0; index < actual.length; ++index) {
        if (actual[index].id !== expected[index].id
            || actual[index].type !== expected[index].type) {
            throw new Error('arrival changed the pile identity');
        }
        if (actual[index].where !== OBJ_FLOOR
            || actual[index].x !== target.x
            || actual[index].y !== target.y) {
            throw new Error('arrival changed floor-object ownership');
        }
        if (!actual[index].known)
            throw new Error('pile display did not observe every object');
    }
    if (game.gf?.ffruit?.fname !== 'caf\u00e9')
        throw new Error('replay did not retain the custom UTF-8 fruit name');
    if (game.flags.pickup)
        throw new Error('replay changed the autopickup option');
    if (game.context.run !== 0 || game.multi !== 0)
        throw new Error('pile window did not stop movement');
    if (game.nhDisplay.inputQueueLength !== 0)
        throw new Error('pile window left unread command input');
}

export async function runMultibyteObjectPileMatrix() {
    const [enabled, disabled] = loadMultibyteObjectPileRecipes();
    return runFreshMatrix({
        entries: [
            { label: 'enabled-overlay multibyte pile', recipe: enabled },
            { label: 'disabled-overlay multibyte pile', recipe: disabled },
        ],
        summaryLabel: 'MULTIBYTE OBJECT PILE',
        verifySegment: verifyMultibyteObjectPileSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMultibyteObjectPileMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`multibyte object pile: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
