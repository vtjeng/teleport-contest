// Proposed only: static source review; no import, parse, syntax check, or execution was performed.
// This is a corrected successor; predecessor bytes remain immutable.
// One canonical startup, two source-created held SACK/glob pairs, then exactly
// one public dotip(state) call using live assigned inventory selectors.
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NethackGame } from '../../js/jsmain.js';
import { game } from '../../js/gstate.js';
import { GameDisplay } from '../../js/game_display.js';
import { OBJ_FREE, OBJ_FLOOR, OBJ_INVENT, OBJ_CONTAINED, OBJ_MINVENT, TOPLINE_NEED_MORE,
    TIMER_OBJECT, SHRINK_GLOB, Upolyd } from '../../js/const.js';
import { SACK, GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import { mksobj, weight, isContainer } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { addinv_runtime, addToContainerRuntime, container_weight, mergable } from '../../js/invent.js';
import { dotip } from '../../js/pickup.js';
import * as random from '../../js/rng.js';
const { cloneIsaacContext, getRngLog } = random;

const input = Object.freeze({ seed: 671903, datetime: '20261016200000', recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,menustyle:traditional\n' });
const outputRoot = process.env.TIP_SACK_OUTPUT_DIR;
if (!outputRoot) throw new Error('TIP_SACK_OUTPUT_DIR must name a fresh output directory');
mkdirSync(outputRoot, { recursive: false });
const runId = randomUUID();
const out = name => join(outputRoot, `${runId}.${name}.json`);
const savedPaths = [], saveErrors = [], inputBoundaries = [];
let primaryError = null, observerError = null, restoreError = null;
let display = null, state = null, oldOnEmptyQueue, handlerInstalled = false;
let targetEnteredCount = 0, targetResult, startupRefs = null, preTargetRefs = null, setupPhase = 'startup';
let sourceSack = null, destinationSack = null, sourceGlob = null, destinationGlob = null;
const refs = new WeakMap(); let nextRef = 1;
const refId = value => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
    if (!refs.has(value)) refs.set(value, nextRef++); return refs.get(value);
};
const tagged = value => ({ presentType: typeof value,
    value: value === undefined ? { tag: 'undefined' } : value === null ? null
        : ['string', 'number', 'boolean'].includes(typeof value) ? value
            : { tag: typeof value, constructor: value?.constructor?.name ?? null } });
function copy(value, seen = new Map()) {
    if (value === undefined) return { tag: 'undefined' };
    if (typeof value === 'bigint') return { tag: 'bigint', value: String(value) };
    if (value === null || ['string','number','boolean'].includes(typeof value)) return value;
    if (typeof value === 'function') return { tag: 'function', name: value.name };
    if (seen.has(value)) return { ref: seen.get(value) };
    const id = seen.size + 1; seen.set(value, id);
    if (Array.isArray(value)) return value.map(v => copy(v, seen));
    if (value instanceof Set) return { tag:'Set', values:[...value].map(v=>copy(v,seen)) };
    if (value instanceof Map) return { tag:'Map', entries:[...value].map(([k,v])=>[copy(k,seen),copy(v,seen)]) };
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copy(v,seen)]));
}
function objRow(o) {
    if (!o) return null;
    return { ref:refId(o), oid:o.o_id??null, otyp:o.otyp??null, oclass:o.oclass??null,
        invlet:o.invlet??null, where:o.where??null, quan:o.quan??null, owt:o.owt??null,
        age:o.age??null, timed:o.timed??null, globby:o.globby??null, nomerge:o.nomerge??null,
        blessed:o.blessed??null, cursed:o.cursed??null, spe:o.spe??null, lknown:o.lknown??null,
        cknown:o.cknown??null, unpaid:o.unpaid??null, no_charge:o.no_charge??null,
        how_lost:o.how_lost??null,
        // List links are owner-specific: floor objects use nexthere; inventory,
        // contained, migrating, and buried list members use nobj.
        links:o.where===OBJ_FLOOR?{owner:'floor-pile',nexthere:o.nexthere?.o_id??null}:
            o.where===OBJ_INVENT?{owner:'hero-inventory',nobj:o.nobj?.o_id??null}:
            o.where===OBJ_CONTAINED?{owner:'container-contents',parent:o.ocontainer?.o_id??null,nobj:o.nobj?.o_id??null}:
            o.where===OBJ_MINVENT?{owner:'monster-inventory',carrier:o.ocarry?.m_id??null,nobj:o.nobj?.o_id??null}:
            {owner:'other/unknown',nobj:o.nobj?.o_id??null}, cobj:o.cobj?.o_id??null,
        owner:o.where===OBJ_INVENT?{kind:'hero-inventory'}:
            o.where===OBJ_CONTAINED?{kind:'container',oid:o.ocontainer?.o_id??null}:
            o.where===OBJ_FLOOR?{kind:'floor',x:o.ox??null,y:o.oy??null}:
            o.where===OBJ_MINVENT?{kind:'monster',mid:o.ocarry?.m_id??null}:null };
}
function chain(head, link='nobj', limit=500) {
    const rows=[], seen=new Set(); let o=head;
    for(;o&&rows.length<limit;o=o[link]??null){ if(seen.has(o)) return {rows,link,complete:false,cycleAt:o.o_id??null}; seen.add(o); rows.push(objRow(o)); }
    return {rows,link,complete:!o,truncated:Boolean(o)};
}
function nested(o, depth=0, seen=new Set()) {
    if(!o||depth>16||seen.has(o)) return o?{cycleOrDepth:true,oid:o.o_id??null}:null;
    seen.add(o); const children=[], siblings=new Set(); let c=o.cobj;
    for(;c;c=c.nobj){ if(siblings.has(c)){children.push({siblingCycle:true,oid:c.o_id??null});break;} siblings.add(c);
        children.push(nested(c,depth+1,seen)); }
    return { ...objRow(o), contents:chain(o.cobj), children, childTraversalComplete:!c };
}
function inventoryTrees(head) {
    const trees=[], seen=new Set(); let o=head;
    for(;o&&trees.length<500;o=o.nobj){
        if(seen.has(o)) return {trees,complete:false,cycleAt:o.o_id??null};
        seen.add(o); trees.push(nested(o));
    }
    return {trees,complete:!o,truncated:Boolean(o)};
}
function baselineEquality(s, baseline) {
    if(!baseline) return {baselinePresent:false};
    return {baselinePresent:true,stateSame:s===baseline.state,uSame:s.u===baseline.u,
        levelSame:s.level===baseline.level,uzSame:s.u?.uz===baseline.uz,
        coordsSame:s.u?.ux===baseline.ux&&s.u?.uy===baseline.uy,
        hpSame:s.u?.uhp===baseline.hp,
        baseline:{stateRef:refId(baseline.state),uRef:refId(baseline.u),
            levelRef:refId(baseline.level),uzRef:refId(baseline.uz),
            ux:baseline.ux??null,uy:baseline.uy??null,hp:baseline.hp??null}};
}
function freeGlobShape(glob) {
    return glob.where===OBJ_FREE && glob.otyp===GLOB_OF_GRAY_OOZE && glob.globby
        && glob.quan===1 && glob.owt>0 && glob.age>0 && glob.timed>0
        && !glob.nobj && !glob.nomerge && !glob.unpaid && !glob.no_charge
        && !glob.blessed && !glob.cursed;
}
function timers(s) {
    const rows=[],seen=new Set(); let t=s.gt?.timer_base??null;
    for(;t&&rows.length<1000;t=t.next??null){if(seen.has(t))return {rows,complete:false,cycleAt:t.tid??null};seen.add(t);
        rows.push({tid:t.tid??null,kind:t.kind??null,func_index:t.func_index??null,timeout:t.timeout??null,
            argType:typeof t.arg,argRef:refId(t.arg),argOid:t.arg?.o_id??null,argAge:t.arg?.age??null,argWhere:t.arg?.where??null,
            argObject:t.arg&&typeof t.arg==='object'?objRow(t.arg):null,next:t.next?.tid??null});}
    return {rows,complete:!t,truncated:Boolean(t)};
}
function exactGlobTimers(s, glob) {
    const rows=[],seen=new Set(); let t=s.gt?.timer_base??null;
    for(;t&&rows.length<1000;t=t.next??null){if(seen.has(t))return {rows,complete:false,cycleAt:t.tid??null};seen.add(t);
        if(t.kind===TIMER_OBJECT&&t.func_index===SHRINK_GLOB&&t.arg===glob) rows.push({tid:t.tid??null,timeout:t.timeout??null,kind:t.kind,func_index:t.func_index,exactArg:true,argRef:refId(t.arg),argObject:objRow(t.arg)});}
    return {rows,complete:!t,truncated:Boolean(t),exactOne:!t&&rows.length===1};
}
function monsterRows(s) {
    const rows=[],seen=new Set(); let m=s.level?.monlist??null;
    for(;m&&rows.length<500;m=m.nmon??null){if(seen.has(m))return {rows,complete:false,cycleAt:m.m_id??null};seen.add(m);
        rows.push({mid:m.m_id??null,pmidx:m.data?.pmidx??null,x:m.mx??null,y:m.my??null,gridOwner:s.level?.monsters?.[m.mx]?.[m.my]===m,
            mhp:m.mhp??null,minv:chain(m.minvent)});}
    return {rows,complete:!m,truncated:Boolean(m)};
}
function snapshotUnsafe(s, phase) {
    const inv=chain(s.invent), floor=chain(s.level?.objlist), pile=chain(s.level?.objects?.[s.u?.ux]?.[s.u?.uy],'nexthere');
    const sackRows=[sourceSack,destinationSack].filter(Boolean).map(o=>({object:objRow(o),tree:nested(o),massByWeight:weight(o),timerMatches:timers(s).rows.filter(t=>t.argOid===sourceGlob?.o_id||t.argOid===destinationGlob?.o_id)}));
    return {phase,globals:{gameAlias:game===s,gameRef:refId(game),stateRef:refId(s),uRef:refId(s.u),levelRef:refId(s.level),
        uzRef:refId(s.u?.uz),moves:tagged(s.moves),svmMoves:tagged(s.svm?.moves),clockOwnership:{rootOwn:Object.hasOwn(s,'moves'),groupOwn:Object.hasOwn(s.svm??{},'moves'),root:tagged(s.moves),group:tagged(s.svm?.moves),effectiveRoot:s.moves??0,effectiveGroup:s.svm?.moves??0},ux:s.u?.ux??null,uy:s.u?.uy??null,
        uhp:s.u?.uhp??null,uhpmax:s.u?.uhpmax??null,polymorphed:s.u?Upolyd(s.u):null,
        gameoverOwn:Boolean(s.program_state&&Object.hasOwn(s.program_state,'gameover')),gameover:tagged(s.program_state?.gameover),
        effectiveGameover:Boolean(s.program_state?.gameover),multiOwn:Object.hasOwn(s,'multi'),multi:tagged(s.multi),effectiveMulti:s.multi??0,
        invletConstant:tagged(s.flags?.invlet_constant),menuStyle:tagged(s.flags?.menu_style),
        levelRefId:refId(s.level),activeObjects:copy({invent:s.invent,levelObjects:s.level?.objlist,
            migrating:s.gm?.migrating_objs,buried:s.level?.buriedobjlist})},
        startupEquality:baselineEquality(s,startupRefs),
        inventory:inv,inventoryTrees:inventoryTrees(s.invent),
        floor:{nobj:floor,herePile: pile,buried:chain(s.level?.buriedobjlist),migrating:chain(s.gm?.migrating_objs)},
        sacks:sackRows,pair:{source:objRow(sourceGlob),destination:objRow(destinationGlob),
            sourceTimer:exactGlobTimers(s,sourceGlob),destinationTimer:exactGlobTimers(s,destinationGlob)},
        monsters:monsterRows(s),timers:timers(s),rng:{log:[...getRngLog()],core:s.coreCtx?copy(cloneIsaacContext(s.coreCtx)):null,
            display:s.displayCtx?copy(cloneIsaacContext(s.displayCtx)):null},
        inputBoundaries:copy(inputBoundaries),terminal:{pendingMessage:copy(s._pending_message),toplin:display?.toplin??null,
            topMessage:copy(display?.topMessage),screen:display?.serialize()??null,queueLength:display?.inputQueueLength??null,
            resolverWaiting:display?.isWaitingForInput??null,waitEpoch:display?.waitEpoch??null,
            queue:copy(display?.terminal?._inputQueue),resolver:tagged(display?.terminal?._inputResolver)}};
}
function snapshot(s, phase) {
    try { return snapshotUnsafe(s,phase); }
    catch(e) { observerError??=err(e,`snapshot:${phase}`); throw e; }
}
function save(name,value){const p=out(name);try{writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx'});savedPaths.push(p);return p;}
    catch(e){const failure={name:String(e?.name??'Error'),message:String(e?.message??e),stack:String(e?.stack??''),operation:`save:${name}`};saveErrors.push(failure);throw e;}}
function err(e,operation=setupPhase){return {name:String(e?.name??'Error'),message:String(e?.message??e),stack:String(e?.stack??''),operation,sourceOperation:e?.operation??null,otyp:e?.otyp??null};}
function saveObserved(name, project) {
    let value; try{value=project();}catch(e){observerError??=err(e,`observer:${name}`);throw e;}
    return save(name,value);
}
const floorContainers = s => {let n=0; for(let o=s.level?.objects?.[s.u?.ux]?.[s.u?.uy]??null;o;o=o.nexthere) if(isContainer(o)) n++; return n;};
try {
    save('intent-before-start',{input,phase:'intent-before-start',targetEnteredCount:0});
    const nhGame=new NethackGame(input); display=new GameDisplay(null); nhGame._pendingDisplay=display;
    // The pure durable intent above precedes these optional diagnostic reads.
    saveObserved('before-start-contexts',()=>({input,phase:'before-start-contexts',rngLog:[...getRngLog()],
        coreCtxPresent:!!game?.coreCtx,coreCtx:game?.coreCtx?copy(cloneIsaacContext(game.coreCtx)):null,
        displayCtxPresent:!!game?.displayCtx,displayCtx:game?.displayCtx?copy(cloneIsaacContext(game.displayCtx)):null,
        toplin:display.toplin,topMessage:copy(display.topMessage),queueLength:display.inputQueueLength,
        waitEpoch:display.waitEpoch,queue:copy(display.terminal?._inputQueue),resolver:tagged(display.terminal?._inputResolver)}));
    oldOnEmptyQueue=display.onEmptyQueue;
    display.onEmptyQueue=()=>{
        const serialized=display.serialize(), boundary={index:inputBoundaries.length,toplin:display.toplin,
            serialized,waitEpoch:display.waitEpoch,queueLength:display.inputQueueLength,
            resolverWaiting:display.isWaitingForInput,gameRef:refId(game),pendingOwner:'game._pending_message',
            pendingMessage:copy(game?._pending_message),terminalQueue:copy(display.terminal?._inputQueue),
            terminalResolver:tagged(display.terminal?._inputResolver),rngLog:[...getRngLog()],
            coreCtx:game?.coreCtx?copy(cloneIsaacContext(game.coreCtx)):null,
            displayCtx:game?.displayCtx?copy(cloneIsaacContext(game.displayCtx)):null};
        if(display.toplin!==TOPLINE_NEED_MORE||!serialized.includes('--More--')){save('input-unknown-boundary',boundary);throw new Error('input boundary not a rendered TOPLINE_NEED_MORE');}
        if(inputBoundaries.length>=16){save('input-capped-boundary',boundary);throw new Error('rendered More cap reached');}
        save(`input-more-${inputBoundaries.length}`,boundary); inputBoundaries.push({...boundary,acceptedKey:32}); return 32;
    };
    handlerInstalled=true;
    let started=false,startError=null; try{started=await nhGame.start();}catch(e){startError=e;if(!observerError&&!saveErrors.length)primaryError??=err(e,'startup');}
    state=game; // Refresh the live singleton even when start rejected or threw.
    startupRefs={state,u:state.u,level:state.level,uz:state.u?.uz,ux:state.u?.ux,uy:state.u?.uy,hp:state.u?.uhp};
    save('startup', {input,started,startError:startError?err(startError,'startup'):null,snapshot:snapshot(game,'post-start-before-admission')});
    if(startError) throw startError;
    const liveAdmission=started&&state.level&&state.u&&state.u.uhp>0&&!Boolean(state.program_state?.gameover)&&!Upolyd(state.u)&&(state.multi??0)>=0;
    if(!liveAdmission){save('startup-rejection',{reason:'canonical startup/live hero admission failed',snapshot:snapshot(game,'rejected-admission-live-state')});throw new Error('canonical startup/live hero admission failed');}
    if(floorContainers(state)!==0){save('startup-rejection',{reason:'fixed hero tile has source-owned floor-container prompt',snapshot:snapshot(game,'floor-container-guard-live-state')});throw new Error('fixed hero tile has source-owned floor-container prompt; no route substitution');}
    const randomCtx=random, objectEnv=objectGenerationEnv({state,random:randomCtx});
    const inventoryEnv={state,random:randomCtx};
    sourceSack=mksobj(SACK,false,false,objectEnv); save('source-sack-created',snapshot(state,'source-sack-free-before-addinv'));
    if(sourceSack.where!==OBJ_FREE||sourceSack.cobj!=null||sourceSack.olocked||sourceSack.otrapped||sourceSack.cursed||sourceSack.unpaid||sourceSack.no_charge||sourceSack.blessed) throw new Error('source SACK is not a fresh ordinary empty object');
    await addinv_runtime(sourceSack,inventoryEnv);
    if(sourceSack.where!==OBJ_INVENT||![...function*(){for(let o=state.invent;o;o=o.nobj)yield o;}()].includes(sourceSack)) throw new Error('source SACK not held by actual hero inventory');
    save('source-sack-held',snapshot(state,'source-sack-inventory-owned'));
    sourceGlob=mksobj(GLOB_OF_GRAY_OOZE,true,false,objectEnv); save('source-glob-free',snapshot(state,'source-glob-free-before-insertion'));
    if(!freeGlobShape(sourceGlob)) throw new Error('source glob is not an initialized free singleton with no prior list/container owner');
    await addToContainerRuntime(sourceSack,sourceGlob,inventoryEnv); container_weight(sourceSack,objectEnv);
    if(sourceGlob.where!==OBJ_CONTAINED||sourceGlob.ocontainer!==sourceSack||sourceSack.cobj!==sourceGlob) throw new Error('source glob did not acquire exact source-created SACK ownership');
    save('source-pair-built',snapshot(state,'source-sack-has-initialized-contained-glob'));
    destinationSack=mksobj(SACK,false,false,objectEnv); save('destination-sack-created',snapshot(state,'destination-sack-free-before-addinv'));
    if(destinationSack.where!==OBJ_FREE||destinationSack.cobj!=null||destinationSack.olocked||destinationSack.otrapped||destinationSack.cursed||destinationSack.unpaid||destinationSack.no_charge||destinationSack.blessed) throw new Error('destination SACK is not a fresh ordinary empty object');
    await addinv_runtime(destinationSack,inventoryEnv);
    if(destinationSack.where!==OBJ_INVENT||![...function*(){for(let o=state.invent;o;o=o.nobj)yield o;}()].includes(destinationSack)) throw new Error('destination SACK not held by actual hero inventory');
    destinationGlob=mksobj(GLOB_OF_GRAY_OOZE,true,false,objectEnv); save('destination-glob-free',snapshot(state,'destination-glob-free-before-insertion'));
    if(!freeGlobShape(destinationGlob)) throw new Error('destination glob is not an initialized free singleton with no prior list/container owner');
    await addToContainerRuntime(destinationSack,destinationGlob,inventoryEnv); container_weight(destinationSack,objectEnv);
    if(destinationGlob.where!==OBJ_CONTAINED||destinationGlob.ocontainer!==destinationSack||destinationSack.cobj!==destinationGlob) throw new Error('destination glob did not acquire exact source-created SACK ownership');
    save('both-held-pairs',snapshot(state,'two-source-created-held-sacks-each-with-glob'));
    if(sourceSack===destinationSack||typeof sourceSack.invlet!=='string'||sourceSack.invlet.length!==1
        ||typeof destinationSack.invlet!=='string'||destinationSack.invlet.length!==1||sourceSack.invlet===destinationSack.invlet)
        throw new Error('two distinct held SACKs lack distinct live assigned selector letters');
    if(state.flags?.invlet_constant!==true) throw new Error('live invlet-constant source owner is not true; no manual relettering');
    if(!Number.isFinite(state.moves)) throw new Error('canonical root timeout clock state.moves is not finite');
    const rootNow=Math.trunc(state.moves);
    for(const [glob,parent] of [[sourceGlob,sourceSack],[destinationGlob,destinationSack]]){
        const matches=exactGlobTimers(state,glob);
        if(glob.where!==OBJ_CONTAINED||glob.ocontainer!==parent||parent.cobj!==glob
            ||glob.otyp!==GLOB_OF_GRAY_OOZE||!glob.globby||glob.quan!==1||!(glob.owt>0)||!(glob.age>0)
            ||glob.nomerge||glob.unpaid||glob.no_charge||glob.blessed||glob.cursed
            ||!glob.timed||!matches.exactOne||!(matches.rows[0].timeout>rootNow)) throw new Error('initialized glob ownership or exact root-clock SHRINK_GLOB timer not source-shaped');
    }
    const pairMergePredicate=mergable(sourceGlob,destinationGlob,inventoryEnv);
    const heldShape={source:{typ:sourceSack.otyp,where:sourceSack.where,invlet:sourceSack.invlet,cursed:sourceSack.cursed,blessed:sourceSack.blessed,unpaid:sourceSack.unpaid,no_charge:sourceSack.no_charge,locked:sourceSack.olocked,trapped:sourceSack.otrapped,child:sourceGlob.o_id,childParent:sourceGlob.ocontainer?.o_id??null,weight:sourceSack.owt},destination:{typ:destinationSack.otyp,where:destinationSack.where,invlet:destinationSack.invlet,cursed:destinationSack.cursed,blessed:destinationSack.blessed,unpaid:destinationSack.unpaid,no_charge:destinationSack.no_charge,locked:destinationSack.olocked,trapped:destinationSack.otrapped,child:destinationGlob.o_id,childParent:destinationGlob.ocontainer?.o_id??null,weight:destinationSack.owt},pairMergePredicate};
    save('source-valid-owners-and-merge-predicate',{heldShape,sourceTimer:exactGlobTimers(state,sourceGlob),destinationTimer:exactGlobTimers(state,destinationGlob)});
    if(!pairMergePredicate) throw new Error('the actual source-owned pair is not mergeable');
    const setupEquality=baselineEquality(state,startupRefs);
    save('startup-baseline-before-target',setupEquality);
    if(!setupEquality.stateSame||!setupEquality.uSame||!setupEquality.levelSame||!setupEquality.uzSame
        ||!setupEquality.coordsSame||!setupEquality.hpSame) throw new Error('canonical setup changed the startup hero/level baseline');
    // dotip() first counts hero-tile floor containers; above guard ensures no
    // extra floor question. getobj(tip_ok,GETOBJ_PROMPT) then accepts source.invlet.
    // tipcontainer_gettarget is real PICK_ONE: explicit destination selector
    // returns immediately; Enter/Space would keep the preselected floor row.
    const inputPlan={sourceSelector:sourceSack.invlet,sourceOid:sourceSack.o_id,
        destinationSelector:destinationSack.invlet,destinationOid:destinationSack.o_id,
        publicRoute:'pickup.dotip(state) -> getobj(tip_ok,GETOBJ_PROMPT) -> tipcontainer_gettarget(PICK_ONE)',
        menuCommit:'explicit unique destination selector returns the selected PICK_ONE value; no commit key required',
        targetEnteredCount:0};
    save('target-intent', {input,phase:'intent-before-entry',targetEnteredCount:0,inputPlan,heldShape,
        sourceSelectorType:typeof sourceSack.invlet,destinationSelectorType:typeof destinationSack.invlet});
    save('before-target',snapshot(state,'immediately-before-public-dotip'));
    // Observe pending-message/queue state before selector input is supplied. If
    // pre-existing More may consume selectors in selectTtyMenu's xwaitforspace
    // loop; stop here rather than guessing a replacement acknowledgement.
    if(display.toplin===TOPLINE_NEED_MORE||display.inputQueueLength!==0||display.isWaitingForInput) throw new Error('pre-target input ownership is not empty; selectors not queued');
    preTargetRefs={state,u:state.u,level:state.level,uz:state.u?.uz,ux:state.u?.ux,uy:state.u?.uy};
    display.pushKey(sourceSack.invlet.charCodeAt(0)); display.pushKey(destinationSack.invlet.charCodeAt(0));
    setupPhase='dotip'; targetEnteredCount=1;
    try{targetResult=await dotip(state);}
    catch(e){primaryError??=err(e,'dotip'); try{save('target-threw',{targetEnteredCount,returned:false,primaryError});}catch{} throw e;}
    try{save('target-returned',{targetEnteredCount,returned:true,result:tagged(targetResult)});}catch{}
} catch(e){if(!observerError&&!saveErrors.length)primaryError??=err(e); try{save('first-catch',{setupPhase,targetEnteredCount,primaryError,observerError,saveErrors});}catch{}}
finally{
    // Minimal restoration-only tail: no game/object/RNG snapshot reads here.
    try{if(handlerInstalled)display.onEmptyQueue=oldOnEmptyQueue;}catch(e){restoreError??=err(e,'restore-onEmptyQueue');}
    try{save('finally-scalar',{targetEnteredCount,resultType:typeof targetResult,primaryError,observerError,restoreError,saveErrors,handlerRestored:!handlerInstalled||display.onEmptyQueue===oldOnEmptyQueue});}catch{}
}
let after=null;try{after=snapshot(game,'after-target-handler-restored');}catch(e){observerError??=err(e,'snapshot:after');}
const targetBaseline={stateRef:refId(preTargetRefs?.state),uRef:refId(preTargetRefs?.u),levelRef:refId(preTargetRefs?.level),uzRef:refId(preTargetRefs?.uz),ux:preTargetRefs?.ux??null,uy:preTargetRefs?.uy??null};
const finalEquality={stateSame:game===preTargetRefs?.state,uSame:game?.u===preTargetRefs?.u,levelSame:game?.level===preTargetRefs?.level,uzSame:game?.u?.uz===preTargetRefs?.uz,
    coordsSame:game?.u?.ux===targetBaseline.ux&&game?.u?.uy===targetBaseline.uy, targetBaseline};
const receipt={input,runId,targetEnteredCount,targetResult:tagged(targetResult),primaryError,observerError,restoreError,saveErrors,
    after,startupEquality:baselineEquality(game,startupRefs),finalEquality,handlerRestored:!handlerInstalled||display.onEmptyQueue===oldOnEmptyQueue,finalOutputPaths:[...savedPaths,out('receipt')]};
try{save('receipt',receipt);}catch{try{save('receipt-fallback',{...receipt,saveErrors});}catch{}}

// A caught source/capture failure is serialized and remains a failing process.
process.exitCode=(primaryError||observerError||restoreError||saveErrors.length||targetEnteredCount!==1)?2:0;
