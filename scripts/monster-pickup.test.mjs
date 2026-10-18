import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { OBJ_DELETED, OBJ_MINVENT, SHRINK_GLOB, TIMER_OBJECT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { FOOD_RATION } from '../js/objects.js';
import { loadMonsterPickupRecipe } from './run-monster-pickup.mjs';

// The matrix drives the hero with the search command and the four orthogonal
// movement commands; nothing else is bound in these segments.
const SEGMENT_KEYS = new Set(['s', 'h', 'j', 'k', 'l']);

function untamedMonsters() {
    const monsters = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        if (!monster.mtame) monsters.push(monster);
    return monsters;
}

function carried(monster, otyp) {
    for (let obj = monster.minvent; obj; obj = obj.nobj)
        if (obj.otyp === otyp) return obj;
    return null;
}

test('monster-pickup matrix contains only source-selected inputs', () => {
    const recipe = loadMonsterPickupRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // A starting pet cannot reach mpickstuff(), and its own carry arm
        // belongs to scripts/run-pet-pickup.mjs.
        assert.match(segment.nethackrc, /pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment spends its turns on search or a step',
        );
    }
    // Both pline() gates in mpickstuff() need a segment: flags.verbose decides
    // whether the line prints at all, and accessiblemsg decides whether
    // pline_mon()'s coordinate prefix precedes it.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('!verbose'),
        ).length,
        1,
    );
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => nethackrc.includes('accessiblemsg'),
        ).length,
        1,
    );
});

test('every matrix segment replays to its last key', async () => {
    // The port emits one screen per consumed key plus the opening prompt, so
    // a segment that stops early emits fewer. Each of these segments was
    // sized to the boundary the port reaches, and before mpickstuff() landed
    // several of them stopped on the turn of the pickup instead.
    const { segments } = loadMonsterPickupRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('the visible base segment ends on a monster holding the ration',
    async () => {
        // Segment 0 is the case the matrix exists for: a goblin lifts a food
        // ration on a square the hero can see. Pinning the object here keeps
        // the screen-count test above from being the only thing that would
        // notice mpickstuff() quietly declining to carry anything.
        const [base] = loadMonsterPickupRecipe().segments;
        await runSegment(base);

        const carriers = untamedMonsters()
            .filter((monster) => carried(monster, FOOD_RATION));
        assert.equal(carriers.length, 1);
        const ration = carried(carriers[0], FOOD_RATION);
        assert.equal(ration.where, OBJ_MINVENT);
        assert.equal(ration.ocarry, carriers[0]);
        // obj_extract_self() unlinked it from the level list as well as from
        // the pile, so nothing on the floor can reach it any more.
        for (let obj = game.level.objlist; obj; obj = obj.nobj)
            assert.notEqual(obj, ration);
    });

test('canonical goblin floor glob pickup completes through mpickstuff', async () => {
    const fixture = fileURLToPath(new URL(
        '../.cache/glob-monster-floor-pickup-main-reviewed-qualification-20261018/attempt.mjs',
        import.meta.url,
    ));
    const fixtureBytes = readFileSync(fixture);
    assert.equal(fixtureBytes.byteLength, 19191);
    assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),
        'e0ebb02d3a4b736faf2c6a158ba5f061d1f2ed036092901666fd80aa8f70bcb2');
    const outputDir = mkdtempSync(join(dirname(fixture), 'regression-'));
    const oldOutputDir = process.env.QUALIFICATION_OUTPUT_DIR;
    const oldLog = console.log;
    const fixtureOutput = [];
    process.env.QUALIFICATION_OUTPUT_DIR = outputDir;
    console.log = (...values) => fixtureOutput.push(values.map(String).join(' '));
    let fixtureError = null;
    try {
        await import(new URL(
            '../.cache/glob-monster-floor-pickup-main-reviewed-qualification-20261018/attempt.mjs',
            import.meta.url,
        ).href);
    } catch (error) {
        fixtureError = error;
    } finally {
        console.log = oldLog;
        if (oldOutputDir === undefined) delete process.env.QUALIFICATION_OUTPUT_DIR;
        else process.env.QUALIFICATION_OUTPUT_DIR = oldOutputDir;
    }
    writeFileSync(join(outputDir, 'fixture-stdout.txt'), fixtureOutput.join('\n') + '\n');
    writeFileSync(join(outputDir, 'fixture-import-error.txt'), fixtureError
        ? `${fixtureError.stack ?? fixtureError}\n` : 'null\n');
    assert.equal(fixtureError, null, `fixture module threw: ${fixtureError?.stack}`);
    const final = JSON.parse(readFileSync(join(outputDir, '07-final-restored.json'), 'utf8'));
    const selector = JSON.parse(readFileSync(join(outputDir, '04-selector-once-receipt.json'), 'utf8'));
    const intent = JSON.parse(readFileSync(join(outputDir, '05-before-target-intent-count-zero.json'), 'utf8'));
    const before = intent.beforeTarget;
    assert.equal(selector.kind, 'pick up');
    assert.equal(selector.selectedExactSecond, true);
    assert.equal(selector.carryamt, 1);
    assert.equal(intent.invocationCount, 0);
    assert.equal(final.invocationCount, 1);
    assert.equal(final.invocation.entered, true);
    assert.equal(final.callbackRestored, true);
    assert.deepEqual(final.observerErrors, []);
    assert.deepEqual(final.saveErrors, []);
    assert.equal(final.primaryError, null, JSON.stringify({
        phase: final.phase, invocationCount: final.invocationCount,
        entered: final.invocation?.entered, error: final.invocation?.error,
        captureDirectory: outputDir,
    }));
    assert.equal(final.phase, 'target-returned');
    assert.equal(final.invocation.returnType, 'boolean');
    assert.equal(final.invocation.returnValue, true);
    const after = final.afterTarget;
    const actor = after.actor;
    const first = after.objects.first;
    const absorbed = after.objects.second;
    const beforeActor = before.actor;
    const beforeFirst = before.objects.first;
    const beforeSecond = before.objects.second;
    assert.equal(actor.m_id, beforeActor.m_id);
    assert.deepEqual([first.o_id, absorbed.o_id], [beforeFirst.o_id, beforeSecond.o_id]);
    assert.equal(actor.x, beforeActor.x);
    assert.equal(actor.y, beforeActor.y);
    assert.equal(actor.inMonsterGrid, true);
    assert.equal(actor.inMonlist, true);
    assert.equal(actor.alive, true);
    assert.deepEqual(actor.minventIds, [first.o_id]);
    assert.equal(first.where, OBJ_MINVENT);
    assert.equal(first.ocarry, actor.m_id);
    assert.equal(first.quan, 1);
    assert.equal(first.owt, 40);
    assert.equal(first.age, 1);
    assert.equal(absorbed.where, OBJ_DELETED);
    assert.equal(absorbed.ocarry, null);
    assert.equal(absorbed.nobj, null);
    assert.equal(absorbed.nexthere, null);
    assert.deepEqual(after.floorObjectIdsAtActor, []);
    assert.equal(after.levelObjectIds.includes(absorbed.o_id), false);
    assert.equal(after.timerRows.length, 1);
    assert.equal(after.timerRows[0].o_id, first.o_id);
    assert.equal(after.timerRows[0].kind, TIMER_OBJECT);
    assert.equal(after.timerRows[0].func_index, SHRINK_GLOB);
    assert.equal(after.timerRows[0].timeout, 26);
    assert.equal(after.hero.hp, before.hero.hp);
    assert.equal(final.currentLevelRefUnchanged, true);
    assert.equal(final.heroPositionUnchanged, true);
});
