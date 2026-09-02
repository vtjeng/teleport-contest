#!/usr/bin/env node

// Run the checked-in matrix for mthrowu.c thrwmu():1183-1189's empty-handed
// ranged-weapon setup. Wizard genesis creates an Uruk-hai with an orcish bow
// and arrows. Three northward moves give it a movement ration while keeping it
// at range, so select_rwep() returns the arrows as its missile and the bow
// through gp.propellor. mon_wield_item() equips the bow and spends the turn
// before monshoot() can announce or launch an arrow.
//
// The bounded seed scan covered 9100001-9100100 at 20260827120000 with this
// genesis command and inspected only creation state: whether the Uruk-hai
// received m_initweap()'s one-in-three bow-and-arrow loadout and where genesis
// placed it. Seed 9100007 was the first bow carrier. Its northward route is the
// shortest legal route whose final key reaches the wield; one or two northward
// moves end before the monster receives and spends its first movement ration.

import { W_WEP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_URUK_HAI } from '../js/monsters.js';
import { ORCISH_ARROW, ORCISH_BOW } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const GENESIS_KEY = '\u0007';

function nethackrc() {
    return [
        'OPTIONS=name:RangedWield,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug',
        'OPTIONS=pettype:none,rest_on_space,!safe_wait',
        '',
    ].join('\n');
}

export function loadMonsterRangedWieldRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // The first bow carrier in the declared 100-seed scan above.
            seed: 9100007,
            datetime: '20260827120000',
            nethackrc: nethackrc(),
            moves: ` ${GENESIS_KEY}Uruk-hai\nkkk`,
        }],
    }, 'monster ranged wield recipe');
}

function findUrukHai() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.mnum === PM_URUK_HAI) return monster;
    }
    return null;
}

// diff-fresh pins the PRNG stream, complete terminal screens and cursor. This
// port-side check also pins the C weapon-state transition that the recorder
// does not serialize directly and proves that the later throw has not begun.
export async function verifyMonsterRangedWieldSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (replay.getScreens().length !== segment.moves.length + 1)
        throw new Error('monster ranged wield stopped before its last key');

    const monster = findUrukHai();
    if (!monster) throw new Error('monster ranged wield lost its Uruk-hai');
    if (monster.mw?.otyp !== ORCISH_BOW
        || monster.mw.owornmask !== W_WEP) {
        throw new Error('Uruk-hai did not wield its orcish bow');
    }
    const arrows = [];
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp === ORCISH_ARROW) arrows.push(obj);
    }
    if (arrows.length !== 1 || arrows[0].quan !== 8)
        throw new Error('Uruk-hai launched an arrow during the wield turn');
    if (game._pending_message !== 'The Uruk-hai wields an orcish bow!')
        throw new Error('monster ranged wield message did not match C');
}

export async function runMonsterRangedWieldMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster ranged wield',
            recipe: loadMonsterRangedWieldRecipe(),
        }],
        summaryLabel: 'MONSTER RANGED WIELD',
        verifySegment: verifyMonsterRangedWieldSegment,
    });
}

runMatrixCli(import.meta.url, runMonsterRangedWieldMatrix, 'monster ranged wield');
