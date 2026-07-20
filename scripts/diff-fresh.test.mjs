import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    assertRecordingMatchesRecipe,
    buildFreshRecipe,
    compareSessionOutputs,
    formatReport,
    isPathWithinDirectory,
    isSealedHoldoutPath,
    parseArgs,
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';

function recordingWithSteps(steps) {
    return {
        version: 5,
        segments: [{
            // This arbitrary seed and clock only satisfy the clean-v5 shape;
            // the pure comparator tests below do not initialize a game.
            seed: 424242,
            datetime: '20311224010203',
            nethackrc: '',
            moves: '',
            steps,
        }],
    };
}

test('builds a complete fresh recipe from convenient character flags', () => {
    // Seed 271828 is arbitrary and unrelated to the development recordings.
    const parsed = parseArgs([
        '--seed', '271828',
        '--datetime', '20300506070809',
        '--role', 'Wizard',
        '--race', 'elf',
        '--gender', 'female',
        '--align', 'chaotic',
        '--options', '!autopickup,pettype:none',
    ]);
    const recipe = buildFreshRecipe(parsed);

    assert.equal(parsed.mode, 'fresh');
    assert.equal(recipe.segments[0].seed, 271828);
    assert.match(recipe.segments[0].nethackrc, /role:Wizard,race:elf,gender:female,align:chaotic/u);
    assert.match(recipe.segments[0].nethackrc, /OPTIONS=!autopickup,pettype:none/u);
    assert.equal(recipe.segments[0].moves, '');
    assert.equal(validateCleanRecipe(recipe), recipe);
});

test('user options replace generated noninteractive defaults', () => {
    // This arbitrary fresh seed only exercises recipe construction.  Supplying
    // all three defaults reproduces the duplicate-option failure this guards.
    const parsed = parseArgs([
        '--seed', '161803',
        '--options', '!legacy,!tutorial,!splash_screen',
    ]);
    const recipe = buildFreshRecipe(parsed);
    const rc = recipe.segments[0].nethackrc;

    assert.equal(rc.match(/!legacy/gu)?.length, 1);
    assert.equal(rc.match(/!tutorial/gu)?.length, 1);
    assert.equal(rc.match(/!splash_screen/gu)?.length, 1);
    assert.equal(rc.split('\n').filter(Boolean).length, 2);
});

test('abbreviated user options also replace generated defaults', () => {
    // The arbitrary seed is unrelated to recorded fixtures.  Three-character
    // names cover NetHack's shortest accepted abbreviations for these options.
    const parsed = parseArgs([
        '--seed', '141421',
        '--options', '!leg,!tut,!spl',
    ]);
    const recipe = buildFreshRecipe(parsed);

    assert.doesNotMatch(recipe.segments[0].nethackrc, /!legacy|!tutorial|!splash_screen/u);
});

test('rejects direct use of the sealed holdout path', () => {
    assert.equal(isSealedHoldoutPath('sessions/holdout/example.session.json'), true);
    assert.equal(isSealedHoldoutPath('/tmp/fresh-recipe.session.json'), false);
});

test('sealed-path containment follows outside symlinks', async (t) => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'diff-path-test-'));
    t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
    const sealedRoot = path.join(tempRoot, 'sealed');
    const answerPath = path.join(sealedRoot, 'answer.json');
    const symlinkPath = path.join(tempRoot, 'outside-link.json');
    await fs.mkdir(sealedRoot);
    await fs.writeFile(answerPath, '{}');
    await fs.symlink(answerPath, symlinkPath);

    assert.equal(isPathWithinDirectory(answerPath, sealedRoot), true);
    assert.equal(isPathWithinDirectory(symlinkPath, sealedRoot), true);
    assert.equal(
        isPathWithinDirectory(path.join(tempRoot, 'ordinary.json'), sealedRoot),
        false,
    );
});

