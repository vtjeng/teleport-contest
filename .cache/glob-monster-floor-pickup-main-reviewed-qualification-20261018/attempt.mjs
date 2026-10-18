import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    MM_NOMSG, MENU_TRADITIONAL, MON_FLOOR, NO_MINVENT, OBJ_FREE, OBJ_MINVENT,
    SHRINK_GLOB, TIMER_OBJECT, LOST_NONE, OBJ_FLOOR, Upolyd,
} from '../../js/const.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import { add_to_minv, mergable } from '../../js/invent.js';
import { mksobj, mksobj_at } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import { M2_COLLECT, PM_GOBLIN } from '../../js/monsters.js';
import { makemon_runtime } from '../../js/makemon_create.js';
import { mpickstuff, curr_mon_load, max_mon_load } from '../../js/mon.js';
import { select_postmove_object_action } from '../../js/monmove.js';
import * as random from '../../js/rng.js';
import { cloneIsaacContext, getRngLog } from '../../js/rng.js';
import { isok } from '../../js/cmd_isok.js';
import { TOPLINE_NEED_MORE } from '../../js/tty_message.js';

const requestedInput = {
    seed: 671903,
    instantUTC: '2026-10-17T00:00:00Z',
    datetime: '20261016200000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,menustyle:traditional\n',
    pet: 'none',
};
const outputRoot = join(dirname(fileURLToPath(import.meta.url)), 'runs');
mkdirSync(outputRoot, { recursive: true });
const outputDir = process.env.QUALIFICATION_OUTPUT_DIR
    ? resolve(process.env.QUALIFICATION_OUTPUT_DIR)
    : mkdtempSync(join(outputRoot, 'invocation-'));
mkdirSync(outputDir, { recursive: true });
const json = (value) => JSON.stringify(value, (_key, child) =>
    typeof child === 'bigint' ? child.toString() : child, 2) + '\n';
const savePrefix = (name, value) => writeFileSync(join(outputDir, `${name}.json`), json(value), { flag: 'wx' });
const errorRecord = (error) => ({ name: error?.name ?? 'Error',
    message: String(error?.message ?? error), stack: String(error?.stack ?? '') });
const nhGame = new NethackGame({ seed: requestedInput.seed,
    datetime: requestedInput.datetime, recorderIsDst: requestedInput.recorderIsDst,
    nethackrc: requestedInput.nethackrc });
const display = new GameDisplay(null);
const previousOnEmptyQueue = display.onEmptyQueue;
const acknowledgements = [];
const saveErrors = [];
display.onEmptyQueue = () => {
    const screen = display.serialize();
    const receipt = { screen, topMessage: display.topMessage, topline: display.toplin,
        waitEpoch: display.waitEpoch, queueLength: display.terminal.inputQueueLength,
        waiting: display.terminal.isWaitingForInput, pendingMessage: { present: Object.hasOwn(game ?? {}, '_pending_message'), type: typeof game?._pending_message, value: game?._pending_message ?? null },
        pendingInputCodes: [...(display.terminal._inputQueue ?? [])], resolver: { present: typeof display.terminal._inputResolver === 'function', type: typeof display.terminal._inputResolver },
        rng: rngSnapshot() };
    if (display.toplin !== TOPLINE_NEED_MORE || !screen.includes('--More--')) {
        acknowledgements.push({ ...receipt, rejected: 'not a rendered canonical More' });
        try { savePrefix(`input-boundary-${String(acknowledgements.length).padStart(2, '0')}`, acknowledgements); } catch (error) { saveErrors.push(errorRecord(error)); }
        throw new Error('input boundary is not a rendered canonical More prompt');
    }
    if (acknowledgements.length >= 16) {
        acknowledgements.push({ ...receipt, rejected: 'acknowledgement cap reached' });
        try { savePrefix(`input-boundary-${String(acknowledgements.length).padStart(2, '0')}`, acknowledgements); } catch (error) { saveErrors.push(errorRecord(error)); }
        throw new Error('rendered More acknowledgement budget exhausted');
    }
    acknowledgements.push(receipt);
    try { savePrefix(`input-boundary-${String(acknowledgements.length).padStart(2, '0')}`, acknowledgements); } catch (error) { saveErrors.push(errorRecord(error)); throw error; }
    return 32;
};
nhGame._pendingDisplay = display;
let state = null;
let currentLevelRef = null;
let initialHero = null;
let phase = 'before-startup';
let started = false;
let actor = null;
let pair = { first: null, second: null };
let invocationCount = 0;
let invocation = null;
let primaryError = null;
let observerErrors = [];
let beforeStartup = null;
let postStartup = null;
let beforeTarget = null;
let afterTarget = null;
const ids = (head, link, key) => {
    const out = [];
    for (let item = head ?? null; item; item = item[link]) out.push(item[key]);
    return out;
};
const cloneContext = (context) => context ? cloneIsaacContext(context) : null;
const rngSnapshot = () => ({ log: [...getRngLog()], core: cloneContext(game.coreCtx),
    display: cloneContext(game.displayCtx) });
