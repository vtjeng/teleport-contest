#!/usr/bin/env node

// Independent C-first #sit routes into sit.c:special_throne_effect. Wizard
// class-genocide '*' clears current monsters, allowing the command's own
// effects to be compared without the separately blocked elemental attack.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { GLIB, ROOM } from '../js/const.js';
import { COIN_CLASS } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = [
    ['grease', 'ThronePrimary'],
    ['coins', 'ThroneCoins'],
    ['wish', 'ThroneWish'],
];

function recipe(kind) {
    const path = new URL(`../recipes/sit.c/special-throne-${kind}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

async function verifySegment(segment) {
    const [kind] = CASES.find(([, name]) => segment.nethackrc.includes(`name:${name},`));
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const c = JSON.parse(readFileSync(new URL(
        `../recordings/sit.c/special-throne-${kind}.session.json`, import.meta.url), 'utf8'));
    const comparison = compareSessionOutputs(c, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const screens = replay.getScreens();
    const cScreens = c.segments[0].steps.map(step => step.screen);
    const reached = kind === 'wish'
        ? 'The throne disintegrates, having spent its power.'
        : 'A greasy liquid sprays all over you!';
    assert.ok(cScreens.some(screen => screen.includes(reached)));
    assert.ok(screens.some(screen => screen.includes(reached)));
    assert.ok(!game.unported.has('sit.c special_throne_effect'));
    assert.equal(game.uwep, null, 'source-valid bare-hands setup avoids the blocked throne drop');
    if (kind === 'wish') {
        assert.equal(game.level.at(game.u.ux, game.u.uy).typ, ROOM);
        assert.ok(screens.some(screen => screen.includes('Having fun sitting on the floor?')));
    } else {
        assert.ok(game.u.uprops[GLIB].intrinsic > 0);
        for (let object = game.invent; object; object = object.nobj)
            assert.equal(Boolean(object.greased), object.oclass !== COIN_CLASS);
        assert.ok(screens.some(screen => screen.includes('(being worn); slippery)')));
        if (kind === 'coins') {
            const coin = game.invent;
            assert.equal(coin.oclass, COIN_CLASS);
            assert.equal(coin.quan, 91); // Independently wished stack; grease excludes COIN_CLASS.
        }
    }
}

export function runSpecialThroneMatrix() {
    return runFreshMatrix({
        entries: CASES.map(([kind]) => ({ label: `special throne ${kind}`, recipe: recipe(kind) })),
        summaryLabel: 'SPECIAL THRONE', chunkLimit: 1, verifySegment,
    });
}

runMatrixCli(import.meta.url, runSpecialThroneMatrix, 'special throne');
