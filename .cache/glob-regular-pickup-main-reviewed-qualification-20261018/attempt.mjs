import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU_TRADITIONAL, OBJ_FLOOR, OBJ_FREE, OBJ_INVENT, SHOPBASE, Upolyd, is_pit } from '../../js/const.js';
import { can_reach_floor } from '../../js/engrave.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import { addinv_runtime, mergable } from '../../js/invent.js';
import { mksobj, mksobj_at } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import { in_rooms } from '../../js/rooms.js';
import { t_at } from '../../js/trap.js';
import { pickup } from '../../js/pickup.js';
import { d, getRngLog, rn1, rn2, rnd, rne, rnl, rnz } from '../../js/rng.js';
import { TOPLINE_NEED_MORE } from '../../js/tty_message.js';
import { isok } from '../../js/cmd_isok.js';

const requestedInput = {
    seed: 671903,
    instantUTC: '2026-10-17T00:00:00Z',
    // calendar.js parses recorder local wall time YYYYMMDDHHMMSS. Its source
    // timezone is America/New_York; 2026-10-16 20:00 EDT is the requested UTC instant.
    datetime: '20261016200000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,menustyle:traditional\n',
    pet: 'none',
};
const outputRoot = join(dirname(fileURLToPath(import.meta.url)), 'runs');
mkdirSync(outputRoot, { recursive: true });
const outputDir = mkdtempSync(join(outputRoot, 'invocation-'));
const json = (value) => JSON.stringify(value, (_key, child) =>
    typeof child === 'bigint' ? child.toString() : child, 2) + '\n';
const savePrefix = (name, value) => writeFileSync(join(outputDir, `${name}.json`), json(value));
const errorRecord = (error) => ({ name: error?.name ?? 'Error',
    message: String(error?.message ?? error), stack: String(error?.stack ?? '') });

