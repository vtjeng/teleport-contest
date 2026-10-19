// Proposed source-only qualification fixture. DO NOT run as part of this task.
// This file is a review artifact for the existing special-level object caller.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLNO, OBJ_BURIED, OBJ_CONTAINED, OBJ_FLOOR, OBJ_INVENT, OBJ_MINVENT, OBJ_MIGRATING, ROWNO, SHRINK_GLOB, TIMER_OBJECT, TOPLINE_NEED_MORE, Upolyd } from '../../js/const.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import { lspo_object, new_sp_lev_object_context } from '../../js/sp_lev_object.js';
import { LARGE_BOX, GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import * as random from '../../js/rng.js';
import { cloneIsaacContext, getRngLog } from '../../js/rng.js';
import { objectGenerationEnv } from '../../js/object_generation.js';

const fixedInput = Object.freeze({
    seed: 671903,
    instantUTC: '2026-10-17T00:00:00Z',
    datetime: '20261016200000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,menustyle:traditional\n',
});
const outputRoot = join(dirname(fileURLToPath(import.meta.url)), 'runs');
mkdirSync(outputRoot, { recursive: true });
const outputDir = process.env.QUALIFICATION_OUTPUT_DIR
    ? resolve(process.env.QUALIFICATION_OUTPUT_DIR)
    : mkdtempSync(join(outputRoot, 'invocation-'));
mkdirSync(outputDir, { recursive: true });
const safeJSON = (value) => JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item, 2) + '\n';
const save = (name, value) => writeFileSync(join(outputDir, `${name}.json`),
    safeJSON(value), { flag: 'wx' });
const saveRequired = (name, value) => {
    try { save(name, value); }
    catch (error) { saveFailure.push(captureError(error)); receiptFailure = error; throw error; }
};
const saveFailure = [];
const primary = { error: null };
const captureError = (error) => ({ name: error?.name ?? 'Error',
    message: String(error?.message ?? error), stack: String(error?.stack ?? ''),
    operation: error?.operation ?? null, otyp: error?.otyp ?? null });
