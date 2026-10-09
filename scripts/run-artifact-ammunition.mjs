#!/usr/bin/env node
// artifact.c:invoke_create_ammo independent Ranger BUC/drop variations.
// Seeds chosen directly before comparison; C-only setup established selector g.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARROW } from '../js/objects.js';
import { ART_LONGBOW_OF_DIANA } from '../js/artifacts.js';
import { FUMBLING, OBJ_FLOOR } from '../js/const.js';
import { weight } from '../js/obj.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const names = ['blessed', 'uncursed', 'cursed', 'fumbling'];
export function loadArtifactAmmunitionCases() {
    return names.map(name => {
        const path = new URL(`../recipes/artifact.c/ammunition-${name}.session.json`, import.meta.url);
        return { name, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
function carriedArrows() {
    const arrows = [];
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.otyp === ARROW) arrows.push(obj);
    return arrows;
}
export async function verifyArtifactAmmunitionSegment(segment) {
    const entry = loadArtifactAmmunitionCases().find(({ recipe }) => recipe.segments[0].seed === segment.seed);
    assert.ok(entry);
    // Snapshot the starting stacks after the independent wish/wear setup so
    // merged quantity is checked as an increase, not as a new-stack identity.
    await runSegment({ ...segment, moves: segment.moves.split('#invoke')[0] });
    const before = carriedArrows().reduce((sum, obj) => sum + obj.quan, 0);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    let bow;
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.oartifact === ART_LONGBOW_OF_DIANA) bow = obj;
    assert.ok(bow);
    assert.ok(bow.age > game.moves, 'production invocation charged its canonical cooldown');
    let generated;
    let quantity;
    if (entry.name === 'fumbling') {
        const prop = game.u.uprops[FUMBLING];
        assert.ok(prop.intrinsic || prop.extrinsic, 'worn gauntlets activate source Fumbling');
        for (let obj = game.level.objects[game.u.ux][game.u.uy]; obj; obj = obj.nexthere)
            if (obj.otyp === ARROW) generated = obj;
        assert.ok(generated);
        assert.equal(generated.where, OBJ_FLOOR);
        assert.equal(carriedArrows().reduce((sum, obj) => sum + obj.quan, 0), before);
        quantity = generated.quan;
        assert.match(replay.getScreens().join('\n'), /Suddenly \d+ arrows fall out\./u);
    } else {
        const arrows = carriedArrows();
        quantity = arrows.reduce((sum, obj) => sum + obj.quan, 0) - before;
        generated = arrows.find(obj => Boolean(obj.blessed) === Boolean(bow.blessed)
            && Boolean(obj.cursed) === Boolean(bow.cursed));
        assert.ok(generated);
    }
    assert.equal(Boolean(generated.blessed), Boolean(bow.blessed));
    assert.equal(Boolean(generated.cursed), Boolean(bow.cursed));
    assert.equal(generated.oeroded, 0);
    assert.equal(generated.oeroded2, 0);
    assert.equal(generated.owt, weight(generated, { state: game }));
    // mkobj.c multi-generation rn1(6,6) gives 6..11; the artifact adds
    // rnd(10) when blessed, rnd(5) when uncursed, no draw when cursed.
    const min = bow.cursed ? 6 : 7;
    const max = bow.blessed ? 21 : bow.cursed ? 11 : 16;
    assert.ok(quantity >= min && quantity <= max, 'source generated quantity range');
}
export function runArtifactAmmunitionMatrix() {
    return runFreshMatrix({ entries: loadArtifactAmmunitionCases().map(({ name, recipe }) => ({ label: name, recipe })),
        summaryLabel: 'ARTIFACT AMMUNITION', chunkLimit: 1, verifySegment: verifyArtifactAmmunitionSegment });
}
runMatrixCli(import.meta.url, runArtifactAmmunitionMatrix, 'artifact ammunition');
