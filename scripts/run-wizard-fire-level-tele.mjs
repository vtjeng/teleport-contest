#!/usr/bin/env node

// Record and replay the bounded wizard level-teleport route to the Plane of
// Fire. The recipe contains replay inputs only; runFreshMatrix() records its
// C reference output in an isolated temporary workspace.
//
// This is the source-selected branch at teleport.c:1234-1302: the wizard uses
// the dungeon menu to choose an endgame level, receives the Amulet prerequisite
// when needed, and schedules the forced arrival. The chosen arrival then runs
// do.c:1478-1998's common level-generation path, including dat/fire.lua.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runFreshMatrix } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const FIRE_PLANE_SEED = 5732;
const FIRE_PLANE_DATETIME = '20330615101500';
export { FIRE_PLANE_DATETIME };
export const FIRE_PLANE_MOVES =
    '.#levelchange\n20\n                     \x16?\n>>L';

export const FIRE_PLANE_NETHACKRC = [
    'OPTIONS=name:FireTest2,role:Barbarian,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug,'
        + 'suppress_alert:3.4.3,symset:DECgraphics',
    '',
].join('\n');

export function loadWizardFirePlaneTeleRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: FIRE_PLANE_SEED,
            datetime: FIRE_PLANE_DATETIME,
            nethackrc: FIRE_PLANE_NETHACKRC,
            moves: FIRE_PLANE_MOVES,
        }],
    }, 'wizard Plane of Fire level teleport recipe');
}

export async function runWizardFirePlaneTeleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard Plane of Fire level teleport',
            recipe: loadWizardFirePlaneTeleRecipe(),
        }],
        summaryLabel: 'WIZARD PLANE OF FIRE LEVEL TELEPORT',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runWizardFirePlaneTeleMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `wizard Plane of Fire level teleport: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