const attempt = new NethackGame({ ...fixedInput });
const display = new GameDisplay(null);
const oldOnEmptyQueue = display.onEmptyQueue;
attempt._pendingDisplay = display;
const acknowledgements = [];
let liveState = null;
let context = null;
let callback = null;
let targetIntent = false;
let targetEntered = false;
let targetIntentCount = 0;
let targetEnteredCount = 0;
let firstIntentCount = 0;
let firstEnteredCount = 0;
let outerIntentCount = 0;
let outerEnteredCount = 0;
let firstDescriptor = null;
let secondDescriptor = null;
let parentDescriptor = null;
let baseline = null;
let preSecondTimerArgRefs = [];
let receiptFailure = null;
let firstReturned = null;
let secondReturned = null;
let parentReturned = null;
let resultScalar = null;
let phase = 'before-start';
const rngReceipt = (state = liveState ?? game) => ({
    core: state?.coreCtx ? cloneIsaacContext(state.coreCtx) : null,
    display: state?.displayCtx ? cloneIsaacContext(state.displayCtx) : null,
    log: [...getRngLog()],
});
const timerReceipt = (state, objects) => {
    const timers = [];
    for (let timer = state?.gt?.timer_base ?? null; timer; timer = timer.next) {
        timers.push({ kind: timer.kind, func_index: timer.func_index,
            timeout: timer.timeout,
            argIsObject: Boolean(timer.arg && typeof timer.arg === 'object'),
            argOid: timer.arg && typeof timer.arg === 'object'
                ? timer.arg.o_id ?? null : null,
            argIsTargetObject: objects.some((object) => timer.arg === object),
            shrinkGlobTimer: timer.kind === TIMER_OBJECT
                && timer.func_index === SHRINK_GLOB,
            argType: typeof timer.arg });
    }
    return timers;
};
const objectReceipt = (object) => object ? ({
    oid: object.o_id, otyp: object.otyp, oclass: object.oclass, quan: object.quan,
    where: object.where, ox: object.ox, oy: object.oy, owt: object.owt,
    globby: object.globby, age: object.age, timed: object.timed,
    nomerge: object.nomerge, no_charge: object.no_charge, how_lost: object.how_lost,
    nobjOid: object.nobj?.o_id ?? null,
    unionOwner: object.where === OBJ_FLOOR ? 'nexthere'
        : object.where === OBJ_CONTAINED ? 'ocontainer'
            : object.where === OBJ_MINVENT ? 'ocarry'
                : object.where === OBJ_INVENT ? 'inventory-owner-not-projected'
                    : object.where === OBJ_BURIED ? 'burial-owner-not-projected'
                        : object.where === OBJ_MIGRATING ? 'migration-owner-not-projected' : 'not-observed',
    unionTargetOid: object.where === OBJ_FLOOR ? object.nexthere?.o_id ?? null
        : object.where === OBJ_CONTAINED ? object.ocontainer?.o_id ?? null
            : object.where === OBJ_MINVENT ? object.ocarry?.m_id ?? null : null,
    blessed: object.blessed, cursed: object.cursed,
}) : null;
const chainReceipt = (head, link = 'nobj') => {
    const rows = [];
    const seen = new Set();
    for (let object = head ?? null; object; object = object[link]) {
        if (seen.has(object)) { rows.push({ cycleAtOid: object.o_id }); break; }
        seen.add(object);
        rows.push(objectReceipt(object));
    }
    return rows;
};
const gridReceipt = (grid) => {
    const entries = [];
    for (let x = 0; x < (grid?.length ?? 0); ++x) {
        for (let y = 0; y < (grid[x]?.length ?? 0); ++y) {
            const head = grid[x][y] ?? null;
            if (head) entries.push({ x, y, chain: chainReceipt(head, 'nexthere') });
        }
    }
    return entries;
};
const stateReceipt = (state) => {
    const hero = state?.u ?? null;
    const x = hero?.ux;
    const y = hero?.uy;
    const floorHere = Number.isInteger(x) && Number.isInteger(y)
        ? state.level?.objects?.[x]?.[y] ?? null : null;
    const things = [callback?.parent, callback?.firstChild,
        callback?.firstSurvivor, callback?.secondSurvivor].filter(Boolean);
    return {
        phase, liveGameAlias: state === game,
        hero: hero ? { x, y, hp: hero.uhp, maxhp: hero.uhpmax,
            role: state?.urole?.filecode ?? null, race: state?.urace?.filecode ?? null,
            polymorphed: Upolyd(hero), multiPresent: Object.hasOwn(state, 'multi'),
            multiType: typeof state.multi, multiRaw: state.multi,
            multiEffective: state.multi ?? 0,
            gameoverPresent: Object.hasOwn(state?.program_state ?? {}, 'gameover'),
            gameoverType: typeof state?.program_state?.gameover,
            gameoverRaw: state?.program_state?.gameover,
            gameoverEffective: Boolean(state?.program_state?.gameover) } : null,
        stateIsInitial: baseline ? state === baseline.stateRef : null,
        levelIsInitial: baseline ? state?.level === baseline.levelRef : null,
        heroIsInitial: baseline ? state?.u === baseline.heroRef : null,
        levelDescriptorIsInitial: baseline ? state?.u?.uz === baseline.uzRef : null,
        heroPositionIsInitial: baseline ? x === baseline.x && y === baseline.y : null,
        levelIdentity: state?.u?.uz ? { dnum: state.u.uz.dnum,
            dlevel: state.u.uz.dlevel } : null,
        descriptorResolution: baseline ? { relativeX: baseline.coordinateRef?.x ?? null,
            relativeY: baseline.coordinateRef?.y ?? null,
            resolvedX: baseline.coordinateRef ? baseline.coordinateRef.x + baseline.frame.xstart : null,
            resolvedY: baseline.coordinateRef ? baseline.coordinateRef.y + baseline.frame.ystart : null,
            resolvesToCurrentHero: baseline.coordinateRef
                ? baseline.coordinateRef.x + baseline.frame.xstart === x
                    && baseline.coordinateRef.y + baseline.frame.ystart === y : null } : null,
        levelBranch: state?.u?.uz ? { dnum: state.u.uz.dnum,
            dlevel: state.u.uz.dlevel } : null,
        contextDepth: context?.containers?.length ?? null,
        callCounts: { outerIntentCount, outerEnteredCount, firstIntentCount,
            firstEnteredCount, targetIntent, targetIntentCount, targetEntered,
            targetEnteredCount },
        callback: callback ? { entered: callback.entered,
            envStateIsLive: callback.envStateIsLive,
            envContextIsShared: callback.envContextIsShared,
            envFrameIsCanonical: callback.envFrameIsCanonical,
            envRandomNamespaceIsCanonical: callback.envRandomNamespaceIsCanonical,
            envHookNames: callback.envHookNames,
            firstIntentCount, firstEnteredCount,
            targetIntent: callback.targetIntent, targetIntentCount: callback.targetIntentCount,
            targetEntered: callback.targetEntered, targetEnteredCount: callback.targetEnteredCount,
            parentCoordinateIsCanonical: Boolean(parentDescriptor?.coordinate === baseline?.coordinateRef),
            firstCoordinateIsCanonical: Boolean(firstDescriptor?.coordinate === baseline?.coordinateRef),
            secondCoordinateIsCanonical: Boolean(secondDescriptor?.coordinate === baseline?.coordinateRef),
            preSecondTimerArguments: callback.preSecondTimerArgSnapshots ?? null,
            newShrinkTimerCandidates: callback.newShrinkTimerCandidates ?? null,
            firstReturnScalar: callback.firstReturnScalar ?? null,
            parent: objectReceipt(callback.parent),
            firstChild: objectReceipt(callback.firstChild),
            firstSurvivor: objectReceipt(callback.firstSurvivor),
            secondSurvivor: objectReceipt(callback.secondSurvivor),
            parentChildren: chainReceipt(callback.parent?.cobj),
            parentWeight: callback.parent?.owt ?? null,
            floorHere: chainReceipt(floorHere, 'nexthere'),
            error: callback.error } : null,
        inventory: chainReceipt(state?.invent),
        floor: chainReceipt(state?.level?.objlist),
        floorGrid: gridReceipt(state?.level?.objects),
        buried: chainReceipt(state?.level?.buriedobjlist),
        migrating: chainReceipt(state?.gm?.migrating_objs),
        timers: timerReceipt(state, things),
        screen: state?.nhDisplay?.serialize?.() ?? '',
        topMessage: state?.nhDisplay?.topMessage ?? null,
        topline: state?.nhDisplay?.toplin ?? null,
        queuedInput: state?.nhDisplay?.inputQueueLength ?? null,
        inputQueue: Array.isArray(state?.nhDisplay?.terminal?._inputQueue)
            ? [...state.nhDisplay.terminal._inputQueue] : null,
        inputResolverPresent: Boolean(state?.nhDisplay?.terminal?._inputResolver),
        waitingInput: state?.nhDisplay?.isWaitingForInput ?? null,
        pendingMessage: state?._pending_message ?? null,
        rng: rngReceipt(),
    };
};
const durable = (name) => {
    try { saveRequired(name, stateReceipt(liveState ?? game)); }
    catch (error) {
        saveFailure.push(captureError(error));
        receiptFailure = error;
        throw error; // pre-call receipt failure is terminal; never continue to the target.
    }
};
const timerArgRefs = (state) => {
    const refs = [];
    for (let timer = state?.gt?.timer_base ?? null; timer; timer = timer.next)
        if (timer.kind === TIMER_OBJECT && timer.func_index === SHRINK_GLOB
            && timer.arg && typeof timer.arg === 'object') refs.push(timer.arg);
    return refs;
};
const newShrinkTimerCandidates = (state) => {
    const candidates = [];
    for (let timer = state?.gt?.timer_base ?? null; timer; timer = timer.next) {
        if (timer.kind === TIMER_OBJECT && timer.func_index === SHRINK_GLOB
            && timer.arg && typeof timer.arg === 'object'
            && !preSecondTimerArgRefs.includes(timer.arg)) {
            candidates.push({ timerKind: timer.kind, funcIndex: timer.func_index,
                timeout: timer.timeout, object: objectReceipt(timer.arg),
                exactTimerArgReferenceObserved: true });
        }
    }
    return candidates;
};

