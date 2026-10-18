// PROPOSAL ONLY. Do not execute until Main selects a new finite qualification.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBJ_BURIED, OBJ_FLOOR, TIMER_OBJECT, SHRINK_GLOB, MENU_TRADITIONAL } from '../../js/const.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import { mergable } from '../../js/invent.js';
import { mksobj_at } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import { bury_an_obj } from '../../js/bury.js';
import { unearth_objs } from '../../js/dig.js';
import { TOPLINE_NEED_MORE } from '../../js/tty_message.js';
import * as rng from '../../js/rng.js';

const requestedInput = {
    seed: 671903,
    instantUTC: '2026-10-17T00:00:00Z',
    datetime: '20261016200000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,menustyle:traditional\n',
};
const runs = join(dirname(fileURLToPath(import.meta.url)), 'runs');
mkdirSync(runs, { recursive: true });
const runDir = mkdtempSync(join(runs, 'invocation-'));
const json = (v) => JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? x.toString() : x, 2) + '\n';
const save = (name, v) => { try { writeFileSync(join(runDir, `${name}.json`), json(v)); } catch(e) { saveError ??= err(e); throw e; } };
const err = (e) => ({ name: e?.name ?? 'Error', message: String(e?.message ?? e), stack: String(e?.stack ?? '') });
const ids = (head, link) => { const out=[]; for(let p=head ?? null;p;p=p[link]) out.push(p.o_id); return out; };
const copyCtx = (c) => {
    if (!c) return null;
    try { return rng.cloneIsaacContext(c); }
    catch(e) { return { cloneError:err(e), raw:{keys:Object.keys(c),m:Array.isArray(c.m)?c.m.slice():null,
        r:Array.isArray(c.r)?c.r.slice():null,other:Object.fromEntries(Object.entries(c).filter(([k])=>k!=='m'&&k!=='r'))} }; }
};
const nh = new NethackGame({ seed: requestedInput.seed, datetime: requestedInput.datetime,
    recorderIsDst: requestedInput.recorderIsDst, nethackrc: requestedInput.nethackrc });
const display = new GameDisplay(null);
const previousOnEmptyQueue = display.onEmptyQueue;
const acknowledgements = [];
display.onEmptyQueue = () => {
    const screen = display.serialize();
    if (display.toplin !== TOPLINE_NEED_MORE || !screen.includes('--More--'))
        throw new Error('input boundary is not a rendered canonical More prompt');
    if (acknowledgements.length >= 16) throw new Error('rendered More acknowledgement budget exhausted');
    acknowledgements.push({ screen, waitEpoch: display.waitEpoch,
        queueLength: display.terminal.inputQueueLength });
    return 32;
};
nh._pendingDisplay = display;
let state = null, phase = 'startup', setup = null, invocation = null;
let primaryError = null, observerError = null, saveError = null, outputError = null;
let callEntered = false, callCount = 0, targetReturn = null;
const rawField = (object,key) => {
    const present=object!=null && Object.hasOwn(object,key), value=present?object[key]:undefined;
    return {present,type:typeof value,undefinedTag:value===undefined?'undefined':null,
        ...(value===undefined?{}:typeof value==='function'?{functionName:value.name||null}
            :value===null||['string','number','boolean','bigint'].includes(typeof value)?{value}
                :Array.isArray(value)?{value:value.slice()}:{valueType:'object'})};
};
const inputOwners = (s=state) => ({pendingMessage:rawField(s,'_pending_message'),
    pendingDisplay:rawField(nh,'_pendingDisplay'),inputQueue:rawField(display.terminal,'_inputQueue'),
    inputResolver:rawField(display.terminal,'_inputResolver'),activeOptions:rawField(display.terminal,'_activeOptions'),
    terminalWaitEpoch:rawField(display.terminal,'_waitEpoch')});
const objectRow = (o) => o ? { id:o.o_id, type:o.otyp, class:o.oclass, where:o.where,
    x:o.ox, y:o.oy, nobj:o.nobj?.o_id ?? null, nexthere:o.nexthere?.o_id ?? null,
    quan:o.quan, mass:o.owt, age:o.age, timed:o.timed, globby:o.globby,
    blessed:o.blessed, cursed:o.cursed, nomerge:o.nomerge, how_lost:o.how_lost,
    unpaid:o.unpaid, no_charge:o.no_charge } : null;
