#!/usr/bin/env node

// Run the checked-in matrix for mhitm.c mattackm():393-410's adjacent
// empty-handed AT_WEAP arm through a fresh C recording. The little dog attacks
// a goblin, the goblin selects its ordinary orcish dagger with
// mon_wield_item(), and that nonzero result spends the attack turn before any
// weapon swing or damage.
//
// Wizard genesis supplies the hostile directly, so the recipe does not depend
// on random monster generation or a long walk. A bounded search recorded
// seeds 9000001-9000200 at 20260827120000 with the same genesis command and
// twelve waits. Eight seeds reached the source gate in dog_move() after a
// visible wield. Seed 9000117 selected a cursed dagger and was rejected as the
// still-unported welded branch. Seed 9000001 wielded an ordinary dagger but
// crossed an unrelated sticky-damage boundary later in the same turn. Seed
// 9000123 is the shortest ordinary case whose entire input boundary replays;
// cutting it to four waits leaves the wield on its final key.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GOBLIN } from '../js/monsters.js';
import { ORCISH_DAGGER } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const GENESIS_KEY = '\u0007';

function nethackrc() {
    return [
        'OPTIONS=name:WieldScan,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug',
        'OPTIONS=rest_on_space,!safe_wait',
        '',
    ].join('\n');
}

export function loadMonsterWieldRetaliationRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 9000123,
            datetime: '20260827120000',
            nethackrc: nethackrc(),
            moves: ` ${GENESIS_KEY}goblin\n    `,
        }],
    }, 'monster wield retaliation recipe');
}

function findGoblin() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.mnum === PM_GOBLIN) return monster;
    }
    return null;
}

// The differential pins the text, RNG stream, screen and cursor. This port-side
// check makes the state transition explicit too: the hostile ends the turn
// holding the ordinary, non-welded weapon selected from its inventory.
export async function verifyMonsterWieldRetaliationSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (replay.getScreens().length !== segment.moves.length + 1) {
        throw new Error('monster wield retaliation stopped before its last key');
    }
    const goblin = findGoblin();
    if (!goblin) throw new Error('monster wield retaliation lost its goblin');
    if (goblin.mw?.otyp !== ORCISH_DAGGER || goblin.mw.cursed) {
        throw new Error('goblin did not wield its ordinary orcish dagger');
    }
}

export async function runMonsterWieldRetaliationMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster wield retaliation',
            recipe: loadMonsterWieldRetaliationRecipe(),
        }],
        summaryLabel: 'MONSTER WIELD RETALIATION',
        verifySegment: verifyMonsterWieldRetaliationSegment,
    });
}

runMatrixCli(import.meta.url, runMonsterWieldRetaliationMatrix, 'monster wield retaliation');
