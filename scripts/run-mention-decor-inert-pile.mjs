#!/usr/bin/env node

// Record and replay the silent mention_decor transition into an ordinary
// room, followed by a same-terrain object-pile window. The route begins on
// the traversed D:1 staircase, crosses four object-free ROOM squares, reaches
// a generated three-object ROOM pile, dismisses the window, and captures the
// next command boundary.

import { OBJ_FLOOR, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadMentionDecorInertPileRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 6231371,
            // This Tuesday has no calendar message beyond the welcome line.
            datetime: '20340117112233',
            nethackrc: [
                'OPTIONS=name:DecorPile,role:Valkyrie,race:human,gender:female,'
                    + 'align:lawful',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,!autopickup,mention_decor,'
                    + 'pile_limit:5',
                '',
            ].join('\n'),
            // Space dismisses welcome. Four object-free steps establish and
            // retain ROOM, the fifth reaches three objects, Space dismisses
            // the window, and rest captures the repaired successor.
            moves: ' llkkk .',
        }],
    }, 'mention-decor inert pile recipe');
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

export async function verifyMentionDecorInertPileSegment(segment) {
    // The first four directions stop one square south of the pile and exercise
    // the source's empty-square pickup() return on ordinary terrain.
    await runSegment({ ...segment, moves: ' llkk' });
    const target = { x: game.u.ux, y: game.u.uy - 1 };
    if (game.level.at(target.x, target.y).typ !== ROOM)
        throw new Error('setup did not retain an ordinary ROOM destination');
    if (game.iflags.prev_decor !== ROOM)
        throw new Error('empty-square route did not remember ROOM terrain');
    const expectedPile = pileAt(target.x, target.y);
    if (expectedPile.length !== 3)
        throw new Error('setup did not retain the generated three-object pile');

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.u.ux !== target.x || game.u.uy !== target.y)
        throw new Error('replay did not finish on the ordinary object pile');
    const actualPile = pileAt(target.x, target.y);
    if (actualPile.length !== expectedPile.length)
        throw new Error('arrival changed the pile length');
    for (let index = 0; index < actualPile.length; ++index) {
        const actual = actualPile[index];
        const expected = expectedPile[index];
        if (actual.id !== expected.id || actual.type !== expected.type
            || actual.quantity !== expected.quantity) {
            throw new Error('arrival changed the pile identity');
        }
        if (actual.where !== OBJ_FLOOR
            || actual.x !== target.x || actual.y !== target.y) {
            throw new Error('arrival changed floor-object ownership');
        }
    }
    if (game.iflags.prev_decor !== ROOM)
        throw new Error('pile arrival changed ordinary terrain memory');
    if (game.flags.pickup || !game.flags.mention_decor)
        throw new Error('replay changed its description options');
    if (game.context.run !== 0 || game.multi !== 0)
        throw new Error('pile window did not stop movement');
    if (game.nhDisplay.inputQueueLength !== 0)
        throw new Error('pile window left unread command input');
}

export async function runMentionDecorInertPileMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'mention-decor inert pile',
            recipe: loadMentionDecorInertPileRecipe(),
        }],
        summaryLabel: 'MENTION-DECOR INERT PILE',
        verifySegment: verifyMentionDecorInertPileSegment,
    });
}

runMatrixCli(import.meta.url, runMentionDecorInertPileMatrix, 'mention-decor inert pile');
