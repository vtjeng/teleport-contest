#!/usr/bin/env node

// Record and replay the sighted ordinary pile_limit count transaction against
// the patched C reference. Each segment walks through object-free ROOM or CORR
// squares with autopickup disabled to one of the natural generated piles used
// by the preceding window slice. Positive triggering thresholds exercise
// invent.c look_here()'s skip_objects arm; zero and a threshold above the
// object count are outside-boundary controls that retain the object menu.
//
// The five-object case is a separately scanned natural pile. The ten-object
// case uses debug wishes to place ten nonmerging heavy iron balls on an
// ordinary square, then steps away and back through the same check_here()
// transaction as the natural cases.

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { HEAVY_IRON_BALL } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed ordinary Monday morning makes the recorder's tm_isdst handling
// deterministic; this transaction reads neither the calendar nor the clock.
const DATETIME = '20330809101112';

const WIZWISH_KEY = '\x17';
const HEAVY_BALL_WISH = `${WIZWISH_KEY}iron ball\n`;

function nethackrc(name, pileLimit, { debug = false } = {}) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,`
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:none,!acoustics,!autopickup,${debug
            ? 'playmode:debug,' : ''}pile_limit:${pileLimit}`,
        '',
    ].join('\n');
}

export function loadObjectPileCountRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // A fresh scan found this seed's one-step north destination
                // holding exactly two non-mergeable object-chain nodes.
                seed: 6200242,
                datetime: DATETIME,
                nethackrc: nethackrc('PileCount', '   +2'),
                // Space dismisses the welcome More prompt. One step north
                // reaches two objects; rest captures the next prompt after
                // the count line without a window-dismissal key.
                moves: ' k.',
            },
            {
                seed: 6200242,
                datetime: DATETIME,
                nethackrc: nethackrc('PileWrap', 4294967298),
                // glibc atoi() narrows this to int value 2. Reaching the
                // two-node pile must therefore print the count instead of
                // opening the window a large JavaScript number would retain.
                moves: ' k.',
            },
            {
                // A separate fresh scan found this seed's five-step route
                // ending on exactly three non-mergeable chain nodes.
                seed: 6231371,
                datetime: DATETIME,
                nethackrc: nethackrc('PileCount', 3),
                moves: ' llkkk.',
            },
            {
                // This clean scan reaches a five-node pile on <48,5>. The
                // final east step is the only one which observes that pile.
                seed: 6349344,
                datetime: DATETIME,
                nethackrc: nethackrc('PileCount', 5),
                moves: ' hhkkkkhhkkllkllklllklllllkkll.',
            },
            {
                seed: 6200242,
                datetime: DATETIME,
                nethackrc: nethackrc('PileCount', 10, { debug: true }),
                // Three balls remain carried. Every later ball raises
                // near_capacity() past pickup_burden and falls at <76,7>.
                // Repeated identical drop lines need no More dismissal; the
                // east-west pair then re-enters the completed ten-node pile.
                moves: ' h'
                    + HEAVY_BALL_WISH + HEAVY_BALL_WISH + ' '
                    + HEAVY_BALL_WISH + ' '
                    + HEAVY_BALL_WISH.repeat(10)
                    + 'lh.',
            },
            {
                seed: 6200242,
                datetime: DATETIME,
                nethackrc: nethackrc('PileCount', 0),
                // Space dismisses the retained menu, then rest captures its
                // repaired successor prompt.
                moves: ' k .',
            },
            {
                seed: 6231371,
                datetime: DATETIME,
                nethackrc: nethackrc('PileCount', 4),
                moves: ' llkkk .',
            },
        ],
    }, 'object pile count recipe');
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

export async function verifyObjectPileCountSegment(segment) {
    const limitText = /pile_limit:([^,\n]+)/u.exec(segment.nethackrc)?.[1];
    // options.c stores atoi() in an int; this matrix's overflow discriminator
    // wraps to 2 on the recorder's two's-complement target.
    const limit = limitText === '4294967298' ? 2 : Number(limitText);
    const debug = segment.nethackrc.includes('playmode:debug');
    let expectedCount;
    let beforeArrivalMoves;
    let delta;
    if (debug) {
        expectedCount = 10;
        beforeArrivalMoves = segment.moves.slice(0, -2);
        delta = { x: -1, y: 0 };
    } else if (segment.seed === 6349344) {
        expectedCount = 5;
        beforeArrivalMoves = segment.moves.slice(0, -2);
        delta = { x: 1, y: 0 };
    } else if (segment.seed === 6200242) {
        expectedCount = 2;
        beforeArrivalMoves = ' ';
        delta = { x: 0, y: -1 };
    } else {
        expectedCount = 3;
        beforeArrivalMoves = ' llkk';
        delta = { x: 0, y: -1 };
    }
    await runSegment({ ...segment, moves: beforeArrivalMoves });
    const target = { x: game.u.ux + delta.x, y: game.u.uy + delta.y };
    const expectedPile = [];
    for (let object = game.level.objects[target.x][target.y];
        object;
        object = object.nexthere) {
        expectedPile.push({
            id: object.o_id,
            type: object.otyp,
            quantity: object.quan,
        });
    }
    if (expectedPile.length !== expectedCount) {
        throw new Error(
            `seed ${segment.seed} has no ${expectedCount}-object target pile`,
        );
    }

    const storage = storageProbe();
    let boundary = null;
    await runSegment(
        { ...segment, storage },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;
    if (game.u.ux !== target.x || game.u.uy !== target.y)
        throw new Error(`seed ${segment.seed} did not reach its target pile`);

    const actualPile = [];
    for (let object = game.level.objects[game.u.ux][game.u.uy];
        object;
        object = object.nexthere) {
        if (object.where !== OBJ_FLOOR)
            throw new Error(`seed ${segment.seed} changed pile ownership`);
        if (object.ox !== game.u.ux || object.oy !== game.u.uy)
            throw new Error(`seed ${segment.seed} changed pile coordinates`);
        actualPile.push({
            id: object.o_id,
            type: object.otyp,
            quantity: object.quan,
        });
    }
    if (JSON.stringify(actualPile) !== JSON.stringify(expectedPile))
        throw new Error(`seed ${segment.seed} changed its object pile`);
    if (debug) {
        let carriedBalls = 0;
        for (let object = game.invent; object; object = object.nobj)
            if (object.otyp === HEAVY_IRON_BALL) ++carriedBalls;
        if (carriedBalls !== 3 || actualPile.length !== 10) {
            throw new Error(
                `seed ${segment.seed} did not retain 3 and drop 10 iron balls`,
            );
        }
    }
    if (game.flags.pile_limit !== limit)
        throw new Error(`seed ${segment.seed} parsed pile_limit incorrectly`);
    if (game.context.run !== 0 || game.multi !== 0)
        throw new Error(`seed ${segment.seed} did not stop its walk`);
    if (storage.length !== 0)
        throw new Error(`seed ${segment.seed} changed persisted storage`);
}

export async function runObjectPileCountMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'object pile count',
            recipe: loadObjectPileCountRecipe(),
        }],
        summaryLabel: 'OBJECT PILE COUNT',
        verifySegment: verifyObjectPileCountSegment,
    });
}

runMatrixCli(import.meta.url, runObjectPileCountMatrix, 'object pile count');
