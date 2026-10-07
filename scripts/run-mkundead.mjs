#!/usr/bin/env node

// mkroom.c:mkundead production evidence through apply.c:use_bell and
// read.c:doread -> spell.c:study_book/learn/deadbook. Seeds 123061001-003
// were independently chosen. Floor success uses the first positive of the
// fixed JS-only range 123061100-123061163 (14/64, no refusals); floor failure
// uses the first positive of 123061200-123061263 (21/64, no refusals).
// The first range's setup was corrected for the Book's observed g label and
// debug_mongen's source-wide no-creation guard; neither range was widened.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { is_undead } from '../js/mondata.js';
import { PM_NEWT, PM_PIRANHA } from '../js/monsters.js';
import { BELL_OF_OPENING, CORPSE } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const MKUNDEAD_CASES = [
    { name: 'mkundead-cursed-bell', kind: 'bell' },
    { name: 'mkundead-cursed-book', kind: 'book' },
    { name: 'mkundead-cursed-bell-no-generation', kind: 'bell', noGeneration: true },
    { name: 'mkundead-cursed-book-no-generation', kind: 'book', noGeneration: true },
    { name: 'mkundead-book-floor-revive', kind: 'floor-success' },
    { name: 'mkundead-book-floor-failed-revive', kind: 'floor-failure' },
    { name: 'mkundead-book-carried-revive', kind: 'carried' },
];

export function loadMkundeadRecipes() {
    return MKUNDEAD_CASES.map(entry => ({ ...entry,
        recipe: validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/mkroom.c/${entry.name}.recipe.session.json`, import.meta.url,
        ), 'utf8')), entry.name),
    }));
}

function allMonsters() {
    const result = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

function floorCorpse(species) {
    for (let x = 1; x < game.level.objects.length; x++)
        for (let y = 0; y < game.level.objects[x].length; y++)
            for (let obj = game.level.objects[x][y]; obj; obj = obj.nexthere)
                if (obj.otyp === CORPSE && obj.corpsenm === species)
                    return { obj, x, y };
    return null;
}

export async function verifyMkundeadSegment(segment) {
    const entry = loadMkundeadRecipes().find(candidate =>
        candidate.recipe.segments[0].moves === segment.moves
        && candidate.recipe.segments[0].seed === segment.seed);
    assert.ok(entry, 'segment must name an independently prepared mkundead case');
    const command = entry.kind === 'bell' ? 'af' : entry.kind === 'book' ? 'rf' : 'rg';
    const commandIndex = segment.moves.lastIndexOf(command);
    assert.ok(commandIndex >= 0);
    let boundary;
    await runSegment({ ...segment, moves: segment.moves.slice(0, commandIndex) },
        { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const oldIds = new Set(allMonsters().map(monster => monster.m_id));
    const beforeCorpse = entry.kind === 'floor-success' ? floorCorpse(PM_NEWT)
        : entry.kind === 'floor-failure' ? floorCorpse(PM_PIRANHA) : null;
    const corpseSquare = beforeCorpse ? [beforeCorpse.x, beforeCorpse.y] : null;
    if (entry.kind.startsWith('floor')) assert.ok(corpseSquare);
    // Inventory is a source nobj chain, including in the actual runtime.
    let initialCharge;
    if (entry.kind === 'bell')
        for (let obj = game.invent; obj; obj = obj.nobj)
            if (obj.otyp === BELL_OF_OPENING) initialCharge = obj.spe;
    const replay = await runSegment(segment,
        { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.graveyard, true);
    assert.equal(Boolean(game.iflags.debug_mongen), Boolean(entry.noGeneration));
    const created = allMonsters().filter(monster => !oldIds.has(monster.m_id));
    if (entry.noGeneration) {
        assert.equal(created.length, 0); // C makemon guard leaves selection attempts alive.
    } else {
        assert.ok(created.some(monster => is_undead(monster.data)), 'swarm creates undead');
        for (const monster of created.filter(monster => is_undead(monster.data)))
            assert.equal(monster.minvent, null); // NO_MINVENT suppresses every inventory tail.
    }
    if (entry.kind === 'bell') {
        let finalCharge;
        for (let obj = game.invent; obj; obj = obj.nobj)
            if (obj.otyp === BELL_OF_OPENING) finalCharge = obj.spe;
        assert.equal(finalCharge, initialCharge - 1); // use_bell consumes one charge before mkundead.
    }
    if (entry.kind === 'floor-success') {
        const [x, y] = corpseSquare;
        assert.equal(game.level.objects[x][y], null);
        assert.equal(game.level.monsters[x][y]?.mnum, PM_NEWT);
        assert.equal(game.level.monsters[x][y]?.mrevived, true);
        assert.ok(created.some(monster => monster.mnum === PM_NEWT && monster.mrevived));
    } else if (entry.kind === 'floor-failure') {
        const [x, y] = corpseSquare;
        assert.equal(game.level.objects[x][y]?.corpsenm, PM_PIRANHA);
        assert.ok(is_undead(game.level.monsters[x][y]?.data));
        assert.equal(Boolean(game.level.monsters[x][y]?.mrevived), false);
        assert.ok(replay.getScreens().some(screen => screen.includes('piranha corpse twitches feebly.')));
    } else if (entry.kind === 'carried') {
        assert.ok(created.some(monster => monster.mnum === PM_NEWT && monster.mrevived));
        for (let obj = game.invent; obj; obj = obj.nobj)
            assert.ok(obj.otyp !== CORPSE || obj.corpsenm !== PM_NEWT);
        assert.ok(replay.getScreens().some(screen => screen.includes('It suddenly comes alive!')));
        assert.ok(replay.getScreens().some(screen => screen.includes('You stop studying.')));
    }
}

export async function runMkundeadMatrix() {
    return runFreshMatrix({
        entries: loadMkundeadRecipes().map(entry => ({ label: entry.name, recipe: entry.recipe })),
        verifySegment: verifyMkundeadSegment,
        summaryLabel: 'MKUNDEAD',
        chunkLimit: 1, // Each debug game needs an isolated C save directory.
    });
}

runMatrixCli(import.meta.url, runMkundeadMatrix, 'mkundead');
