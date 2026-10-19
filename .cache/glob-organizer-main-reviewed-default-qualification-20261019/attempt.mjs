import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CMDQ_KEY, CQ_CANNED, CQ_REPEAT, MENU_TRADITIONAL, OBJ_FREE, OBJ_INVENT,
    SHRINK_GLOB, TIMER_OBJECT, Upolyd,
} from '../../js/const.js';
import { cmdq_add_key, cmdq_peek } from '../../js/cmd.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import { addinv_nomerge, addinv_runtime, doorganize, mergable } from '../../js/invent.js';
import { mksobj } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import { TOPLINE_NEED_MORE } from '../../js/tty_message.js';
import * as canonicalRNGnamespace from '../../js/rng.js';

const fixedInput = {
    seed: 671903,
    instantUTC: '2026-10-17T00:00:00Z',
    datetime: '20261016200000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,menustyle:traditional\n',
};
const root = dirname(fileURLToPath(import.meta.url));
const runs = join(root, 'runs');
mkdirSync(runs, { recursive: true });
const outputDir = mkdtempSync(join(runs, 'invocation-'));
const json = (value) => JSON.stringify(value, (_key, child) =>
    typeof child === 'bigint' ? child.toString() : child, 2) + '\n';
const save = (name, value) => writeFileSync(join(outputDir, `${name}.json`), json(value));
const errorRecord = (error) => ({ name: error?.name ?? 'Error',
    message: String(error?.message ?? error), stack: String(error?.stack ?? '') });
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const linkRows = (head, link) => {
    const rows = [], seen = new Set();
    for (let node = head ?? null; node; node = node[link]) {
        if (seen.has(node)) return { rows, cycleDetected: true };
        seen.add(node);
        rows.push(node);
    }
    return { rows, cycleDetected: false };
};
const ids = (head, link) => linkRows(head, link).rows.map((obj) => obj.o_id);
const row = (obj, inventoryIds) => obj ? ({
    o_id: obj.o_id, otyp: obj.otyp, oclass: obj.oclass, where: obj.where,
    invlet: obj.invlet, quan: obj.quan, globby: obj.globby,
    age: obj.age, owt: obj.owt, timed: obj.timed,
    blessed: obj.blessed, cursed: obj.cursed, bknown: obj.bknown,
    nomergePresent: has(obj, 'nomerge'), nomerge: obj.nomerge,
    oartifact: obj.oartifact, oextraPresent: has(obj, 'oextra'),
    oextraOnamePresent: has(obj.oextra ?? {}, 'oname'),
    oextraOname: obj.oextra?.oname,
    unpaid: obj.unpaid, no_charge: obj.no_charge, how_lost: obj.how_lost,
    nobjId: obj.nobj?.o_id ?? null,
    inInventory: inventoryIds.includes(obj.o_id),
}) : null;
const queueRows = (state, q) => (state.command_queue?.[q] ?? []).map((item) => ({
    typ: item.typ, key: item.key, value: item.value,
}));

