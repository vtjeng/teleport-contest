// Proposed source fixture only. It was not imported or executed in this task.
import fs from 'node:fs';
import path from 'node:path';
import { NethackGame } from '../../js/jsmain.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { makemon_runtime } from '../../js/makemon_create.js';
import { PM_GELATINOUS_CUBE } from '../../js/monsters.js';
import {
    NO_MINVENT, OBJ_FREE, OBJ_FLOOR, OBJ_CONTAINED, OBJ_MINVENT,
    TIMER_OBJECT, SHRINK_GLOB, Upolyd, LOST_NONE,
} from '../../js/const.js';
import { MORE_PROMPT } from '../../js/tty_message.js';
import { SACK, GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import { m_at } from '../../js/monst.js';
import { addToMinvRuntime, addToContainerRuntime, container_weight, mergable } from '../../js/invent.js';
import { mksobj, place_object } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { meatobj } from '../../js/mon.js';
import * as canonicalRng from '../../js/rng.js';

const input = Object.freeze({
    seed: 2026101801,
    datetime: '20261018120000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:lawful\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n',
});
const outputDir = process.env.CUBE_MEATOBJ_OUTPUT_DIR;
if (!outputDir) throw new Error('CUBE_MEATOBJ_OUTPUT_DIR must name a fresh output directory');
fs.mkdirSync(outputDir, { recursive: false });
const out = name => path.join(outputDir, name);
const counters = { startup: 0, constructor: 0, residentFactory: 0, residentInsert: 0,
    sackFactory: 0, incomingFactory: 0, containerInsert: 0, containerWeight: 0,
    floorPlacement: 0, meatobj: 0 };
const errors = { primary: null, setup: null, observer: null, save: null, restore: null, capture: null };
const refs = { game: null, u: null, level: null, uz: null, hero: null, inventory: [], floor: [] };
let display, oldHandler, harness, cube, resident, sack, incoming, phase = 'prestart', stop = null;
let inputCount = 0;

function encode(root) {
    const ids = new Map();
    function visit(value) {
        if (value === undefined) return { $undefined: true };
        if (typeof value === 'bigint') return { $bigint: String(value) };
        if (typeof value === 'function') return { $function: value.name || '(anonymous)' };
        if (typeof value === 'symbol') return { $symbol: String(value) };
        if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
        if (value === null || typeof value !== 'object') return value;
        if (ids.has(value)) return { $ref: ids.get(value) };
        const id = ids.size + 1;
        ids.set(value, id);
        if (Array.isArray(value)) return { $id: id, $array: value.map(visit) };
        const result = { $id: id };
        for (const key of Object.keys(value)) result[key] = visit(value[key]);
        return result;
    }
    return visit(root);
}
function clone(value) {
    const seen = new Map();
    function copy(v) {
        if (v === null || typeof v !== 'object') return v;
        if (seen.has(v)) return seen.get(v);
        const result = Array.isArray(v) ? [] : {};
        seen.set(v, result);
        for (const key of Object.keys(v)) result[key] = copy(v[key]);
        return result;
    }
    return copy(value);
}
function rawField(obj, key) {
    const present = Boolean(obj && Object.hasOwn(obj,key));
    const value = present ? obj[key] : undefined;
    return { present, type: value === undefined ? 'undefined' : typeof value,
        value: value === undefined ? { absentOrUndefined: true } : value };
}
function write(name, value) {
    try { fs.writeFileSync(out(name), `${JSON.stringify(encode(value), null, 2)}\n`, { flag: 'wx' }); }
    catch (e) { errors.save ??= { phase, file: name, name: e?.name, message: e?.message, stack: e?.stack }; throw e; }
}
function observe(name, fn) {
    try { return fn(); }
    catch (e) { errors.observer ??= { phase, name, message: e?.message, stack: e?.stack }; throw e; }
}
function objectRows(head, link = 'nobj') {
    const rows = [], seen = new Set();
    for (let o = head ?? null; o; o = o[link] ?? null) {
        if (seen.has(o)) { rows.push({ cycleAt: o.o_id ?? null }); break; }
        seen.add(o);
        const row = { id: o.o_id ?? null, otyp: o.otyp ?? null, where: o.where ?? null,
            quan: o.quan ?? null, age: o.age ?? null, owt: o.owt ?? null, globby: o.globby ?? null,
            timed: o.timed ?? null, oclass: o.oclass ?? null, mass: o.mass ?? null,
            blessed: o.blessed ?? null, cursed: o.cursed ?? null, unpaid: o.unpaid ?? null,
            no_charge: o.no_charge ?? null, nomerge: o.nomerge ?? null,
            how_lost: o.how_lost ?? null, ox: o.ox ?? null, oy: o.oy ?? null };
        if (o.where === OBJ_MINVENT) row.ocarryId = o.ocarry?.m_id ?? null;
        else if (o.where === OBJ_CONTAINED) row.ocontainerId = o.ocontainer?.o_id ?? null;
        else if (o.where === OBJ_FLOOR) row.nexthereId = o.nexthere?.o_id ?? null;
        else if (o.where === OBJ_FREE) { row.nobjId = o.nobj?.o_id ?? null; row.nexthereId = o.nexthere?.o_id ?? null; }
        rows.push(row);
        if (rows.length === 4096) { rows.push({ truncated: true }); break; }
    }
    return rows;
}
function monsterRows(head) {
    const rows = [], seen = new Set();
    for (let m = head ?? null; m; m = m.nmon ?? null) {
        if (seen.has(m)) { rows.push({ cycleAt: m.m_id ?? null }); break; }
        seen.add(m); rows.push({ id: m.m_id ?? null, species: m.data?.pmidx ?? null,
            x: m.mx ?? null, y: m.my ?? null, hp: m.mhp ?? null, tame: m.mtame ?? null,
            peaceful: m.mpeaceful ?? null, minv: objectRows(m.minvent) });
        if (rows.length === 4096) { rows.push({ truncated: true }); break; }
    }
    return rows;
}
function hasRef(head, target, link) {
    const seen = new Set();
    for (let o=head ?? null; o; o=o[link] ?? null) { if (o===target) return true; if(seen.has(o)) return false; seen.add(o); }
    return false;
}
function refsInChain(head, link) {
    const out=[], seen=new Set();
    for(let o=head ?? null;o;o=o[link] ?? null) { if(seen.has(o)) break; seen.add(o); out.push(o); }
    return out;
}
function objectReceipt(o) {
    return o ? {id:o.o_id ?? null,otyp:o.otyp ?? null,where:o.where ?? null,quan:o.quan ?? null,
        oclass:o.oclass ?? null,baseWeight:game.objects?.[o.otyp]?.oc_weight ?? null,
        age:o.age ?? null,owt:o.owt ?? null,globby:o.globby ?? null,timed:o.timed ?? null,
        blessed:o.blessed ?? null,cursed:o.cursed ?? null,unpaid:o.unpaid ?? null,
        no_charge:o.no_charge ?? null,nomerge:o.nomerge ?? null,how_lost:o.how_lost ?? null,
        mass:o.mass ?? null,olocked:o.olocked ?? null,otrapped:o.otrapped ?? null} : null;
}
function contentRows(container, seen = new Set()) {
    if (!container || seen.has(container)) return container ? [{cycleAt:container.o_id ?? null}] : [];
    seen.add(container); const rows=[], siblingSeen=new Set();
    for(let o=container.cobj ?? null;o;o=o.nobj ?? null) {
        if(siblingSeen.has(o)) { rows.push({cycleAt:o.o_id ?? null}); break; }
        siblingSeen.add(o); rows.push({...objectReceipt(o),children:contentRows(o,seen)});
    }
    return rows;
}
function shrinkTimerFacts(o) {
    const rows=[],seen=new Set();
    for(let t=game.gt?.timer_base ?? null;t;t=t.next ?? null) {
        if(seen.has(t)) break; seen.add(t);
        if(t.arg===o) rows.push({exactArg:t.arg===o,otyp:o.otyp,where:o.where,
            kind:t.kind,func_index:t.func_index,timeout:t.timeout,tid:t.tid,
            rootMoves:game.moves,future:Number.isFinite(t.timeout)&&t.timeout>game.moves});
    }
    return rows;
}
function assertGlobFacts(label,o,expectedType,expectedWhere=OBJ_FREE,expectedOwner=null) {
    const timers=shrinkTimerFacts(o);
    const ownerOk=expectedWhere===OBJ_MINVENT ? o?.ocarry===expectedOwner
        : expectedWhere===OBJ_CONTAINED ? o?.ocontainer===expectedOwner : true;
    const ok=Boolean(o && o.where===expectedWhere && ownerOk
        && (expectedWhere!==OBJ_FREE || (!o.nobj && !o.nexthere && !o.ocarry && !o.ocontainer))
        && o.otyp===expectedType && o.quan===1 && Number.isFinite(o.owt)&&o.owt>0
        && Number.isFinite(o.age)&&o.age>0 && Number.isFinite(o.timed)
        && !o.blessed && !o.cursed && !o.unpaid && !o.nomerge && o.how_lost===LOST_NONE
        && timers.length>0 && timers.every(t=>t.exactArg && t.kind===TIMER_OBJECT
            && t.func_index===SHRINK_GLOB && t.future));
    if(!ok) throw new Error(`${label} natural free/glob/timer contract missing`);
    return { object:objectReceipt(o), timers };
}
function assertNaturalObject(label,o,expectedType) {
    if(o?.where!==OBJ_FREE || o?.nobj || o?.nexthere)
        throw new Error(`${label} is not a natural unlinked FREE object`);
    return assertGlobFacts(label,o,expectedType,OBJ_FREE);
}
function assertSackFactory(o) {
    if(!o || o.where!==OBJ_FREE || o.nobj || o.nexthere || o.ocarry || o.ocontainer || o.otyp!==SACK || o.quan!==1
        || !(o.owt>0) || !(o.age>0) || !Number.isFinite(o.timed) || o.blessed || o.cursed
        || o.unpaid || o.nomerge || o.how_lost!==LOST_NONE || o.cobj || o.olocked || o.otrapped)
        throw new Error('natural empty/unlocked/untrapped SACK contract missing');
    return objectReceipt(o);
}
function assertSackBeforeWriter(o, requireEmpty) {
    if(!o || o.where!==OBJ_FREE || o.nobj || o.nexthere || o.ocarry || o.ocontainer || o.otyp!==SACK || o.quan!==1
        || !(o.owt>0) || !(o.age>0) || !Number.isFinite(o.timed) || o.blessed || o.cursed
        || o.unpaid || o.nomerge || o.how_lost!==LOST_NONE || o.olocked || o.otrapped
        || (requireEmpty ? Boolean(o.cobj) : o.cobj!==incoming))
        throw new Error('real SACK pre-writer owner/default contract missing');
    return objectReceipt(o);
}
function ownerChecks() { return {
    cubeNmon: hasRef(game?.level?.monlist,cube,'nmon'),
    cubeGrid: Boolean(cube && game?.level?.monsters?.[cube.mx]?.[cube.my]===cube),
    residentMinv: hasRef(cube?.minvent,resident,'nobj'),
    sackFloor: hasRef(game?.level?.objlist,sack,'nobj'),
    sackTile: Boolean(sack && hasRef(game?.level?.objects?.[sack.ox]?.[sack.oy],sack,'nexthere')),
    incomingContained: hasRef(sack?.cobj,incoming,'nobj'),
    originalInventory: refs.inventory.every(o=>hasRef(game?.invent,o,'nobj')),
    originalFloor: refs.floor.every(o=>hasRef(game?.level?.objlist,o,'nobj')) };
}
function assertBaseline(cell) {
    const owners=ownerChecks();
    const ok=game===refs.game && game.u===refs.u && game.level===refs.level && game.u?.uz===refs.uz
        && game.u?.ux===refs.hero.x && game.u?.uy===refs.hero.y && game.u.uhp>0
        && !Boolean(game.program_state?.gameover) && !Upolyd(game.u) && Math.trunc(game.multi??0)>=0
        && Number.isInteger(cube?.m_id) && cube.m_id>0
        && cube?.data===game.mons?.[PM_GELATINOUS_CUBE] && cube.mhp>0 && !cube.mtame
        && cube.mx===cell.x && cube.my===cell.y && cube.minvent===resident && !resident?.nobj
        && owners.cubeNmon && owners.cubeGrid
        && owners.residentMinv && owners.sackFloor && owners.sackTile && owners.incomingContained
        && sack?.cobj===incoming && !incoming?.nobj
        && owners.originalInventory && owners.originalFloor;
    if(!ok) throw new Error('live game/hero/cube/owner baseline contract missing');
    return owners;
}
function timerRows(objects) {
    const rows = [], seen = new Set();
    for (let t = game.gt?.timer_base ?? null; t; t = t.next ?? null) {
        if (seen.has(t)) { rows.push({ cycle: true }); break; }
        seen.add(t);
        rows.push({ objectId: t.arg?.o_id ?? null, objectOtyp:t.arg?.otyp ?? null,
            objectWhere:t.arg?.where ?? null, objectMass:t.arg?.mass ?? null,
            targetObjectId: objects.find(o=>o===t.arg)?.o_id ?? null, exactArg: objects.some(o=>o===t.arg),
            kind:t.kind ?? null,func_index:t.func_index ?? null,timeout:t.timeout ?? null,
            tid:t.tid ?? null,rootMoves:game.moves,future:Number.isFinite(t.timeout)&&t.timeout>game.moves,
            timerObject:t.kind===TIMER_OBJECT,shrinkGlob:t.func_index===SHRINK_GLOB });
        if (rows.length >= 8192) { rows.push({ truncated: true }); break; }
    }
    return rows;
}
function rngReceipt(state = game, required = true) {
    const log = canonicalRng.getRngLog();
    if (!Array.isArray(log)) throw new Error('canonical RNG log unavailable');
    if (required && (!state?.coreCtx || !state?.displayCtx)) throw new Error('initialized ISAAC contexts unavailable after startup');
    return { length: log.length, log: [...log], coreCtx: state?.coreCtx ? canonicalRng.cloneIsaacContext(state.coreCtx) : null,
        displayCtx: state?.displayCtx ? canonicalRng.cloneIsaacContext(state.displayCtx) : null,
        corePresent:Boolean(state?.coreCtx),displayPresent:Boolean(state?.displayCtx) };
}
function startupRngReceipt(state = game) {
    try {
        const log=canonicalRng.getRngLog();
        return { logPresent:Array.isArray(log), length:Array.isArray(log)?log.length:null,
            log:Array.isArray(log)?[...log]:null,
            corePresent:Boolean(state?.coreCtx),displayPresent:Boolean(state?.displayCtx),
            coreCtx:state?.coreCtx?canonicalRng.cloneIsaacContext(state.coreCtx):null,
            displayCtx:state?.displayCtx?canonicalRng.cloneIsaacContext(state.displayCtx):null };
    } catch(e) { return { error:{name:e?.name,message:e?.message} }; }
}
function displayReceipt() {
    const q = display?.terminal?._inputQueue;
    return { serialized: display?.serialize?.() ?? null, topMessage: display?.topMessage ?? null,
        topline: display?.toplin ?? null,
        waiting: Boolean(display?.isWaitingForInput),
        queueValues: Array.isArray(q) ? q.map(x=>['string','number','boolean'].includes(typeof x)?x:`<${typeof x}>`) : null,
        queueLength: display?.terminal?.inputQueueLength ?? null,
        waitEpoch: display?.terminal?.waitEpoch ?? null,
        resolverPending: Boolean(display?.terminal?._inputResolver), resolverType: typeof display?.terminal?._inputResolver,
        activeOptionKeys: display?.terminal?._activeOptions ? Object.keys(display.terminal._activeOptions) : [] };
}
function snapshot(stage) {
    const inv = objectRows(game?.invent), floor = objectRows(game?.level?.objlist);
    const monsters = monsterRows(game?.level?.monlist);
    return { stage, rootMoves: Math.trunc(game?.moves ?? 0), stateRefs: {
        game: game === refs.game, hero: game?.u === refs.u, level: game?.level === refs.level,
        levelInfo: game?.u?.uz === refs.uz, initialHero: refs.hero,
        currentHero: { x: game?.u?.ux ?? null, y: game?.u?.uy ?? null },
        sameHeroPosition: Boolean(refs.hero && refs.hero.x === game?.u?.ux && refs.hero.y === game?.u?.uy),
    }, hero: { hp: game?.u?.uhp ?? null, gameover: Boolean(game?.program_state?.gameover),
        upolyd: game?.u ? Upolyd(game.u) : null, multi: Math.trunc(game?.multi ?? 0),
        inventory: inv, startingInventoryIds: refs.inventory.map(o => o.o_id),
        startingInventoryRefsRetained: ownerChecks().originalInventory,
        sourceFields: clone({ context: game?.context, go: game?.go, gs: game?.gs, gc: game?.gc,
            gv: game?.gv, iflags: game?.iflags, program_state: game?.program_state,
            nomovemsg: game?.nomovemsg, multi_reason: game?.multi_reason, afternmv: game?.afternmv }) },
        cube: cube ? { id: cube.m_id ?? null, ptr: cube.data?.pmidx ?? null,
            xy: [cube.mx, cube.my], hp: cube.mhp ?? null, tame: cube.mtame ?? null,
            peaceful: cube.mpeaceful ?? null, minv: objectRows(cube.minvent) } : null,
        cubeTileId: cube ? game.level?.monsters?.[cube.mx]?.[cube.my]?.m_id ?? null : null,
        nmon: monsters, floorList: floor, ownerChecks: ownerChecks(), floorPile: cube
            ? objectRows(game.level?.objects?.[cube.mx]?.[cube.my], 'nexthere') : [],
        resident: objectReceipt(resident), sack: sack ? {...objectReceipt(sack),children:contentRows(sack)} : null,
        inventoryContents: refs.inventory.map(o=>({id:o.o_id,children:contentRows(o)})),
        floorContents: refs.floor.map(o=>({id:o.o_id,children:contentRows(o)})),
        incoming: objectReceipt(incoming),
        clock: { moves: rawField(game,'moves'), multi: rawField(game,'multi'), gameover: rawField(game.program_state,'gameover') },
        timers: timerRows([resident, sack, incoming]), rng: rngReceipt(game, stage !== 'startup-threw'), display: displayReceipt() };
}
function capture(stage) { const data = observe(stage, () => clone(snapshot(stage))); write(`${stage}.json`, data); return data; }
function promptInput() {
    inputCount++;
    write(`startup-input-${String(inputCount).padStart(2,'0')}-intent.json`, { entered:true,count:inputCount,operationPhase:phase });
    const frame = observe(`startup-input-${String(inputCount).padStart(2,'0')}`, () => displayReceipt());
    write(`startup-input-${String(inputCount).padStart(2,'0')}.json`, { count: inputCount,
        operationPhase: phase, frame, pendingMessage: rawField(game,'_pending_message'),
        queueLength: Array.isArray(display?.terminal?._inputQueue) ? display.terminal._inputQueue.length : null,
        resolverPending: Boolean(display?.terminal?._inputResolver), rng: startupRngReceipt(game) });
    if (inputCount > 16) throw new Error('startup More input cap 16 reached; no retry');
    if (String(frame.serialized ?? '').includes(MORE_PROMPT)) return 32;
    throw new Error('unknown startup input request; retained frame, no guessed input');
}

try {
    write('prestart-intent.json', { entered: false, count: 0, input });
    write('prestart.json', { input, rngLog: canonicalRng.getRngLog(),
        coreCtx: game?.coreCtx ? canonicalRng.cloneIsaacContext(game.coreCtx) : null,
        displayCtx: game?.displayCtx ? canonicalRng.cloneIsaacContext(game.displayCtx) : null,
        rawMoves: Object.hasOwn(game, 'moves') ? game.moves : { absent: true },
        rawMulti: Object.hasOwn(game, 'multi') ? game.multi : { absent: true } });
    display = new GameDisplay(null);
    oldHandler = display.onEmptyQueue;
    display.onEmptyQueue = promptInput;
    harness = new NethackGame(input);
    harness._pendingDisplay = display;
    phase = 'startup';
    write('startup-intent.json', { entered: false, count: 0 });
    let started;
    counters.startup = 1;
    try { started = await harness.start(); }
    catch (error) {
        errors.setup ??= {phase,name:error?.name ?? 'Error',message:error?.message ?? String(error),
            stack:error?.stack ?? null,operation:error?.operation ?? null,otyp:error?.otyp ?? null};
        refs.game = game; refs.u = game.u; refs.level = game.level; refs.uz = game.u?.uz;
        refs.hero = { x: game.u?.ux ?? null, y: game.u?.uy ?? null };
        refs.inventory = refsInChain(game.invent,'nobj'); refs.floor = refsInChain(game.level?.objlist,'nobj');
        try { capture('startup-threw'); } catch (observerError) { errors.observer ??= {name:observerError?.name,message:observerError?.message}; }
        throw error;
    }
    write('startup-return.json', { returned: true, started });
    refs.game = game; refs.u = game.u; refs.level = game.level; refs.uz = game.u?.uz;
    refs.hero = { x: game.u?.ux ?? null, y: game.u?.uy ?? null };
    refs.inventory = refsInChain(game.invent,'nobj');
    refs.floor = refsInChain(game.level?.objlist,'nobj');
    capture('startup');
    if (started === false || !game.u || !(game.u.uhp > 0)
        || Boolean(game.program_state?.gameover) || Upolyd(game.u)
        || Math.trunc(game.multi ?? 0) < 0) throw new Error('ordinary live startup prerequisite missed');

    const cell = { x: refs.hero.x + 1, y: refs.hero.y };
    const terrain = game.level?.at?.(cell.x, cell.y) ?? null;
    if (!terrain || m_at(cell.x, cell.y, game))
        throw new Error('fixed original hero X+1,Y cube square unavailable; no coordinate search');
    const terrainReceipt = typeof terrain === 'object'
        ? { present:true, type:terrain.typ ?? terrain.type ?? null, passable:terrain.passable ?? null }
        : { present:true, value:terrain };
    const env = objectGenerationEnv({ state: game, random: canonicalRng });
    write('cube-constructor-intent.json', { entered: false, count: 0, species: PM_GELATINOUS_CUBE,
        x: cell.x, y: cell.y, flags: NO_MINVENT, terrain:terrainReceipt });
    phase = 'cube-constructor'; counters.constructor = 1;
    cube = await makemon_runtime(game.mons[PM_GELATINOUS_CUBE], cell.x, cell.y, NO_MINVENT, env);
    write('cube-constructor-return.json', { returned: Boolean(cube), id: cube?.m_id ?? null, cell });
    capture('cube-created');
    if (!cube || cube.data !== game.mons[PM_GELATINOUS_CUBE]
        || cube.mx !== cell.x || cube.my !== cell.y
        || game.level.monsters?.[cell.x]?.[cell.y] !== cube
        || !hasRef(game.level.monlist,cube,'nmon')
        || cube.minvent) throw new Error('canonical cube constructor/list/grid/NO_MINVENT prerequisite missed');

    write('resident-glob-intent.json', { entered: false, count: 0, factory: 'mksobj(GLOB_OF_GRAY_OOZE,true,false,env)' });
    phase = 'resident-glob-factory'; counters.residentFactory = 1;
    resident = mksobj(GLOB_OF_GRAY_OOZE, true, false, env);
    write('resident-glob-created.json', { returned: Boolean(resident), object: objectReceipt(resident) });
    capture('resident-before-minv');
    const residentFactoryReceipt=assertNaturalObject('resident gray glob',resident,GLOB_OF_GRAY_OOZE);
    if (!resident.globby) throw new Error('resident gray glob not naturally globby');
    write('resident-insert-intent.json', { entered: false, count: 0, cubeId: cube.m_id, objectId: resident.o_id });
    phase = 'resident-minv-insert'; counters.residentInsert = 1;
    assertNaturalObject('resident gray glob before minv writer',resident,GLOB_OF_GRAY_OOZE);
    const residentResult = await addToMinvRuntime(cube, resident, env);
    write('resident-minv-inserted.json', { returned: residentResult, cubeId: cube.m_id, objectId: resident.o_id });
    capture('resident-after-minv');
    if (residentResult !== false || resident.where !== OBJ_MINVENT || resident.ocarry !== cube
        || cube.minvent !== resident || resident.nobj) throw new Error('canonical addToMinvRuntime did not insert resident glob');

    write('sack-intent.json', { entered: false, count: 0, factory: 'mksobj(SACK,false,false,env)' });
    phase = 'sack-factory'; counters.sackFactory = 1;
    sack = mksobj(SACK, false, false, env);
    write('sack-created.json', { returned: Boolean(sack), object: objectReceipt(sack) });
    capture('sack-before-child');
    const sackFactoryReceipt=assertSackFactory(sack);

    write('incoming-glob-intent.json', { entered: false, count: 0, factory: 'mksobj(GLOB_OF_GRAY_OOZE,true,false,env)' });
    phase = 'incoming-glob-factory'; counters.incomingFactory = 1;
    incoming = mksobj(GLOB_OF_GRAY_OOZE, true, false, env);
    write('incoming-glob-created.json', { returned: Boolean(incoming), object: objectReceipt(incoming) });
    capture('incoming-before-container');
    const incomingFactoryReceipt=assertNaturalObject('incoming gray glob',incoming,GLOB_OF_GRAY_OOZE);
    if (!incoming.globby) throw new Error('incoming gray glob not naturally globby');
    write('container-insert-intent.json', { entered: false, count: 0, sackId: sack.o_id, objectId: incoming.o_id });
    phase = 'container-insert'; counters.containerInsert = 1;
    assertNaturalObject('incoming gray glob before container writer',incoming,GLOB_OF_GRAY_OOZE);
    assertSackBeforeWriter(sack,true);
    const containedResult = await addToContainerRuntime(sack, incoming, env);
    write('container-inserted.json', { returnedId: containedResult?.o_id ?? null, sameObject: containedResult === incoming });
    capture('container-after-child');
    if (containedResult !== incoming || incoming.where !== OBJ_CONTAINED
        || incoming.ocontainer !== sack || sack.cobj !== incoming || incoming.nobj)
        throw new Error('canonical addToContainerRuntime did not insert child');
    write('container-weight-intent.json', { entered: false, count: 0, sackId: sack.o_id });
    phase = 'container-weight'; counters.containerWeight = 1;
    assertSackBeforeWriter(sack,false);
    assertGlobFacts('contained gray glob before container_weight',incoming,GLOB_OF_GRAY_OOZE,OBJ_CONTAINED,sack);
    container_weight(sack, env);
    write('container-weighted.json', { sackId: sack.o_id, owt: sack.owt, childId: incoming.o_id, childOwt: incoming.owt });
    capture('container-after-weight');

    write('floor-placement-intent.json', { entered: false, count: 0, sackId: sack.o_id, x: cell.x, y: cell.y });
    phase = 'floor-placement'; counters.floorPlacement = 1;
    assertSackBeforeWriter(sack,false);
    assertGlobFacts('contained gray glob before floor placement',incoming,GLOB_OF_GRAY_OOZE,OBJ_CONTAINED,sack);
    const placed = place_object(sack, cell.x, cell.y, env);
    if (placed && typeof placed.then === 'function') await placed;
    write('floor-placement-return.json', { sackId: sack.o_id, x: cell.x, y: cell.y, where: sack.where });
    const pairMergeEligible = mergable(resident,incoming,env);
    write('target-intent.json', { entered: false, count: 0, pairMergeEligible,
        factoryReceipts:{resident:residentFactoryReceipt,sack:sackFactoryReceipt,incoming:incomingFactoryReceipt},
        entry: 'await meatobj(realCube,fullCanonicalEnv)', cubeId:cube.m_id,
        species:PM_GELATINOUS_CUBE,residentId:resident.o_id,sackId:sack.o_id,
        containedGlobId:incoming.o_id,fixedCell:cell,
        expectedCSequence:'mon.c:meatobj -> m_consume_obj -> meatbox -> mpickobj' });
    const before = capture('before-meatobj');
    if (!pairMergeEligible) throw new Error('source-shaped resident/incoming glob pair is not mergable');
    assertGlobFacts('resident gray glob before target',resident,GLOB_OF_GRAY_OOZE,OBJ_MINVENT,cube);
    assertGlobFacts('incoming gray glob before target',incoming,GLOB_OF_GRAY_OOZE,OBJ_CONTAINED,sack);
    assertBaseline(cell);
    if (sack.where !== OBJ_FLOOR || sack.ox !== cell.x || sack.oy !== cell.y
        || !before.ownerChecks.sackTile || !before.ownerChecks.cubeNmon
        || !before.ownerChecks.cubeGrid || !before.ownerChecks.residentMinv || !before.ownerChecks.incomingContained
        || !before.ownerChecks.originalInventory || !before.ownerChecks.originalFloor)
        throw new Error('real owners/order/baseline no longer match proposed target');

    write('target-ready.json', { entered:false,count:0,owners:before.ownerChecks,pairMergeEligible });
    phase = 'meatobj'; counters.meatobj = 1;
    let targetResult = null, targetThrown = null;
    try { targetResult = await meatobj(cube, env); }
    catch (error) { targetThrown = { name:error?.name, message:error?.message, stack:error?.stack,
        operation:error?.operation, otyp:error?.otyp, phase, count:counters.meatobj }; errors.primary = targetThrown; }
    try { write('target-return.json', { returned: !targetThrown, value: targetResult, thrown: targetThrown, counter: counters.meatobj }); }
    catch (error) { errors.save ??= { file:'target-return.json', message:error?.message }; }
    if (targetThrown) {
        try { write('error-prefix.json', { phase, primary:targetThrown, counters:{...counters},
            ownerChecks:ownerChecks(), errors:{...errors} }); }
        catch (error) { errors.save ??= { file:'error-prefix.json', message:error?.message }; }
    }
    try { capture('after-meatobj'); } catch (error) { errors.capture ??= { name:error?.name, message:error?.message }; }
} catch (error) {
    const record = { phase, name: error?.name ?? 'Error', message: error?.message ?? String(error),
        stack: error?.stack ?? null, operation: error?.operation ?? null, otyp: error?.otyp ?? null };
    if (phase === 'meatobj') errors.primary ??= record;
    else errors.setup ??= record;
    stop ??= phase === 'meatobj' ? 'one actual target error/return retained; no retry' : 'setup prerequisite missed; no recovery/search';
    try { write('error-prefix.json', { phase, record, counters, errors, stop }); }
    catch (e) { errors.capture ??= { name: e?.name, message: e?.message }; }
} finally {
    try { if (display) display.onEmptyQueue = oldHandler; }
    catch (e) { errors.restore ??= { name: e?.name, message: e?.message, stack: e?.stack }; }
    try { write('restoration.json', { handlerRestored: !display || display.onEmptyQueue === oldHandler,
        counters:{...counters},errors:{...errors},stop,root:{moves:rawField(game,'moves'),multi:rawField(game,'multi'),
            gameover:rawField(game.program_state,'gameover')},actor:{id:game.u?.m_id ?? null,hp:game.u?.uhp ?? null,
            x:game.u?.ux ?? null,y:game.u?.uy ?? null},owners:ownerChecks() }); }
    catch (e) { errors.save ??= { file: 'restoration.json', message: e?.message }; }
}
try { write('final.json', { input, counters, errors, stop, phase,
    final: observe('final', () => clone(snapshot('final'))), handlerRestored: !display || display.onEmptyQueue === oldHandler }); }
catch (e) {
    errors.capture ??= { name: e?.name, message: e?.message, stack:e?.stack };
    try { write('final-fallback.json',{input,counters:{...counters},errors:{...errors},stop,phase,
        handlerRestored:!display || display.onEmptyQueue===oldHandler,
        root:{moves:rawField(game,'moves'),multi:rawField(game,'multi'),gameover:rawField(game.program_state,'gameover')},
        actor:{hp:game.u?.uhp ?? null,x:game.u?.ux ?? null,y:game.u?.uy ?? null},
        owners:ownerChecks()}); }
    catch(fallbackError) { errors.save ??= {file:'final-fallback.json',name:fallbackError?.name,message:fallbackError?.message}; }
}
if(counters.meatobj!==1) stop ??= 'target was not entered exactly once; no claim of target execution';
if (errors.primary || errors.setup || errors.observer || errors.save || errors.restore || errors.capture
    || counters.meatobj !== 1) process.exitCode = 1;
