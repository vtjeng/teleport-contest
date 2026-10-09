#!/usr/bin/env node

// Record and replay whole Medusa-4 through direct and natural loading,
// with a neighboring Medusa-3 check. The historical six-seed recipe exports
// below are retained as existing runner inputs; they do not establish which
// variant each seed selects. Runtime assertions verify the new owned cases.
// C refs: dat/medusa-4.lua and mkmaze.c fixup_special().

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { MOAT } from '../js/const.js';
import { PM_MEDUSA, PM_YELLOW_DRAGON } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20000110090000';

function nethackrc() {
    return [
        'OPTIONS=name:Cardinal,role:Priest,race:human,gender:female,align:chaotic',
        'OPTIONS=playmode:debug,suppress_alert:3.4.3,symset:DECgraphics',
        'OPTIONS=!autopickup',
        '',
    ].join('\n');
}

// Two spaces dismiss the startup prompts, 'n' declines the tutorial, then
// #levelchange\n20\n teleports to dungeon level 20 (the medusa level).
const LEVELCHANGE_MOVES = '  n#levelchange\n20\n';

function medusaSegment(seed) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        moves: LEVELCHANGE_MOVES,
    };
}

// Seeds chosen from the range 100-600 (step 10). All 51 tested seeds pass;
// these six span the range and cover different rnd(4) variant draws.
const SEEDS = [100, 200, 300, 367, 400, 500];

export function loadMedusaLevelLoadRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: SEEDS.map(medusaSegment),
    }, 'medusa level load recipe');
}

export async function runMedusaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'medusa level load (6 seeds)',
            recipe: loadMedusaLevelLoadRecipe(),
        }],
        summaryLabel: 'MEDUSA LEVEL LOAD',
        chunkLimit: 1,
    });
}

// Medusa-4 evidence: independent seeds19710031/19710108, dates and
// Valkyrie/Wizard roles. Natural-arrival seed comes from the fixed range
//19710100–19710131: first source loader4 after nine probes, before C replay.
// Seed19710037 naturally selects the neighboring Medusa-3 program.
function medusa4Entries() {
    return ['medusa4-valkyrie-independent', 'medusa4-wizard-arrival-independent',
        'medusa3-natural-outside-program'].map(label => {
        const url = new URL(`../recipes/medusa-4.lua/${label}.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname) };
    });
}

async function verifyMedusaProgram(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    let medusa, dragon;
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.data.pmidx === PM_MEDUSA) medusa = monster;
        if (monster.data.pmidx === PM_YELLOW_DRAGON) dragon = monster;
    }
    assert.ok(medusa); // Both Lua programs explicitly create their sleeping nemesis.
    assert.equal(medusa.msleeping, true);
    if (segment.seed === 19710037) return; // Outside-program Medusa-3 witness only.
    assert.ok(dragon); // medusa-4.lua126: yellow dragon precedes two gated babies.
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.is_maze_lev, true); // Lua7 flags survive postprocessing.
    // Lua33 is a 76-cell moat row; both edge rows stay moat after either flip.
    for (let x = 3; x < 79; ++x) assert.equal(game.level.at(x, 20).typ, MOAT);
    // Lua66 uses medloc for the down stair and Lua123 for Medusa.
    let matchingStair = false;
    for (let stair = game.stairs; stair; stair = stair.next) {
        if (!stair.up && stair.sx === medusa.mx && stair.sy === medusa.my)
            matchingStair = true;
    }
    assert.ok(matchingStair);
}

export function runMedusa4LevelMatrix() {
    return runFreshMatrix({ entries: medusa4Entries(), chunkLimit: 1,
        summaryLabel: 'MEDUSA FOUR AND ADJACENT PROGRAM', verifySegment: verifyMedusaProgram });
}

runMatrixCli(import.meta.url, runMedusa4LevelMatrix, 'Medusa-4 generation');
