// Prospective source-only fixture. Do not execute under the proposal assignment.
// Ordinary public non-content lspo_object path: floor setup glob, then target glob.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLNO, OBJ_BURIED, OBJ_CONTAINED, OBJ_FLOOR, OBJ_INVENT, OBJ_MINVENT, OBJ_MIGRATING, LOST_NONE, ROWNO, SHRINK_GLOB, TIMER_OBJECT, TOPLINE_NEED_MORE, Upolyd } from '../../js/const.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import { lspo_object, new_sp_lev_object_context } from '../../js/sp_lev_object.js';
import { GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
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
const saveFailure = [];
let receiptFailure = null;
const saveRequired = (name, value) => {
    try { save(name, value); }
    catch (error) { saveFailure.push(captureError(error)); receiptFailure = error; throw error; }
};
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
let baseline = null;
let frame = null;
let coordinate = null;
let firstDescriptor = null;
let targetDescriptor = null;
let firstIntentCount = 0;
let firstEnteredCount = 0;
let targetIntentCount = 0;
let targetEnteredCount = 0;
let firstObject = null;
let targetObject = null;
let firstScalar = null;
let targetScalar = null;
let primaryError = null;
let targetTimerArgCandidates = null;
let phase = 'before-start';
let priorShrinkTimerArgs = [];
const rngReceipt = (state = liveState ?? game) => ({
    core: state?.coreCtx ? cloneIsaacContext(state.coreCtx) : null,
    display: state?.displayCtx ? cloneIsaacContext(state.displayCtx) : null,
    log: [...getRngLog()],
});
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
const timerReceipt = (state, targets) => {
    const timers = [];
    for (let timer = state?.gt?.timer_base ?? null; timer; timer = timer.next)
        timers.push({ kind: timer.kind, func_index: timer.func_index, timeout: timer.timeout,
            argIsObject: Boolean(timer.arg && typeof timer.arg === 'object'),
            argOid: timer.arg && typeof timer.arg === 'object' ? timer.arg.o_id ?? null : null,
            argIsFirst: Boolean(firstObject && timer.arg === firstObject),
            argIsTarget: Boolean(targetObject && timer.arg === targetObject),
            shrinkGlobTimer: timer.kind === TIMER_OBJECT && timer.func_index === SHRINK_GLOB,
            argType: typeof timer.arg });
    return timers;
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
    for (let timer = state?.gt?.timer_base ?? null; timer; timer = timer.next)
        if (timer.kind === TIMER_OBJECT && timer.func_index === SHRINK_GLOB
            && timer.arg && typeof timer.arg === 'object'
            && !priorShrinkTimerArgs.includes(timer.arg))
            candidates.push({ timerKind: timer.kind, funcIndex: timer.func_index,
                timeout: timer.timeout, object: objectReceipt(timer.arg),
                exactTimerArgReferenceObserved: true });
    return candidates;
};
const taggedRaw = (owner, key) => {
    const value = owner?.[key];
    return value === undefined ? { kind: 'undefined' }
        : { kind: typeof value, value };
};
const stateReceipt = (state) => {
    const hero = state?.u ?? null;
    const x = hero?.ux, y = hero?.uy;
    const floorHere = Number.isInteger(x) && Number.isInteger(y)
        ? state.level?.objects?.[x]?.[y] ?? null : null;
    const targets = [firstObject, targetObject].filter(Boolean);
    return {
        phase, liveGameAlias: state === game,
        hero: hero ? { x, y, hp: hero.uhp, maxhp: hero.uhpmax,
            role: state?.urole?.filecode ?? null, race: state?.urace?.filecode ?? null,
            polymorphed: Upolyd(hero), multiPresent: Object.hasOwn(state, 'multi'),
            multiType: typeof state.multi, multiRaw: taggedRaw(state, 'multi'), multiEffective: state.multi ?? 0,
            gameoverPresent: Object.hasOwn(state?.program_state ?? {}, 'gameover'),
            gameoverType: typeof state?.program_state?.gameover,
            gameoverRaw: taggedRaw(state?.program_state, 'gameover'),
            gameoverEffective: Boolean(state?.program_state?.gameover) } : null,
        stateIsInitial: baseline ? state === baseline.stateRef : null,
        levelIsInitial: baseline ? state.level === baseline.levelRef : null,
        heroIsInitial: baseline ? state.u === baseline.heroRef : null,
        levelDescriptorIsInitial: baseline ? state.u?.uz === baseline.uzRef : null,
        heroPositionIsInitial: baseline ? x === baseline.x && y === baseline.y : null,
        levelIdentity: state?.u?.uz ? { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel } : null,
        descriptorResolution: baseline ? { relativeX: coordinate?.x ?? null,
            relativeY: coordinate?.y ?? null,
            resolvedX: coordinate ? coordinate.x + frame.xstart : null,
            resolvedY: coordinate ? coordinate.y + frame.ystart : null,
            resolvesToCurrentHero: coordinate
                ? coordinate.x + frame.xstart === x && coordinate.y + frame.ystart === y : null } : null,
        contextDepth: context?.containers?.length ?? null,
        callCounts: { firstIntentCount, firstEnteredCount, targetIntentCount, targetEnteredCount },
        firstDescriptorUsesCanonicalCoordinate: Boolean(firstDescriptor?.coordinate === coordinate),
        targetDescriptorUsesCanonicalCoordinate: Boolean(targetDescriptor?.coordinate === coordinate),
        firstScalar, targetScalar,
        firstObject: objectReceipt(firstObject), targetObject: objectReceipt(targetObject),
        targetTimerArgCandidates,
        floor: chainReceipt(state?.level?.objlist), floorGrid: gridReceipt(state?.level?.objects),
        floorHere: chainReceipt(floorHere, 'nexthere'),
        inventory: chainReceipt(state?.invent), buried: chainReceipt(state?.level?.buriedobjlist),
        migrating: chainReceipt(state?.gm?.migrating_objs),
        timers: timerReceipt(state, targets),
        screen: state?.nhDisplay?.serialize?.() ?? '',
        topMessage: state?.nhDisplay?.topMessage ?? null, topline: state?.nhDisplay?.toplin ?? null,
        queuedInput: state?.nhDisplay?.inputQueueLength ?? null,
        inputQueue: Array.isArray(state?.nhDisplay?.terminal?._inputQueue)
            ? [...state.nhDisplay.terminal._inputQueue] : null,
        inputResolverPresent: Boolean(state?.nhDisplay?.terminal?._inputResolver),
        waitingInput: state?.nhDisplay?.isWaitingForInput ?? null,
        waitEpoch: state?.nhDisplay?.waitEpoch ?? null,
        pendingMessage: state?._pending_message ?? null,
        pendingMessagePresent: Object.hasOwn(state ?? {}, '_pending_message'),
        pendingMessageType: typeof state?._pending_message,
        pendingMessageRaw: taggedRaw(state, '_pending_message'),
        rng: rngReceipt(),
    };
};
const durable = (name) => {
    try { saveRequired(name, stateReceipt(liveState ?? game)); }
    catch (error) { saveFailure.push(captureError(error)); receiptFailure = error; throw error; }
};

display.onEmptyQueue = () => {
    const row = { phase, screen: display.serialize(), topMessage: display.topMessage,
        topline: display.toplin, waitEpoch: display.waitEpoch,
        queuedInput: display.inputQueueLength, waitingInput: display.isWaitingForInput,
        pendingMessage: game?._pending_message ?? null,
        pendingMessagePresent: Object.hasOwn(game ?? {}, '_pending_message'),
        pendingMessageType: typeof game?._pending_message,
        pendingMessageRaw: taggedRaw(game, '_pending_message'),
        inputQueue: Array.isArray(display.terminal?._inputQueue)
            ? [...display.terminal._inputQueue] : null,
        resolverPresent: Boolean(display.terminal?._inputResolver), rng: rngReceipt() };
    if (display.toplin === TOPLINE_NEED_MORE && row.screen.includes('--More--')
        && acknowledgements.length < 16) {
        acknowledgements.push(row);
        saveRequired(`more-${String(acknowledgements.length).padStart(2, '0')}`, row);
        return 13;
    }
    row.rejected = display.toplin !== TOPLINE_NEED_MORE ? 'not TOPLINE_NEED_MORE'
        : !row.screen.includes('--More--') ? 'no rendered --More--' : 'More cap reached';
    acknowledgements.push(row);
    saveRequired('unknown-input-boundary', row);
    throw new Error(`unsupported non-More input boundary: ${row.rejected}`);
};

try {
    saveRequired('before-start', { fixedInput, firstIntentCount, firstEnteredCount,
        targetIntentCount, targetEnteredCount });
    phase = 'starting';
    const started = await attempt.start();
    liveState = game;
    baseline = { stateRef: liveState, levelRef: liveState.level, heroRef: liveState.u,
        uzRef: liveState.u?.uz, x: liveState.u?.ux, y: liveState.u?.uy,
        frame: null, coordinateRef: null };
    phase = 'started';
    saveRequired('started', stateReceipt(liveState)); // full snapshot precedes guards.
    if (!started) throw new Error('NethackGame.start returned false');
    const hero = liveState.u;
    if (!hero || !Number.isInteger(hero.ux) || !Number.isInteger(hero.uy)
        || !liveState.level?.at?.(hero.ux, hero.uy))
        throw new Error('normal start did not produce a coherent hero/current level');
    if (Boolean(liveState.program_state?.gameover) || !(hero.uhp > 0))
        throw new Error('normal start did not retain a live positive-HP hero');
    frame = Object.freeze({ xstart: 1, ystart: 0, xsize: COLNO - 1, ysize: ROWNO });
    coordinate = Object.freeze({ x: hero.ux - frame.xstart, y: hero.uy - frame.ystart });
    baseline.frame = frame; baseline.coordinateRef = coordinate;
    if (coordinate.x < 0 || coordinate.x >= frame.xsize
        || coordinate.y < 0 || coordinate.y >= frame.ysize)
        throw new Error('hero tile is outside canonical whole-level coordinate frame');
    context = new_sp_lev_object_context();
    const env = objectGenerationEnv({ state: liveState, spObjectContext: context, frame, random });
    firstDescriptor = { id: GLOB_OF_GRAY_OOZE, coordinate, quantity: 1 };
    phase = 'first-setup-intent';
    firstIntentCount = 1;
    durable('before-first-setup-call'); // intent is persisted before actual entry.
    firstEnteredCount = 1;
    phase = 'first-setup-call';
    try {
        firstObject = await lspo_object(firstDescriptor, null, env);
        firstScalar = { returned: firstObject != null, oid: firstObject?.o_id ?? null,
            otyp: firstObject?.otyp ?? null };
        saveRequired('first-setup-returned-scalar', firstScalar);
    } catch (error) {
        firstScalar = { threw: true, error: captureError(error) };
        try { saveRequired('first-setup-threw-scalar', firstScalar); }
        catch (saveError) { saveFailure.push(captureError(saveError)); }
        throw error;
    }
    phase = 'after-first-setup';
    durable('after-first-setup-before-target');
    const squareHead = liveState.level.objects[hero.ux]?.[hero.uy] ?? null;
    let firstLinkedOnSquare = false;
    for (let item = squareHead; item; item = item.nexthere)
        if (item === firstObject) { firstLinkedOnSquare = true; break; }
    let firstLinkedOnLevel = false;
    for (let item = liveState.level.objlist; item; item = item.nobj)
        if (item === firstObject) { firstLinkedOnLevel = true; break; }
    let firstShrinkTimerCount = 0;
    for (let timer = liveState.gt?.timer_base ?? null; timer; timer = timer.next)
        if (timer.arg === firstObject && timer.kind === TIMER_OBJECT
            && timer.func_index === SHRINK_GLOB) ++firstShrinkTimerCount;
    if (!firstObject || firstObject.otyp !== GLOB_OF_GRAY_OOZE
        || firstObject.where !== OBJ_FLOOR || !firstObject.globby
        || firstObject.nomerge || firstObject.how_lost !== LOST_NONE
        || firstObject.blessed || firstObject.cursed || !firstLinkedOnSquare
        || !firstLinkedOnLevel || firstShrinkTimerCount !== 1)
        throw new Error('first public setup glob did not retain the natural floor/glob/merge-admission state');
    priorShrinkTimerArgs = timerArgRefs(liveState);
    const beforeTargetTimerArgSnapshots = priorShrinkTimerArgs.map(objectReceipt);
    saveRequired('before-target-timer-arguments', beforeTargetTimerArgSnapshots);
    targetDescriptor = { id: GLOB_OF_GRAY_OOZE, coordinate, quantity: 1 };
    phase = 'target-intent';
    targetIntentCount = 1;
    durable('before-target-call');
    phase = 'target-call';
    targetEnteredCount = 1;
    try {
        targetObject = await lspo_object(targetDescriptor, null, env);
        targetScalar = { returned: targetObject != null, oid: targetObject?.o_id ?? null,
            otyp: targetObject?.otyp ?? null };
        saveRequired('target-returned-scalar', targetScalar);
        phase = 'target-returned';
        durable('after-target-return');
    } catch (error) {
        targetScalar = { threw: true, error: captureError(error) };
        try { saveRequired('target-threw-scalar', targetScalar); }
        catch (saveError) { saveFailure.push(captureError(saveError)); }
        try { targetTimerArgCandidates = newShrinkTimerCandidates(liveState); }
        catch (observerError) { saveFailure.push(captureError(observerError)); }
        phase = 'target-error';
        try { durable('target-error-state'); }
        catch (saveError) { if (error !== receiptFailure) saveFailure.push(captureError(saveError)); }
        throw error;
    }
} catch (error) {
    if (error !== receiptFailure) primaryError = error;
    phase = error === receiptFailure ? 'receipt-error' : 'outer-error';
    try { save(error === receiptFailure ? 'receipt-error' : 'primary-error', {
        primaryError: primaryError ? captureError(primaryError) : null,
        receiptError: receiptFailure ? captureError(receiptFailure) : null,
        firstIntentCount, firstEnteredCount, targetIntentCount, targetEnteredCount,
        firstScalar, targetScalar }); }
    catch (observerError) { saveFailure.push(captureError(observerError)); }
    try { save('outer-operation-error-scalar', {
        call: targetEnteredCount ? 'second-target' : firstEnteredCount ? 'first-setup' : 'pre-entry',
        firstEnteredCount, targetEnteredCount,
        primaryError: primaryError ? captureError(primaryError) : null,
        receiptError: receiptFailure ? captureError(receiptFailure) : null,
        firstScalar, targetScalar }); }
    catch (observerError) { saveFailure.push(captureError(observerError)); }
    try { save('outer-error-full-state', stateReceipt(liveState ?? game)); }
    catch (observerError) { saveFailure.push(captureError(observerError)); }
} finally {
    display.onEmptyQueue = oldOnEmptyQueue;
    liveState = game;
    phase = primaryError ? 'finally-after-error' : 'finally';
    try { save('final', { primaryError: primaryError ? captureError(primaryError) : null,
        receiptFailure: receiptFailure ? captureError(receiptFailure) : null,
        handlerRestored: display.onEmptyQueue === oldOnEmptyQueue,
        firstIntentCount, firstEnteredCount, targetIntentCount, targetEnteredCount,
        firstScalar, targetScalar, acknowledgements, saveFailure,
        state: stateReceipt(liveState) }); }
    catch (observerError) { saveFailure.push(captureError(observerError)); }
}
if (primaryError) throw primaryError;
if (receiptFailure) throw receiptFailure;
if (saveFailure.length) throw new AggregateError(
    saveFailure.map((entry) => new Error(entry.message)),
    'receipt persistence failed after the primary operation',
);
