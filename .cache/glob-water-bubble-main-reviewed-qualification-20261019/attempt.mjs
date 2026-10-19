// Complete source-audited proposal only. This file is intentionally NOT run
// by the source inquiry that stores it.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AMULET_OF_YENDOR, GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import {
    AIR, COLNO, LOST_NONE, OBJ_BURIED, OBJ_CONTAINED, OBJ_DELETED,
    OBJ_FLOOR, OBJ_FREE, OBJ_INVENT, OBJ_LUAFREE, OBJ_MINVENT,
    OBJ_MIGRATING, ROWNO, SHRINK_GLOB, TIMER_OBJECT, Upolyd,
} from '../../js/const.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import {
    addinv_runtime, inventoryObjects, mergable, obj_extract_self,
} from '../../js/invent.js';
import { mksobj, place_object } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import * as canonicalRng from '../../js/rng.js';
import { cloneIsaacContext, getRngLog } from '../../js/rng.js';
import { MORE_PROMPT } from '../../js/tty_message.js';
import { goto_level } from '../../js/do.js';
import { movebubbles } from '../../js/mkmaze.js';

const input = Object.freeze({
    seed: 2026101801,
    datetime: '20261018120000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:lawful\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n'
        + 'OPTIONS=playmode:debug\n',
});
const outputDir = mkdtempSync(join(tmpdir(), 'water-bubble-pair-'));
let outputIndex = 0;
const file = (stem, value) => {
    const name = `${stem}-${String(++outputIndex).padStart(3, '0')}.json`;
    writeFileSync(join(outputDir, name), `${JSON.stringify(plain(value), null, 2)}\n`, { flag: 'wx' });
    return name;
};
const cloneRaw = (value, seen = new Map()) => {
    if (value === null || ['string', 'number', 'boolean', 'undefined', 'bigint'].includes(typeof value)) return value;
    if (typeof value !== 'object') return `[${typeof value}]`;
    if (seen.has(value)) return seen.get(value);
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (value instanceof ArrayBuffer) return value.slice(0);
    const clone = Array.isArray(value) ? [] : {};
    seen.set(value, clone);
    for (const key of Object.keys(value)) clone[key] = cloneRaw(value[key], seen);
    return clone;
};
const plain = (value, seen = new Map()) => {
    if (value === undefined) return { tag: 'undefined' };
    if (typeof value === 'bigint') return { tag: 'bigint', value: String(value) };
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value !== 'object') return { tag: typeof value };
    if (seen.has(value)) return { ref: seen.get(value) };
    const id = `r${seen.size + 1}`;
    seen.set(value, id);
    if (ArrayBuffer.isView(value)) return { id, typedArray: value.constructor.name, values: Array.from(value, x => plain(x, seen)) };
    if (Array.isArray(value)) return { id, array: value.map(x => plain(x, seen)) };
    const fields = {};
    for (const key of Object.keys(value)) fields[key] = plain(value[key], seen);
    return { id, fields };
};
const errorRow = error => ({
    name: error?.name ?? 'Error', message: String(error?.message ?? error),
    stack: String(error?.stack ?? ''), operation: error?.operation ?? null,
    otyp: error?.otyp ?? null,
});
const rootMoves = state => Math.trunc(state?.moves ?? 0);
const chainDiagnostics = [];
const noteChainIssue = (kind, head, link, count) => chainDiagnostics.push({
    kind, headId: head?.o_id ?? head?.m_id ?? null, link, visited: count,
});
const objectIds = (head, link = 'nobj') => {
    const ids = [], seen = new Set();
    for (let obj = head ?? null; obj; obj = obj[link]) {
        if (seen.has(obj)) { noteChainIssue('cycle', head, link, ids.length); break; }
        if (ids.length >= 10000) { noteChainIssue('limit', head, link, ids.length); break; }
        seen.add(obj); ids.push(obj.o_id ?? null);
    }
    return ids;
};
const monsterIds = head => {
    const ids = [], seen = new Set();
    for (let mon = head ?? null; mon; mon = mon.nmon) {
        if (seen.has(mon)) { noteChainIssue('cycle', head, 'nmon', ids.length); break; }
        if (ids.length >= 10000) { noteChainIssue('limit', head, 'nmon', ids.length); break; }
        seen.add(mon); ids.push(mon.m_id ?? null);
    }
    return ids;
};
const installedTimerRefs = { first: null, second: null };
const objectTimers = (state, first = null, second = null) => {
    const rows = [], seen = new Set();
    for (let timer = state?.gt?.timer_base ?? null; timer; timer = timer.next) {
        if (seen.has(timer)) { noteChainIssue('timer-cycle', state?.gt?.timer_base, 'next', rows.length); break; }
        if (seen.size >= 10000) { noteChainIssue('timer-limit', state?.gt?.timer_base, 'next', seen.size); break; }
        seen.add(timer);
        if (timer.arg !== first && timer.arg !== second) continue;
        rows.push({
            tid: timer.tid ?? null,
            sameInstalledTimer: timer.arg === first ? timer === installedTimerRefs.first : timer === installedTimerRefs.second,
            nextTid: timer.next?.tid ?? null,
            role: timer.arg === first ? 'first' : 'second',
            argId: timer.arg?.o_id ?? null,
            exactArg: timer.arg === first || timer.arg === second,
            kind: timer.kind, func_index: timer.func_index,
            timeout: timer.timeout,
            future: typeof timer.timeout === 'number' && timer.timeout > rootMoves(state),
        });
    }
    return rows;
};
const idsAcrossGrid = level => {
    const cells = [];
    for (let x = 0; x < COLNO; ++x) for (let y = 0; y < ROWNO; ++y) {
        const pile = level?.objects?.[x]?.[y];
        if (pile) cells.push({ x, y, ids: objectIds(pile, 'nexthere') });
    }
    return cells;
};
const activeUnion = obj => {
    if (!obj) return null;
    if (obj.where === OBJ_FLOOR) return { kind: 'floor', nexthere: obj.nexthere?.o_id ?? null };
    if (obj.where === OBJ_CONTAINED) return { kind: 'contained', ocontainer: obj.ocontainer?.o_id ?? null };
    if (obj.where === OBJ_MINVENT) return { kind: 'monster', ocarry: obj.ocarry?.m_id ?? null };
    if ([OBJ_FREE, OBJ_INVENT, OBJ_MIGRATING, OBJ_BURIED, OBJ_LUAFREE, OBJ_DELETED].includes(obj.where))
        return { kind: 'nobj' };
    return { kind: 'unknown', where: obj.where };
};
const objectRow = obj => obj ? ({
    o_id: obj.o_id ?? null, otyp: obj.otyp ?? null, where: obj.where ?? null,
    ox: obj.ox ?? null, oy: obj.oy ?? null, quan: obj.quan ?? null,
    owt: obj.owt ?? null, age: obj.age ?? null, timed: obj.timed ?? null,
    globby: obj.globby ?? null, blessed: obj.blessed ?? null, cursed: obj.cursed ?? null,
    nomerge: obj.nomerge ?? null, how_lost: obj.how_lost ?? null,
    unpaid: obj.unpaid ?? null, no_charge: obj.no_charge ?? null,
    nobj: obj.nobj?.o_id ?? null,
    contents: obj.cobj ? objectIds(obj.cobj, 'nobj') : null,
    ownerUnion: activeUnion(obj),
}) : null;
const identityRefs = {};
const capture = (state, phase, first = null, second = null, bubble = null, coord = null) => {
    const u = state?.u, level = state?.level, uz = u?.uz;
    const objects = new Map(), seen = new Set();
    const walkChain = (head, link) => {
        const local = new Set();
        for (let obj = head ?? null; obj; obj = obj[link]) {
            if (local.has(obj)) { noteChainIssue('capture-cycle', head, link, local.size); break; }
            if (local.size >= 10000) { noteChainIssue('capture-limit', head, link, local.size); break; }
            local.add(obj);
            if (!seen.has(obj)) {
                seen.add(obj);
                if (obj.o_id != null) objects.set(obj.o_id, obj);
                walkChain(obj.cobj, 'nobj');
            }
        }
    };
    walkChain(state?.invent, 'nobj');
    walkChain(state?.level?.objlist, 'nobj');
    walkChain(state?.level?.buriedobjlist, 'nobj');
    walkChain(state?.gm?.migrating_objs, 'nobj');
    walkChain(state?.gi?.invent, 'nobj');
    for (let x = 0; x < COLNO; ++x) for (let y = 0; y < ROWNO; ++y)
        walkChain(state?.level?.objects?.[x]?.[y], 'nexthere');
    const monsters = [], monsterSeen = new Set();
    for (let mon = state?.level?.monlist ?? null; mon; mon = mon.nmon) {
        if (monsterSeen.has(mon)) { noteChainIssue('monster-cycle', state?.level?.monlist, 'nmon', monsters.length); break; }
        if (monsters.length >= 10000) { noteChainIssue('monster-limit', state?.level?.monlist, 'nmon', monsters.length); break; }
        monsterSeen.add(mon); walkChain(mon.minvent, 'nobj');
        monsters.push({ m_id: mon.m_id ?? null, pmidx: mon.data?.pmidx ?? null, x: mon.mx ?? null, y: mon.my ?? null,
            hp: mon.mhp ?? null, minvent: objectIds(mon.minvent), gridId: state?.level?.monsters?.[mon.mx]?.[mon.my]?.m_id ?? null });
    }
    for (let mon = state?.gm?.migrating_mons ?? null; mon; mon = mon.nmon) {
        if (monsterSeen.has(mon)) { noteChainIssue('migrating-monster-cycle', state?.gm?.migrating_mons, 'nmon', monsters.length); break; }
        if (monsters.length >= 10000) { noteChainIssue('migrating-monster-limit', state?.gm?.migrating_mons, 'nmon', monsters.length); break; }
        monsterSeen.add(mon); walkChain(mon.minvent, 'nobj');
        monsters.push({ m_id: mon.m_id ?? null, pmidx: mon.data?.pmidx ?? null, x: mon.mx ?? null, y: mon.my ?? null, migrating: true, minvent: objectIds(mon.minvent) });
    }
    const bubbles = (state?.air_bubbles ?? []).map((b, index) => ({
        index, sameFirstBubble: b === identityRefs.waterBubble,
        x: b.x, y: b.y, dx: b.dx, dy: b.dy,
        mask: { width: b.mask?.width ?? null, height: b.mask?.height ?? null, rows: [...(b.mask?.rows ?? [])] },
        cons: (b.cons ?? []).map(c => ({ x: c.x, y: c.y, what: c.what, listId: c.list?.o_id ?? c.list?.m_id ?? null,
            listChain: c.what === 'object' ? objectIds(c.list, 'nexthere') : null })),
    }));
    const timerRows = [];
    const timerSeen = new Set();
    for (let t = state?.gt?.timer_base ?? null; t; t = t.next) {
        if (timerSeen.has(t)) { noteChainIssue('timer-cycle', state?.gt?.timer_base, 'next', timerRows.length); break; }
        if (timerSeen.size >= 10000) { noteChainIssue('timer-limit', state?.gt?.timer_base, 'next', timerSeen.size); break; }
        timerSeen.add(t); timerRows.push({ tid: t.tid ?? null, kind: t.kind, func_index: t.func_index,
            timeout: t.timeout, argId: t.arg?.o_id ?? t.arg?.m_id ?? null,
            argIsFirst: t.arg === first, argIsSecond: t.arg === second });
    }
    const ctx = (key) => ({ own: Object.hasOwn(state ?? {}, key), isNull: state?.[key] === null,
        type: typeof state?.[key], clone: state?.[key] == null ? null : cloneIsaacContext(state[key]) });
    return {
        phase, input,
        startupOk: Boolean(state && state.u && state.level),
        hero: { sameUAsPrior: identityRefs.u ? u === identityRefs.u : null,
            sameLevelAsPrior: identityRefs.level ? level === identityRefs.level : null,
            sameUzRefAsPrior: identityRefs.uz ? uz === identityRefs.uz : null,
            x: u?.ux ?? null, y: u?.uy ?? null,
            hp: u?.uhp ?? null, maxhp: u?.uhpmax ?? null,
            gameoverOwn: Object.hasOwn(state?.program_state ?? {}, 'gameover'),
            gameoverType: typeof state?.program_state?.gameover,
            gameoverUndefined: state?.program_state?.gameover === undefined,
            gameoverRaw: state?.program_state?.gameover, gameover: Boolean(state?.program_state?.gameover),
            upolyd: u ? Upolyd(u) : null,
            multiOwn: Object.hasOwn(state ?? {}, 'multi'), multiType: typeof state?.multi,
            multiUndefined: state?.multi === undefined, multiRaw: state?.multi, multiEffective: state?.multi ?? 0,
            movesOwn: Object.hasOwn(state ?? {}, 'moves'), movesType: typeof state?.moves,
            movesUndefined: state?.moves === undefined, movesRaw: state?.moves, movesEffective: rootMoves(state),
            uz: uz ? { dnum: uz.dnum, dlevel: uz.dlevel } : null,
            requestedWater: state?.water_level ? { dnum: state.water_level.dnum, dlevel: state.water_level.dlevel } : null },
        refs: { sameGame: state === game, sameLiveU: identityRefs.u ? state?.u === identityRefs.u : null,
            sameLevel: identityRefs.level ? state?.level === identityRefs.level : null,
            sameUz: identityRefs.uz ? state?.u?.uz === identityRefs.uz : null,
            sameFloorGrid: identityRefs.floorGrid ? state?.level?.objects === identityRefs.floorGrid : null,
            sameBubbleArray: identityRefs.bubbles ? state?.air_bubbles === identityRefs.bubbles : null },
        bubble: bubble ? { sameRef: bubble === identityRefs.waterBubble, x: bubble.x, y: bubble.y, dx: bubble.dx, dy: bubble.dy,
            mask: { width: bubble.mask?.width, height: bubble.mask?.height, rows: [...(bubble.mask?.rows ?? [])] },
            cons: (bubble.cons ?? []).map(c => ({ x: c.x, y: c.y, what: c.what,
                listId: c.list?.o_id ?? c.list?.m_id ?? null, listChain: c.what === 'object' ? objectIds(c.list, 'nexthere') : null })) } : null,
        target: coord ? { ...coord, cellTyp: state?.level?.at?.(coord.x, coord.y)?.typ ?? null,
            floorIds: objectIds(state?.level?.objects?.[coord.x]?.[coord.y], 'nexthere') } : null,
        waterBubbles: bubbles, bubbleCount: state?.air_bubbles?.length ?? null,
        targetGlobs: { first: objectRow(first), second: objectRow(second), pairPureMergable: first && second ? mergable(first, second, { state }) : null,
            timerRows: objectTimers(state, first, second), sameObjectIdentities: Boolean(first && second && first !== second) },
        inventoryIds: inventoryObjects(state).map(o => o.o_id), levelObjectIds: objectIds(state?.level?.objlist),
        floorGrid: idsAcrossGrid(state?.level), buriedObjectIds: objectIds(state?.level?.buriedobjlist),
        monsterIds: monsterIds(state?.level?.monlist), monsters,
        objects: [...objects.values()].map(objectRow), timers: timerRows,
        rng: { log: [...getRngLog()], core: ctx('coreCtx'), display: ctx('displayCtx') },
        runtimeCounters: { screens: gameRunner?.getScreens?.().length ?? null,
            cursors: gameRunner?.getCursors?.().length ?? null, rngSlices: gameRunner?.getRngSlices?.().length ?? null,
            animationFrames: gameRunner?._animFramesByStep?.length ?? null,
            lastRngIndex: gameRunner?._lastRngIdx ?? null,
            displayEpoch: display?.waitEpoch ?? null, inputQueueLength: display?.inputQueueLength ?? null,
            waiting: display?.isWaitingForInput ?? null,
            resolverPresent: typeof display?.terminal?._inputResolver === 'function',
            queuedInput: cloneRaw(display?.terminal?._inputQueue ?? []),
            pendingMessage: { own: Object.hasOwn(state ?? {}, '_pending_message'), type: typeof state?._pending_message,
                undefined: state?._pending_message === undefined, value: cloneRaw(state?._pending_message) },
            screen: display?.serialize?.() ?? '',
            topMessage: display?.topMessage ?? null, topline: display?.toplin ?? null },
        chainDiagnostics: [...chainDiagnostics],
    };
};
const required = (name, fn) => { try { return fn(); } catch (error) { observerErrors.push({ name, error: errorRow(error) }); throw error; } };
const save = file;
let gameRunner = null, display = null, priorEmptyQueue = null, handlerRestored = false;
let state = null, started = false, phase = 'prestart', setupError = null, targetError = null, restoreError = null;
let first = null, second = null, bubble = null, coordinate = null, actualTarget = null;
let targetCalls = 0, targetOutcome = null, targetIntent = null, beforeTarget = null, afterFinal = null;
let inputBoundaryCount = 0;
let startupReferences = null, postWaterReferences = null;
const observerErrors = [], saveErrors = [], moreRecords = [];
const failure = why => { phase = `terminal-miss:${why}`; const error = new Error(`source-qualified fixture stopped: ${why}`); error.operation = why; throw error; };
const attemptSave = (name, value) => { try { return save(name, value); } catch (error) { saveErrors.push({ name, error: errorRow(error) }); throw error; } };
const snapshot = (name, state, b = bubble, c = coordinate) => required(name, () => {
    const row = capture(state, name, first, second, b, c);
    attemptSave(name, row);
    return row;
});
const timerGuard = (obj, role) => {
    const rows = objectTimers(state, role === 'first' ? obj : first, role === 'second' ? obj : second)
        .filter(t => t.exactArg && t.argId === obj?.o_id);
    return { rows, okay: Boolean(obj && obj.timed && rows.length === 1 && rows[0].kind === TIMER_OBJECT
        && rows[0].func_index === SHRINK_GLOB && rows[0].future) };
};
const globFacts = obj => obj ? ({ o_id: obj.o_id, otyp: obj.otyp, where: obj.where,
    x: obj.ox, y: obj.oy, quan: obj.quan, owt: obj.owt, age: obj.age, timed: obj.timed,
    globby: obj.globby, blessed: obj.blessed, cursed: obj.cursed, nomerge: obj.nomerge,
    how_lost: obj.how_lost, nobj: obj.nobj?.o_id ?? null, ownerUnion: activeUnion(obj) }) : null;
