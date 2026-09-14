#!/usr/bin/env node

// Record and replay mkroom.c mk_zoo_thronemon() (mkroom.c:256-273), the
// throne-room ruler that fill_zoo()'s case COURT arm seats. The function
// rolls i = rnd(level_difficulty()) and picks PM_OGRE_TYRANT above 9,
// PM_ELVEN_MONARCH above 5, PM_DWARF_RULER above 2, and PM_GNOME_RULER
// otherwise; the two low rolls already have coverage in
// scripts/run-level-teleport-arrival.mjs, whose D:5 Court seeds cannot roll
// above 5. These cases cover the two high rolls, whose rulers also reach
// arms of makemon.c m_initweap() no other case exercises: the monarch takes
// the is_elf arm (makemon.c:226-262, including the PM_ELVEN_MONARCH pick-axe
// and crystal ball at 257-262) and the tyrant the case S_OGRE arm
// (makemon.c:446-451), whose rn2(3) battle-axe odds are the tyrant's alone.
//
// Recipes contain replay inputs only; runFreshMatrix() records a new C
// reference in an isolated temporary workspace.

import { COLNO, ROWNO, THRONE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { PM_ELVEN_MONARCH, PM_OGRE_TYRANT } from '../js/monsters.js';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310715091422';

const NETHACKRC = [
    'OPTIONS=name:ThroneFresh,role:Wizard,race:human,gender:male,align:neutral,'
        + 'playmode:debug,suppress_alert:3.4.3,symset:DECgraphics',
    'OPTIONS=!autopickup',
    '',
].join('\n');

// Wizard #levelchange raises the hero from experience level 1 to 20 without
// spending a turn; the nineteen spaces dismiss its welcome and intrinsic
// chain. Ctrl-V then teleports to the destination, whose arrival runs
// mklev() and so fill_zoo() for the generated Court.
const LEVELCHANGE_DISMISSALS_TO_20 = 19;

function thronePort(seed, destination) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        moves: '   n#levelchange\n20\n'
            + ' '.repeat(LEVELCHANGE_DISMISSALS_TO_20)
            + `\x16${destination}\n`,
    };
}

// mkroom.c's C selector reads level_difficulty(), which dungeon.c:2036
// returns as depth(&u.uz) for an ordinary main-dungeon level. Both witnesses
// use D:10: it reaches the monarch's 6..9 band and the tyrant's one roll at
// 10, while remaining above the Knox portal's strict `depth > 10` gate. The
// earlier D:12 monarch witness could enter a vault and then reach the still
// unsupported mk_knox_portal() placement path after the wizard deferral fix,
// before fill_zoo() seats its ruler.
export const EXPECTED_RULERS = new Map([
    [14, PM_ELVEN_MONARCH],
    [55, PM_ELVEN_MONARCH],
    [400, PM_OGRE_TYRANT],
]);

export function loadThronemonFillRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // D:10's roll for seed 14 takes the monarch arm and its
            // pick-axe, shield, spear, and dagger setup in makemon.c.
            thronePort(14, 10),
            // This independent D:10 layout takes the other monarch weapon
            // branch, including its elven arrow stack.
            thronePort(55, 10),
            // D:10's roll for seed 400 takes the tyrant arm and its
            // battle-axe branch. Keeping both levels at depth 10 avoids Knox
            // placement.
            thronePort(400, 10),
        ],
    }, 'throne-room ruler recipe');
}

// The differential already pins every random-number call and screen, so this
// verifier only names which arm each seed is meant to exercise: a seed whose
// layout drifted would otherwise still pass while covering nothing new.
export async function verifyThronemonFill(segment) {
    await runSegment(segment);
    let seated = null;
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if (game.level.at(x, y)?.typ !== THRONE) continue;
            const monster = m_at(x, y, game);
            if (monster) seated = monster;
        }
    }
    const expected = EXPECTED_RULERS.get(segment.seed);
    if (!seated || seated.data.pmidx !== expected) {
        throw new Error(
            `seed ${segment.seed} seated ${seated?.data?.pmidx ?? 'nobody'} `
            + `on its throne, not ${expected}`,
        );
    }
    if (!seated.msleeping || seated.mpeaceful) {
        throw new Error(
            `seed ${segment.seed} ruler is not the sleeping hostile `
            + 'mk_zoo_thronemon() creates',
        );
    }
}

export async function runThronemonFillMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'throne-room ruler',
            recipe: loadThronemonFillRecipe(),
        }],
        summaryLabel: 'THRONE ROOM RULERS',
        verifySegment: verifyThronemonFill,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runThronemonFillMatrix, 'throne-room rulers');