display.onEmptyQueue = () => {
    const row = { phase, screen: display.serialize(), topMessage: display.topMessage,
        topline: display.toplin, waitEpoch: display.waitEpoch,
        queuedInput: display.inputQueueLength, waitingInput: display.isWaitingForInput,
        pendingMessage: game?._pending_message ?? null,
        inputQueue: Array.isArray(display.terminal?._inputQueue)
            ? [...display.terminal._inputQueue] : null,
        resolverPresent: Boolean(display.terminal?._inputResolver), rng: rngReceipt() };
    if (display.toplin === TOPLINE_NEED_MORE
        && row.screen.includes('--More--') && acknowledgements.length < 16) {
        acknowledgements.push(row);
        saveRequired(`more-${String(acknowledgements.length).padStart(2, '0')}`, row);
        return 13;
    }
    row.rejected = display.toplin !== TOPLINE_NEED_MORE
        ? 'input boundary is not TOPLINE_NEED_MORE'
        : !row.screen.includes('--More--')
            ? 'More marker was not rendered' : 'More acknowledgement cap reached';
    acknowledgements.push(row);
    saveRequired('unknown-input-boundary', row);
    throw new Error(`unsupported non-More input boundary: ${row.rejected}`);
};

try {
    saveRequired('before-start', { fixedInput, targetIntent: false, targetEntered: false, outerIntentCount: 0, outerEnteredCount: 0 });
    phase = 'starting';
    const started = await attempt.start();
    liveState = game; // start() calls resetGame(); preserve the live exported binding.
    baseline = { stateRef: liveState, levelRef: liveState.level, heroRef: liveState.u, uzRef: liveState.u?.uz,
        x: liveState.u?.ux, y: liveState.u?.uy, frame: null, coordinateRef: null }; 
    phase = 'started';
    saveRequired('started', stateReceipt(liveState));
    if (!started) throw new Error('NethackGame.start returned false');
    const u = liveState.u;
    if (!u || !Number.isInteger(u.ux) || !Number.isInteger(u.uy)
        || !liveState.level?.at?.(u.ux, u.uy))
        throw new Error('normal start did not produce a coherent hero/current level');
    if (Boolean(liveState.program_state?.gameover) || !(liveState.u?.uhp > 0))
        throw new Error('normal start did not retain a live positive-HP hero');
    const frame = Object.freeze({ xstart: 1, ystart: 0,
        xsize: COLNO - 1, ysize: ROWNO }); // mklev.reset_xystart_size source frame.
    const target = Object.freeze({ x: u.ux - frame.xstart,
        y: u.uy - frame.ystart }); // get_location adds frame origin: resolves exactly to hero.
    baseline.frame = frame;
    baseline.coordinateRef = target;
    if (target.x < 0 || target.x >= frame.xsize
        || target.y < 0 || target.y >= frame.ysize)
        throw new Error('hero tile is outside canonical whole-level coordinate frame');
    context = new_sp_lev_object_context();
    const runtimeEnv = objectGenerationEnv({ state: liveState, spObjectContext: context,
        frame, random }); // canonical providers plus the complete live RNG namespace.
    parentDescriptor = { id: LARGE_BOX, coordinate: target, quantity: 1,
        contents: async (parent, env) => {
            phase = 'contents-callback';
            callback = { entered: true, envStateIsLive: env.state === liveState,
                envContextIsShared: env.spObjectContext === context,
                envFrameIsCanonical: env.frame === frame,
                envRandomNamespaceIsCanonical: env.random === random,
                envHookNames: Object.keys(env.hooks ?? {}).sort(),
                targetIntent: false, targetIntentCount: 0,
                targetEntered: false, targetEnteredCount: 0, parent, firstChild: null,
                firstSurvivor: null, secondSurvivor: null, error: null };
            durable('callback-entry-before-child');
            try {
                phase = 'first-child-intent';
                firstDescriptor = { id: GLOB_OF_GRAY_OOZE, coordinate: target, quantity: 1 };
                callback.firstIntentCount = ++firstIntentCount;
                durable('first-child-intent-before-call');
                callback.firstEnteredCount = ++firstEnteredCount;
                phase = 'first-child-call';
                callback.firstSurvivor = await lspo_object(firstDescriptor, null, env);
                callback.firstChild = callback.firstSurvivor;
                callback.firstReturnScalar = { returned: callback.firstSurvivor != null,
                    oid: callback.firstSurvivor?.o_id ?? null,
                    otyp: callback.firstSurvivor?.otyp ?? null };
                saveRequired('first-child-returned-scalar', callback.firstReturnScalar);
                durable('after-first-child-before-second-intent');
                preSecondTimerArgRefs = timerArgRefs(env.state);
                callback.preSecondTimerArgSnapshots = preSecondTimerArgRefs.map(objectReceipt);
                phase = 'second-child-intent';
                callback.targetIntent = targetIntent = true;
                callback.targetIntentCount = ++targetIntentCount;
                durable('second-child-intent-before-call');
                secondDescriptor = { id: GLOB_OF_GRAY_OOZE, coordinate: target, quantity: 1 };
                callback.targetEntered = targetEntered = true;
                callback.targetEnteredCount = ++targetEnteredCount;
                phase = 'second-child-call';
                secondReturned = await lspo_object(secondDescriptor, null, env);
                callback.secondSurvivor = secondReturned;
                resultScalar = { call: 'second-child', returned: secondReturned != null,
                    oid: secondReturned?.o_id ?? null, otyp: secondReturned?.otyp ?? null };
                saveRequired('second-child-returned-scalar', resultScalar);
                phase = 'second-child-returned';
                durable('second-child-returned');
            } catch (error) {
                callback.error = captureError(error);
                if (error !== receiptFailure) {
                    resultScalar = { call: targetEntered ? 'second-child' : 'first-child',
                        threw: true, error: captureError(error) };
                    try { saveRequired('child-threw-scalar', resultScalar); }
                    catch (saveError) { /* preserve the actual child error */ }
                }
                try { callback.newShrinkTimerCandidates = targetEntered
                    ? newShrinkTimerCandidates(env.state) : []; }
                catch (observerError) {
                    saveFailure.push(captureError(observerError));
                    callback.newShrinkTimerCandidates = null;
                }
                phase = 'contents-callback-error';
                if (error !== receiptFailure) {
                    try { durable('contents-callback-error'); }
                    catch (saveError) { /* preserve the callback's first error below */ }
                }
                throw error;
            }
        },
    };
    phase = 'parent-call-intent';
    outerIntentCount = 1;
    durable('before-parent-call');
    outerEnteredCount = 1;
    parentReturned = await lspo_object(parentDescriptor, null, runtimeEnv);
    phase = 'parent-returned';
    resultScalar = { call: 'outer-parent', returned: parentReturned != null,
        oid: parentReturned?.o_id ?? null, otyp: parentReturned?.otyp ?? null };
    saveRequired('outer-parent-returned-scalar', resultScalar);
    durable('parent-returned');
} catch (error) {
    if (error === receiptFailure) {
        phase = 'receipt-failure';
    } else {
        primary.error = error;
        phase = 'primary-error';
    }
    // Preserve the scalar failure before optional projection can fail.
    try { save('outer-operation-error-scalar', {
        call: outerEnteredCount ? 'outer-parent' : 'pre-entry',
        threw: true, outerEnteredCount, firstEnteredCount, targetEnteredCount,
        primaryError: primary.error ? captureError(primary.error) : null,
        receiptError: receiptFailure ? captureError(receiptFailure) : null,
        resultScalar }); }
    catch (scalarSaveError) { saveFailure.push(captureError(scalarSaveError)); }
    try { save(error === receiptFailure ? 'receipt-failure' : 'primary-error', {
        primaryError: primary.error ? captureError(primary.error) : null,
        receiptError: receiptFailure ? captureError(receiptFailure) : null,
        targetIntent, targetIntentCount, targetEntered, targetEnteredCount,
        outerIntentCount, outerEnteredCount, firstIntentCount, firstEnteredCount, resultScalar,
        state: stateReceipt(liveState ?? game) }); }
    catch (saveError) { saveFailure.push(captureError(saveError)); }
} finally {
    display.onEmptyQueue = oldOnEmptyQueue; // restore exact prior value, including null.
    liveState = game; // refresh alias in case start/reset replaced the singleton.
    phase = primary.error ? 'finally-after-error' : 'finally';
    try { save('final', { primary: primary.error ? captureError(primary.error) : null,
        receiptFailure: receiptFailure ? captureError(receiptFailure) : null,
        handlerRestored: display.onEmptyQueue === oldOnEmptyQueue,
        resultScalar, targetIntent, targetIntentCount, targetEntered,
        targetEnteredCount, outerIntentCount, outerEnteredCount,
        firstIntentCount, firstEnteredCount, acknowledgements,
        state: stateReceipt(liveState), saveFailure }); }
    catch (saveError) { saveFailure.push(captureError(saveError)); }
}
if (primary.error) throw primary.error;
if (receiptFailure) throw receiptFailure;
if (saveFailure.length) throw new AggregateError(
    saveFailure.map((entry) => new Error(entry.message)),
    'receipt persistence failed after the primary operation',
);