test('fresh recipes reject recorded answers while C output requires them', () => {
    const recorded = recordingWithSteps([{
        key: null,
        rng: [],
        screen: 'A',
        cursor: [0, 0, 1],
    }]);
    assert.throws(
        () => validateCleanRecipe(recorded),
        /must not contain recorded steps/u,
    );
    assert.equal(
        validateCleanRecipe(recorded, 'C recording', { steps: 'require' }),
        recorded,
    );

    const answerFree = structuredClone(recorded);
    delete answerFree.segments[0].steps;
    assert.throws(
        () => validateCleanRecipe(answerFree, 'C recording', {
            steps: 'require',
        }),
        /must contain nonempty recorded steps/u,
    );
});

test('fresh recipes reject impossible fixed datetimes', () => {
    const parsed = parseArgs(['--seed', '271828']);
    const recipe = buildFreshRecipe(parsed);
    for (const datetime of [
        '20230229010203',
        '20241301010203',
        '20241231246000',
        '00000101000000',
    ]) {
        recipe.segments[0].datetime = datetime;
        assert.throws(
            () => validateCleanRecipe(recipe),
            /must be a valid YYYYMMDDHHMMSS value/u,
        );
    }
    recipe.segments[0].datetime = '20000229010203';
    assert.equal(validateCleanRecipe(recipe), recipe);
});

test('recorded replay inputs must exactly match the requested recipe', () => {
    const parsed = parseArgs(['--seed', '271828']);
    const recipe = buildFreshRecipe(parsed);
    const recording = structuredClone(recipe);
    recording.segments[0].steps = [{ key: null, rng: [], screen: 'A' }];
    assert.doesNotThrow(() => assertRecordingMatchesRecipe(recording, recipe));

    recording.segments[0].seed += 1;
    assert.throws(
        () => assertRecordingMatchesRecipe(recording, recipe),
        /changed replay field seed/u,
    );
    recording.segments[0].seed = recipe.segments[0].seed;
    recording.segments.push(structuredClone(recording.segments[0]));
    assert.throws(
        () => assertRecordingMatchesRecipe(recording, recipe),
        /segment count does not match/u,
    );
});

test('reports the first PRNG mismatch with the C caller and stream lengths', () => {
    const recording = recordingWithSteps([{
        key: null,
        rng: [
            // The first call proves caller annotations do not affect equality.
            'rn2(7)=3 @ first_draw(alpha.c:10)',
            'rnd(4)=2 @ second_draw(beta.c:20)',
            // The third call makes the unequal stream lengths independently
            // observable after the value mismatch at call two.
            'rn2(2)=1 @ trailing_draw(gamma.c:30)',
        ],
        screen: 'A',
        cursor: [1, 0, 1],
    }]);
    const result = compareSessionOutputs(recording, {
        rng: ['17 rn2(7)=3', 'rnd(4)=1'],
        screens: ['A'],
        cursors: [[1, 0, 1]],
    });

    assert.equal(result.rngMismatch.index, 1);
    assert.equal(result.rngMismatch.cCaller, 'second_draw(beta.c:20)');
    assert.deepEqual(result.lengths.rng, { c: 3, js: 2 });
    const report = formatReport(result);
    assert.match(report, /PRNG length mismatch: C=3, JS=2/u);
    assert.match(report, /First PRNG mismatch at call 2/u);
    assert.match(report, /C caller: second_draw\(beta\.c:20\)/u);
});

test('uses scorer-equivalent visual normalization before reporting cell attributes', () => {
    const recording = recordingWithSteps([
        {
            key: null,
            rng: [],
            // These exercise the scorer's clock normalization and DEC line
            // drawing conversion, not literal string equality.
            screen: '12:34:56.\n\x0elqk\x0f',
            cursor: [0, 1, 1],
        },
        {
            key: 'x',
            rng: [],
            // Bold on a visible glyph must remain observable after decoding.
            screen: '\x1b[1mA',
            cursor: [1, 0, 1],
        },
    ]);
    const result = compareSessionOutputs(recording, {
        rng: [],
        screens: ['23:59:59.\n┌─┐', 'A'],
        cursors: [[0, 1, 1], [1, 0, 1]],
    });

    assert.equal(result.screenMismatch.index, 1);
    assert.equal(result.screenMismatch.kind, 'attr');
    assert.deepEqual(
        [result.screenMismatch.row, result.screenMismatch.column],
        [0, 0],
    );
    const report = formatReport(result);
    assert.match(report, /Cell row 1, column 1 \(attr\)/u);
    assert.match(report, /attr:2 \(bold\)/u);
});