const nhGame = new NethackGame({
    seed: requestedInput.seed,
    datetime: requestedInput.datetime,
    recorderIsDst: requestedInput.recorderIsDst,
    nethackrc: requestedInput.nethackrc,
});
const display = new GameDisplay(null);
const previousOnEmptyQueue = display.onEmptyQueue;
let handlerRestored = false;
let callEntered = false;
let invocationCount = 0;
const acknowledgements = [];
display.onEmptyQueue = () => {
    state = game; // retain the live singleton even if startup/input later throws
    const screen = display.serialize();
    const inputSnapshot = { screen, toplin: display.toplin, topMessage: display.topMessage,
        waitEpoch: display.waitEpoch, queueLength: display.terminal.inputQueueLength,
        waiting: display.terminal.isWaitingForInput,
        pendingInputCodes: display.terminal._inputQueue?.slice() ?? null,
        pendingResolverPresent: Boolean(display.terminal._inputResolver),
        pendingMessagePresent: Object.hasOwn(game, '_pending_message'),
        pendingMessage: game._pending_message ?? null,
        coreCtx: game.coreCtx ? { m: game.coreCtx.m.slice(), r: game.coreCtx.r.slice(), a: game.coreCtx.a, b: game.coreCtx.b, c: game.coreCtx.c, n: game.coreCtx.n } : null,
        displayCtx: game.displayCtx ? { m: game.displayCtx.m.slice(), r: game.displayCtx.r.slice(), a: game.displayCtx.a, b: game.displayCtx.b, c: game.displayCtx.c, n: game.displayCtx.n } : null,
        rngLog: getRngLog().slice() };
    if (display.toplin !== TOPLINE_NEED_MORE || !screen.includes('--More--')) {
        try { savePrefix('unknown-input-boundary', inputSnapshot); }
        catch (error) { observerError ??= errorRecord(error); }
        throw new Error('input boundary is not a rendered canonical More prompt');
    }
    if (acknowledgements.length >= 16) {
        try { savePrefix('unknown-input-boundary', inputSnapshot); }
        catch (error) { observerError ??= errorRecord(error); }
        throw new Error('rendered More acknowledgement budget exhausted');
    }
    acknowledgements.push({ screen, waitEpoch: display.waitEpoch,
        queueLength: display.terminal.inputQueueLength });
    return 32;
};
nhGame._pendingDisplay = display;
let state = null;
let primaryError = null;
let started = null;
let phase = 'startup';
let originalHero = null;
let originalLevelObject = null;
let invocation = null;
let setup = null;
let after = null;
let observerError = null;
const linkedIds = (head, link) => {
    const ids = [];
    for (let node = head ?? null; node; node = node[link]) ids.push(node.o_id);
    return ids;
};
const rngContext = (ctx) => ctx ? ({ m: ctx.m.slice(), r: ctx.r.slice(), a: ctx.a, b: ctx.b, c: ctx.c, n: ctx.n }) : null;
const project = () => {
    const u = state.u;
    const x = u.ux, y = u.uy;
    const floor = state.level.objects?.[x]?.[y] ?? null;
    const floorIds = linkedIds(floor, 'nexthere');
    const inventoryIds = linkedIds(state.invent, 'nobj');
    const levelIds = linkedIds(state.level.objlist, 'nobj');
    const timerRows = [];
    for (let timer = state.gt?.timer_base ?? null; timer; timer = timer.next) {
        if (timer.arg?.o_id === setup?.carriedId || timer.arg?.o_id === setup?.floorId) {
            timerRows.push({ o_id: timer.arg.o_id, timeout: timer.timeout,
                tid: timer.tid, kind: timer.kind, func_index: timer.func_index,
                needs_fixup: timer.needs_fixup });
        }
    }
    const objectRow = (obj) => obj ? ({ o_id: obj.o_id, otyp: obj.otyp,
        oclass: obj.oclass, where: obj.where, quan: obj.quan, globby: obj.globby,
        age: obj.age, owt: obj.owt, timed: obj.timed, blessed: obj.blessed,
        cursed: obj.cursed, bknown: obj.bknown, nomerge: obj.nomerge,
        unpaid: obj.unpaid, no_charge: obj.no_charge, how_lost: obj.how_lost,
        ox: obj.ox, oy: obj.oy, nobjId: obj.nobj?.o_id ?? null,
        nexthereId: obj.nexthere?.o_id ?? null,
        inInventory: inventoryIds.includes(obj.o_id),
        inLevelObjlist: levelIds.includes(obj.o_id),
        inSquarePile: floorIds.includes(obj.o_id) }) : null;
    return {
        actor: { x, y, level: u.uz ? { dnum: u.uz.dnum, dlevel: u.uz.dlevel } : null,
            form: u.umonnum, baseForm: u.umonster, upolyd: Upolyd(u),
            rawMultiPresent: Object.hasOwn(state, 'multi'), rawMultiType: typeof state.multi,
            rawMulti: state.multi ?? null, effectiveMulti: state.multi ?? 0,
            hp: u.uhp, gameoverPresent: Object.hasOwn(state.program_state ?? {}, 'gameover'),
            rawGameover: state.program_state?.gameover ?? null, gameover: Boolean(state.program_state?.gameover),
            heroShops: u.ushops?.slice() ?? null,
            shopRoomsAtTarget: in_rooms(x, y, SHOPBASE, state) },
        objects: { carried: objectRow(setup?.carried), floorGlob: objectRow(setup?.floorGlob),
            inventoryIds, levelObjlistIds: levelIds, squarePileIds: floorIds },
        timers: timerRows,
        target: { x, y, terrain: state.level.at(x, y)?.typ ?? null,
            roomno: state.level.at(x, y)?.roomno ?? null,
            trap: (() => { const trap = t_at(x, y, state); return trap
                ? { ttyp: trap.ttyp, tx: trap.tx, ty: trap.ty } : null; })() },
        input: { screen: display.serialize(), topline: display.toplin, waitEpoch: display.waitEpoch,
            queueLength: display.terminal.inputQueueLength,
            waiting: display.terminal.isWaitingForInput, pendingResolverPresent: Boolean(display.terminal._inputResolver),
            topMessage: display.topMessage, pendingInputCodes: display.terminal._inputQueue?.slice() ?? null,
            pendingMessagePresent: Object.hasOwn(game, '_pending_message'),
            pendingMessage: game._pending_message ?? null,
            acknowledgements: acknowledgements.map((row) => ({ ...row })) },
        actorStart: originalHero ? { x: originalHero.x, y: originalHero.y,
            level: { dnum: originalHero.level?.dnum, dlevel: originalHero.level?.dlevel },
            sameLevelDescriptorRef: state.u.uz === originalHero.levelIdentity,
            sameLevelRef: state.level === originalLevelObject,
            sameHeroX: x === originalHero.x, sameHeroY: y === originalHero.y } : null,
        moves: state.moves,
        rng: getRngLog().slice(), rngContexts: { core: rngContext(state.coreCtx), display: rngContext(state.displayCtx) },
        screens: nhGame.getScreens().slice(),
    };
};
try {
    savePrefix('00-before-startup', { requestedInput,
        displaySource: 'GameDisplay assigned as NethackGame._pendingDisplay before start',
        queuedInput: display.terminal.inputQueueLength, waitEpoch: display.waitEpoch,
        screen: display.serialize() });
    started = await nhGame.start();
    // gstate.js exports a live binding: NethackGame.start() resets it. Refresh
    // only after startup; no stale pre-start state alias is used below.
    state = game;
    if (!started) throw new Error('canonical startup did not enter a live game');
    phase = 'poststartup';
    savePrefix('01-poststartup', { started, role: state.urole?.name?.m ?? null,
        race: state.urace?.noun ?? null, hero: { x: state.u?.ux ?? null, y: state.u?.uy ?? null,
            level: state.u?.uz ? { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel } : null },
        gameoverPresent: Object.hasOwn(state.program_state ?? {}, 'gameover'),
        rawGameover: state.program_state?.gameover ?? null, hp: state.u?.uhp ?? null,
        screen: display.serialize(), toplin: display.toplin, topMessage: display.topMessage,
        waitEpoch: display.waitEpoch, queueLength: display.terminal.inputQueueLength,
        waiting: display.terminal.isWaitingForInput, pendingInputCodes: display.terminal._inputQueue?.slice() ?? null,
        pendingMessagePresent: Object.hasOwn(game, '_pending_message'), pendingMessage: game._pending_message ?? null,
        coreCtx: rngContext(state.coreCtx), displayCtx: rngContext(state.displayCtx), rng: getRngLog().slice() });
    originalLevelObject = state.level;
    originalHero = { x: state.u.ux, y: state.u.uy,
        level: { dnum: state.u.uz.dnum, dlevel: state.u.uz.dlevel },
        levelIdentity: state.u.uz };
    assert.equal(String(state.urole?.name?.m ?? '').toLowerCase(), 'archeologist');
    assert.equal(String(state.urace?.noun ?? '').toLowerCase(), 'human');
    assert.equal(state.flags?.female, false);
    assert.equal(state.u?.ualign?.type, 0);
    assert.equal(state.gp?.preferred_pet, 'n');
    assert.equal(Upolyd(state.u), false);
    assert.equal(Boolean(state.program_state?.gameover), false);
    assert.ok(state.u.uhp > 0);
    assert.equal(state.flags?.menu_style, MENU_TRADITIONAL);
    assert.equal(Boolean(state.iflags?.menu_requested), false);

    const x = state.u.ux, y = state.u.uy;
    const tile = state.level.at(x, y);
    const trap = t_at(x, y, state);
    if (!isok(x, y) || !tile || trap
        || !can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)
        || in_rooms(x, y, SHOPBASE, state).length
        || state.u.ushops?.[0])
        throw new Error('fixed actual hero square is not a clear reachable nonshop floor tile');
    if (state.level.objects?.[x]?.[y])
        throw new Error('fixed actual hero square already has floor objects');
    for (let monster = state.level.monlist ?? null; monster; monster = monster.nmon) {
        if (monster.mx === x && monster.my === y)
            throw new Error('fixed actual hero square already has a monster owner');
    }
    const inventoryTypes = [];
    for (let obj = state.invent ?? null; obj; obj = obj.nobj) inventoryTypes.push(obj.otyp);
    if (inventoryTypes.includes(GLOB_OF_GRAY_OOZE))
        throw new Error('canonical starting inventory already has compatible gray glob');

    const env = objectGenerationEnv({ state, random: { d, rn1, rn2, rnd, rne, rnl, rnz } });
    const carried = mksobj(GLOB_OF_GRAY_OOZE, true, false, env);
    setup = { carried, carriedId: carried.o_id, env, x, y };
    if (carried.where !== OBJ_FREE || carried.otyp !== GLOB_OF_GRAY_OOZE
        || carried.oclass !== state.objects[GLOB_OF_GRAY_OOZE].oc_class
        || !carried.globby || carried.quan !== 1 || !(carried.age > 0)
        || !(carried.owt > 0) || !Number.isInteger(carried.timed) || carried.timed < 1)
        throw new Error('real mksobj defaults do not produce the expected free one-unit timed glob');
    await addinv_runtime(carried, env);
    if (carried.where !== OBJ_INVENT || !linkedIds(state.invent, 'nobj').includes(carried.o_id))
        throw new Error('real addinv_runtime did not insert the source-created glob into hero inventory');

    const floorGlob = await mksobj_at(GLOB_OF_GRAY_OOZE, x, y, true, false, env);
    setup.floorGlob = floorGlob;
    setup.floorId = floorGlob?.o_id;
    if (!floorGlob || floorGlob.where !== OBJ_FLOOR || floorGlob.otyp !== GLOB_OF_GRAY_OOZE
        || !floorGlob.globby || floorGlob.quan !== 1 || !(floorGlob.age > 0)
        || !(floorGlob.owt > 0) || !Number.isInteger(floorGlob.timed) || floorGlob.timed < 1)
        throw new Error('real mksobj_at did not create/place the second timed glob');
    const squareIds = linkedIds(state.level.objects?.[x]?.[y] ?? null, 'nexthere');
    if (!squareIds.includes(floorGlob.o_id) || !linkedIds(state.level.objlist, 'nobj').includes(floorGlob.o_id))
        throw new Error('canonical floor writers did not place floor glob in both square and level lists');
    const timerObjectIds = new Set();
    for (let timer = state.gt?.timer_base ?? null; timer; timer = timer.next) {
        if (timer.arg?.o_id === carried.o_id || timer.arg?.o_id === floorGlob.o_id)
            timerObjectIds.add(timer.arg.o_id);
    }
    if (!timerObjectIds.has(carried.o_id) || !timerObjectIds.has(floorGlob.o_id))
        throw new Error('canonical glob constructors did not install both object timers');
    const inventoryAfter = [];
    for (let obj = state.invent ?? null; obj; obj = obj.nobj) inventoryAfter.push(obj.otyp);
    if (inventoryAfter.filter((otyp) => otyp === GLOB_OF_GRAY_OOZE).length !== 1)
        throw new Error('fixture has a pre-existing or competing compatible inventory glob');
    if (!mergable(carried, floorGlob, { state }))
        throw new Error('source mergable predicate rejects the canonical glob pair');
    if (carried.nomerge || floorGlob.nomerge || carried.how_lost !== floorGlob.how_lost
        || Boolean(carried.blessed) !== Boolean(floorGlob.blessed)
        || Boolean(carried.cursed) !== Boolean(floorGlob.cursed))
        throw new Error('source BUC/loss/nomerge merge prerequisites do not hold');
    savePrefix('02-canonical-pair', project());

    if (squareIds.length !== 1 || squareIds[0] !== floorGlob.o_id)
        throw new Error('fixed target must contain exactly the newly constructed floor glob');
    const beforeTarget = project();
    savePrefix('03-before-pickup-intent', { phase: 'target-intent', callEntered: false,
        invocationCount: 0, entry: 'await pickup(-1, state)', before: beforeTarget });
    invocation = { phase: 'entered', entry: 'await pickup(-1, state)', started: false,
        before: beforeTarget, error: null, returnValue: null };
    phase = 'invocation';
    invocation.started = true;
    callEntered = true;
    invocationCount = 1;
    try {
        invocation.returnValue = await pickup(-1, state);
        invocation.phase = 'returned';
    } catch (error) {
        primaryError = errorRecord(error);
        invocation.error = primaryError;
        invocation.phase = 'threw';
    }
    try { savePrefix('04-target-result', { invocationCount, callEntered, invocation }); }
    catch (saveError) { observerError ??= errorRecord(saveError); }
} catch (error) {
    primaryError ??= errorRecord(error);
    state = state ?? game;
    if (phase === 'startup') phase = 'startup-threw';
    else if (phase !== 'invocation') phase = 'setup-threw';
    try { savePrefix('startup-or-setup-error', { phase, started, primaryError,
        stateAvailable: Boolean(state), screen: display.serialize(), toplin: display.toplin,
        topMessage: display.topMessage, waitEpoch: display.waitEpoch,
        queueLength: display.terminal.inputQueueLength, waiting: display.terminal.isWaitingForInput,
        pendingInputCodes: display.terminal._inputQueue?.slice() ?? null,
        pendingMessagePresent: Object.hasOwn(game, '_pending_message'), pendingMessage: game._pending_message ?? null,
        coreCtx: state?.coreCtx ? rngContext(state.coreCtx) : null,
        displayCtx: state?.displayCtx ? rngContext(state.displayCtx) : null,
        rng: state ? getRngLog().slice() : [] }); }
    catch (saveError) { observerError ??= errorRecord(saveError); }
} finally {
    // Restore the previous callback before any optional/fallible projection.
    display.onEmptyQueue = previousOnEmptyQueue;
    handlerRestored = display.onEmptyQueue === previousOnEmptyQueue;
}
try {
    if (state) after = project();
} catch (error) {
    // Keep the original target/startup failure authoritative.
    observerError ??= errorRecord(error);
}
const finalRecord = { invocationCount, callEntered, handlerRestored,
    phase, requestedInput, startup: { started }, entry: 'pickup(-1, state)',
    invocation, setup: setup ? { carriedId: setup.carriedId, floorId: setup.floorId,
        x: setup.x, y: setup.y } : null,
    acknowledgements, primaryError, observerError, after };
savePrefix('04-after-target-or-error', finalRecord);
console.log(JSON.stringify({ outputDir, phase, primaryError,
    targetIds: setup ? { carried: setup.carriedId, floor: setup.floorId } : null }));
