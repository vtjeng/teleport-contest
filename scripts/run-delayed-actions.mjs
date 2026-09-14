#!/usr/bin/env node

// Independent recipes for allmain.c moveloop_core's negative-multi branch.
// Seed 8420013 was selected before inspection, without a seed scan. The same
// Healer acquires heavy armor and then varies the delayed action. Debug wishes
// provide the setup; the tested countdown does not inspect the wizard flag.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FUMBLING, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { near_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { CHAIN_MAIL, FUMBLE_BOOTS } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadDelayedActionRecipes() {
    return ['burdened-dressing', 'burdened-fumbling-boots',
        'burdened-paralysis'].map((label) => ({
        label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/allmain.c/${label}.session.json`, import.meta.url,
        ), 'utf8')),
    }));
}

export async function verifyDelayedActionSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.ok(near_capacity(game) > 0, 'the delayed hero remains burdened');
    assert.equal(game.multi, 0, 'the delay completed');
    assert.equal(game.afternmv ?? null, null, 'no callback remains');
    assert.equal(game.nomovemsg, null, 'unmul completed its message');
    if (segment.moves.includes('fumble boots')) {
        assert.equal(game.uarmf?.otyp, FUMBLE_BOOTS);
        assert.equal(game.uarmf.known, true, 'Boots_on revealed enchantment');
        assert.ok((game.u.uprops[FUMBLING]?.intrinsic & TIMEOUT) > 0,
            'Boots_on installed its rnd(20) timeout');
    } else if (segment.moves.includes('paralysis')) {
        assert.equal(game.uarm ?? null, null, 'this delay has no armor callback');
        assert.match(game._ttyToplines, /You can move again\./u);
    } else {
        assert.equal(game.uarm?.otyp, CHAIN_MAIL);
        assert.equal(game.uarm.known, true, 'Armor_on revealed enchantment');
    }
}

export function runDelayedActionsMatrix() {
    return runFreshMatrix({
        entries: loadDelayedActionRecipes(),
        summaryLabel: 'DELAYED ACTIONS',
        verifySegment: verifyDelayedActionSegment,
        // Each debug game must start with a fresh recorder save directory.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runDelayedActionsMatrix, 'delayed actions');
