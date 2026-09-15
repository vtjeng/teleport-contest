#!/usr/bin/env node

// Run the checked-in matrix for weapon.c select_rwep()'s hand-thrown
// negative-skill branch through a fresh C recording. A port-only scan of
// seeds 9300001-9300500 at 20260914130000 with the wizard genesis Kobold
// setup and three eastward steps replayed 82 seeds and first kept 9300002,
// whose created Kobold received darts. Ten eastward steps are the shortest
// route tested here that lets that Kobold reach the actual throw.

import { DART } from '../js/objects.js';
import { PM_KOBOLD } from '../js/monsters.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const GENESIS_KEY = '\x07';

function nethackrc() {
    return [
        'OPTIONS=name:NinjaThrow,role:Valkyrie,race:human,gender:female,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug',
        'OPTIONS=pettype:none,rest_on_space,!safe_wait',
        '',
    ].join('\n');
}

export function loadWeaponDartThrowRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Seed 9300002 was selected by the bounded port-only scan in this
            // file's header; the recipe remains input-only and independent of
            // the fixed seed0106 holdout recording.
            seed: 9300002,
            datetime: '20260914130000',
            nethackrc: nethackrc(),
            moves: ` #wizgenesis\nkobold\nllllllllll`,
        }],
    }, 'weapon dart throw recipe');
}

function dartBearingKobold() {
    for (let monster = game.level.monlist;
        monster;
        monster = monster.nmon) {
        if (monster.mnum !== PM_KOBOLD) continue;
        for (let object = monster.minvent;
            object;
            object = object.nobj) {
            if (object.otyp === DART) return { monster, object };
        }
    }
    return null;
}

// The verifier proves that the selected source path reached a real throw,
// rather than merely selecting a dart in a direct unit fixture. The initial
// quantity is 11 for this seed and the final quantity is 10 after one throw.
export async function verifyWeaponDartThrowSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (replay.getScreens().length !== segment.moves.length + 1) {
        throw new Error('weapon dart throw stopped before its last key');
    }
    const selected = dartBearingKobold();
    if (!selected || selected.object.quan !== 10) {
        throw new Error('Kobold did not throw one of its darts');
    }
    if (game.nhDisplay?.toplines
        !== 'The kobold throws a dart!  You are hit by a dart.') {
        throw new Error('dart throw message did not match C');
    }
}

export async function runWeaponDartThrowMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'weapon dart throw',
            recipe: loadWeaponDartThrowRecipe(),
        }],
        summaryLabel: 'WEAPON DART THROW',
        verifySegment: verifyWeaponDartThrowSegment,
    });
}

runMatrixCli(import.meta.url, runWeaponDartThrowMatrix, 'weapon dart throw');
