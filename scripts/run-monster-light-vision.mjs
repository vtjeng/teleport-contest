#!/usr/bin/env node

// Run the checked-in matrix for movemon()'s mobile-light vision rebuild
// through fresh C recordings. Every segment contains replay inputs only;
// runDifferential() records new reference output in an isolated workspace.
//
// The setup enters the big-room special level, whose ordinary level creation
// places a distant yellow light and faster monsters. Putting on the wished
// amulet spends the turn on which movemon() sets vision_full_recalc at
// mon.c:1332-1333; a monster with a second movement ration consumes it through
// vision_recalc(0) at mon.c:1258-1259. That rebuild reaches light.c
// do_light_sources(), which updates the source position and overlays its
// temporary light before the next input boundary.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// This clock has no NetHack calendar event and retains the deterministic
// big-room layout and monster actions selected by the two seeds below.
const DATETIME = '20000110090000';
const LEVEL_TELEPORT_KEY = '\x16'; // cmd.c's C('v') wizlevelport binding.
const WISH_KEY = '\x17'; // cmd.c's C('w') wizwish binding.

const NETHACKRC = [
    'OPTIONS=name:Dazz,role:Wizard,race:human,gender:male,align:neutral,'
        + 'playmode:debug,suppress_alert:3.4.3,symset:DECgraphics',
    'OPTIONS=!autopickup',
    '',
].join('\n');

function segment(filler) {
    return {
        // The development witness uses this seed too, but this recipe changes
        // the wished armor, wand, and final object. Those choices advance the
        // movement RNG and produce a new post-rebuild monster scan.
        seed: 383,
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        moves: [
            // The two spaces dismiss startup messages; `n` declines the
            // tutorial. Experience level 20 admits the big room's monster
            // difficulty, and nineteen spaces dismiss its gain messages.
            '  n#levelchange\n20\n',
            ' '.repeat(19),
            // `?` opens the level menu and accelerator `e` selects bigrm.
            `${LEVEL_TELEPORT_KEY}?\ne`,
            // The three wishes keep the hero alive and advance the same RNG
            // that later allocates monster movement. Silver dragon scale mail
            // and a wand of cold distinguish this recipe from the development
            // witness while retaining the source-selected path.
            `${WISH_KEY}blessed amulet of life saving\n`,
            `${WISH_KEY}blessed +3 silver dragon scale mail\n`,
            `${WISH_KEY}blessed +3 wand of cold\n`,
            `${WISH_KEY}${filler}\n`,
            // T and its two dismissals remove the starting cloak. The wished
            // amulet occupies inventory letter o, so Po puts it on and spends
            // the turn that reaches the second monster scan.
            'T  Po',
        ].join(''),
    };
}

export function loadMonsterLightVisionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Both objects take the ordinary single-object wish path but leave
            // different inventory shapes for planningState() to clone.
            segment('food ration'),
            segment('rock'),
        ],
    }, 'monster light vision recipe');
}

function assertKnownMovementGap(result, label) {
    assert.equal(result.error, null, `${label}: JavaScript replay error`);
    assert.equal(result.rngMismatch, null, `${label}: PRNG mismatch`);
    assert.equal(result.cursorMismatch, null, `${label}: cursor mismatch`);
    assert.equal(result.animMismatch, null, `${label}: animation mismatch`);
    assert.deepEqual(result.lengths.rng,
        { c: 9889, js: 9889 }, `${label}: PRNG length`);
    assert.equal(result.lengths.screens.c, result.lengths.screens.js,
        `${label}: screen length`);

    // The selected `o` turn now finishes both monster scans and reaches the
    // next input boundary. Two monsters whose earlier ordinary movement is
    // already recorded under the broader special-monster scope remain one
    // square apart; the first is the red `1` below. Pinning the first
    // mismatch keeps this runner useful for the light-source boundary without
    // treating that pre-existing movement gap as part of this slice.
    assert.equal(result.screenMismatch?.location?.key, 'o');
    assert.equal(result.screenMismatch?.row, 12);
    assert.equal(result.screenMismatch?.column, 31);
    assert.equal(result.screenMismatch?.cCell?.ch, '1');
    assert.equal(result.screenMismatch?.jsCell?.ch, ' ');
}

export async function runMonsterLightVisionMatrix() {
    const recipe = loadMonsterLightVisionRecipe();
    let rngCalls = 0;
    let screens = 0;
    for (let index = 0; index < recipe.segments.length; ++index) {
        // Debug recordings must run one segment per recorder invocation so a
        // prior debug save cannot restore into the following case.
        const result = await runDifferential({
            version: recipe.version,
            segments: [recipe.segments[index]],
        });
        const label = `monster light vision ${index + 1}`;
        assertKnownMovementGap(result, label);
        rngCalls += result.lengths.rng.c;
        screens += result.lengths.screens.c;
        process.stdout.write(`[${label}] PASS\n`);
    }
    process.stdout.write(
        `MONSTER LIGHT VISION: PASS: ${recipe.segments.length} segments, `
        + `${rngCalls} PRNG calls, ${screens} screens and cursors\n`,
    );
    return { passed: true };
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterLightVisionMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`monster light vision: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
