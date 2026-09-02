#!/usr/bin/env node

// Record and replay reqmenu-prefixed walks onto ordinary two-object floor
// piles against the patched C reference. The four independently generated
// D:1 cases cross autopickup with the pile_limit branches that an unprefixed
// walk would enter. The prefix suppresses both pickup and description before
// either branch runs.

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// This fixed Tuesday morning isolates movement from calendar messages while
// preserving the recorder's America/New_York daylight-saving normalization.
const DATETIME = '20340117112233';

const CASES = new Map([
    // One south step reaches the menu-sized pile with the default prefix.
    [6471489, { setup: '', prefix: 'm', direction: 'j', target: [74, 3] }],
    // One east step reaches the count-threshold pile with rebound reqmenu.
    [6471491, { setup: '', prefix: 'x', direction: 'l', target: [8, 5] }],
    // One north step reaches the menu-sized pile with rebound reqmenu.
    [6472320, { setup: '', prefix: 'x', direction: 'k', target: [45, 17] }],
    // The first north step is object-free; the second reaches the count pile.
    [6472206, { setup: 'k', prefix: 'm', direction: 'k', target: [6, 11] }],
]);

function nethackrc(name, { autopickup, pileLimit, rebound }) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,`
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:none,!acoustics,${autopickup
            ? 'autopickup' : '!autopickup'},pile_limit:${pileLimit}`,
        ...(rebound ? ['BINDINGS=x:reqmenu'] : []),
        '',
    ].join('\n');
}

export function loadNoPickObjectPileRecipe() {
    const inputs = [
        // Five leaves a two-object pile on the object-menu path.
        [6471489, 'NoPickA', false, 5, false],
        // Equality at two selects look_here()'s count shortcut.
        [6471491, 'NoPickB', false, 2, true],
        // Autopickup reaches pickup()'s same context.nopick early return.
        [6472320, 'NoPickC', true, 5, true],
        // The final case combines autopickup with the count threshold.
        [6472206, 'NoPickD', true, 2, false],
    ];
    return validateCleanRecipe({
        version: 5,
        segments: inputs.map(
            ([seed, name, autopickup, pileLimit, rebound]) => {
                const route = CASES.get(seed);
                return {
                    seed,
                    datetime: DATETIME,
                    nethackrc: nethackrc(
                        name,
                        { autopickup, pileLimit, rebound },
                    ),
                    // Rest supplies the next input boundary after movement.
                    moves: route.setup + route.prefix + route.direction + '.',
                };
            },
        ),
    }, 'no-pick object pile recipe');
}

function pileAt(x, y) {
    const pile = [];
    for (let object = game.level.objects[x]?.[y] ?? null;
        object;
        object = object.nexthere) {
        // nobj belongs to the level-wide object chain. nexthere supplies the
        // chain order captured by this array; the remaining object fields
        // belong to the object and are compared below.
        const {
            nobj: _nobj,
            nexthere: _nexthere,
            // obj.v is the source union slot and aliases nobj for floor
            // objects, so compare its owner through the chain itself.
            v: _ownerAlias,
            ...fields
        } = object;
        // vision_recalc() can mark a newly visible floor object dknown before
        // spoteffects(). That sight transition belongs to movement, so the
        // pile comparison pins every other object field and both chain links.
        delete fields.dknown;
        pile.push(structuredClone(fields));
    }
    return pile;
}

export async function verifyNoPickObjectPileSegment(segment) {
    const route = CASES.get(segment.seed);
    if (!route) throw new Error(`unrecognized no-pick seed ${segment.seed}`);
    await runSegment({ ...segment, moves: route.setup });
    const [targetX, targetY] = route.target;
    const expectedPile = pileAt(targetX, targetY);
    // Every chosen target contains exactly two ordinary, non-container nodes.
    if (expectedPile.length !== 2
        || expectedPile.some((object) => object.cobj || object.oartifact
            || object.corpsenm >= 0)) {
        throw new Error(`seed ${segment.seed} has no ordinary two-object pile`);
    }

    const storageValues = new Map();
    const storage = {
        getItem(key) {
            return storageValues.has(key) ? storageValues.get(key) : null;
        },
        setItem(key, value) { storageValues.set(key, String(value)); },
        removeItem(key) { storageValues.delete(key); },
        get length() { return storageValues.size; },
        key(index) { return [...storageValues.keys()][index] ?? null; },
    };
    let boundary = null;
    const replay = await runSegment(
        { ...segment, storage },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;
    if (game.u.ux !== targetX || game.u.uy !== targetY)
        throw new Error(`seed ${segment.seed} did not reach its target pile`);
    if (JSON.stringify(pileAt(targetX, targetY))
        !== JSON.stringify(expectedPile)) {
        throw new Error(`seed ${segment.seed} changed its object pile`);
    }
    for (let object = game.level.objects[targetX][targetY];
        object;
        object = object.nexthere) {
        if (object.where !== OBJ_FLOOR
            || object.ox !== targetX || object.oy !== targetY) {
            throw new Error(`seed ${segment.seed} changed pile ownership`);
        }
    }
    const screens = replay.getScreens().join('\n');
    if (/Things that are here:|There are (?:two|a few) objects here\./u
        .test(screens)) {
        throw new Error(`seed ${segment.seed} described its object pile`);
    }
    if (game.context.nopick !== 0 || game.iflags.menu_requested
        || game.context.run !== 0 || game.multi !== 0) {
        throw new Error(`seed ${segment.seed} retained its command prefix`);
    }
    if (game.nhDisplay.inputQueueLength !== 0) {
        throw new Error(`seed ${segment.seed} left unread command input`);
    }
    if (storage.length !== 0) {
        throw new Error(`seed ${segment.seed} changed persisted storage`);
    }
}

export async function runNoPickObjectPileMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'no-pick object pile',
            recipe: loadNoPickObjectPileRecipe(),
        }],
        summaryLabel: 'NO-PICK OBJECT PILE',
        verifySegment: verifyNoPickObjectPileSegment,
    });
}

runMatrixCli(import.meta.url, runNoPickObjectPileMatrix, 'no-pick object pile');
