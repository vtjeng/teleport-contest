#!/usr/bin/env node

// lock.c:pick_lock production entries, chosen from source before comparison.
// Independent seeds 7134101..7134103 select manual monster rejection, floor
// container autounlock and a door made locked by a wand. C inventory/cursor
// observations corrected setup letters and directions. Cursed containers
// and the untrap option are cheap variations of those same source entries.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { acurr } from '../js/attrib.js';
import { A_DEX, D_LOCKED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { LARGE_BOX } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['manual-visible', 'container-auto', 'container-cursed', 'container-untrap', 'door-auto', 'door-untrap'];

export function loadPickLockRecipe(name) {
    assert.ok(CASES.includes(name));
    return validateCleanRecipe(JSON.parse(fs.readFileSync(new URL(
        `../recipes/lock.c/pick-lock-${name}-b134.session.json`, import.meta.url,
    ))), `pick_lock ${name}`);
}

export async function runPickLockMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: name, recipe: loadPickLockRecipe(name) })),
        summaryLabel: 'PICK LOCK',
        chunkLimit: 1,
        verifySegment: async segment => {
            const name = CASES.find(candidate => loadPickLockRecipe(candidate).segments[0].moves === segment.moves
                && loadPickLockRecipe(candidate).segments[0].nethackrc === segment.nethackrc);
            await runSegment(segment);
            if (name === 'container-untrap') {
                const box = game.level.objects[game.u.ux][game.u.uy];
                assert.equal(box.otyp, LARGE_BOX);
                assert.equal(box.olocked, 1, 'untrap does not unlock the container');
                // trap.c untrap_box's no-trap arm prints without setting tknown.
                assert.equal(Boolean(box.tknown), false, 'no-trap check leaves trap knowledge unchanged');
                assert.equal(game.xlock?.box ?? null, null, 'NULL tool does not install a picking occupation');
            } else if (name.startsWith('container')) {
                const box = game.level.objects[game.u.ux][game.u.uy];
                assert.equal(box.otyp, LARGE_BOX);
                assert.equal(box.olocked, 0, 'production occupation unlocks the same box');
                assert.equal(box.lknown, 1);
                assert.equal(game.xlock.box, box);
                // lock.c:516,526: Rogue bonus 25, cursed-box integer halving.
                assert.equal(game.xlock.chance, Math.trunc((4 * acurr(game, A_DEX) + 25) / (box.cursed ? 2 : 1)));
                assert.equal(game.xlock.usedtime, 0);
            } else if (name === 'door-auto') {
                assert.ok(game.xlock.door);
                assert.equal(game.xlock.door.doormask & D_LOCKED, 0);
                assert.equal(game.xlock.box, null);
                assert.equal(game.xlock.usedtime, 0);
            } else if (name === 'door-untrap') {
                // Same C-observed door coordinates, one square south of hero.
                assert.ok(game.level.at(game.u.ux, game.u.uy + 1).doormask & D_LOCKED);
                assert.equal(game.xlock?.door ?? null, null, 'untrap does not install a picking occupation');
            } else {
                assert.equal(game.xlock?.door ?? null, null, 'visible monster rejection precedes door selection');
            }
        },
    });
}

runMatrixCli(import.meta.url, runPickLockMatrix, 'pick_lock');