const naturalGlob = obj => Boolean(obj && obj.where === OBJ_FREE && obj.otyp === GLOB_OF_GRAY_OOZE
    && obj.globby === true && obj.quan === 1 && Number.isFinite(obj.owt) && obj.owt > 0
    && Number.isFinite(obj.age) && obj.age > 0 && Number.isFinite(obj.timed) && obj.timed > 0
    && obj.blessed !== undefined && obj.cursed !== undefined && obj.nomerge === false
    && obj.how_lost === LOST_NONE && !obj.nobj && !obj.nexthere && !obj.unpaid && !obj.no_charge);

try {
    attemptSave('prestart-intent', { phase, input, targetCalls });
    display = new GameDisplay(null);
    priorEmptyQueue = display.onEmptyQueue;
    display.onEmptyQueue = () => {
        const boundary = ++inputBoundaryCount;
        attemptSave('input-boundary-intent', { phase, boundary, targetCalls });
        const screen = display.serialize();
        const row = { boundary, epoch: display.waitEpoch, topline: display.toplin, topMessage: display.topMessage,
            screen, queueLength: display.inputQueueLength, waiting: display.isWaitingForInput,
            resolverPresent: typeof display.terminal?._inputResolver === 'function',
            queuedInput: cloneRaw(display.terminal?._inputQueue ?? []), pendingMessage: {
                own: Object.hasOwn(game, '_pending_message'), type: typeof game?._pending_message,
                undefined: game?._pending_message === undefined, value: cloneRaw(game?._pending_message) },
            rngLogLength: getRngLog().length };
        if (screen.includes(MORE_PROMPT)) {
            if (moreRecords.length >= 16) { attemptSave('more-cap', row); throw new Error('More-only input cap reached'); }
            moreRecords.push(row); attemptSave('more', row); return 32;
        }
        attemptSave('unknown-input-boundary', row);
        throw new Error('input queue empty at non-More input boundary');
    };
    gameRunner = new NethackGame(input);
    gameRunner._pendingDisplay = display;
    const preStartRng = { objExtractSelfInventExportType: typeof obj_extract_self, coreOwn: Object.hasOwn(game, 'coreCtx'), displayOwn: Object.hasOwn(game, 'displayCtx'),
        core: game.coreCtx == null ? null : cloneIsaacContext(game.coreCtx),
        display: game.displayCtx == null ? null : cloneIsaacContext(game.displayCtx), log: [...getRngLog()] };
    attemptSave('intent', { phase, input, targetCalls, preStartRng });
    phase = 'startup';
    started = await gameRunner.start();
    state = game;
    startupReferences = { u: state?.u ?? null, level: state?.level ?? null, uz: state?.u?.uz ?? null, floorGrid: state?.level?.objects ?? null };
    identityRefs.u = startupReferences.u; identityRefs.level = startupReferences.level;
    identityRefs.uz = startupReferences.uz; identityRefs.floorGrid = startupReferences.floorGrid;
    snapshot('after-start-before-any-admission-guard', state, null, null);
    const coreStartCapture = { core: state.coreCtx == null ? null : cloneIsaacContext(state.coreCtx),
        display: state.displayCtx == null ? null : cloneIsaacContext(state.displayCtx), rngLog: [...getRngLog()],
        screens: gameRunner.getScreens(), cursors: gameRunner.getCursors(), rngSlices: gameRunner.getRngSlices(),
        counts: { lastRngIndex: gameRunner._lastRngIdx, screens: gameRunner._screens.length,
            cursors: gameRunner._cursors.length, slices: gameRunner._rngSlices.length,
            animationFrameSteps: gameRunner._animFramesByStep.length } };
    attemptSave('post-start-core-display-isaac-counters-log', coreStartCapture);
    phase = 'after-start';
    if (!started || !state?.u || !state.level || !state.water_level) failure('startup-or-water-topology-unavailable');
    if (!state.wizard || !state.flags?.debug) failure('supported-debug-mode-not-active');
    if (!(state.u.uhp > 0) || Boolean(state.program_state?.gameover) || Upolyd(state.u) || (state.multi ?? 0) < 0)
        failure('startup-live-hero-admission');

    phase = 'create-real-amulet';
    const generationEnv = objectGenerationEnv({ state, random: canonicalRng });
    let amulet = null, amuletFactoryError = null;
    try { amulet = mksobj(AMULET_OF_YENDOR, true, false, generationEnv); }
    catch (error) { amuletFactoryError = errorRow(error); }
    attemptSave('amulet-factory-outcome-before-guard', { phase, amuletFactoryError, object: objectRow(amulet), actualUhaveAmulet: state.u.uhave?.amulet });
    snapshot('after-amulet-factory-before-guard', state, null, null);
    if (amuletFactoryError) throw Object.assign(new Error(amuletFactoryError.message), amuletFactoryError);
    if (!amulet || amulet.otyp !== AMULET_OF_YENDOR || amulet.where !== OBJ_FREE) failure('real-amulet-factory');
    let addedAmulet = null, addAmuletError = null;
    try { addedAmulet = await addinv_runtime(amulet, generationEnv); }
    catch (error) { addAmuletError = errorRow(error); }
    attemptSave('amulet-inventory-outcome-before-guard', { phase, addAmuletError,
        addedId: addedAmulet?.o_id ?? null, sameObject: addedAmulet === amulet,
        actualUhaveAmulet: state.u.uhave?.amulet, inventoryIds: inventoryObjects(state).map(o => o.o_id) });
    snapshot('after-amulet-inventory-writer-before-guard', state, null, null);
    if (addAmuletError) throw Object.assign(new Error(addAmuletError.message), addAmuletError);
    if (addedAmulet !== amulet || state.u.uhave?.amulet !== 1 || !inventoryObjects(state).includes(amulet))
        failure('canonical-amulet-inventory-writer');
    attemptSave('amulet-writer-receipt', { phase, amulet: objectRow(amulet), addedSame: addedAmulet === amulet,
        actualUhaveAmulet: state.u.uhave?.amulet, inventoryIds: inventoryObjects(state).map(o => o.o_id) });

    phase = 'enter-actual-water';
    const requestedWater = { dnum: state.water_level.dnum, dlevel: state.water_level.dlevel };
    let gotoReturn, gotoError = null;
    try { gotoReturn = await goto_level(requestedWater, false, false, false, state); }
    catch (error) { gotoError = errorRow(error); }
    attemptSave('water-goto-outcome-before-guard', { phase, gotoError, returnType: typeof gotoReturn,
        returnedNull: gotoReturn === null, returnedUndefined: gotoReturn === undefined,
        actualU: state.u === startupReferences.u, actualLevel: state.level === startupReferences.level,
        actualUz: state.u?.uz ? { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel } : null,
        requestedWater });
    snapshot('after-real-water-entry-before-guard', state, null, null);
    if (gotoError) throw Object.assign(new Error(gotoError.message), gotoError);
    if (!state.u?.uz || state.u.uz.dnum !== requestedWater.dnum || state.u.uz.dlevel !== requestedWater.dlevel
        || state.u.uz.dnum !== state.water_level.dnum || state.u.uz.dlevel !== state.water_level.dlevel
        || !state.wizard || state.u.uhave?.amulet !== 1 || !Array.isArray(state.air_bubbles))
        failure('actual-water-entry-or-initializer');
    postWaterReferences = { u: state.u, level: state.level, uz: state.u.uz,
        floorGrid: state.level.objects, bubbles: state.air_bubbles };
    snapshot('after-real-water-entry-before-pair', state, null, null);
    if (!state.air_bubbles.length) failure('water-entry-created-no-bubbles');

    phase = 'select-first-source-bubble-cell';
    bubble = state.air_bubbles[0];
    if (!bubble || !bubble.mask || !Array.isArray(bubble.mask.rows) || !Number.isInteger(bubble.mask.width)
        || !Number.isInteger(bubble.mask.height) || bubble.cons?.length) failure('first-source-bubble-invalid-or-busy');
    for (let i = 0; i < bubble.mask.width && !coordinate; ++i) {
        for (let j = 0; j < bubble.mask.height; ++j) {
            if (bubble.mask.rows[j] & (1 << i)) { coordinate = { x: bubble.x + i, y: bubble.y + j, i, j }; break; }
        }
    }
    if (!coordinate || !Number.isInteger(coordinate.x) || !Number.isInteger(coordinate.y)
        || coordinate.x < 0 || coordinate.x >= COLNO || coordinate.y < 0 || coordinate.y >= ROWNO)
        failure('first-mask-bit-off-map');
    const cell = state.level.at(coordinate.x, coordinate.y);
    if (!cell || cell.typ !== AIR) failure('first-mask-bit-not-live-air-cell');
    const preexistingFloor = state.level.objects?.[coordinate.x]?.[coordinate.y] ?? null;
    const originalPileIds = objectIds(preexistingFloor, 'nexthere');
    const originalPileRows = [];
    const originalPileSeen = new Set();
    for (let obj = preexistingFloor; obj; obj = obj.nexthere) {
        if (originalPileSeen.has(obj)) { noteChainIssue('selected-pile-cycle', preexistingFloor, 'nexthere', originalPileRows.length); break; }
        if (originalPileRows.length >= 10000) { noteChainIssue('selected-pile-limit', preexistingFloor, 'nexthere', originalPileRows.length); break; }
        originalPileSeen.add(obj); originalPileRows.push(objectRow(obj));
    }
    if (bubble.cons?.length) failure('first-bubble-cons-not-empty');
    identityRefs.u = postWaterReferences.u; identityRefs.level = postWaterReferences.level;
    identityRefs.uz = postWaterReferences.uz; identityRefs.floorGrid = postWaterReferences.floorGrid;
    identityRefs.bubbles = postWaterReferences.bubbles; identityRefs.waterBubble = bubble;
    attemptSave('selected-source-cell-before-object-writers', { phase, coordinate, originalPileHeadId: preexistingFloor?.o_id ?? null,
        originalPileIds, originalPileRows,
        bubble: { index: 0, x: bubble.x, y: bubble.y, dx: bubble.dx, dy: bubble.dy,
            mask: { width: bubble.mask.width, height: bubble.mask.height, rows: [...bubble.mask.rows] },
            consLength: bubble.cons?.length ?? 0 }, terrain: cell.typ, cellPresent: true });

    phase = 'construct-two-real-gray-globs';
    first = mksobj(GLOB_OF_GRAY_OOZE, true, false, generationEnv);
    second = mksobj(GLOB_OF_GRAY_OOZE, true, false, generationEnv);
    const initialTimerNodes = [];
    for (let timer = state?.gt?.timer_base ?? null, seen = new Set(); timer && !seen.has(timer); timer = timer.next) {
        seen.add(timer);
        if (timer.arg === first) { installedTimerRefs.first = timer; initialTimerNodes.push(timer); }
        if (timer.arg === second) { installedTimerRefs.second = timer; initialTimerNodes.push(timer); }
    }
    const firstTimer = timerGuard(first, 'first'), secondTimer = timerGuard(second, 'second');
    attemptSave('factory-and-shrink-timer-guards-before-place-writers', { phase,
        first: globFacts(first), second: globFacts(second), firstTimer, secondTimer, timerNodeCount: initialTimerNodes.length,
        firstOriginalFloorIds: originalPileIds, sameLiveGame: state === game });
    if (!naturalGlob(first) || !naturalGlob(second) || first === second || initialTimerNodes.length !== 2
        || !firstTimer.okay || !secondTimer.okay || !firstTimer.rows[0]?.sameInstalledTimer || !secondTimer.rows.some(r => r.role === 'second' && r.sameInstalledTimer))
        failure('natural-glob-shape-or-shrink-timer');
    if (first.blessed !== second.blessed || first.cursed !== second.cursed
        || first.how_lost !== LOST_NONE || second.how_lost !== LOST_NONE
        || first.nomerge || second.nomerge || !mergable(first, second, { state }))
        failure('natural-compatible-glob-pair');
    phase = 'place-real-glob-pair';
    place_object(first, coordinate.x, coordinate.y, generationEnv);
    place_object(second, coordinate.x, coordinate.y, generationEnv);
    const placedIds = objectIds(state.level.objects[coordinate.x][coordinate.y], 'nexthere');
    if (!placedIds.includes(first.o_id) || !placedIds.includes(second.o_id) || first.where !== OBJ_FLOOR
        || second.where !== OBJ_FLOOR || first.ox !== coordinate.x || first.oy !== coordinate.y
        || second.ox !== coordinate.x || second.oy !== coordinate.y || first === second)
        failure('canonical-floor-writers-did-not-retain-both');
    attemptSave('pair-placed-without-prior-stack', { phase, coordinate, originalPileIds, placedIds,
        first: globFacts(first), second: globFacts(second), pairPureMergable: mergable(first, second, { state }),
        timerGuards: { first: timerGuard(first, 'first'), second: timerGuard(second, 'second') } });

    phase = 'before-target-count-zero-intent';
    targetCalls = 0;
    targetIntent = { phase, operation: 'await movebubbles(state, canonicalRng.rn2)', calls: 0,
        destination: { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel },
        bubbleIndex: 0, coordinate, firstOId: first.o_id, secondOId: second.o_id };
    attemptSave('target-intent-count-zero', targetIntent);
    beforeTarget = snapshot('before-one-movebubbles-call', state, bubble, coordinate);
    const targetAdmission = { live: state === game && state.u === postWaterReferences.u
        && state.level === postWaterReferences.level && state.u.uz === postWaterReferences.uz
        && state.level.objects === postWaterReferences.floorGrid && state.air_bubbles === postWaterReferences.bubbles
        && state.air_bubbles[0] === bubble && state.u.uhp > 0
        && !Boolean(state.program_state?.gameover) && !Upolyd(state.u) && (state.multi ?? 0) >= 0,
        hp: state.u?.uhp ?? null, gameover: Boolean(state.program_state?.gameover),
        upolyd: state.u ? Upolyd(state.u) : null, multi: state.multi ?? 0,
        samePostWaterU: state.u === postWaterReferences.u, samePostWaterLevel: state.level === postWaterReferences.level,
        samePostWaterUz: state.u?.uz === postWaterReferences.uz,
        heroPosition: { x: state.u?.ux ?? null, y: state.u?.uy ?? null }, selectedCoordinate: coordinate };
    attemptSave('target-entry-admission', targetAdmission);
    if (state !== game || state.u !== postWaterReferences.u || state.level !== postWaterReferences.level
        || state.u.uz !== postWaterReferences.uz || state.level.objects !== postWaterReferences.floorGrid
        || state.air_bubbles !== postWaterReferences.bubbles || state.air_bubbles[0] !== bubble
        || !(state.u.uhp > 0) || Boolean(state.program_state?.gameover) || Upolyd(state.u)
        || (state.multi ?? 0) < 0)
        failure('target-live-reference-or-owner-changed-before-call');
    phase = 'target-called';
    targetCalls = 1;
    let targetReturn = null;
    try {
        const pendingTarget = movebubbles(state, canonicalRng.rn2);
        targetReturn = await pendingTarget;
        targetOutcome = { kind: 'returned', type: typeof targetReturn, isUndefined: targetReturn === undefined,
            isNull: targetReturn === null, isObject: targetReturn !== null && typeof targetReturn === 'object' };
        phase = 'target-returned';
    } catch (error) {
        targetError = errorRow(error);
        targetOutcome = { kind: 'threw', ...targetError };
        phase = 'target-threw';
    }
    // Pure return/error scalars are persisted before any optional graph projection.
    attemptSave('target-return-or-throw-scalars', { phase, targetCalls, targetOutcome, targetError,
        targetReturnType: typeof targetReturn, targetReturnedNull: targetReturn === null,
        targetOperation: 'await movebubbles(state, canonicalRng.rn2)', firstOId: first?.o_id ?? null,
        secondOId: second?.o_id ?? null, stack: targetError?.stack ?? null });
} catch (error) {
    if (!setupError) setupError = errorRow(error);
    state = game;
    try { attemptSave('first-error-live-alias', { phase, sourceError: setupError,
        sameGame: state === game, state: capture(state, 'first-error-live-alias', first, second, bubble, coordinate) }); }
    catch (captureError) { observerErrors.push({ name: 'first-error-live-alias', error: errorRow(captureError) }); }
    if (!targetOutcome) targetOutcome = { kind: 'setup-threw', ...errorRow(error) };
    if (!phase.startsWith('terminal-miss:')) phase = `setup-threw:${phase}`;
    try { attemptSave('first-error-scalars', { phase, targetCalls, setupError, targetError, targetOutcome }); }
    catch (saveError) { saveErrors.push({ name: 'first-error-scalars', error: errorRow(saveError) }); }
} finally {
    try {
        if (display) {
            display.onEmptyQueue = priorEmptyQueue;
            handlerRestored = display.onEmptyQueue === priorEmptyQueue;
            if (!handlerRestored) restoreError = { name: 'RestoreMismatch', message: 'previous input handler was not restored' };
        }
    } catch (error) { restoreError = errorRow(error); }
    state = game;
    const finallyScalars = { phase, started, targetCalls, handlerRestored, setupError, targetError, restoreError, targetOutcome };
    try { attemptSave('finally-scalars-before-final-projection', finallyScalars); }
    catch (error) { saveErrors.push({ name: 'finally-scalars', error: errorRow(error) }); }
    try { afterFinal = capture(state, 'final-after-handler-restore', first, second, bubble, coordinate); }
    catch (error) { observerErrors.push({ name: 'final-capture', error: errorRow(error) }); }
    if (afterFinal) {
        try { attemptSave('final-capture', { ...finallyScalars, beforeTarget, afterFinal, moreRecords, observerErrors, saveErrors }); }
        catch (error) { saveErrors.push({ name: 'final-capture', error: errorRow(error) }); }
    }
}
if (!afterFinal) {
    try { attemptSave('final-fallback', { phase, started, targetCalls, handlerRestored,
        setupError, targetError, restoreError, targetOutcome, observerErrors, saveErrors }); }
    catch (error) { saveErrors.push({ name: 'final-fallback', error: errorRow(error) }); }
}
const exitStatus = (!started || targetCalls !== 1 || !handlerRestored || setupError || targetError
    || restoreError || observerErrors.length || saveErrors.length || !afterFinal
    || chainDiagnostics.length || targetOutcome?.kind !== 'returned' || !afterFinal?.targetGlobs?.first
    || !afterFinal?.targetGlobs?.second) ? 1 : 0;
try { attemptSave('final-status', { exitStatus, phase, started, targetCalls, handlerRestored,
    targetOutcome, setupError, targetError, restoreError, observerErrors, saveErrors }); }
catch (error) { saveErrors.push({ name: 'final-status', error: errorRow(error) }); process.exitCode = 1; }
console.log(JSON.stringify({ outputDir, phase, started, targetCalls, exitStatus, handlerRestored,
    targetOutcome, setupError, targetError, restoreError, observerErrors, saveErrors }));
process.exitCode = exitStatus || process.exitCode || 0;
