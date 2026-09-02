#!/usr/bin/env node

// Run the checked-in matrix for mthrowu.c thrwmu():1183-1189 when a monster
// already has a different ordinary weapon. The Uruk-hai first wields its
// short sword, then selects its bow and arrows at range; mon_wield_item()
// replaces the current weapon and spends the turn before missile flight.
//
// A bounded fresh search over seeds 9100001-9100030 at 20260827120000 used
// the same genesis command and short movement set. Seed 9100007 is the first
// case whose inventory includes the short sword, bow, and arrows and whose
// final key reaches the current-weapon replacement.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { W_WEP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_URUK_HAI } from '../js/monsters.js';
import {
    ORCISH_BOW,
    ORCISH_SHORT_SWORD,
} from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const GENESIS_KEY = '\u0007';

function nethackrc() {
    return [
        'OPTIONS=name:RangedSwitch,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug',
        'OPTIONS=pettype:none,rest_on_space,!safe_wait',
        '',
    ].join('\n');
}

export function loadMonsterRangedWieldSwitchRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 9100007,
            datetime: '20260827120000',
            nethackrc: nethackrc(),
            moves: ` ${GENESIS_KEY}Uruk-hai\n   kkk`,
        }],
    }, 'monster ranged wield switch recipe');
}

function findUrukHai() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.mnum === PM_URUK_HAI) return monster;
    }
    return null;
}

// The differential pins PRNG calls, complete terminal screens, attributes,
// and cursor positions. This verifier additionally pins the source state
// transition: the old sword is no longer wielded and the bow is held, with no
// missile action started on the final input.
export async function verifyMonsterRangedWieldSwitchSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (replay.getScreens().length !== segment.moves.length + 1) {
        throw new Error('monster ranged wield switch stopped before its last key');
    }

    const monster = findUrukHai();
    if (!monster) throw new Error('monster ranged wield switch lost its Uruk-hai');
    if (monster.mw?.otyp !== ORCISH_BOW
        || monster.mw.owornmask !== W_WEP) {
        throw new Error('Uruk-hai did not wield its orcish bow');
    }
    let sword = null;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp === ORCISH_SHORT_SWORD) sword = obj;
    }
    if (!sword || sword.owornmask & W_WEP) {
        throw new Error('Uruk-hai kept wielding its orcish short sword');
    }
    if (game._pending_message !== 'The Uruk-hai wields an orcish bow!') {
        throw new Error('monster ranged wield switch message did not match C');
    }
}

export async function runMonsterRangedWieldSwitchMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster ranged wield switch',
            recipe: loadMonsterRangedWieldSwitchRecipe(),
        }],
        summaryLabel: 'MONSTER RANGED WIELD SWITCH',
        verifySegment: verifyMonsterRangedWieldSwitchSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterRangedWieldSwitchMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster ranged wield switch: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
