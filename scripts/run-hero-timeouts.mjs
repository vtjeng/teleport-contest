#!/usr/bin/env node

// Independent nh_timeout recipes. The one-turn property reaches expiry on
// the next elapsed action. The two-plate variation also exercises the live
// timeout handoff followed by further burdened movement allocations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFUSION, DISPLACED, GLIB, HALLUC, NORMAL_SPEED, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { near_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadHeroTimeoutRecipes() {
    return ['confusion-expiry', 'burdened-confusion-expiry',
        'hallucination-expiry', 'burdened-hallucination-expiry',
        'glib-expiry', 'displacement-expiry'].map((label) => ({
        label,
        recipe: JSON.parse(readFileSync(new URL(
            `../recipes/timeout.c/${label}.session.json`, import.meta.url,
        ), 'utf8')),
    }));
}

export async function verifyHeroTimeoutSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(near_capacity(game) > 0, segment.moves.includes('plate mail'),
        'the independent armor setup reaches the intended capacity branch');
    let property;
    if (segment.moves.includes('1g')) {
        property = CONFUSION;
        assert.match(game._ttyToplines, /You feel less confused now\./u);
    } else if (segment.moves.includes('1h')) {
        property = HALLUC;
        assert.match(game._ttyToplines, /Everything feels SO boring now\./u);
    } else if (segment.moves.includes('1l')) {
        property = GLIB;
        assert.match(game._ttyToplines, /Timeout for slippery fingers set to 1\./u);
        assert.equal(game.uwep, null, 'glibr has no weapon to drop');
        assert.ok(game.uarmg, 'make_glib refreshes the starting gloves');
    } else {
        property = DISPLACED;
        assert.match(game._ttyToplines,
            /monsters no longer have difficulty pinpointing your location\./u);
    }
    assert.equal(game.u.uprops[property].intrinsic & TIMEOUT, 0,
        'the selected property expired through elapsed-turn upkeep');
    assert.ok(game.u.umovement >= NORMAL_SPEED, 'the hero regained a movement ration');
}

export function runHeroTimeoutsMatrix() {
    return runFreshMatrix({
        entries: loadHeroTimeoutRecipes(),
        summaryLabel: 'HERO TIMEOUTS',
        verifySegment: verifyHeroTimeoutSegment,
        // Separate recorder directories prevent debug saves crossing cases.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runHeroTimeoutsMatrix, 'hero timeouts');
