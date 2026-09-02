#!/usr/bin/env node

// Record and replay sighted decorated object-pile feedback against the
// patched C reference. Both segments use debug wishes to drop two distinct,
// nonmerging heavy iron balls on source-inert terrain, step off that square,
// and return through pickup.c check_here(). The D:1 up staircase exercises
// invent.c look_here()'s terrain header, blank separator, and object menu.
// The doorway exercises the terrain message before the pile-limit count.

import { DOOR, OBJ_FLOOR, STAIRS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { dfeature_at } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { HEAVY_IRON_BALL } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// This fixed Monday morning isolates terrain and pile output from calendar
// messages while retaining the recorder's America/New_York normalization.
const DATETIME = '20330809101112';
const WIZWISH_KEY = '\x17';
const HEAVY_BALL_WISH = `${WIZWISH_KEY}iron ball\n`;
// Three balls fit in the starting inventory. The next two fall separately,
// because heavy iron balls have oc_merge clear in objects.c.
const TWO_BALL_DROP = HEAVY_BALL_WISH + HEAVY_BALL_WISH + ' '
    + HEAVY_BALL_WISH + ' ' + HEAVY_BALL_WISH.repeat(2);

function nethackrc(name, pileLimit) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,`
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug,'
            + `pile_limit:${pileLimit}`,
        '',
    ].join('\n');
}

export function loadDecoratedObjectPileRecipes() {
    const segments = [
        {
            seed: 6200242,
            datetime: DATETIME,
            nethackrc: nethackrc('PileCount', 5),
            // Space dismisses startup. Wishes drop two balls on the D:1
            // up staircase. West then east re-enters it, Space dismisses
            // the pile window, and rest captures the repaired successor.
            moves: ' ' + TWO_BALL_DROP + 'hl .',
        },
        {
            seed: 6200242,
            datetime: DATETIME,
            nethackrc: nethackrc('PileFresh2', 2),
            // Two north and two west steps reach the nearby doorway; the
            // first west step crosses a generated gold-piece square.
            // Wishes drop two balls there, and west then east re-enters
            // the doorway through the triggering count threshold.
            moves: ' kkhh' + TWO_BALL_DROP + 'hl.',
        },
    ];
    // record-session preserves the staged install between one recipe's
    // segments for save/restore sessions. Each debug game therefore receives
    // its own recipe and fresh install, avoiding the observed collision
    // between two sequential debug games.
    return segments.map((segment, index) => validateCleanRecipe({
        version: 5,
        segments: [segment],
    }, `decorated object pile recipe ${index + 1}`));
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

function pileAt(x, y) {
    const pile = [];
    for (let object = game.level.objects[x]?.[y] ?? null;
        object;
        object = object.nexthere) {
        pile.push({
            id: object.o_id,
            type: object.otyp,
            quantity: object.quan,
            where: object.where,
            x: object.ox,
            y: object.oy,
            known: Boolean(object.dknown),
        });
    }
    return pile;
}

export async function verifyDecoratedObjectPileSegment(segment) {
    const counted = segment.nethackrc.includes('pile_limit:2');
    const beforeArrivalMoves = counted
        ? ' kkhh' + TWO_BALL_DROP + 'h'
        : ' ' + TWO_BALL_DROP + 'h';
    await runSegment({ ...segment, moves: beforeArrivalMoves });
    // Both setup routes finish one square west of the decorated pile.
    const target = { x: game.u.ux + 1, y: game.u.uy };
    const expectedType = counted ? DOOR : STAIRS;
    const expectedFeature = counted
        ? 'doorway'
        : 'staircase up out of the dungeon';
    if (game.level.at(target.x, target.y).typ !== expectedType)
        throw new Error('setup did not leave the expected decorated square');
    if (dfeature_at(target.x, target.y, game) !== expectedFeature)
        throw new Error('setup produced the wrong terrain description');

    const expectedPile = pileAt(target.x, target.y);
    // Five wishes leave three carried balls and two separate floor nodes.
    if (expectedPile.length !== 2
        || expectedPile.some(({ type }) => type !== HEAVY_IRON_BALL)) {
        throw new Error('setup did not create a two-ball floor pile');
    }

    const storage = storageProbe();
    let boundary = null;
    await runSegment(
        { ...segment, storage },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;
    if (game.u.ux !== target.x || game.u.uy !== target.y)
        throw new Error('replay did not finish on the decorated pile');

    const actualPile = pileAt(target.x, target.y);
    if (actualPile.length !== expectedPile.length)
        throw new Error('arrival changed the pile length');
    for (let index = 0; index < actualPile.length; ++index) {
        const actual = actualPile[index];
        const expected = expectedPile[index];
        if (actual.id !== expected.id || actual.type !== expected.type
            || actual.quantity !== expected.quantity
            || actual.known !== expected.known) {
            throw new Error('arrival changed the pile identity');
        }
        if (actual.where !== OBJ_FLOOR
            || actual.x !== target.x || actual.y !== target.y) {
            throw new Error('arrival changed floor-object ownership');
        }
    }
    if (counted) {
        const terrain = game._ttyToplines.indexOf(
            'There is a doorway here.',
        );
        const count = game._ttyToplines.indexOf(
            'There are two objects here.',
        );
        if (terrain < 0 || count <= terrain)
            throw new Error('count path did not report terrain before count');
    }
    if (game.flags.pickup || game.flags.mention_decor)
        throw new Error('replay changed its object-description options');
    if (game.context.run !== 0 || game.multi !== 0)
        throw new Error('decorated pile did not stop movement');
    if (storage.length !== 0)
        throw new Error('decorated pile changed persisted storage');
}

export async function runDecoratedObjectPileMatrix() {
    const [staircase, doorway] = loadDecoratedObjectPileRecipes();
    return runFreshMatrix({
        entries: [
            { label: 'staircase object pile', recipe: staircase },
            { label: 'doorway object pile', recipe: doorway },
        ],
        summaryLabel: 'DECORATED OBJECT PILE',
        verifySegment: verifyDecoratedObjectPileSegment,
    });
}

runMatrixCli(import.meta.url, runDecoratedObjectPileMatrix, 'decorated object pile');