const nhGame = new NethackGame({ ...fixedInput });
const display = new GameDisplay(null);
const priorEmptyQueueHandler = display.onEmptyQueue;
const moreAcknowledgements = [];
const terminalDiagnostics = () => ({
    waitEpoch: display.waitEpoch,
    inputQueueLength: display.inputQueueLength,
    isWaitingForInput: display.isWaitingForInput,
    inputQueue: Array.isArray(display.terminal?._inputQueue) ? display.terminal._inputQueue.slice() : null,
    resolverPresent: typeof display.terminal?._inputResolver === 'function',
    resolverType: typeof display.terminal?._inputResolver,
    activeOptionsPresent: Boolean(display.terminal?._activeOptions),
});
const boundaryRecord = (kind, number = null) => {
    state = game;
    return { kind, number, topline: display.toplin, screen: display.serialize(),
        input: { pendingMessagePresent: has(state ?? {}, '_pending_message'),
            pendingMessageType: typeof state?._pending_message, pendingMessage: typeof state?._pending_message === 'undefined' ? { tag: 'undefined' } : { tag: 'value', value: state._pending_message },
            commandQueue: { canned: queueRows(state, CQ_CANNED), repeat: queueRows(state, CQ_REPEAT) },
            terminal: terminalDiagnostics() },
        copiedRngLog: canonicalRNGnamespace.getRngLog().slice(),
        coreContext: state?.coreCtx ? canonicalRNGnamespace.cloneIsaacContext(state.coreCtx) : null,
        displayContext: state?.displayCtx ? canonicalRNGnamespace.cloneIsaacContext(state.displayCtx) : null };
};
display.onEmptyQueue = () => {
    state = game;
    const screen = display.serialize();
    if (display.toplin !== TOPLINE_NEED_MORE || !screen.includes('--More--')) {
        save('boundary-unknown-empty-input', boundaryRecord('unknown-empty-input-boundary'));
        throw new Error('unrecognized empty-input boundary; full boundary receipt saved');
    }
    if (moreAcknowledgements.length >= 16) {
        save('boundary-rendered-more-cap', boundaryRecord('rendered-more-cap-reached', moreAcknowledgements.length + 1));
        throw new Error('rendered More acknowledgement cap reached; full boundary receipt saved');
    }
    const ack = boundaryRecord('rendered-more-acknowledgement', moreAcknowledgements.length + 1);
    const name = 'ack-' + String(moreAcknowledgements.length + 1).padStart(2, '0');
    save(name, ack);
    moreAcknowledgements.push({ file: name + '.json', screen, topline: display.toplin,
        waitEpoch: display.waitEpoch, input: terminalDiagnostics() });
    return 32;
};
nhGame._pendingDisplay = display;
let state = null;
let started = false;
let phase = 'pre-startup';
let setup = null;
let primaryError = null;
let observerError = null;
let restoreError = null;
let saveError = null;
let allowOptionalProjection = true;
let actualEntered = false;
let invocationCount = 0;
let targetResult = null;
let beforeTarget = null;
let afterTarget = null;
let heroRef = null;
let levelRef = null;
let levelDescriptorRef = null;

