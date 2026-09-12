#!/usr/bin/env node

// Record and replay read.c's ordinary uncursed positive enchant-weapon path.
// The trailing wait crosses the command boundary after the glow message, so
// the differential covers both scroll consumption and the following turn.

import assert from 'node:assert/strict';

import { A_WIS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SCR_ENCHANT_WEAPON } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const ENCHANT_READ_WAIT = '.';
export const ENCHANT_READ_KEY = 'r';
export const ENCHANT_READ_MORE = ' ';
export const ENCHANT_READ_SLOT = 'n';
const WIZWISH = '\x17';

function wish(objectName) {
    return `${WIZWISH}${objectName}\n`;
}

export function loadReadEnchantWeaponRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent Wizard case leaves the starting +1 weapon in
            // slot a and places one wished scroll in the next slot, n.
            seed: 9048199,
            datetime: '20380506070809',
            nethackrc: [
                'OPTIONS=name:EnchantRead,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=playmode:debug,pettype:none,!autopickup,!debug_mongen',
                '',
            ].join('\n'),
            // Space dismisses doread()'s disappearance and chwepon's glow
            // line. The final wait proves the read consumed one turn.
            moves: `${ENCHANT_READ_WAIT}${wish('uncursed scroll of enchant weapon')}`
                + `${ENCHANT_READ_KEY}${ENCHANT_READ_SLOT}`
                + `${ENCHANT_READ_MORE}${ENCHANT_READ_WAIT}`,
        }],
    }, 'read enchant-weapon recipe');
}

export async function verifyReadEnchantWeaponSegment(segment) {
    const replay = await runSegment(segment);
    if (replay.getScreens().length !== segment.moves.length + 1)
        throw new Error('enchant-weapon read stopped before its last key');

    let scroll;
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === SCR_ENCHANT_WEAPON) scroll = obj;
    }
    if (scroll)
        throw new Error('enchant-weapon scroll remained in inventory');
    if (!game.uwep || game.uwep.spe !== 2)
        throw new Error('enchant-weapon read did not raise the wielded weapon');
    if (game.objects[SCR_ENCHANT_WEAPON].oc_name_known !== 1)
        throw new Error('enchant-weapon scroll was not identified');
    assert.equal(game.u.uconduct.literate, 1);
    assert.equal(game.u.aexe[A_WIS], 0);
    // Startup begins with one move already elapsed; the opening wait, read,
    // and trailing wait account for the three subsequent moves.
    assert.equal(game.moves, 4);
    assert.equal(game.nhDisplay.toplines,
        'Your quarterstaff glows blue for a moment.');
    const selectionIndex = segment.moves.indexOf(
        `${ENCHANT_READ_KEY}${ENCHANT_READ_SLOT}`,
    ) + 1; // the slot key is the second input after `r`
    assert.deepEqual(replay.getRngSlices()[selectionIndex + 1],
        ['rn2(19)=0']);
}

export async function runReadEnchantWeaponMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'ordinary enchant-weapon scroll',
            recipe: loadReadEnchantWeaponRecipe(),
        }],
        summaryLabel: 'READ ENCHANT WEAPON',
        verifySegment: verifyReadEnchantWeaponSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runReadEnchantWeaponMatrix, 'read enchant weapon');