test('reports cursor and positional stream length mismatches', () => {
    const recording = recordingWithSteps([
        {
            key: null,
            rng: [],
            screen: 'A',
            // Distinct row and column values make cursor transposition visible.
            cursor: [4, 7, 1],
        },
        {
            key: 'x',
            rng: [],
            screen: 'B',
            cursor: [5, 8, 1],
        },
    ]);
    const result = compareSessionOutputs(recording, {
        rng: [],
        // One JS boundary exercises missing-screen and missing-cursor lengths.
        screens: ['A'],
        cursors: [[7, 4, 1]],
    });

    assert.equal(result.screenMismatch.kind, 'js-missing');
    assert.equal(result.cursorMismatch.index, 0);
    assert.deepEqual(result.lengths.screens, { c: 2, js: 1 });
    assert.deepEqual(result.lengths.cursors, { c: 2, js: 1 });
    const report = formatReport(result);
    assert.match(report, /Screen length mismatch: C=2, JS=1/u);
    assert.match(report, /Cursor length mismatch: C=2, JS=1/u);
    assert.match(report, /First cursor mismatch at boundary 1/u);
});

test('strict parity rejects trailing JS output beyond the scorer total', () => {
    const recording = recordingWithSteps([{
        key: null,
        rng: ['rn2(2)=1 @ source(alpha.c:1)'],
        screen: 'A',
        cursor: [1, 0, 1],
    }]);
    const result = compareSessionOutputs(recording, {
        rng: ['rn2(2)=1', 'rn2(3)=2'],
        screens: ['A', 'B'],
        cursors: [[1, 0, 1], [1, 0, 1]],
    });

    assert.equal(result.passed, false);
    assert.deepEqual(result.lengths.rng, { c: 1, js: 2 });
    assert.equal(result.screenMismatch.kind, 'c-missing');
    assert.equal(result.cursorMismatch.cCursor, undefined);
});

test('records a recipe through record-session before running the judge contract', async (t) => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'diff-fresh-test-'));
    t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));

    const binary = path.join(tempRoot, 'fake-nethack');
    const installDir = path.join(tempRoot, 'install');
    const invokedPath = path.join(tempRoot, 'invoked');
    await fs.mkdir(installDir);

    const fakeSource = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.FAKE_INVOKED_PATH, 'yes');
const payload = 'X';
const marker = '\x1b]7777;KIND=input;SEQ=1;ANIM=0;CX=2;CY=3;LEN=1\x07' + payload;
fs.writeSync(1, marker);
setInterval(() => {}, 1000);
`;
    await fs.writeFile(binary, fakeSource, { mode: 0o755 });
    await fs.chmod(binary, 0o755);
    const recipe = {
        version: 5,
        segments: [{
            // This fresh seed is chosen only to exercise workflow integration.
            seed: 97531,
            datetime: '20340708091011',
            nethackrc: 'OPTIONS=name:Integration,role:Healer,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen\n',
            moves: '',
        }],
    };
    const result = await runDifferential(recipe, {
        ...process.env,
        NETHACK_BINARY: binary,
        NETHACK_INSTALL: installDir,
        FAKE_INVOKED_PATH: invokedPath,
    });

    assert.equal(await fs.readFile(invokedPath, 'utf8'), 'yes');
    assert.deepEqual(await fs.readdir(installDir), []);
    assert.equal(result.passed, false);
    const report = formatReport(result);
    assert.match(report, /PRNG length/u);
    assert.match(report, /Screen length/u);
    assert.match(report, /Cursor length/u);
    assert.match(report, /RESULT: FAIL/u);
});
