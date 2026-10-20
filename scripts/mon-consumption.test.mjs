import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { FIRE_RES, OBJ_CONTAINED, OBJ_DELETED, OBJ_FLOOR, OBJ_MINVENT, ROWNO, COLNO, ROOM } from '../js/const.js';

const C_MON_SOURCE = readFileSync('nethack-c/upstream/src/mon.c', 'utf8');
const JS_MON_SOURCE = readFileSync('js/mon.js', 'utf8');

test('meatobj imports and applies source slimeproof for green slime glob', () => {
    const cStart = C_MON_SOURCE.indexOf('meatobj(struct monst *mtmp)');
    const cEnd = C_MON_SOURCE.indexOf('\n#undef mstoning', cStart);
    const jsStart = JS_MON_SOURCE.indexOf('export async function meatobj(');
    const jsEnd = JS_MON_SOURCE.indexOf('\n}', jsStart);
    const cFunction = C_MON_SOURCE.slice(cStart, cEnd);
    const jsFunction = JS_MON_SOURCE.slice(jsStart, jsEnd);

    assert.ok(cStart >= 0 && cEnd > cStart, 'C meatobj source range exists');
    assert.ok(jsStart >= 0 && jsEnd > jsStart, 'JS meatobj source range exists');
    assert.match(cFunction, /GLOB_OF_GREEN_SLIME[\s\S]{0,80}slimeproof\(mtmp->data\)/u);
    assert.match(cFunction, /if \(flags\.verbose\)[\s\S]{0,180}You_hear\("a slurping sound\."\)/u);
    assert.match(cFunction, /else if \(flags\.verbose\)[\s\S]{0,140}You_hear\("%s slurping sound%s\."/u);
    assert.match(jsFunction, /GLOB_OF_GREEN_SLIME && !slimeproof\(mtmp\.data\)/u);
    assert.match(jsFunction, /youHear\('a slurping sound\.', state\)/u);
    assert.match(JS_MON_SOURCE, /import \{[\s\S]*?\bslimeproof\b[\s\S]*?\} from '\.\/mondata\.js';/u);
});
import { GameMap } from '../js/game.js';
import {
    m_consume_obj,
    meatobj,
    meatcorpse,
    meatmetal,
    mon_give_prop,
    mpickgold,
} from '../js/mon.js';
import { mpickobj } from '../js/steal.js';
import {
    PM_GELATINOUS_CUBE,
    PM_GREEN_SLIME,
    PM_HUMAN,
    PM_PURPLE_WORM,
    PM_ROCK_MOLE,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject, place_object } from '../js/obj.js';
import {
    CORPSE,
    GOLD_PIECE,
    GLOB_OF_GREEN_SLIME,
    IRON_CHAIN,
    objects_globals_init,
} from '../js/objects.js';

function makeState() {
    const state = {
        context: {
            achieveo: { mines_prize_oid: 0, soko_prize_oid: 0 },
        },
        flags: { verbose: false },
        level: new GameMap(),
        dungeons: [{
            depth_start: 1,
            ledger_start: 0,
            num_dunlevs: 29,
            entry_lev: 1,
            flags: { hellish: false },
        }],
        u: {
            uprops: [],
            ux: 5,
            uy: 5,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
    objects_globals_init(state);
    monst_globals_init(state);
    for (const column of state.level.locations)
        for (const location of column) location.typ = ROOM;
    state.viz_array = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
    return state;
}

function random() {
    return {
        d: (count) => count,
        rn2: () => 5,
        rnd: (bound) => bound,
        rn1: (count, base) => base,
        rne: () => 1,
    };
}

function monster(state, pmidx) {
    return newMonster({
        data: state.mons[pmidx],
        mhp: 20,
        mhpmax: 20,
        mcanmove: true,
        mcansee: true,
        mx: 5,
        my: 5,
        mnum: pmidx,
    });
}

function floorObject(state, otyp, overrides = {}) {
    const type = state.objects[otyp];
    const obj = newObject({
        oclass: type.oc_class,
        otyp,
        owt: type.oc_weight,
        quan: 1,
        ...overrides,
    });
    place_object(obj, 5, 5, { state, random: random() });
    return obj;
}

test('m_consume_obj turns an eater into green slime after consuming a glob', async () => {
    const state = makeState();
    reset_mvitals(state);
    const cube = monster(state, PM_GELATINOUS_CUBE);
    const globType = state.objects[GLOB_OF_GREEN_SLIME];
    const glob = newObject({
        oclass: globType.oc_class,
        otyp: GLOB_OF_GREEN_SLIME,
        owt: globType.oc_weight,
        quan: 1,
    });
    mpickobj(cube, glob, { state, random: random() });

    await m_consume_obj(cube, glob, {
        state,
        random: random(),
        canSpotMonster: () => false,
        redrawSquare: () => {},
    });

    assert.equal(glob.where, OBJ_DELETED);
    assert.equal(cube.data, state.mons[PM_GREEN_SLIME]);
});

test('meatobj gates hidden slurping messages by C verbosity, acoustics, and deafness', async () => {
    // Each flag combination below isolates a C You_hear gate: only verbose,
    // acoustic, non-deaf play reports the hidden edible object.
    for (const { verbose, acoustics, deaf, expected } of [
        // This is the sole combination that reaches You_hear's output branch.
        { verbose: true, acoustics: true, deaf: false,
            expected: ['You hear a slurping sound.'] },
        // C suppresses the sound when the player is deaf.
        { verbose: true, acoustics: true, deaf: true, expected: [] },
        // C acoustics suppresses the sound when disabled.
        { verbose: true, acoustics: false, deaf: false, expected: [] },
        // meatobj skips You_hear entirely when verbose is disabled.
        { verbose: false, acoustics: true, deaf: false, expected: [] },
    ]) {
        const state = makeState();
        state.flags.verbose = verbose;
        state.flags.acoustics = acoustics;
        state.u.uroleplay = { deaf };
        const cube = monster(state, PM_GELATINOUS_CUBE);
        floorObject(state, GLOB_OF_GREEN_SLIME);
        const messages = [];

        assert.equal(await meatobj(cube, {
            state,
            random: random(),
            message: async (line) => messages.push(line),
        }), 1);
        assert.deepEqual(messages, expected);
        assert.equal(cube.minvent.otyp, GLOB_OF_GREEN_SLIME);
    }
});

test('meatmetal consumes the first acceptable metallic object', async () => {
    const state = makeState();
    const mole = monster(state, PM_ROCK_MOLE);
    const chain = floorObject(state, IRON_CHAIN);

    assert.equal(
        await meatmetal(mole, { state, random: random() }),
        1,
    );
    assert.notEqual(chain.where, 1); // OBJ_FLOOR; delobj() marks it deleted.
    assert.equal(state.level.objects[5][5], null);
});

test('meatmetal routes offscreen crunch through the C acoustics gate', async () => {
    for (const [acoustics, expectedMessages] of [
        [false, []],
        [true, ['You hear a crunching sound.']],
    ]) {
        const state = makeState();
        state.flags.verbose = true;
        state.flags.acoustics = acoustics;
        const mole = monster(state, PM_ROCK_MOLE);
        floorObject(state, IRON_CHAIN);
        const draws = [];
        const messages = [];
        const random = {
            rn2(bound) { draws.push(['rn2', bound]); return 99; },
            rnd(bound) { draws.push(['rnd', bound]); return bound; },
        };

        assert.equal(await meatmetal(mole, {
            state,
            random,
            message: async (line) => messages.push(line),
        }), 1);
        assert.deepEqual(messages, expectedMessages);
        assert.deepEqual(draws, [
            ['rn2', 100], // meatmetal's object resistance check
            ['rn2', 100], // delobj's ordinary-object resistance check
            ['rnd', 25], // possible rock pile after consumption
        ]);
    }
});

test('meatcorpse consumes one ordinary corpse and leaves the monster alive', async () => {
    const state = makeState();
    const worm = monster(state, PM_PURPLE_WORM);
    const corpse = floorObject(state, CORPSE, { corpsenm: PM_HUMAN });

    assert.equal(
        await meatcorpse(worm, { state, random: random() }),
        1,
    );
    assert.notEqual(corpse.where, 1); // OBJ_FLOOR; delobj() marks it deleted.
    assert.equal(worm.mhp, 20);
});

test('meatcorpse gates offscreen chewing by verbosity and hearing', async () => {
    const cStart = C_MON_SOURCE.indexOf('\nmeatcorpse(\n');
    const cEnd = C_MON_SOURCE.indexOf('\n/* give monster property', cStart);
    const cBody = C_MON_SOURCE.slice(cStart, cEnd);
    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.match(cBody,
        /else \{\s*Soundeffect\(se_masticating_sound, 50\);\s*if \(flags\.verbose\)\s*You_hear\("a masticating sound\."\)/u);

    for (const { verbose, acoustics, deaf, expected } of [
        { verbose: true, acoustics: true, deaf: false,
            expected: ['You hear a masticating sound.'] },
        { verbose: false, acoustics: true, deaf: false, expected: [] },
        { verbose: true, acoustics: false, deaf: false, expected: [] },
        { verbose: true, acoustics: true, deaf: true, expected: [] },
    ]) {
        const state = makeState();
        state.u.ux = 2;
        state.u.uy = 2;
        state.flags.verbose = verbose;
        state.flags.acoustics = acoustics;
        state.u.uroleplay = { deaf };
        const worm = monster(state, PM_PURPLE_WORM);
        state.level.monlist = worm;
        state.level.monsters[5][5] = worm;
        floorObject(state, CORPSE, { corpsenm: PM_HUMAN });
        const messages = [];

        assert.equal(await meatcorpse(worm, {
            state,
            random: random(),
            message: (line) => { messages.push(line); },
        }), 1);
        assert.deepEqual(messages, expected);
    }
});

test('mon_give_prop records resistance and mpickgold transfers coins', async () => {
    const state = makeState();
    const mole = monster(state, PM_ROCK_MOLE);
    await mon_give_prop(mole, FIRE_RES, { state });
    assert.equal(mole.mintrinsics & 1, 1);

    const gold = floorObject(state, GOLD_PIECE);
    mpickgold(mole, { state });
    assert.equal(gold.where, 4); // OBJ_MINVENT in monst.h's object-location enum.
    assert.equal(mole.minvent, gold);
});

test('meatbox and meatobj await the real monster-inventory glob merge', () => {
    const fixture = resolve('.cache/glob-cube-meatobj-main-reviewed-qualification-20261019/attempt.mjs');
    const fixtureBytes = readFileSync(fixture);
    assert.equal(fixtureBytes.length, 30196, 'the reviewed fixed-input fixture is unchanged');
    assert.equal(createHash('sha256').update(fixtureBytes).digest('hex'),
        '24624e681f541bfdda3c834d82ed314047a5d09aad6b632cd2ceefbc0e9f7a88');

    const requestedCapture = process.env.MON_CONSUMPTION_CAPTURE_DIR;
    const captureDir = requestedCapture
        ? resolve(requestedCapture)
        : mkdtempSync(join(tmpdir(), 'mon-consumption-glob-'));
    if (requestedCapture) {
        assert.equal(existsSync(captureDir), false, 'capture directory must be unique and absent');
        mkdirSync(captureDir, { recursive: false });
    }
    const outputDir = join(captureDir, 'fixture-output');
    assert.equal(existsSync(outputDir), false, 'fixture output directory must be fresh');

    const command = [process.execPath, fixture];
    const startedAt = new Date().toISOString();
    const child = spawnSync(command[0], command.slice(1), {
        cwd: process.cwd(),
        env: { ...process.env, CUBE_MEATOBJ_OUTPUT_DIR: outputDir },
        maxBuffer: 32 * 1024 * 1024,
    });
    const endedAt = new Date().toISOString();
    const stdout = child.stdout ?? Buffer.alloc(0);
    const stderr = child.stderr ?? Buffer.alloc(0);
    writeFileSync(join(captureDir, 'fixture.stdout.raw'), stdout);
    writeFileSync(join(captureDir, 'fixture.stderr.raw'), stderr);

    const outputFiles = [];
    function collectFiles(dir, relative = '') {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const childRelative = join(relative, entry.name);
            const absolute = join(dir, entry.name);
            if (entry.isDirectory()) collectFiles(absolute, childRelative);
            else if (entry.isFile()) {
                const bytes = readFileSync(absolute);
                outputFiles.push({
                    name: childRelative,
                    bytes: bytes.length,
                    sha256: createHash('sha256').update(bytes).digest('hex'),
                });
            }
        }
    }
    collectFiles(outputDir);
    outputFiles.sort((a, b) => a.name.localeCompare(b.name));
    const processReceipt = {
        startedAt,
        endedAt,
        command,
        cwd: process.cwd(),
        environmentOverride: { CUBE_MEATOBJ_OUTPUT_DIR: outputDir },
        fixtureBytes: fixtureBytes.length,
        fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex'),
        status: child.status,
        signal: child.signal,
        spawnError: child.error ? { name: child.error.name, message: child.error.message } : null,
        stdout: { bytes: stdout.length, sha256: createHash('sha256').update(stdout).digest('hex') },
        stderr: { bytes: stderr.length, sha256: createHash('sha256').update(stderr).digest('hex') },
        outputFiles,
    };
    writeFileSync(join(captureDir, 'fixture-process.json'), `${JSON.stringify(processReceipt, null, 2)}\n`);

    // Receipts and raw bytes are durable before any assertion can fail.
    const receipt = (name) => JSON.parse(readFileSync(join(outputDir, name), 'utf8'));
    const before = receipt('before-meatobj.json');
    const after = receipt('after-meatobj.json');
    const target = receipt('target-return.json');
    const ready = receipt('target-ready.json');
    const restoration = receipt('restoration.json');
    const final = receipt('final.json');

    assert.equal(child.error, undefined, 'fixture process was created');
    assert.equal(child.signal, null, 'fixture process was not signalled');
    assert.equal(target.counter, 1, 'the real meatobj target was entered once');
    assert.equal(final.counters.meatobj, 1, 'the retained fixture counter records one target call');
    assert.equal(ready.pairMergeEligible, true);
    for (const owner of [
        'cubeNmon', 'cubeGrid', 'residentMinv', 'sackFloor', 'sackTile',
        'incomingContained', 'originalInventory', 'originalFloor',
    ]) assert.equal(ready.owners[owner], true, `pretarget owner ${owner}`);
    assert.equal(before.cube.id, 79);
    assert.deepEqual(before.cube.xy.$array, [68, 4]);
    assert.equal(before.resident.id, 80);
    assert.equal(before.resident.where, OBJ_MINVENT);
    assert.equal(before.resident.owt, 20);
    assert.equal(before.sack.id, 82);
    assert.equal(before.sack.where, OBJ_FLOOR);
    assert.equal(before.sack.owt, 35);
    assert.equal(before.incoming.id, 83);
    assert.equal(before.incoming.where, OBJ_CONTAINED);
    assert.equal(restoration.handlerRestored, true);
    for (const error of ['setup', 'observer', 'save', 'restore', 'capture'])
        assert.equal(final.errors[error], null, `no ${error} error`);

    if (child.status !== 0) {
        // Verify the genuine primary target failure before recording a red test.
        assert.equal(target.returned, false);
        assert.equal(target.thrown?.name, 'UnsupportedObjectOperationError');
        assert.equal(target.thrown?.operation, 'absorbGlob');
        assert.equal(target.thrown?.otyp, 271);
        assert.equal(target.thrown?.phase, 'meatobj');
        assert.match(target.thrown?.stack ?? '', /at meatbox \(/u);
        assert.match(target.thrown?.stack ?? '', /at mpickobj \(/u);
        assert.match(target.thrown?.stack ?? '', /absorbGlob is not available for otyp 271/u);
        assert.fail(`real meatbox child merge reached the missing absorbGlob hook; fixture exit=${child.status}`);
    }

    assert.equal(child.status, 0, 'the real monster inventory merge completes without a source error');
    assert.equal(target.returned, true);
    assert.equal(target.value, 1);
    assert.equal(target.thrown, null);
    assert.deepEqual(final.errors, {
        $id: final.errors.$id,
        primary: null,
        setup: null,
        observer: null,
        save: null,
        restore: null,
        capture: null,
    });

    assert.equal(after.resident.id, 80);
    assert.equal(after.resident.where, OBJ_MINVENT);
    assert.equal(after.resident.quan, 1);
    assert.equal(after.resident.age, 1);
    assert.equal(after.resident.owt, 40);
    assert.equal(after.cube.id, 79);
    assert.deepEqual(after.cube.minv.$array.map((object) => object.id), [80]);
    assert.equal(after.cube.minv.$array[0].ocarryId, 79);
    assert.equal(after.incoming.id, 83);
    assert.equal(after.incoming.where, OBJ_DELETED);
    assert.equal(after.sack.id, 82);
    assert.equal(after.sack.where, OBJ_DELETED);
    assert.deepEqual(after.sack.children.$array, []);
    assert.equal(after.floorList.$array.some((object) => object.id === 82 || object.id === 83), false);
    assert.deepEqual(after.floorContents.$array.map((object) => object.id),
        before.floorContents.$array.map((object) => object.id));
    assert.deepEqual(after.inventoryContents.$array.map((object) => object.id),
        before.inventoryContents.$array.map((object) => object.id));
    assert.deepEqual(after.hero.startingInventoryIds.$array, before.hero.startingInventoryIds.$array);
    assert.equal(after.hero.startingInventoryRefsRetained, true);
    assert.equal(after.hero.hp, 13);
    assert.equal(after.hero.gameover, false);
    assert.equal(after.stateRefs.sameHeroPosition, true);
    assert.equal(after.stateRefs.game, true);
    assert.equal(after.stateRefs.hero, true);
    assert.equal(after.stateRefs.level, true);

    const afterTimers = after.timers.$array;
    const residentShrink = afterTimers.filter((timer) => timer.objectId === 80
        && timer.kind === 3 && timer.func_index === 7);
    assert.deepEqual(residentShrink.map((timer) => timer.timeout), [26]);
    assert.equal(afterTimers.some((timer) => timer.objectId === 83), false);
    assert.equal(afterTimers.some((timer) => timer.objectId === 2
        && timer.kind === 3 && timer.func_index === 1 && timer.timeout === 237), true);
});
