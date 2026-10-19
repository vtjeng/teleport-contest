import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
    ALTAR,
    ECMD_TIME,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_INVENT,
} from '../js/const.js';
import {
    BAG_OF_TRICKS,
    CHEST,
    COIN_CLASS,
    CORPSE,
    DAGGER,
    HORN_OF_PLENTY,
    LARGE_BOX,
    POTION_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { PM_HOUSECAT } from '../js/monsters.js';
import { dotip, tip_ok, use_container } from '../js/pickup.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { newObject } from '../js/obj.js';

async function heroOnCleanSquare(seed = 83001621) {
    await runSegment({
        seed,
        datetime: '20290911101500',
        nethackrc: 'OPTIONS=name:Tipper,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!acoustics,!autopickup',
        moves: '',
    });
    clearTtyMessageWindow(game);
    return game;
}

function quantumCatBox(state) {
    const { ux, uy } = state.u;
    const corpse = newObject({
        otyp: CORPSE,
        oclass: state.objects[CORPSE].oc_class,
        corpsenm: PM_HOUSECAT,
        quan: 1,
        where: OBJ_CONTAINED,
        ox: ux,
        oy: uy,
        owt: 20,
    });
    const box = newObject({
        otyp: LARGE_BOX,
        oclass: state.objects[LARGE_BOX].oc_class,
        quan: 1,
        spe: 1,
        where: OBJ_FLOOR,
        ox: ux,
        oy: uy,
        owt: 120,
        cobj: corpse,
    });
    corpse.ocontainer = box;
    state.level.objects[ux][uy] = box;
    return { box, corpse };
}

// C ref: pickup.c tip_ok() (3395-3410). Its source has no RNG, output, or
// state writes; it returns only GETOBJ_EXCLUDE/SUGGEST/DOWNPLAY by class,
// container type, and the horn's discovery flags.
test('tip_ok follows the source eligibility and suggestion rules', () => {
    const knownHornState = {
        objects: { [HORN_OF_PLENTY]: { oc_name_known: true } },
    };
    const unknownHornState = {
        objects: { [HORN_OF_PLENTY]: { oc_name_known: false } },
    };

    assert.equal(tip_ok(null), GETOBJ_EXCLUDE);
    assert.equal(tip_ok({ oclass: COIN_CLASS }), GETOBJ_EXCLUDE);
    assert.equal(tip_ok({ otyp: LARGE_BOX }), GETOBJ_SUGGEST);
    assert.equal(tip_ok({ otyp: BAG_OF_TRICKS }), GETOBJ_SUGGEST);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: false,
    }, knownHornState), GETOBJ_DOWNPLAY);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: true,
    }, unknownHornState), GETOBJ_DOWNPLAY);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: true,
    }, knownHornState), GETOBJ_SUGGEST);
    assert.equal(tip_ok({ oclass: POTION_CLASS }), GETOBJ_DOWNPLAY);
});

test('pickup.c tipcontainer identifies a cursed spill on an altar', async () => {
    const state = await heroOnCleanSquare();
    const { ux, uy } = state.u;
    state.level.at(ux, uy).typ = ALTAR;

    const dagger = {
        otyp: DAGGER,
        oclass: WEAPON_CLASS,
        quan: 1,
        nobj: null,
        cobj: null,
        where: OBJ_CONTAINED,
        unpaid: 0,
        no_charge: false,
        invlet: 0,
        dknown: 1,
        bknown: 0,
        rknown: 0,
        known: 0,
        oartifact: 0,
        cursed: 1,
        blessed: 0,
        spe: 0,
        corpsenm: 0,
        oeroded: 0,
        oeroded2: 0,
        oerodeproof: 0,
        owt: 10,
        age: 0,
        recharged: 0,
        oextra: null,
        onamelth: 0,
        globby: 0,
        how_lost: 0,
        ox: ux,
        oy: uy,
        nexthere: null,
    };
    const chest = {
        otyp: CHEST,
        oclass: 6,
        olocked: 0,
        obroken: 1,
        lknown: 0,
        cknown: 0,
        cobj: dagger,
        nexthere: null,
        nobj: null,
        quan: 1,
        owt: 100,
        ox: ux,
        oy: uy,
        o_id: 70021,
        where: OBJ_FLOOR,
        dknown: 1,
        bknown: 1,
        rknown: 0,
        known: 0,
        invlet: 0,
        oartifact: 0,
        no_charge: false,
        cursed: 0,
        blessed: 0,
        spe: 0,
        corpsenm: 0,
        oeroded: 0,
        oeroded2: 0,
        oerodeproof: 0,
        globby: 0,
        onamelth: 0,
        oextra: null,
        unpaid: 0,
        age: 0,
        recharged: 0,
    };
    dagger.ocontainer = chest;
    state.level.objects[ux][uy] = chest;

    // pickup.c:3601 accepts the container, then :3710 chooses the floor.
    state.nhDisplay.pushKey('y'.charCodeAt(0));
    state.nhDisplay.pushKey(13);
    for (let i = 0; i < 12; ++i) state.nhDisplay.pushKey(32);

    assert.equal(await dotip(state), ECMD_TIME);
    assert.equal(dagger.where, OBJ_FLOOR);
    assert.equal(dagger.cursed, 1);
    assert.equal(dagger.bknown, 1);
    assert.equal(dagger.nexthere, chest);
    assert.equal(state.u.uconduct.gnostic, 1);
    assert.match(state.nhDisplay.toplines, /black flash as a dagger hits the altar/u);
});

