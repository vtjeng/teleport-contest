#!/usr/bin/env node
// Inputs chosen independently before C comparison. One-turn debug intrinsics
// exercise every fatal nh_timeout arm; the Tourist is a cheap slime variation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { G_GENOD, I_SPECIAL, LS_MONSTER, SICK, SLIMED, STONED, STRANGLED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GREEN_SLIME } from '../js/monsters.js';
import { runDifferential, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['fatal-sick-wizard', 'fatal-stoned-wizard',
    'fatal-strangled-wizard', 'fatal-slimed-wizard', 'fatal-slimed-tourist',
    'fatal-sick-recovery', 'fatal-slime-amulet', 'fatal-slimed-genocided',
    'fatal-slimed-genocided-amulet', 'fatal-slimed-luminous'];
export function loadFatalTimeoutRecipes() {
    return names.map(name => ({ label: name, recipe: validateCleanRecipe(
        JSON.parse(readFileSync(new URL(`../recipes/timeout.c/${name}.session.json`, import.meta.url))), name,
    ) }));
}
export async function verifyFatalTimeoutSegment(segment) {
    const luminous = segment.moves.includes('yellow light');
    const genocided = segment.moves.includes('scroll of genocide');
    const amulet = segment.moves.includes('amulet of life saving');
    if (luminous || genocided) {
        await runSegment({ ...segment, moves: segment.moves.slice(0, segment.moves.indexOf('#wizintrinsic')) });
        if (genocided) assert.ok(game.svm.mvitals[PM_GREEN_SLIME].mvflags & G_GENOD,
            'setup genocides the exact green-slime species before infection');
        if (luminous) {
            let light = game.gl.light_base;
            while (light && (light.type !== LS_MONSTER || light.id !== game.youmonst)) light = light.next;
            assert.ok(light, 'setup owns a real hero light source before slime expiry');
        }
    }
    let boundary;
    const result = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(Boolean(game.program_state.gameover), false);
    const screens = result.getScreens();
    if (segment.seed === 1542101) {
        assert.equal(game.u.umortality, 0, 'source food-poisoning recovery avoids fatal dispatch');
        assert.ok(screens.some(screen => screen.includes('You have recovered from your illness.')));
    } else {
        assert.ok(game.u.umortality >= 1, 'production fatal expiry reaches done and life-saving return');
        assert.ok(screens.some(screen => screen.includes(amulet
            ? 'The medallion crumbles to dust!' : "OK, so you don't die.")));
    }
    const property = segment.moves.includes('1c') ? SLIMED
        : segment.moves.includes('1b') ? STONED
            : segment.moves.includes('1d') ? STRANGLED : SICK;
    assert.equal(game.u.uprops[property].intrinsic & I_SPECIAL, 0, 'life-saved timeout clears special disclosure bit');
    if (property === SLIMED) {
        assert.equal(game.u.umonnum, PM_GREEN_SLIME);
        assert.equal(game.youmonst.data, game.mons[PM_GREEN_SLIME]);
        assert.equal(game.youmonst.m_ap_type, 0, 'polymon clears the dialogue mimic');
        if (genocided) {
            assert.equal(game.u.umortality, 2, 'genocided slime triggers a second death after reprieve');
            assert.ok(game.svm.mvitals[PM_GREEN_SLIME].mvflags & G_GENOD,
                'temporary ungenocide is restored before fatal disclosure');
            assert.ok(screens.some(screen => screen.includes(amulet
                ? 'Unfortunately, green slime has been genocided...'
                : 'Yes, you do.  Green slime has been genocided...')));
        }
        if (luminous) {
            for (let light = game.gl.light_base; light; light = light.next)
                assert.ok(light.type !== LS_MONSTER || light.id !== game.youmonst,
                    'source deletes the old form light before polymon');
        }
        if (amulet) assert.equal(game.uamul, null, 'life saving consumes the worn amulet');
    }
}
export async function runFatalTimeoutMatrix() {
    let index = 0;
    return runFreshMatrix({ entries: loadFatalTimeoutRecipes(), summaryLabel: 'FATAL TIMEOUT',
        chunkLimit: 1, verifySegment: verifyFatalTimeoutSegment,
        runDifferentialFn: recipe => {
            const name = names[index++];
            return runDifferential(recipe, process.env, { transformRecording: recording => {
                writeFileSync(new URL(`../recordings/timeout.c/${name}.session.json`, import.meta.url), JSON.stringify(recording) + '\n');
                return recording;
            } });
        } });
}
runMatrixCli(import.meta.url, runFatalTimeoutMatrix, 'fatal timeout');
