// Source-audited future fixture proposal. Do not run for this source-only task.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANIMATE_SPELL, LOST_NONE, OBJ_CONTAINED, OBJ_FLOOR, OBJ_FREE, OBJ_INVENT, OBJ_MINVENT, OBJ_MIGRATING, OBJ_BURIED, OBJ_LUAFREE, OBJ_DELETED, SHRINK_GLOB, TIMER_OBJECT, Upolyd } from '../../js/const.js';
import { GameDisplay } from '../../js/game_display.js';
import { game } from '../../js/gstate.js';
import { NethackGame } from '../../js/jsmain.js';
import { addToContainerRuntime, container_weight, mergable } from '../../js/invent.js';
import { curse, mksobj, mksobj_at, set_corpsenm, uncurse } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { GLOB_OF_GRAY_OOZE, STATUE } from '../../js/objects.js';
import { PM_GOBLIN } from '../../js/monsters.js';
import { animate_statue } from '../../js/trap.js';
import * as random from '../../js/rng.js';
import { cloneIsaacContext, getRngLog } from '../../js/rng.js';
import { TOPLINE_NEED_MORE } from '../../js/tty_message.js';
import { costly_spot } from '../../js/shk.js';

const input = Object.freeze({ seed: 2026101801, datetime: '20261018120000',
    recorderIsDst: true,
    nethackrc: 'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:lawful\n'
      + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup\n' });
const outputRoot = join(dirname(fileURLToPath(import.meta.url)), 'runs');
mkdirSync(outputRoot, {recursive:true});
const outputDir = process.env.ANIMATE_STATUE_OUTPUT_DIR
    ? resolve(process.env.ANIMATE_STATUE_OUTPUT_DIR) : mkdtempSync(join(outputRoot,'run-'));
if (process.env.ANIMATE_STATUE_OUTPUT_DIR) mkdirSync(outputDir, {recursive:false});
const save = (name, encoded) => writeFileSync(join(outputDir, `${name}.json`), encoded+'\n', {flag:'wx'});
const err = e => ({name:e?.name ?? 'Error', message:String(e?.message ?? e), stack:String(e?.stack ?? ''), operation:e?.operation??null, otyp:e?.otyp??null});
const graph = (v, seen=new Map()) => {
    if (v === undefined) return {tag:'undefined'};
    if (typeof v === 'bigint') return {tag:'bigint',value:String(v)};
    if (v === null || ['string','number','boolean'].includes(typeof v)) return v;
    if (typeof v !== 'object') return {tag:typeof v};
    if (seen.has(v)) return {ref:seen.get(v)};
    const id=`r${seen.size+1}`; seen.set(v,id);
    if (Array.isArray(v)) return {id,array:v.map(x=>graph(x,seen))};
    const fields={}; for (const k of Object.keys(v)) fields[k]=graph(v[k],seen);
    return {id,fields};
};
// In-memory copies retain cycles and aliases. Each durable receipt is graph-encoded once.
const cloneReceipt = (value, seen=new Map()) => {
    if(value===null||typeof value!=='object') return value;
    if(seen.has(value)) return seen.get(value);
    const out=Array.isArray(value)?[]:{};seen.set(value,out);
    for(const key of Object.keys(value)) out[key]=cloneReceipt(value[key],seen);
    return out;
};
const rng = () => {
    const context=(ctx,key)=>({own:!!game&&Object.hasOwn(game,key),type:typeof ctx,
        value:ctx===undefined?{tag:'undefined'}:ctx===null?null:{tag:'stateful-context'},
        clone:ctx==null?null:cloneIsaacContext(ctx)});
    return {log:[...getRngLog()],core:context(game?.coreCtx,'coreCtx'),display:context(game?.displayCtx,'displayCtx')};
};
const ids = (head, link='nobj') => { const a=[], s=new Set(); for(let o=head??null;o&&!s.has(o);o=o[link]) { s.add(o); a.push(o.o_id); } return a; };
const monsterIds = head => { const a=[], s=new Set(); for(let m=head??null;m&&!s.has(m);m=m.nmon){s.add(m);a.push(m.m_id);}return a; };
const rootMoves = () => Math.trunc(state?.moves ?? 0);
const raw = (o,k) => ({own:!!o&&Object.hasOwn(o,k),type:typeof o?.[k],value:cloneReceipt(o?.[k])});
let state=null, statue=null, first=null, second=null, priorMore=null, phase='before-start',
    started=false, calls=0, handlerRestored=false, primaryError=null, setupError=null, restoreError=null, outcome=null, targetValue=null;
let heroRef=null, levelRef=null, uzRef=null, heroPos=null, before=null, after=null;
let initialFloorIds=[], initialMonsterIds=[], initialInventoryIds=[];
const observerErrors=[], saveErrors=[], stages=[], acknowledgements=[];
const capture = () => {
    const u=state?.u, x=heroPos?.x, y=heroPos?.y, floor=ids(state?.level?.objects?.[x]?.[y],'nexthere');
    const timers=[], timerSeen=new Set(); for(let t=state?.gt?.timer_base??null;t&&!timerSeen.has(t);t=t.next){timerSeen.add(t);if(t.arg===first||t.arg===second)timers.push({id:t.tid,arg:t.arg===first?'first':'second',argId:t.arg?.o_id??null,sameArg:t.arg===first||t.arg===second,kind:t.kind,func_index:t.func_index,timeout:t.timeout,future:typeof t.timeout==='number'&&t.timeout>rootMoves()});}
    const all= new Map(), seenObjects=new Set();
    const walk=(head,link) => { const chain=new Set(); for(let o=head??null;o&&!chain.has(o);o=o[link]) { chain.add(o); if(seenObjects.has(o)) continue; seenObjects.add(o); if(o.o_id!=null) all.set(o.o_id,o); walk(o.cobj,'nobj'); } };
    walk(state?.invent,'nobj'); walk(state?.level?.objlist,'nobj'); walk(state?.level?.buriedobjlist,'nobj'); walk(state?.gm?.migrating_objs,'nobj'); walk(state?.level?.objects?.[x]?.[y],'nexthere');
    const monsters=[], seenMonsters=new Set(); for(let m=state?.level?.monlist??null;m&&!seenMonsters.has(m);m=m.nmon){seenMonsters.add(m);walk(m.minvent,'nobj');monsters.push({m_id:m.m_id,pmidx:m.data?.pmidx??null,x:m.mx,y:m.my,hp:m.mhp,minvent:ids(m.minvent),gridId:state?.level?.monsters?.[m.mx]?.[m.my]?.m_id??null});}
    const row=o=>{if(!o)return null;let union;if(o.where===OBJ_FLOOR)union={kind:'floor',next:o.nexthere?.o_id??null};else if(o.where===OBJ_CONTAINED)union={kind:'container',parent:o.ocontainer?.o_id??null,next:o.nobj?.o_id??null};else if(o.where===OBJ_MINVENT)union={kind:'monster',carrier:o.ocarry?.m_id??null,next:o.nobj?.o_id??null};else if([OBJ_FREE,OBJ_INVENT,OBJ_MIGRATING,OBJ_BURIED,OBJ_LUAFREE,OBJ_DELETED].includes(o.where))union={kind:'nobj',next:o.nobj?.o_id??null};else union={kind:'unknown'};return {o_id:o.o_id,otyp:o.otyp,where:o.where,quan:o.quan,owt:o.owt,corpsenm:o.corpsenm,savedMonst:o.oextra?.omonst?.m_id??o.oextra?.omonst??null,cobj:ids(o.cobj),ownerUnion:union,blessed:o.blessed,cursed:o.cursed,globby:o.globby,timed:o.timed,age:o.age,nomerge:o.nomerge,how_lost:o.how_lost,unpaid:o.unpaid,no_charge:o.no_charge,ox:o.ox,oy:o.oy};};
    const retainedFloorIds=floor.filter(id=>initialFloorIds.includes(id));
    return {input,phase,started,calls,hero:{sameStartupU:!!heroRef&&u===heroRef,sameStartupLevel:!!levelRef&&state?.level===levelRef,sameStartupUz:!!uzRef&&u?.uz===uzRef,samePosition:!!heroPos&&u?.ux===x&&u?.uy===y,x:u?.ux??null,y:u?.uy??null,hp:u?.uhp??null,maxhp:u?.uhpmax??null,gameover:raw(state?.program_state,'gameover'),gameoverEffective:Boolean(state?.program_state?.gameover),upolyd:u?Upolyd(u):null,multi:raw(state,'multi'),multiEffective:state?.multi??0,multiAdmitted:(state?.multi??0)>=0},
      statue:row(statue),first:row(first),second:row(second), floorIds:floor,
      levelObjIds:ids(state?.level?.objlist),inventoryIds:ids(state?.invent),inventoryRetained:JSON.stringify(ids(state?.invent))===JSON.stringify(initialInventoryIds),monsterIds:monsterIds(state?.level?.monlist),newMonsterIds:monsterIds(state?.level?.monlist).filter(id=>!initialMonsterIds.includes(id)),
      monsters,returnedTarget:targetValue&&typeof targetValue==='object'?{m_id:targetValue.m_id??null,pmidx:targetValue.data?.pmidx??null,x:targetValue.mx??null,y:targetValue.my??null,inList:monsters.some(m=>m.m_id===targetValue.m_id),newMonster:!initialMonsterIds.includes(targetValue.m_id),gridId:state?.level?.monsters?.[targetValue.mx]?.[targetValue.my]?.m_id??null}:null,
      originalFloorStillRetained:JSON.stringify(retainedFloorIds)===JSON.stringify(initialFloorIds),
      startupFloorIds:[...initialFloorIds],startupMonsterIds:[...initialMonsterIds],
      objectRows:[...all.values()].map(row),timers,nobj:state?.svm?.nobj??null,nmon:state?.svm?.nmon??null,rootMoves:raw(state,'moves'),rootMovesEffective:rootMoves(),groupMoves:raw(state?.svm,'moves'),groupMulti:raw(state?.svm,'multi'),
      display:{screen:display.serialize(),topMessage:display.topMessage,topline:display.toplin,epoch:display.waitEpoch,queueLength:display.terminal.inputQueueLength,waiting:display.terminal.isWaitingForInput,pending:cloneReceipt(display.terminal._inputQueue??[]),resolver:typeof display.terminal._inputResolver,pendingMessage:cloneReceipt(state?._pending_message)},rng:rng()};
};
const persist=(n,v)=>{let encoded;try{encoded=JSON.stringify(graph(v),null,2);}catch(e){observerErrors.push({name:`serialize:${n}`,error:err(e)});throw e;}try{save(n,encoded)}catch(e){saveErrors.push({name:n,error:err(e)});throw e;}};
const projection=(name,fn)=>{try{return fn();}catch(e){observerErrors.push({name,error:err(e)});throw e;}};
const requiredSnapshot=(n)=>projection(n,()=>cloneReceipt(capture()));
const stage=(n)=>{const snapshot=requiredSnapshot(n);const r={name:n,snapshot};stages.push(r);persist(`stage-${String(stages.length).padStart(2,'0')}-${n}`,r);return r;};
const stop=why=>{phase=`terminal-miss:${why}`;};
const naturalGlobShape=o=>Boolean(o&&o.where===OBJ_FREE&&o.otyp===GLOB_OF_GRAY_OOZE&&o.globby===true&&o.quan===1&&o.owt>0&&o.age>0&&o.timed>0&&!o.nobj&&!o.nomerge&&o.how_lost===LOST_NONE&&!o.unpaid&&!o.no_charge);
const display = new GameDisplay(null);
try {
    priorMore=display.onEmptyQueue;
    display.onEmptyQueue=()=>{
        const r=projection('input-boundary',()=>({screen:display.serialize(),topMessage:display.topMessage,topline:display.toplin,epoch:display.waitEpoch,queueLength:display.terminal.inputQueueLength,waiting:display.terminal.isWaitingForInput,pending:cloneReceipt(display.terminal._inputQueue??[]),resolver:typeof display.terminal._inputResolver,pendingMessage:cloneReceipt(game?._pending_message),rng:rng()}));
        if(display.toplin!==TOPLINE_NEED_MORE||!r.screen.includes('--More--')){persist('unknown-input-boundary',r);throw new Error('unrendered input boundary');}
        if(acknowledgements.length>=16){persist('capped-input-boundary',r);throw new Error('More cap reached');}
        acknowledgements.push(r); persist(`more-${String(acknowledgements.length).padStart(2,'0')}`,r); return 32;
    };
    const nh=new NethackGame({seed:input.seed,datetime:input.datetime,recorderIsDst:input.recorderIsDst,nethackrc:input.nethackrc});
    nh._pendingDisplay=display; persist('startup-intent',{input,phase,calls});
    persist('prestart-rng-after-intent',projection('prestart-rng',()=>rng()));
    phase='startup'; started=await nh.start(); state=game; nh._pendingDisplay=display;
    heroRef=state?.u??null; levelRef=state?.level??null; uzRef=state?.u?.uz??null; heroPos=state?.u?{x:state.u.ux,y:state.u.uy}:null;
    phase='after-startup'; const startup=stage('after-startup'); initialFloorIds=[...(startup.snapshot?.floorIds??[])]; initialMonsterIds=[...(startup.snapshot?.monsterIds??[])]; initialInventoryIds=[...(startup.snapshot?.inventoryIds??[])];
    if(!started||!state?.u||!state.level||!(state.u.uhp>0)||Boolean(state.program_state?.gameover)||Upolyd(state.u)||(state.multi??0)<0||costly_spot(state.u.ux,state.u.uy,state)) stop('live-hero-admission-or-shop-square');
    else {
        const env=objectGenerationEnv({state,random});
        statue=mksobj_at(STATUE,heroPos.x,heroPos.y,true,false,env); stage('statue-constructed-on-original-hero-square');
        if(!statue||statue.otyp!==STATUE||statue.where!==OBJ_FLOOR||statue.ox!==heroPos.x||statue.oy!==heroPos.y||!ids(state.level.objects?.[heroPos.x]?.[heroPos.y],'nexthere').includes(statue.o_id)||!ids(state.level.objlist).includes(statue.o_id)||statue.oextra?.omonst||statue.cobj) stop('statue-initial-state');
        else {
            set_corpsenm(statue,PM_GOBLIN,env); stage('species-set-by-source-writer');
            if(statue.corpsenm!==PM_GOBLIN) throw new Error('source species writer did not retain selected goblin');
            first=mksobj(GLOB_OF_GRAY_OOZE,true,false,env); stage('first-glob-constructor-before-buc-writer');
            if(!naturalGlobShape(first)) stop('first-natural-glob-shape');
            else { await curse(first,env); stage('first-glob-cursed-before-insertion');
            if(first.blessed!==false||first.cursed!==true) stop('first-source-curse-state');
            else {
            const firstInsert=await addToContainerRuntime(statue,first,env); stage('first-cursed-glob-inserted');
            second=mksobj(GLOB_OF_GRAY_OOZE,true,false,env); stage('second-glob-constructor-before-natural-buc-guard');
            if(!naturalGlobShape(second)||second.blessed!==false||second.cursed!==false) stop('natural-second-buc-or-shape');
            else {
                const secondInsert=await addToContainerRuntime(statue,second,env); stage('second-natural-glob-inserted');
                const beforeUncurse={firstInsert:{type:typeof firstInsert,sameAsFirst:firstInsert===first,o_id:firstInsert?.o_id??null},secondInsert:{type:typeof secondInsert,sameAsSecond:secondInsert===second,o_id:secondInsert?.o_id??null},contents:ids(statue.cobj),firstWhere:first.where,secondWhere:second.where,firstParent:first.ocontainer?.o_id??null,secondParent:second.ocontainer?.o_id??null,firstBUC:[first.blessed,first.cursed],secondBUC:[second.blessed,second.cursed]};
                const shrinkTimers=()=>{const found=[],seen=new Set();for(let t=state?.gt?.timer_base??null;t&&!seen.has(t);t=t.next){seen.add(t);if(t.arg===first||t.arg===second)found.push({id:t.tid,arg:t.arg===first?'first':'second',sameArg:t.arg===first||t.arg===second,kind:t.kind,func_index:t.func_index,timeout:t.timeout,future:typeof t.timeout==='number'&&t.timeout>rootMoves()});}return found;};
                const timers=shrinkTimers();
                if(firstInsert!==first||secondInsert!==second||first===second||first.quan!==1||second.quan!==1||first.where!==OBJ_CONTAINED||second.where!==OBJ_CONTAINED||first.ocontainer!==statue||second.ocontainer!==statue||ids(statue.cobj).length!==2||first.blessed!==false||first.cursed!==true||second.blessed!==false||second.cursed!==false||!first.timed||!second.timed||timers.length!==2||timers.filter(t=>t.arg==='first').length!==1||timers.filter(t=>t.arg==='second').length!==1||timers.some(t=>t.kind!==TIMER_OBJECT||t.func_index!==SHRINK_GLOB||!t.future)) stop('source-owned-unmerged-pair');
                else {
                    await uncurse(first,env); container_weight(statue,env);
                    const mergeEligible=mergable(first,second,env); const postUncurseTimers=shrinkTimers(); stage('post-uncurse-weight-and-merge-check');
                    if(!mergeEligible||ids(statue.cobj).length!==2||postUncurseTimers.length!==2||postUncurseTimers.filter(t=>t.arg==='first').length!==1||postUncurseTimers.filter(t=>t.arg==='second').length!==1||postUncurseTimers.some(t=>t.kind!==TIMER_OBJECT||t.func_index!==SHRINK_GLOB||!t.future)) stop('natural-merge-predicate-timer-or-pair');
                    else {
                        phase='before-target-count-zero-intent'; calls=0; persist('target-intent',{phase,calls,input,beforeUncurse});
                        before=stage('before-target-call').snapshot;
                        const stillAdmitted=state?.u===heroRef&&state?.level===levelRef&&state?.u?.uz===uzRef&&state?.u?.ux===heroPos.x&&state?.u?.uy===heroPos.y&&state?.u?.uhp>0&&!Boolean(state?.program_state?.gameover)&&!Upolyd(state.u)&&(state.multi??0)>=0&&!costly_spot(heroPos.x,heroPos.y,state);
                        if(!stillAdmitted) stop('pretarget-live-state-changed');
                        else { const targetStatue=statue, targetX=heroPos.x, targetY=heroPos.y, targetEnv={state,random};
                        phase='target-entered'; calls=1;
                        try { const r=await animate_statue(targetStatue,targetX,targetY,ANIMATE_SPELL,targetEnv); targetValue=r; outcome={kind:'returned',type:typeof r,isNull:r===null,isObject:typeof r==='object'&&r!==null,isUndefined:r===undefined,isBoolean:typeof r==='boolean',isNumber:typeof r==='number',isString:typeof r==='string'}; phase='target-returned'; }
                        catch(e){primaryError=err(e);outcome={kind:'threw',...primaryError};phase='target-threw';}
                        persist('target-scalar-before-projection',{phase,calls,outcome,primaryError});
                        }
                    }
                }
            }
            }
            }
        }
    }
} catch(e) {
    if(!setupError&&!observerErrors.length&&!saveErrors.length) setupError=err(e);
    outcome??={kind:'setup-threw',...err(e)}; if(!phase.startsWith('terminal-miss:')) phase=`setup-threw:${phase}`;
    try{persist('first-error-scalars',{phase,calls,setupError,primaryError,outcome});}catch(saveError){saveErrors.push({name:'first-error-scalars',error:err(saveError)});}
} finally {
    try{display.onEmptyQueue=priorMore;handlerRestored=display.onEmptyQueue===priorMore;if(!handlerRestored)restoreError={name:'RestoreMismatch',message:'prior input handler was not restored'};}catch(e){restoreError=err(e);}
    state=game;
    const finallyScalars={phase,started,calls,handlerRestored,primaryError,setupError,restoreError,outcome};
    try{persist('finally-scalars-before-projection',finallyScalars);}catch(e){saveErrors.push({name:'finally-scalars',error:err(e)});}
    try{after=requiredSnapshot('final-restored');}catch(e){if(!observerErrors.length)observerErrors.push({name:'final-restored',error:err(e)});}
    if(after){try{persist('final-restored',{input,...finallyScalars,before,after,stages,acknowledgements,observerErrors,saveErrors});}catch(e){saveErrors.push({name:'final-restored',error:err(e)});}}
}
if(!after){
    try{persist('final-fallback',{input,phase,started,calls,handlerRestored,primaryError,setupError,restoreError,outcome,before,stages,acknowledgements,observerErrors,saveErrors});}
    catch(e){saveErrors.push({name:'final-fallback',error:err(e)});}
}
const exitStatus=(!calls||!handlerRestored||primaryError||setupError||restoreError||observerErrors.length||saveErrors.length||!outcome||outcome.kind!=='returned'||outcome.isNull||!after?.returnedTarget?.inList||!after?.returnedTarget?.newMonster||after?.returnedTarget?.gridId!==after?.returnedTarget?.m_id||!after?.inventoryRetained||!after?.originalFloorStillRetained||!after?.hero?.sameStartupU||!after?.hero?.sameStartupLevel||!after?.hero?.sameStartupUz||!after?.hero?.samePosition)?1:0;
try{persist('final-status',{exitStatus,phase,calls,handlerRestored,primaryError,setupError,restoreError,observerErrors,saveErrors});}catch(e){saveErrors.push({name:'final-status',error:err(e)});process.exitCode=1;}
console.log(JSON.stringify({outputDir,phase,started,calls,exitStatus,handlerRestored,primaryError,setupError,restoreError,saveErrors,observerErrors}));
process.exitCode=exitStatus||process.exitCode||0;