test('pickup.c tipcontainer resolves a quantum cat before checking its contents',
    async () => {
        // This seed reaches the live-cat branch after startup. The observer
        // must create the cat silently, consume the stored corpse, and leave
        // tipcontainer_checks with an empty, known box.
        const state = await heroOnCleanSquare(83001622);
        const { box, corpse } = quantumCatBox(state);
        clearTtyMessageWindow(state);

        state.nhDisplay.pushKey('y'.charCodeAt(0));
        state.nhDisplay.pushKey('-'.charCodeAt(0));
        for (let i = 0; i < 30; ++i) state.nhDisplay.pushKey(32);

        assert.equal(await dotip(state), ECMD_TIME);
        assert.equal(box.spe, 0);
        assert.equal(box.cknown, 1);
        assert.equal(box.cobj, null,
            'the live observation consumes the corpse from the box');
        assert.equal(corpse.where, OBJ_DELETED);
        let cat = null;
        for (let mon = state.level.monlist; mon; mon = mon.nmon) {
            if (mon.mnum === PM_HOUSECAT) cat = mon;
        }
        assert.ok(cat, 'makemon creates the live housecat');
        assert.equal(cat.mpeaceful, true);
        assert.equal(cat.minvent, null);
        assert.match(state.nhDisplay.toplines,
            /housecat inside the box is still alive/u);
        assert.deepEqual([...(state.unported ?? [])], []);
    });

test('pickup.c use_container observes a quantum box before opening its prompt',
    async () => {
        const state = await heroOnCleanSquare(83001622);
        const { box, corpse } = quantumCatBox(state);
        clearTtyMessageWindow(state);

        // Dismiss the source observation message, then quit its container
        // prompt. The observer still consumes this turn and marks the box
        // known before use_container enters the ordinary prompt loop.
        state.nhDisplay.pushKey(32);
        state.nhDisplay.pushKey('q'.charCodeAt(0));

        assert.equal(await use_container(box, false, false, state), ECMD_TIME);
        assert.equal(box.spe, 0);
        assert.equal(box.cknown, 1);
        assert.equal(box.cobj, null);
        assert.equal(corpse.where, OBJ_DELETED);
        assert.equal(state.gc.current_container, null);
        assert.deepEqual([...(state.unported ?? [])], []);
    });

test('pickup.c passes drop operations to the tipped horn floor path', async () => {
    const state = await heroOnCleanSquare();
    const { ux, uy } = state.u;
    state.level.at(ux, uy).typ = ALTAR;
    state.level.objects[ux][uy] = null;
    state.flags.invlet_constant = true;

    const horn = newObject({
        otyp: HORN_OF_PLENTY,
        oclass: state.objects[HORN_OF_PLENTY].oc_class,
        quan: 1,
        spe: 1,
        cursed: 1,
        where: OBJ_INVENT,
        invlet: 'a',
        owt: 25,
    });
    state.invent = horn;
    state.nhDisplay.pushKey('a'.charCodeAt(0));
    for (let i = 0; i < 16; ++i) state.nhDisplay.pushKey(32);

    // pickup.c:4016 calls hornoplenty() with a null target; its mkobj.c
    // floor path uses the display hooks supplied by this production caller.
    assert.equal(await dotip(state), ECMD_TIME);
    const spilled = state.level.objects[ux][uy];
    assert.equal(horn.spe, 0);
    assert.equal(spilled.where, OBJ_FLOOR);
    assert.equal(spilled.cursed, 1);
    assert.equal(spilled.bknown, 1);
    assert.match(state.nhDisplay.toplines, /black flash as .* hits the altar/u);
});


