#!/usr/bin/env node

// C-first wizcmds.c wiz_kill() evidence. Recipes were chosen independently;
// the mounted-death recipe retains steed.c dismount_steed's explicit limit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newuexp } from '../js/exper.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['hero', 'monster', 'bound', 'suicide', 'mount', 'swallowed', 'multiple', 'gas'];
const REACHED = {
    hero: 'You kill the quantum mechanic!',
    monster: 'The straw golem is destroyed.',
    bound: 'Perform seppuku? [yes|n] (n)',
    suicide: "OK, so you don't die.",
    mount: 'Kill the saddled pony? [ynq] (q)',
    swallowed: 'You destroy the fog cloud!',
    multiple: 'You kill the lizard!',
    gas: "The newt is caught in the gas spore's explosion!",
};

function loadRecipe(name) {
    const path = new URL(`../recipes/wizcmds.c/wizard-kill-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

async function verifySegment(segment) {
    const name = CASES.find(name => segment.nethackrc.includes(`name:Kill${name},`));
    assert.ok(name, 'every recipe identifies its source route');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/wizcmds.c/wizard-kill-${name}.session.json`, import.meta.url), 'utf8'));
    const comparison = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const screens = replay.getScreens();
    assert.ok(screens.some(screen => screen.includes(REACHED[name])));
    assert.ok(recording.segments[0].steps.some(step => step.screen.includes(REACHED[name])));
    assert.equal(game.iflags.purge_monsters, 0, 'wiz_kill forces dmonsfree before returning');
    assert.equal(game.multi, 0, 'ECMD_OK clears even the configured 3V count');
    assert.equal(Boolean(game.context.move), false, 'the completed command spends no turn');
    assert.equal(Boolean(game.context.mon_moving), false, 'the m-prefix flag is restored');
    assert.equal(game.flags.verbose, false, 'the recipe disables verbose before targeting');
    assert.equal(game.iflags.autodescribe, true, 'optlist.h defaults autodescribe On');
    if (name === 'hero') {
        assert.equal(game.u.uconduct.killer, 1); // One hero-credited kill.
        assert.ok(game.u.uexp > 0, 'xkilled awards experience');
        assert.ok(replay.getRngLog().some(entry => entry.startsWith('rnz(')),
            'corpse timers retain the canonical outer rnz log entry');
    } else if (name === 'multiple') {
        assert.equal(game.u.uconduct.killer, 2); // Fox and lizard in one targeting loop.
        assert.ok(screens.filter(screen => screen.includes('Next monster:')).length >= 2);
    } else if (name === 'monster' || name === 'gas') {
        assert.equal(game.u.uconduct.killer, 0, 'monkilled and collateral death credit no hero kill');
        assert.equal(game.u.uexp, name === 'gas' ? newuexp(game.u.ulevel - 1) : 0,
            'the blast adds no experience beyond levelchange setup');
    } else if (name === 'mount') {
        assert.ok(game.u.usteed, 'q/n leave the mounted pony alive');
        assert.equal(game.u.uconduct.killer, 0);
        assert.ok(screens.some(screen => screen.includes('Commit suicide?')));
    } else if (name === 'swallowed') {
        assert.equal(Boolean(game.u.uswallow), false);
        assert.equal(game.u.ustuck, null, 'killing the engulfer releases the hero');
        assert.ok(screens.some(screen => screen.includes('The fog cloud engulfs you!')));
    } else if (name === 'bound') {
        assert.ok(screens.some(screen => screen.includes('There is no monster there.')));
        assert.equal(game.u.uconduct.killer, 0);
    } else if (name === 'suicide') {
        assert.equal(game.u.umortality, 1, 'done(DIED) records the wizard recovery');
        assert.equal(game.u.uhp, game.u.uhpmax);
    }
    // Every setup command is no-time except mount_steed's one turn and the
    // seven forced rests that establish the swallowed state.
    assert.equal(game.moves, name === 'mount' ? 2 : name === 'swallowed' ? 8 : 1);
}

export function runWizardKillMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: `wizard kill ${name}`, recipe: loadRecipe(name) })),
        summaryLabel: 'WIZARD KILL', chunkLimit: 1, verifySegment,
    });
}

runMatrixCli(import.meta.url, runWizardKillMatrix, 'wizard kill');