const project = () => {
    const { x, y, first, second } = setup ?? {};
    const at = (obj) => obj ? { queueId:obj.arg?.o_id ?? null, timeout:obj.timeout,
        kind:obj.kind, func_index:obj.func_index, tid:obj.tid, needs_fixup:obj.needs_fixup } : null;
    const timers=[]; for(let t=state.gt?.timer_base ?? null;t;t=t.next) timers.push(at(t));
    return {
        actor:{ x:state.u?.ux, y:state.u?.uy, level:state.u?.uz ? {dnum:state.u.uz.dnum,dlevel:state.u.uz.dlevel}:null,
            hp:state.u?.uhp, gameoverRaw:rawField(state.program_state,'gameover'), gameover:Boolean(state.program_state?.gameover),
            multiRaw:rawField(state,'multi'), multi:state.multi, multiEffective:state.multi??0, moves:state.moves },
        references:{ liveGameBinding:state===game,levelIdentity:state.level===setup?.levelRef,heroIdentity:state.u===setup?.heroRef,
            levelDescriptorIdentity:state.u?.uz===setup?.uzRef,hero:{x:state.u?.ux,y:state.u?.uy},levelDescriptor:state.u?.uz?{dnum:state.u.uz.dnum,dlevel:state.u.uz.dlevel}:null },
        target:{ x, y, terrain:state.level.at(x,y)?.typ ?? null },
        objects:{ first:objectRow(first), second:objectRow(second),
            floorAtTarget:ids(state.level.objects?.[x]?.[y], 'nexthere'),
            levelObjects:ids(state.level.objlist, 'nobj'),
            buried:ids(state.level.buriedobjlist, 'nobj'), inventory:ids(state.invent,'nobj') },
        timers, input:{ screen:display.serialize(), topline:display.toplin,
            waitEpoch:display.waitEpoch, queueLength:display.terminal.inputQueueLength,
            waiting:display.terminal.isWaitingForInput, owner:state.nhDisplay===display ? 'live state nhDisplay' : 'not-live-state-nhDisplay',
            pendingDisplayConsumed:nh._pendingDisplay===null,
            onEmptyQueueType:typeof display.onEmptyQueue,
            acknowledgements:acknowledgements.map((a)=>JSON.parse(json(a))), owners:inputOwners() },
        rng:{ log:rng.getRngLog().slice(), core:copyCtx(state.coreCtx), display:copyCtx(state.displayCtx) },
        screens:nh.getScreens().slice(),
    };
};
const startupSnapshot = () => {
    const s=state ?? game, timers=[];
    for(let t=s?.gt?.timer_base ?? null;t;t=t.next) timers.push({argId:t.arg?.o_id ?? null,timeout:t.timeout,kind:t.kind,func_index:t.func_index,tid:t.tid});
    const x=s?.u?.ux,y=s?.u?.uy;
    return {phase,stateAvailable:!!s,actor:{x,y,level:s?.u?.uz?{dnum:s.u.uz.dnum,dlevel:s.u.uz.dlevel}:null,
        hp:s?.u?.uhp,gameoverRaw:rawField(s?.program_state,'gameover'),gameover:Boolean(s?.program_state?.gameover),
        multiRaw:rawField(s,'multi'),multi:s?.multi,multiEffective:s?.multi??0},references:{liveGameBinding:s===game,levelPresent:!!s?.level,heroPresent:!!s?.u,levelDescriptorPresent:!!s?.u?.uz,hero:{x:s?.u?.ux,y:s?.u?.uy},levelDescriptor:{dnum:s?.u?.uz?.dnum,dlevel:s?.u?.uz?.dlevel}},
        levelObjects:ids(s?.level?.objlist,'nobj'),buried:ids(s?.level?.buriedobjlist,'nobj'),
        floorObjects:s?.u?ids(s?.level?.objects?.[x]?.[y],'nexthere'):[],timers,
        screen:display.serialize(),topline:display.toplin,topMessage:display.topMessage,waitEpoch:display.waitEpoch,
        queueLength:display.terminal.inputQueueLength,waiting:display.terminal.isWaitingForInput,inputOwners:inputOwners(s),
        rng:{log:rng.getRngLog().slice(),core:copyCtx(s?.coreCtx),display:copyCtx(s?.displayCtx)},screens:nh.getScreens().slice()};
};
display.onEmptyQueue=()=>{
    const screen=display.serialize(); let snapshot=null,captureError=null;
    try { snapshot=startupSnapshot(); } catch(e) { captureError=err(e); }
    const receipt={index:acknowledgements.length,screen,topline:display.toplin,topMessage:display.topMessage,
        waitEpoch:display.waitEpoch,queueLength:display.terminal.inputQueueLength,
        waiting:display.terminal.isWaitingForInput,owners:inputOwners(state??game),snapshot,captureError};
    acknowledgements.push(receipt); save(`more-${String(receipt.index).padStart(2,'0')}`,receipt);
    if(captureError) throw new Error(`More receipt snapshot failed: ${captureError.message}`);
    if(display.toplin!==TOPLINE_NEED_MORE||!screen.includes('--More--')) throw new Error('input boundary is not a rendered canonical More prompt');
    if(acknowledgements.length>16) throw new Error('rendered More acknowledgement budget exhausted');
    return 32;
};
try {
    save('00-before-startup',{ requestedInput, phase, actualInputQueue:display.terminal.inputQueueLength,
        displayAssignedBeforeStart:true, screen:display.serialize() });
    let started;
    try { started=await nh.start(); } finally { state=game; }
    phase='poststartup';
    try { save('01-poststartup',startupSnapshot()); }
    catch(e) { observerError ??= err(e); throw e; }
    if (!started) throw new Error('canonical startup did not enter a live game');
    assert.equal(String(state.urole?.name?.m ?? '').toLowerCase(),'archeologist');
    assert.equal(String(state.urace?.noun ?? '').toLowerCase(),'human');
    assert.equal(state.flags?.female,false); assert.equal(state.u?.ualign?.type,0);
    assert.equal(state.flags?.menu_style,MENU_TRADITIONAL); assert.ok(state.u.uhp>0);
    assert.equal(Boolean(state.program_state?.gameover),false);
    const x=state.u.ux, y=state.u.uy, tile=state.level.at(x,y);
    if (!tile) throw new Error('fixed actual hero tile is absent');
    const env=objectGenerationEnv({ state, random:rng });
    setup={ x,y,env,heroRef:state.u,levelRef:state.level,uzRef:state.u.uz,
        levelIdsBefore:ids(state.level.objlist,'nobj'), buriedBefore:ids(state.level.buriedobjlist,'nobj') };
    const first=await mksobj_at(GLOB_OF_GRAY_OOZE,x,y,true,false,env);
    const second=await mksobj_at(GLOB_OF_GRAY_OOZE,x,y,true,false,env);
    setup.first=first; setup.second=second;
    if (!first || !second || first===second || first.otyp!==GLOB_OF_GRAY_OOZE || second.otyp!==GLOB_OF_GRAY_OOZE)
        throw new Error('canonical constructors did not return two distinct same-type globs');
    const beforeBurial={ first:objectRow(first), second:objectRow(second), pile:ids(state.level.objects[x][y],'nexthere'),
        level:ids(state.level.objlist,'nobj'), buried:ids(state.level.buriedobjlist,'nobj') };
    save('01-before-bury',beforeBurial);
    await bury_an_obj(second,env); // only the second constructor-created object is buried.
    const floorIds=ids(state.level.objects[x][y],'nexthere');
    const buriedIds=ids(state.level.buriedobjlist,'nobj');
    assert.equal(first.where,OBJ_FLOOR); assert.ok(floorIds.includes(first.o_id));
    assert.equal(second.where,OBJ_BURIED); assert.ok(buriedIds.includes(second.o_id));
    assert.equal(second.ox,x); assert.equal(second.oy,y);
    assert.equal(Boolean(first.blessed),Boolean(second.blessed));
    assert.equal(Boolean(first.cursed),Boolean(second.cursed));
    assert.equal(Boolean(first.nomerge),Boolean(second.nomerge));
    assert.equal(first.how_lost,second.how_lost);
    assert.equal(mergable(first,second,{state}),true);
    const pairTimers=[]; for(let t=state.gt?.timer_base ?? null;t;t=t.next)
        if(t.arg===first||t.arg===second) pairTimers.push({argId:t.arg?.o_id??null,kind:t.kind,func_index:t.func_index,timeout:t.timeout,tid:t.tid});
    for(const obj of [first,second]) { const timer=pairTimers.find((t)=>t.argId===obj.o_id&&t.kind===TIMER_OBJECT&&t.func_index===SHRINK_GLOB);
        if(!timer||timer.kind!==TIMER_OBJECT||timer.func_index!==SHRINK_GLOB) throw new Error(`canonical SHRINK_GLOB timer absent or mismatched for object ${obj.o_id}`); }
    setup.buriedAfter=buriedIds;
    save('02-after-bury',{ first:objectRow(first), second:objectRow(second), floorIds,
        levelIds:ids(state.level.objlist,'nobj'), buriedIds,
        rngLog:rng.getRngLog().slice(), core:copyCtx(state.coreCtx), display:copyCtx(state.displayCtx) });
    let beforeTargetProjection;
    try { beforeTargetProjection=project(); } catch(e) { observerError ??= err(e); throw e; }
    save('03-before-unearth-intent',{invocationCount:callCount,callEntered,first:objectRow(first),second:objectRow(second),floorIds,buriedIds,fullSnapshot:beforeTargetProjection});
    phase='target-intent';
    invocation={entry:'await unearth_objs(actualHeroX,actualHeroY,{state,random})',intent:true,entered:false,count:0,error:null,returnValue:null};
    let intentProjection;
    try { intentProjection=project(); } catch(e) { observerError ??= err(e); throw e; }
    save('03-target-intent',{phase,callEntered:false,callCount:0,invocation,fullSnapshot:intentProjection});
    const entryReceipt={entry:invocation.entry,intent:true,entered:false,count:0,expectedNextCallCount:1,nextPhase:'target'};
    save('04-call-intent-not-entry',entryReceipt); // intent is not proof of a call; a failed write means no call follows.
    phase='target'; callEntered=true; callCount=1; invocation={entry:entryReceipt.entry,intent:true,entered:true,count:1,error:null,returnValue:null};
    try { targetReturn=await unearth_objs(x,y,{state,random:env.random}); invocation.returnValue=targetReturn??null; phase='returned'; }
    catch(e) { primaryError=err(e); invocation.error=primaryError; phase='threw'; }
    try { save('04-target-outcome',{phase,callEntered,callCount,returnValue:targetReturn??null,invocation,primaryError}); }
    catch(e) { saveError ??= err(e); }
} catch(e) {
    if(!saveError&&!observerError) primaryError ??= err(e);
    if(phase==='startup'||phase==='poststartup') { phase='startup-threw'; state=game; try { save('01-startup-failure',startupSnapshot()); } catch(se) { saveError ??= err(se); } }
    else if(phase!=='target'&&phase!=='returned'&&phase!=='threw') phase='setup-threw';
} finally {
    display.onEmptyQueue=previousOnEmptyQueue;
}
try { save('04-target-result',{ phase, callEntered, callCount, returnValue:targetReturn ?? null,
    invocationError:primaryError, primaryError,
    handlerRestored:display.onEmptyQueue===previousOnEmptyQueue }); }
catch(e) { saveError ??= err(e); }
try {
    const after=state ? project() : null;
    save('04-after-target',{ phase, callEntered, callCount, targetReturn:targetReturn ?? null,
        invocation, primaryError, handlerRestored:display.onEmptyQueue===previousOnEmptyQueue, after });
} catch(e) { observerError ??= err(e); }
try { save('05-final',{ phase, callEntered, callCount, primaryError, observerError, afterHandlerRestored:display.onEmptyQueue===previousOnEmptyQueue }); }
catch(e) { saveError ??= err(e); }
const finalReceipt={phase,callEntered,callCount,primaryError,observerError,saveError,outputError,runDir,
    handlerRestored:display.onEmptyQueue===previousOnEmptyQueue};
try { save('06-final-receipt',finalReceipt); } catch(e) { saveError ??= err(e); }
try { process.stdout.write(json({...finalReceipt,saveError})); }
catch(e) { outputError=err(e); try { writeFileSync(join(runDir,'stdout-fallback.json'),json({...finalReceipt,outputError,saveError})); }
    catch(fe) { saveError ??= err(fe); } }
if(primaryError||observerError||saveError||outputError) process.exitCode=2;