// Public-entry regression for the real two-held-SACK/glob tip path.  The
// child runs the frozen, exact qualification fixture in its own process so
// the test preserves its complete canonical receipts before making assertions.
test('public dotip transfers a contained glob through the runtime container writer', () => {
    const fixture = resolve('.cache/glob-public-tip-between-sacks-main-reviewed-qualification-20261019/attempt.mjs');
    const fixtureBytes = readFileSync(fixture);
    const fixtureHash = createHash('sha256').update(fixtureBytes).digest('hex');
    assert.equal(fixtureBytes.byteLength, 24844, 'exact Main-reviewed fixture is present');
    assert.equal(fixtureHash, 'a2eb8ee82602d78c42347da696c0e50ec5844166e8961a06c54cbcdd6866f9e7',
        'exact Main-reviewed fixture bytes are used');

    const evidenceRoot = resolve('.cache/glob-public-tip-runtime-source-parity-20261019');
    mkdirSync(evidenceRoot, { recursive: true });
    const testRunId = randomUUID();
    const evidenceDir = mkdtempSync(join(evidenceRoot, `${testRunId}-`));
    const tempParent = mkdtempSync(join(tmpdir(), 'tip-sack-runtime-'));
    const childOutput = join(tempParent, 'run'); // deliberately absent: fixture mkdirSync uses recursive:false
    const child = spawnSync(process.execPath, [fixture], {
        cwd: process.cwd(),
        env: { ...process.env, TIP_SACK_OUTPUT_DIR: childOutput },
        encoding: null,
        maxBuffer: 16 * 1024 * 1024,
    });

    // Preserve the child result and every UUID receipt before assertions.
    const stdout = child.stdout ?? Buffer.alloc(0);
    const stderr = child.stderr ?? Buffer.alloc(0);
    writeFileSync(join(evidenceDir, 'stdout.raw'), stdout);
    writeFileSync(join(evidenceDir, 'stderr.raw'), stderr);
    writeFileSync(join(evidenceDir, 'exit.code'), `${child.status ?? 'null'}\n`);
    writeFileSync(join(evidenceDir, 'spawn-error.json'), JSON.stringify(child.error ? {
        name: child.error.name, message: child.error.message, stack: child.error.stack,
    } : null, null, 2) + '\n');
    const outputNames = existsSync(childOutput) ? readdirSync(childOutput).sort() : [];
    const fixtureOutputCopy = join(evidenceDir, 'fixture-output');
    if (outputNames.length) cpSync(childOutput, fixtureOutputCopy, { recursive: true });
    const manifest = {
        testRunId, fixture, fixtureBytes: fixtureBytes.byteLength, fixtureHash,
        testBytes: readFileSync(resolve('scripts/pickup-tip.test.mjs')).byteLength,
        testHash: createHash('sha256').update(readFileSync(resolve('scripts/pickup-tip.test.mjs'))).digest('hex'),
        productionSourceHash: createHash('sha256').update(readFileSync(resolve('js/pickup.js'))).digest('hex'),
        cwd: process.cwd(), argv: [process.execPath, fixture], childOutput,
        childExitCode: child.status, childSignal: child.signal,
        stdoutBytes: stdout.byteLength, stderrBytes: stderr.byteLength,
        outputNames,
    };
    writeFileSync(join(evidenceDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    assert.equal(child.error, undefined, 'child process starts');
    assert.notEqual(child.status, null, 'child process has an actual exit status');
    const receiptName = outputNames.find(name => name.endsWith('.receipt.json'));
    assert.ok(receiptName, 'one UUID-named canonical receipt was saved');
    const receipt = JSON.parse(readFileSync(join(childOutput, receiptName), 'utf8'));
    const runId = receipt.runId;
    assert.ok(runId && receiptName === `${runId}.receipt.json`, 'receipt UUID names this invocation');
    const beforeName = outputNames.find(name => name === `${runId}.before-target.json`);
    assert.ok(beforeName, 'before-target is a separate UUID receipt, not a receipt.before projection');
    const before = JSON.parse(readFileSync(join(childOutput, beforeName), 'utf8'));
    assert.equal(receipt.targetEnteredCount, 1, 'real public dotip was entered exactly once');
    assert.equal(receipt.observerError, null);
    assert.deepEqual(receipt.saveErrors, []);
    assert.equal(receipt.restoreError, null);
    assert.equal(receipt.handlerRestored, true);
    assert.equal(receipt.startupEquality?.baselinePresent, true);
    assert.equal(receipt.startupEquality?.stateSame, true);
    assert.equal(receipt.finalEquality?.stateSame, true);
    assert.equal(receipt.finalEquality?.uSame, true);
    assert.equal(receipt.finalEquality?.levelSame, true);
    assert.equal(receipt.finalEquality?.uzSame, true);
    assert.equal(receipt.finalEquality?.coordsSame, true);
    assert.equal(before.terminal?.toplin, 0);
    assert.equal(before.terminal?.queueLength, 0);
    assert.deepEqual(before.terminal?.queue, []);

    // On the original implementation, this diagnostic makes the red target
    // specific before the intentional primaryError-null assertion below.
    if (receipt.primaryError !== null) {
        assert.equal(receipt.primaryError?.sourceOperation, 'absorbGlob');
        assert.equal(receipt.primaryError?.otyp, 271);
        assert.match(receipt.primaryError?.stack ?? '', /add_to_container[\s\S]*tipcontainer[\s\S]*dotip/u);
        assert.equal(child.status, 2);
    }
    assert.equal(receipt.primaryError, null, 'the actual public transfer must complete without the legacy missing absorbGlob refusal');
    assert.equal(child.status, 0);
    assert.equal(receipt.targetResult?.value, ECMD_TIME);

    const after = receipt.after;
    const source = after.pair.source;
    const survivor = after.pair.destination;
    assert.equal(source.oid, 66);
    assert.equal(source.where, OBJ_DELETED);
    assert.equal(source.timed, 0);
    assert.equal(source.links?.nobj ?? null, null);
    assert.equal(survivor.oid, 69);
    assert.equal(survivor.where, OBJ_CONTAINED);
    assert.equal(survivor.owt, 40);
    assert.equal(survivor.quan, 1);
    assert.equal(survivor.age, 1);
    assert.equal(survivor.owner?.oid, 68);
    const sourceSack = after.sacks.find(row => row.object.oid === 65);
    const targetSack = after.sacks.find(row => row.object.oid === 68);
    assert.ok(sourceSack && targetSack);
    assert.equal(sourceSack.object.where, OBJ_INVENT);
    assert.equal(sourceSack.object.owt, 15);
    assert.equal(sourceSack.massByWeight, 15);
    assert.deepEqual(sourceSack.tree.contents.rows, []);
    assert.equal(targetSack.object.where, OBJ_INVENT);
    assert.equal(targetSack.object.owt, 55);
    assert.equal(targetSack.massByWeight, 55);
    assert.deepEqual(targetSack.tree.contents.rows.map(row => row.oid), [69]);
    assert.equal(after.timers.rows.filter(row => row.argOid === 66).length, 0);
    const survivorTimer = after.timers.rows.filter(row => row.argOid === 69);
    assert.equal(survivorTimer.length, 1);
    assert.equal(survivorTimer[0].kind, 3);
    assert.equal(survivorTimer[0].func_index, 7);
    assert.equal(survivorTimer[0].timeout, 26);
    assert.equal(after.terminal?.queueLength, 0);
    assert.deepEqual(after.terminal?.queue, []);
    assert.deepEqual(after.inventory.rows.map(row => row.oid), before.inventory.rows.map(row => row.oid));
    assert.deepEqual([after.globals.ux, after.globals.uy], [before.globals.ux, before.globals.uy]);
    assert.equal(after.globals.uhp, before.globals.uhp);
});