function timerRows(objs, snapshotState) {
    const wanted = new Map(objs.filter(Boolean).map((obj) => [obj.o_id, obj]));
    const timers = [], seen = new Set();
    let cycleDetected = false;
    for (let timer = snapshotState?.gt?.timer_base ?? null; timer; timer = timer.next) {
        if (seen.has(timer)) { cycleDetected = true; break; }
        seen.add(timer);
        if (wanted.has(timer.arg?.o_id)) {
            const obj = wanted.get(timer.arg.o_id);
            timers.push({ o_id: timer.arg.o_id, argIsObject: timer.arg === obj,
                timeout: timer.timeout, kind: timer.kind, func_index: timer.func_index,
                isObjectTimer: timer.kind === TIMER_OBJECT,
                isShrinkGlob: timer.func_index === SHRINK_GLOB,
                needs_fixup: timer.needs_fixup });
        }
    }
    return { rows: timers, cycleDetected };
}
function project(label) {
    const inventory = linkRows(state?.invent, 'nobj');
    const inventoryIds = inventory.rows.map((obj) => obj.o_id);
    const idsWanted = [setup?.first?.o_id, setup?.second?.o_id].filter((id) => id !== undefined);
    const objects = idsWanted.map((id) => setup.first?.o_id === id ? setup.first : setup.second);
    const timers = timerRows(objects, state);
    return {
        label,
        hero: {
            uhp: state?.u?.uhp,
            gameoverPresent: has(state?.program_state ?? {}, 'gameover'),
            gameoverType: typeof state?.program_state?.gameover,
            gameoverRaw: typeof state?.program_state?.gameover === 'undefined' ? { tag: 'undefined' } : { tag: 'value', value: state.program_state.gameover },
            gameover: Boolean(state?.program_state?.gameover),
            multiPresent: has(state ?? {}, 'multi'), multiType: typeof state?.multi,
            multiRaw: typeof state?.multi === 'undefined' ? { tag: 'undefined' } : { tag: 'value', value: state.multi },
            multi: state?.multi ?? 0, upolyd: state?.u ? Upolyd(state.u) : null,
            actorSameIdentity: state?.u === heroRef,
            currentLevelSameIdentity: state?.level === levelRef,
            levelDescriptorSameIdentity: state?.u?.uz === levelDescriptorRef,
            level: state?.u?.uz ? { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel } : null,
            moves: state?.moves,
        },
        inventory: { ids: inventoryIds, cycleDetected: inventory.cycleDetected,
            rows: inventory.rows.map((obj) => row(obj, inventoryIds)),
            objects: objects.map((obj) => row(obj, inventoryIds)) },
        timers,
        input: {
            invletConstantPresent: has(state?.flags ?? {}, 'invlet_constant'),
            invletConstantType: typeof state?.flags?.invlet_constant,
            invletConstantRaw: typeof state?.flags?.invlet_constant === 'undefined' ? { tag: 'undefined' } : { tag: 'value', value: state.flags.invlet_constant },
            inDoAgain: state?.in_doagain,
            canned: queueRows(state, CQ_CANNED), repeat: queueRows(state, CQ_REPEAT),
            displayTopline: display.toplin, screen: display.serialize(),
            waitEpoch: display.waitEpoch,
            inputQueueLength: display.terminal.inputQueueLength,
            isWaitingForInput: display.terminal.isWaitingForInput,
            pendingMessage: { present: has(state ?? {}, '_pending_message'), type: typeof state?._pending_message, value: typeof state?._pending_message === 'undefined' ? { tag: 'undefined' } : { tag: 'value', value: state._pending_message } },
            terminal: terminalDiagnostics(), moreAcknowledgements: moreAcknowledgements.slice(),
        },
        rngLog: canonicalRNGnamespace.getRngLog().slice(),
        coreContext: state?.coreCtx ? canonicalRNGnamespace.cloneIsaacContext(state.coreCtx) : null,
        displayContext: state?.displayCtx ? canonicalRNGnamespace.cloneIsaacContext(state.displayCtx) : null,
        screens: nhGame.getScreens().slice(),
    };
}
try {
    save('00-before-startup', { fixedInput, phase, started,
        displayTopline: display.toplin, screen: display.serialize(),
        inputQueueLength: display.terminal.inputQueueLength,
        waitEpoch: display.waitEpoch,
        preStartLiveBinding: { stateExists: Boolean(state), gameRefExists: Boolean(game) },
        rngLog: canonicalRNGnamespace.getRngLog().slice() });
    try { started = Boolean(await nhGame.start()); }
    finally { state = game; }
    if (!started) throw new Error('canonical startup did not return a live game');
    heroRef = state.u;
    levelRef = state.level;
    levelDescriptorRef = state.u?.uz;
    phase = 'post-startup';
    save('01-poststartup', project('poststartup'));
    assert.equal(String(state.urole?.name?.m ?? '').toLowerCase(), 'archeologist');
    assert.equal(String(state.urace?.noun ?? '').toLowerCase(), 'human');
    assert.equal(state.flags?.female, false);
    assert.equal(state.u?.ualign?.type, 0);
    assert.equal(state.gp?.preferred_pet, 'n');
    assert.equal(Upolyd(state.u), false);
    assert.equal(Boolean(state.program_state?.gameover), false);
    assert.ok(state.u?.uhp > 0);
    assert.equal(state.flags?.menu_style, MENU_TRADITIONAL);
    assert.equal(state.flags?.invlet_constant, true);
    assert.equal(Boolean(state.iflags?.menu_requested), false);

    const beforeInventory = linkRows(state.invent, 'nobj');
    if (beforeInventory.cycleDetected) throw new Error('starting inventory has a cycle');
    const env = objectGenerationEnv({ state, random: canonicalRNGnamespace });
    const first = mksobj(GLOB_OF_GRAY_OOZE, true, false, env);
    setup = { env, first, second: null, initialInventoryIds: beforeInventory.rows.map((obj) => obj.o_id),
        firstNomergeBefore: { present: has(first, 'nomerge'), value: first.nomerge } };
    if (first.where !== OBJ_FREE || first.otyp !== GLOB_OF_GRAY_OOZE
        || !first.globby || first.quan !== 1 || !(first.age > 0)
        || !(first.owt > 0) || !(first.timed > 0))
        throw new Error('real first mksobj default did not yield a free one-unit gray glob');
    await addinv_runtime(first, env);
    const firstAfter = linkRows(state.invent, 'nobj');
    if (first.where !== OBJ_INVENT || !firstAfter.rows.includes(first)
        || firstAfter.cycleDetected)
        throw new Error('real addinv_runtime did not place first glob in the inventory chain');

    const second = mksobj(GLOB_OF_GRAY_OOZE, true, false, env);
    setup.second = second;
    setup.secondNomergeBefore = { present: has(second, 'nomerge'), value: second.nomerge };
    if (second.where !== OBJ_FREE || second.otyp !== GLOB_OF_GRAY_OOZE
        || !second.globby || second.quan !== 1 || !(second.age > 0)
        || !(second.owt > 0) || !(second.timed > 0))
        throw new Error('real second mksobj default did not yield a free one-unit gray glob');
    await addinv_nomerge(second, env);
    const inventory = linkRows(state.invent, 'nobj');
    const invlets = inventory.rows.map((obj) => obj.invlet);
    if (inventory.cycleDetected || first.where !== OBJ_INVENT || second.where !== OBJ_INVENT
        || !inventory.rows.includes(first) || !inventory.rows.includes(second)
        || !beforeInventory.rows.every((obj) => inventory.rows.includes(obj))
        || first.o_id === second.o_id || first.invlet === second.invlet
        || !/^[A-Za-z]$/u.test(first.invlet) || !/^[A-Za-z]$/u.test(second.invlet)
        || second.nomerge === true || !mergable(first, second, env))
        throw new Error('actual inventory writers did not retain two distinct mergeable, lettered glob rows');
    if (state.flags.invlet_constant !== true)
        throw new Error('doorganize would reassign letters before the queued selection');
    if (state.in_doagain)
        throw new Error('ordinary doorganize queued input would be routed to CQ_REPEAT');
    if (cmdq_peek(CQ_CANNED, state) !== null || cmdq_peek(CQ_REPEAT, state) !== null)
        throw new Error('normal command queue is not empty before binding the two source-owned answers');
    setup.inputMap = [
        { owner: 'js/invent.js:getobj via cmdq_pop(CQ_CANNED)', keyCode: second.invlet.charCodeAt(0),
            key: second.invlet, selectedObjectId: second.o_id },
        { owner: 'js/cmd.js:yn_function(addcmdq=true) via cmdq_peek/pop(CQ_CANNED)',
            keyCode: first.invlet.charCodeAt(0), key: first.invlet,
            destinationObjectId: first.o_id },
    ];
    setup.defaultContract = { menuStyle: state.flags.menu_style,
        invletConstant: state.flags.invlet_constant,
        inDoAgain: state.in_doagain,
        actualInvlets: invlets,
        firstNomergeBefore: setup.firstNomergeBefore,
        secondNomergeBefore: setup.secondNomergeBefore,
        secondNomergeAfter: { present: has(second, 'nomerge'), value: second.nomerge },
        pureMergable: mergable(first, second, env) };
    save('02-source-created-pair-before-input', project('pair-ready-before-input'));

    const expectedBefore = {
        entry: 'await doorganize(state) — exported public entry; no private helper/provider replacement',
        invocationCount: 0, actualEntered: false,
        selectedKey: setup.inputMap[0], destinationKey: setup.inputMap[1],
        inventoryIds: ids(state.invent, 'nobj'), firstId: first.o_id, secondId: second.o_id,
        currentLevelIdentity: state.level === levelRef, heroIdentity: state.u === heroRef,
        queueBefore: { canned: queueRows(state, CQ_CANNED), repeat: queueRows(state, CQ_REPEAT) },
        sourceInputOwners: ['getobj consumes first CQ_CANNED key', 'yn_function consumes next CQ_CANNED key'],
    };
    save('03-before-target-intent-count-zero', expectedBefore);
    cmdq_add_key(CQ_CANNED, second.invlet.charCodeAt(0), state);
    cmdq_add_key(CQ_CANNED, first.invlet.charCodeAt(0), state);
    const queued = queueRows(state, CQ_CANNED);
    if (queued.length !== 2 || queued[0].typ !== CMDQ_KEY || queued[0].key !== second.invlet.charCodeAt(0)
        || queued[1].typ !== CMDQ_KEY || queued[1].key !== first.invlet.charCodeAt(0))
        throw new Error('source cmdq_add_key did not queue the exact observed selection and destination keys');
    beforeTarget = { ...project('before-target-with-canned-input'), intent: expectedBefore,
        sourceQueueKeys: queued };
    save('04-before-target-frozen-input', beforeTarget);
    const callIntent = { entry: 'await doorganize(state)', phase: 'immediately-before-call', actualEntered: false, invocationCount: 0, selectedKey: setup.inputMap[0], destinationKey: setup.inputMap[1], frozenInputReceipt: '04-before-target-frozen-input.json' };
    save('05-target-call-intent-count-zero', callIntent);
    phase = 'target-entry';
    actualEntered = true;
    invocationCount = 1;
    try {
        targetResult = { kind: 'returned', value: await doorganize(state) };
        phase = 'target-returned';
    } catch (error) {
        primaryError = errorRecord(error);
        targetResult = { kind: 'threw', error: primaryError };
        phase = 'target-threw';
    }
    try {
        save('06-target-scalar-return-or-throw', { phase, actualEntered, invocationCount,
            entry: 'doorganize(state)', targetResult, primaryError,
            remainingQueue: queueRows(state, CQ_CANNED) });
    } catch (error) {
        saveError = errorRecord(error);
        allowOptionalProjection = false;
    }
} catch (error) {
    primaryError ??= errorRecord(error);
    if (phase === 'pre-startup') phase = 'startup-or-before-startup-capture-failed';
    else if (!actualEntered) phase = 'setup-or-before-target-presave-failed';
    try { save('primary-error-before-optional-observation', { phase, started, actualEntered, invocationCount, primaryError }); }
    catch (saveFailure) { saveError = errorRecord(saveFailure); allowOptionalProjection = false; }
}
finally {
    try { display.onEmptyQueue = priorEmptyQueueHandler; }
    catch (error) { restoreError = errorRecord(error); }
}
try {
    if (state && allowOptionalProjection && !restoreError)
        afterTarget = project('after-target-finally-restored');
} catch (error) { observerError = errorRecord(error); }
const finalRecord = { fixedInput, phase, started, actualEntered, invocationCount,
    targetResult, primaryError, restoreError, observerError, saveError,
    setup: setup ? { firstId: setup.first?.o_id, secondId: setup.second?.o_id,
        originalInventoryIds: setup.initialInventoryIds, inputMap: setup.inputMap,
        defaultContract: setup.defaultContract } : null,
    beforeTarget, afterTarget, outputDir,
    handlerRestored: display.onEmptyQueue === priorEmptyQueueHandler };
try { save('07-final-restored-observation', { ...finalRecord, saveError }); }
catch (error) { saveError = errorRecord(error); }
console.log(JSON.stringify({ outputDir, phase, actualEntered, invocationCount,
    targetResult, primaryError, restoreError, observerError, saveError }));