const objectRow = (obj) => obj ? ({ o_id: obj.o_id, otyp: obj.otyp,
    oclass: obj.oclass, where: obj.where, quan: obj.quan, globby: obj.globby,
    age: obj.age, owt: obj.owt, timed: obj.timed, blessed: obj.blessed,
    cursed: obj.cursed, bknown: obj.bknown, nomerge: obj.nomerge,
    unpaid: obj.unpaid, no_charge: obj.no_charge, how_lost: obj.how_lost,
    ox: obj.ox, oy: obj.oy, nobj: obj.nobj?.o_id ?? null,
    nexthere: obj.nexthere?.o_id ?? null, ocarry: obj.ocarry?.m_id ?? null }) : null;
const timerRows = () => {
    const wanted = new Set([pair.first?.o_id, pair.second?.o_id]);
    const rows = [];
    for (let timer = state?.gt?.timer_base ?? null; timer; timer = timer.next) {
        if (wanted.has(timer.arg?.o_id)) rows.push({ o_id: timer.arg.o_id,
            sameObject: timer.arg === pair.first || timer.arg === pair.second,
            timeout: timer.timeout, tid: timer.tid, kind: timer.kind,
            func_index: timer.func_index, needs_fixup: timer.needs_fixup });
    }
    return rows;
};
const monsterIds = () => ids(state?.level?.monlist, 'nmon', 'm_id');
const floorIds = (x, y) => ids(state?.level?.objects?.[x]?.[y] ?? null, 'nexthere', 'o_id');
const snapshot = () => {
    const u = state?.u;
    const mx = actor?.mx ?? null, my = actor?.my ?? null;
    const monsterIdsNow = monsterIds();
    return {
        hero: u ? { x: u.ux, y: u.uy, level: u.uz ? { dnum: u.uz.dnum,
            dlevel: u.uz.dlevel } : null, upolyd: Upolyd(u), rawMulti: { present: Object.hasOwn(state, 'multi'), type: typeof state.multi, value: state.multi === undefined ? 'undefined' : state.multi },
            effectiveMulti: state.multi ?? 0, hp: u.uhp,
            rawGameover: { present: Object.hasOwn(state.program_state ?? {}, 'gameover'), type: typeof state.program_state?.gameover, value: state.program_state?.gameover === undefined ? 'undefined' : state.program_state.gameover },
            gameover: Boolean(state.program_state?.gameover) } : null,
        levelRefUnchanged: currentLevelRef ? state.level === currentLevelRef : null,
        heroPositionUnchanged: initialHero ? u.ux === initialHero.x && u.uy === initialHero.y : null,
        actor: actor ? { m_id: actor.m_id, pmidx: actor.data?.pmidx,
            x: mx, y: my, where: actor.mstate, onFloor: actor.mstate === MON_FLOOR,
            alive: actor.mhp > 0, mhp: actor.mhp, mtame: actor.mtame,
            minventHead: actor.minvent?.o_id ?? null,
            minventIds: ids(actor.minvent, 'nobj', 'o_id'),
            nmon: actor.nmon?.m_id ?? null, inMonlist: monsterIdsNow.includes(actor.m_id),
            inMonsterGrid: Number.isInteger(mx) && Number.isInteger(my)
                ? state.level.monsters[mx]?.[my] === actor : false,
            validCoordinate: Number.isInteger(mx) && Number.isInteger(my) && isok(mx, my) } : null,
        floorObjectIdsAtActor: actor ? floorIds(actor.mx, actor.my) : [],
        levelObjectIds: ids(state?.level?.objlist, 'nobj', 'o_id'),
        objects: { first: objectRow(pair.first), second: objectRow(pair.second),
            firstMergableSecond: pair.first && pair.second
                ? mergable(pair.first, pair.second, { state }) : null },
        timerRows: timerRows(),
        rng: rngSnapshot(),
        input: { screen: display.serialize(), topMessage: display.topMessage,
            topline: display.toplin, waitEpoch: display.waitEpoch,
            queueLength: display.terminal.inputQueueLength,
            waiting: display.terminal.isWaitingForInput,
            pendingMessage: { present: Object.hasOwn(state ?? {}, '_pending_message'), type: typeof state?._pending_message, value: state?._pending_message ?? null },
            pendingInputCodes: [...(display.terminal._inputQueue ?? [])], resolver: { present: typeof display.terminal._inputResolver === 'function', type: typeof display.terminal._inputResolver }, acknowledgements: acknowledgements.map((row) => ({ ...row })) },
        moves: state?.moves,
    };
};
try {
    beforeStartup = { requestedInput, screen: display.serialize(), topMessage: display.topMessage,
        topline: display.toplin, waitEpoch: display.waitEpoch,
        queueLength: display.terminal.inputQueueLength, rng: rngSnapshot() };
    savePrefix('00-before-startup', beforeStartup);
    started = Boolean(await nhGame.start());
    state = game;
    if (!state) throw new Error('startup returned without a live game binding');
    phase = 'poststartup';
    postStartup = snapshot();
    savePrefix('01-poststartup', postStartup);
    currentLevelRef = state.level;
    initialHero = { x: state.u?.ux ?? null, y: state.u?.uy ?? null, uz: state.u?.uz ?? null };
    if (!started) throw new Error('canonical startup did not enter a live game');
    if (Boolean(state.in_mklev)) throw new Error('runtime constructor prerequisite is not active');
    assert.equal(String(state.urole?.name?.m ?? '').toLowerCase(), 'archeologist');
    assert.equal(String(state.urace?.noun ?? '').toLowerCase(), 'human');
    assert.equal(state.flags?.female, false);
    assert.equal(state.u?.ualign?.type, 0);
    assert.equal(state.gp?.preferred_pet, 'n');
    assert.equal(Upolyd(state.u), false);
    assert.equal(Boolean(state.program_state?.gameover), false);
    assert.ok(state.u.uhp > 0);
    assert.equal(state.flags?.menu_style, MENU_TRADITIONAL);

    const species = state.mons?.[PM_GOBLIN];
    if (!species || species.pmidx !== PM_GOBLIN) throw new Error('canonical goblin catalog entry is unavailable');
    actor = await makemon_runtime(species, state.u.ux, state.u.uy,
        NO_MINVENT | MM_NOMSG, { state, random });
    if (!actor) throw new Error('canonical inventoryless goblin constructor returned no actor');
    if (state.level !== currentLevelRef || state.u.ux !== initialHero.x
        || state.u.uy !== initialHero.y || state.u.uz !== initialHero.uz)
        throw new Error('goblin constructor changed hero or current-level identity');
    if (actor.data !== species || actor.data?.pmidx !== PM_GOBLIN
        || !isok(actor.mx, actor.my)
        || state.level.monsters[actor.mx]?.[actor.my] !== actor
        || !monsterIds().includes(actor.m_id) || !(actor.mhp > 0)
        || actor.mstate !== MON_FLOOR || actor.minvent)
        throw new Error('canonical goblin did not satisfy live ordinary inventoryless actor invariants');
    if (actor.mx === initialHero.x && actor.my === initialHero.y)
        throw new Error('source enexto placement unexpectedly retained the occupied hero square');
    savePrefix('02-live-goblin', snapshot());

    const env = objectGenerationEnv({ state, random });
    pair.first = mksobj(GLOB_OF_GRAY_OOZE, true, false, env);
    if (pair.first.where !== OBJ_FREE || pair.first.otyp !== GLOB_OF_GRAY_OOZE
        || !pair.first.globby || pair.first.quan !== 1 || !(pair.first.age > 0)
        || !(pair.first.owt > 0) || !(pair.first.timed > 0))
        throw new Error('real mksobj defaults did not create one free timed gray ooze glob');
    const firstSetupResult = add_to_minv(actor, pair.first, { state });
    if (firstSetupResult !== false || pair.first.where !== OBJ_MINVENT
        || pair.first.ocarry !== actor || actor.minvent !== pair.first)
        throw new Error('empty-inventory add_to_minv did not return false and link the first glob');
    pair.second = mksobj_at(GLOB_OF_GRAY_OOZE, actor.mx, actor.my, true, false, env);
    if (pair.second.where !== OBJ_FLOOR || pair.second.otyp !== GLOB_OF_GRAY_OOZE
        || !pair.second.globby || pair.second.quan !== 1 || !(pair.second.age > 0)
        || !(pair.second.owt > 0) || !(pair.second.timed > 0)
        || !floorIds(actor.mx, actor.my).includes(pair.second.o_id)
        || !ids(state.level.objlist, 'nobj', 'o_id').includes(pair.second.o_id)
        || ids(actor.minvent, 'nobj', 'o_id').includes(pair.second.o_id) || pair.second.ox !== actor.mx || pair.second.oy !== actor.my
        || pair.first.blessed !== pair.second.blessed
        || pair.first.cursed !== pair.second.cursed
        || pair.first.how_lost !== LOST_NONE || pair.second.how_lost !== LOST_NONE
        || pair.first.nomerge || pair.second.nomerge)
        throw new Error('real mksobj_at defaults did not create the second timed gray glob on the actor floor square');
    const validTimers = new Map(timerRows().map((row) => [row.o_id, row]));
    for (const obj of [pair.first, pair.second]) {
        const timer = validTimers.get(obj.o_id);
        if (!timer || !timer.sameObject || timer.kind !== TIMER_OBJECT || timer.func_index !== SHRINK_GLOB)
            throw new Error('canonical glob shrink timer is not linked to its actual object');
    }
    if (!mergable(pair.first, pair.second, { state }))
        throw new Error('actual source mergable predicate rejected the real canonical glob pair');
    savePrefix('03-canonical-pair-and-setup-return', { snapshot: snapshot(),
        firstSetupResult, expectedFirstSetupResult: false,
        exactOwnership: { firstWhere: pair.first.where, firstCarrier: pair.first.ocarry?.m_id,
            incomingWhere: pair.second.where, incomingFloorNextId: pair.second.nexthere?.o_id ?? null, incomingLevelNextId: pair.second.nobj?.o_id ?? null,
            incomingInSquare: floorIds(actor.mx, actor.my).includes(pair.second.o_id), incomingInLevel: ids(state.level.objlist, 'nobj', 'o_id').includes(pair.second.o_id) } });

    const speciesFlags = actor.data?.mflags2 ?? 0;
    const selectorBefore = snapshot();
    const selection = select_postmove_object_action(actor, actor.mx, actor.my, { state, random });
    const selectionReceipt = { kind: selection?.kind ?? null, objectId: selection?.object?.o_id ?? null,
        selectedExactSecond: selection?.object === pair.second, carryamt: selection?.carryamt ?? null,
        actor: { peaceful: actor.mpeaceful, tame: actor.mtame, flags: speciesFlags,
            collects: Boolean(speciesFlags & M2_COLLECT), currentLoad: curr_mon_load(actor),
            maxLoad: max_mon_load(actor), floorIds: floorIds(actor.mx, actor.my) },
        snapshot: selectorBefore };
    savePrefix('04-selector-once-receipt', selectionReceipt);
    if (selection?.kind !== 'pick up' || selection.object !== pair.second
        || selection.carryamt !== 1)
        throw new Error('natural postmove selector did not choose the exact second floor glob with carryamt 1');
    phase = 'target-intent';
    beforeTarget = snapshot();
    savePrefix('05-before-target-intent-count-zero', { phase, invocationCount: 0,
        entry: 'await mpickstuff(actor, selection.object, selection.carryamt, { state, random })', selectionReceipt, beforeTarget });
    invocation = { entered: false, entry: 'await mpickstuff(actor, selection.object, selection.carryamt, { state, random })',
        returnType: null, returnValue: null, error: null };
    savePrefix('06-call-entry-intent', { intendedInvocationCount: 1,
        receiptMeaning: 'durable intent immediately before the call; actual entry is the final invocationCount/entered record',
        entry: invocation.entry });
    try {
        invocationCount = 1;
        invocation.entered = true;
        const value = await mpickstuff(actor, selection.object, selection.carryamt, { state, random });
        invocation.returnType = typeof value;
        invocation.returnValue = value;
        phase = 'target-returned';
    } catch (error) {
        primaryError = errorRecord(error);
        invocation.error = primaryError;
        phase = 'target-threw';
    }
    try { savePrefix('06-target-return-or-throw', { phase, invocationCount, invocation }); }
    catch (error) { saveErrors.push(errorRecord(error)); }
} catch (error) {
    primaryError ??= errorRecord(error);
    if (phase === 'before-startup') phase = 'startup-or-input-threw';
    else if (phase !== 'target-returned' && phase !== 'target-threw') phase = 'setup-threw';
    if (phase === 'startup-or-input-threw') {
        try { savePrefix('startup-error-context', { phase, primaryError,
            liveGameLevel: Boolean(game.level), screen: display.serialize(),
            topMessage: display.topMessage, topline: display.toplin,
            waitEpoch: display.waitEpoch, queueLength: display.terminal.inputQueueLength,
            waiting: display.terminal.isWaitingForInput, pendingMessage: { present: Object.hasOwn(game ?? {}, '_pending_message'), type: typeof game?._pending_message, value: game?._pending_message ?? null },
            pendingInputCodes: [...(display.terminal._inputQueue ?? [])], resolver: { present: typeof display.terminal._inputResolver === 'function', type: typeof display.terminal._inputResolver }, rng: rngSnapshot() }); } catch (saveError) { saveErrors.push(errorRecord(saveError)); }
    }
} finally {
    display.onEmptyQueue = previousOnEmptyQueue;
    state = game;
}
const handlerRestored = display.onEmptyQueue === previousOnEmptyQueue;
try {
    if (state?.level) afterTarget = snapshot();
} catch (error) { observerErrors.push(errorRecord(error)); }
let finalRecord;
try {
finalRecord = { phase, invocationCount, requestedInput, started,
    callbackRestored: handlerRestored,
    currentLevelRefUnchanged: currentLevelRef ? state.level === currentLevelRef : null,
    heroPositionUnchanged: initialHero
        ? state.u.ux === initialHero.x && state.u.uy === initialHero.y && state.u.uz === initialHero.uz : null,
    acknowledgements: acknowledgements.map((row) => ({ ...row })),
    primaryError, observerErrors, saveErrors, beforeStartup, postStartup,
    beforeTarget, invocation, afterTarget };
} catch (error) {
    observerErrors.push(errorRecord(error));
    finalRecord = { phase, invocationCount, requestedInput, started, callbackRestored: handlerRestored,
        primaryError, observerErrors, saveErrors, beforeStartup, postStartup, beforeTarget, invocation, afterTarget };
}
try { savePrefix('07-final-restored', finalRecord); }
catch (error) { saveErrors.push(errorRecord(error)); }
console.log(JSON.stringify({ outputDir, phase, invocationCount,
    primaryError, observerErrors, saveErrors }));
