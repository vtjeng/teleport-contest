// Source-only proposed fixture. Do not import, parse, or execute in this task.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NethackGame } from '../../js/jsmain.js';
import { game } from '../../js/gstate.js';
import { GameDisplay } from '../../js/game_display.js';
import { OBJ_FREE, OBJ_INVENT, OBJ_CONTAINED, OBJ_FLOOR, OBJ_MINVENT, TIMER_OBJECT, SHRINK_GLOB, Upolyd } from '../../js/const.js';
import { SACK, GLOB_OF_GRAY_OOZE } from '../../js/objects.js';
import { mksobj, weight } from '../../js/obj.js';
import { objectGenerationEnv } from '../../js/object_generation.js';
import { addinv_runtime, addToContainerRuntime, container_weight, mergable } from '../../js/invent.js';
import { use_container } from '../../js/pickup.js';
import { TOPLINE_NEED_MORE } from '../../js/tty_message.js';
import * as random from '../../js/rng.js';
import { cloneIsaacContext, getRngLog } from '../../js/rng.js';

const input = Object.freeze({seed:671903, datetime:'20261016200000', recorderIsDst:true,
 nethackrc:'OPTIONS=name:ShopFireFixture,role:Archeologist,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,menustyle:traditional\n'});
const outdir=process.env.STASH_OUTPUT_DIR;
if(!outdir) throw new Error('STASH_OUTPUT_DIR must be a fresh unique directory');
mkdirSync(outdir,{recursive:false});
const save=(n,v)=>{try{return writeFileSync(join(outdir,n+'.json'),JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x,2)+'\n',{flag:'wx'});}catch(e){saveError??={name:e?.name??'Error',message:String(e?.message??e),stack:String(e?.stack??''),operation:'save',path:n};throw e;}};
const err=(e,operation=phase)=>({name:e?.name??'Error',message:String(e?.message??e),stack:String(e?.stack??''),operation,sourceOperation:e?.operation??null,otyp:e?.otyp??null});
const safeGraph=(v,seen=new Map())=>{if(v===undefined)return {tag:'undefined'};if(v===null||['string','number','boolean'].includes(typeof v))return v;if(typeof v==='bigint')return {tag:'bigint',value:v.toString()};if(typeof v!=='object')return {tag:typeof v};if(seen.has(v))return {ref:seen.get(v)};const id='g'+(seen.size+1);seen.set(v,id);if(Array.isArray(v))return {id,array:v.map(x=>safeGraph(x,seen))};const o={id,tag:v.constructor?.name??'Object',fields:{}};for(const k of Object.keys(v))o.fields[k]=safeGraph(v[k],seen);return o;};
const rng=()=>({log:[...getRngLog()],core:game?.coreCtx?safeGraph(cloneIsaacContext(game.coreCtx)):{tag:'uninitialized'},display:game?.displayCtx?safeGraph(cloneIsaacContext(game.displayCtx)):{tag:'uninitialized'}});
let display=null,oldHandler=null,handlerRestored=false,state=null,sack=null,inner=null,heldGlob=null;
let boundaries=[],phase='before-startup',started=false,entered=0,primaryError=null,targetResult=null,before=null,after=null,setupReceipts=[],observerError=null,saveError=null,restoreError=null;
const references=new WeakMap();let nextReference=1;
const refId=o=>{if(!o||typeof o!=='object')return null;if(!references.has(o))references.set(o,nextReference++);return references.get(o);};
const own=(o,k)=>!!o&&Object.hasOwn(o,k);
const tagged=(o,k)=>({present:own(o,k),type:typeof o?.[k],tag:o?.[k]===undefined?'undefined':o?.[k]?.constructor?.name??null,value:safeGraph(o?.[k])});
const chain=(head,link,cap=1000)=>{const ids=[],seen=new Set();let x=head;for(;x&&ids.length<cap;x=x[link]){if(seen.has(x))return {ids,cycle:true,truncated:false};seen.add(x);ids.push(x.o_id??x.m_id??null);}return {ids,cycle:false,truncated:!!x,cap};};
const graphObjects=s=>{
 const found=new Set(),walks=[];
 const walk=(head,link,label)=>{const seen=new Set();let x=head;
  for(;x&&seen.size<1000;x=x[link]){if(seen.has(x))break;seen.add(x);
   if(!found.has(x)){found.add(x);if(x.cobj)walk(x.cobj,'nobj',`contents:${x.o_id}`);}}
  walks.push({label,link,visited:seen.size,complete:!x,cycle:!!x&&seen.has(x),truncated:!!x&&!seen.has(x)});
 };
 const l=s?.level;walk(s?.invent,'nobj','inventory');walk(l?.objlist,'nobj','level');
 walk(l?.buriedobjlist,'nobj','buried');walk(s?.gm?.migrating_objs,'nobj','migrating');
 const monsters=new Set();for(let m=l?.monlist;m&&!monsters.has(m);m=m.nmon){monsters.add(m);walk(m.minvent,'nobj',`monster:${m.m_id}`);}
 for(const [x,col] of (l?.objects??[]).entries())for(const [y,head] of (col??[]).entries())if(head)walk(head,'nexthere',`floor:${x},${y}`);
 return {objects:[...found],walks};
};
const objectRecord=o=>{
 if(!o)return null;
 const r={ref:refId(o),o_id:o.o_id,otyp:o.otyp,where:o.where,quan:o.quan,owt:o.owt,
 age:o.age,timed:o.timed,invlet:o.invlet,globby:o.globby,blessed:o.blessed,cursed:o.cursed,
 nomerge:o.nomerge,unpaid:o.unpaid,no_charge:o.no_charge,how_lost:o.how_lost,
 olocked:o.olocked,otrapped:o.otrapped,owornmask:o.owornmask,nobj:o.nobj?.o_id??null,cobj:chain(o.cobj,'nobj')};
 if(o.where===OBJ_FLOOR)r.squareNext=o.nexthere?.o_id??null;
 else if(o.where===OBJ_MINVENT)r.owner={kind:'monster',ref:refId(o.ocarry),m_id:o.ocarry?.m_id??null};
 else if(o.where===OBJ_CONTAINED)r.owner={kind:'container',ref:refId(o.ocontainer),o_id:o.ocontainer?.o_id??null};
 return r;
};
const objectInventory=s=>{const g=graphObjects(s);return {objects:g.objects.map(objectRecord),walks:g.walks};};
const contextSnapshot=(s)=>({gc:{current_container:objectRecord(s?.gc?.current_container),current_containerRef:refId(s?.gc?.current_container),current_containerOwn:own(s?.gc,'current_container')},ga:{abort_looting:tagged(s?.ga,'abort_looting')},gs:{sellobj_first:tagged(s?.gs,'sellobj_first'),sell_how:tagged(s?.gs,'sell_how'),sell_response:tagged(s?.gs,'sell_response')}});
const snapshot=(label)=>{const s=state,u=s?.u,l=s?.level,x=u?.ux,y=u?.uy;const timers=[];for(let t=s?.gt?.timer_base,seen=new Set();t&&!seen.has(t);t=t.next){seen.add(t);if(t.arg===inner||t.arg===heldGlob)timers.push({tid:t.tid,argSameInner:t.arg===inner,argSameHeld:t.arg===heldGlob,argId:t.arg?.o_id,kind:t.kind,func_index:t.func_index,timeout:t.timeout,nextSame:t.next===t});}return {label,phase,started,entered,gameAliasIsCurrent:game===s,gameover:{...tagged(s?.program_state,'gameover'),boolean:Boolean(s?.program_state?.gameover)},multi:tagged(s,'multi'),effectiveMulti:s?.multi??0,clock:{root:tagged(s,'moves'),cGroup:tagged(s?.svm,'moves'),effective:Math.trunc(s?.moves??0)},hero:u?{sameRef:u===startupU,hp:u.uhp,maxhp:u.uhpmax,polymorphed:Upolyd(u),ux:u.ux,uy:u.uy,uz:safeGraph(u.uz),uzRef:refId(u.uz),sameLevel:l===startupLevel,sameUz:u.uz===startupUz,samePosition:!!startupXY&&u.ux===startupXY.x&&u.uy===startupXY.y,inventory:chain(s.invent,'nobj')}:null,sack:objectRecord(sack),inner:objectRecord(inner),heldGlob:objectRecord(heldGlob),floor:chain(l?.objects?.[x]?.[y],'nexthere'),inventoryObjects:chain(s?.invent,'nobj'),levelObjects:chain(l?.objlist,'nobj'),buried:chain(l?.buriedobjlist,'nobj'),migrating:chain(s?.gm?.migrating_objs,'nobj'),monsters:chain(l?.monlist,'nmon'),activeObjects:objectInventory(s),timers,contexts:contextSnapshot(s),rng:rng(),display:display?{toplin:display.toplin,screen:display.serialize(),waitEpoch:display.waitEpoch,queueLength:display.terminal.inputQueueLength,waiting:display.terminal.isWaitingForInput,pending:safeGraph(display.terminal._inputQueue?.slice()),resolver:typeof display.terminal._inputResolver,pendingMessage:tagged(s,'_pending_message')}:null};};
let startupU=null, startupLevel=null, startupUz=null, startupXY=null;
const requiredSnapshot=label=>{try{return snapshot(label);}catch(e){observerError??=err(e,`snapshot:${label}`);throw e;}};
const persistOutcome=(name,value)=>{try{save(name,value);}catch{/* saveError retains the first write failure. */}};
try{
 const nh=new NethackGame(input);display=new GameDisplay(null);nh._pendingDisplay=display;oldHandler=display.onEmptyQueue;
 display.onEmptyQueue=()=>{try{const screen=display.serialize();const r={index:boundaries.length,toplin:display.toplin,screen,waitEpoch:display.waitEpoch,pendingMessage:tagged(game,'_pending_message'),queue:safeGraph(display.terminal._inputQueue?.slice()),resolver:typeof display.terminal._inputResolver,rng:rng(),truncated:false};if(display.toplin!==TOPLINE_NEED_MORE||!screen.includes('--More--')){save('unknown-boundary',r);throw new Error('unexpected non-rendered-More input boundary');}if(boundaries.length>=16){r.truncated=true;save('capped-boundary',r);throw new Error('More cap reached');}boundaries.push(r);save(`more-${String(boundaries.length).padStart(2,'0')}`,r);return 32;}catch(e){observerError??=err(e);throw e;}};
 phase='startup';save('startup-intent',{input,phase,entered,rng:rng()});let startupThrown=null;try{started=await nh.start();}catch(e){startupThrown=e;primaryError??=err(e,'startup');}state=game;nh._pendingDisplay=display;startupU=state?.u??null;startupLevel=state?.level??null;startupUz=state?.u?.uz??null;startupXY=state?.u?{x:state.u.ux,y:state.u.uy}:null;phase='post-startup';save('startup',{started,snapshot:requiredSnapshot('post-startup-before-guards'),boundaries:[...boundaries]});
 if(startupThrown)throw startupThrown;
 const gameover=state?.program_state?.gameover;
 if(!started||!state?.u||!state?.level||!(state.u.uhp>0)||Boolean(gameover)||Upolyd(state.u)||(state.multi??0)<0||state.gc?.current_container) throw new Error('natural startup/hero/container-context gate miss');
 const env=objectGenerationEnv({state,random});
 phase='sack-factory';sack=mksobj(SACK,false,false,env);const sackFree=objectRecord(sack);save('sack-factory',{phase,free:sackFree,snapshot:requiredSnapshot('sack-before-writer')});if(!sack||sack.where!==OBJ_FREE||sack.nobj||sack.cobj||sack.otyp!==SACK||sack.olocked||sack.otrapped||sack.unpaid||sack.no_charge)throw new Error('factory SACK is not ordinary free empty item');
 phase='sack-writer';await addinv_runtime(sack,env);if(sack.where!==OBJ_INVENT||!state.invent||!chain(state.invent,'nobj').ids.includes(sack.o_id)||sack.cobj||sack.olocked||sack.otrapped||sack.unpaid||sack.no_charge)throw new Error('ordinary held sack writer gate miss');save('sack',{phase,owner:'hero inventory nobj',sackFree,snapshot:requiredSnapshot('sack-in-inventory')});
 phase='contained-glob-factory';inner=mksobj(GLOB_OF_GRAY_OOZE,true,false,env);const innerFree=objectRecord(inner);save('contained-glob-factory',{phase,free:innerFree,snapshot:requiredSnapshot('inner-before-writer')});if(inner?.where!==OBJ_FREE||inner.nobj||inner.quan!==1||inner.otyp!==GLOB_OF_GRAY_OOZE||!inner.globby||!(inner.owt>0)||!(inner.age>=0)||!(inner.timed>0)||inner.unpaid||inner.no_charge||inner.nomerge)throw new Error('first glob factory defaults do not meet source contract');
 phase='contained-glob';const child=await addToContainerRuntime(sack,inner,env);if(child!==inner||inner.where!==OBJ_CONTAINED||inner.ocontainer!==sack||sack.cobj!==inner)throw new Error('real contained-glob writer gate miss');container_weight(sack,env);const expectedSackWeight=weight(sack,env);if(sack.owt!==expectedSackWeight)throw new Error('canonical container-weight receipt mismatch');save('contained-glob',{phase,writer:'addToContainerRuntime then container_weight',actualParentWeight:sack.owt,expectedParentWeight:expectedSackWeight,snapshot:requiredSnapshot('contained-glob')});
 phase='hero-glob-factory';heldGlob=mksobj(GLOB_OF_GRAY_OOZE,true,false,env);const heldFree=objectRecord(heldGlob);save('hero-glob-factory',{phase,free:heldFree,snapshot:requiredSnapshot('held-before-writer')});if(heldGlob?.where!==OBJ_FREE||heldGlob.nobj||heldGlob.quan!==1||heldGlob.otyp!==GLOB_OF_GRAY_OOZE||!heldGlob.globby||!(heldGlob.owt>0)||!(heldGlob.age>=0)||!(heldGlob.timed>0)||heldGlob.unpaid||heldGlob.no_charge||heldGlob.nomerge)throw new Error('second glob factory defaults do not meet source contract');
 phase='hero-glob';await addinv_runtime(heldGlob,env);if(heldGlob.where!==OBJ_INVENT||!chain(state.invent,'nobj').ids.includes(heldGlob.o_id)||!heldGlob.invlet||heldGlob.quan!==1||inner.quan!==1||heldGlob.unpaid||inner.unpaid||heldGlob.no_charge||inner.no_charge||!mergable(heldGlob,inner,env))throw new Error('natural initialized inventory/contained glob pair gate miss');
 const timerFor=(o)=>{const seen=new Set(),found=[];let t=state.gt?.timer_base;for(;t&&!seen.has(t);t=t.next){seen.add(t);if(t.arg===o)found.push({tid:t.tid,argSame:t.arg===o,kind:t.kind,func_index:t.func_index,timeout:t.timeout,live:t.timeout>Math.trunc(state.moves??0)});}return {rows:found,cycle:!!t};};const innerTimers=timerFor(inner),heldTimers=timerFor(heldGlob);const timerOk=(r)=>r.rows.some(t=>t.argSame&&t.kind===TIMER_OBJECT&&t.func_index===SHRINK_GLOB&&t.live);if(!timerOk(innerTimers)||!timerOk(heldTimers))throw new Error('each glob lacks its own live source shrink timer');const flags=state.flags;const selected={id:heldGlob.o_id,invlet:heldGlob.invlet,invletType:typeof heldGlob.invlet,invletCode:typeof heldGlob.invlet==='string'&&heldGlob.invlet.length===1?heldGlob.invlet.charCodeAt(0):null,invletConstant:{present:own(flags,'invlet_constant'),type:typeof flags?.invlet_constant,value:flags?.invlet_constant},selectedRefIsHeld:heldGlob===state.invent||chain(state.invent,'nobj').ids.includes(heldGlob.o_id)};if(selected.invletType!=='string'||selected.invletCode===null||flags?.invlet_constant!==true)throw new Error('actual source inventory letter contract not met');save('hero-glob',{phase,writer:'addinv_runtime (reassign only when !invlet_constant)',selected,eachTimer:{inner:innerTimers,held:heldTimers},pair:{merge:mergable(heldGlob,inner,env),innerQuan:inner.quan,heldQuan:heldGlob.quan,innerBUC:{blessed:inner.blessed,cursed:inner.cursed},heldBUC:{blessed:heldGlob.blessed,cursed:heldGlob.cursed},innerNomerge:inner.nomerge,heldNomerges:heldGlob.nomerge},snapshot:requiredSnapshot('hero-glob')});
 if(!startupU||state.u!==startupU||state.level!==startupLevel||state.u.uz!==startupUz||state.u.ux!==startupXY.x||state.u.uy!==startupXY.y)throw new Error('startup identity/coordinate invariant changed');
 phase='before-target';
 const key='s'.charCodeAt(0), selectedCode=heldGlob.invlet.charCodeAt(0);
 const targetArgs={sack,held:true,moreContainers:false,state};
 save('target-intent',{phase,entered:0,route:'await use_container(sack,true,false,state)',
 queued:[key,selectedCode],sackId:sack.o_id,selectedId:heldGlob.o_id,
 selectedInvlet:heldGlob.invlet,invletConstant:tagged(state.flags,'invlet_constant')});
 before=requiredSnapshot('before-use-container');save('before-target',{phase,entered:0,snapshot:before});
 display.pushKey(key);display.pushKey(selectedCode);
 save('queued-input',{phase,entered:0,keys:[key,selectedCode],
 terminalQueue:safeGraph(display.terminal._inputQueue?.slice()),
 resolver:typeof display.terminal._inputResolver,selectedId:heldGlob.o_id,selectedInvlet:heldGlob.invlet});
 phase='target-entered';entered=1;
 try{
  targetResult=await use_container(targetArgs.sack,targetArgs.held,targetArgs.moreContainers,targetArgs.state);
  phase='target-returned';persistOutcome('target-returned',{phase,entered,returned:true,targetResult});
 }catch(e){primaryError??=err(e,'use_container');
  persistOutcome('target-threw',{phase,entered,returned:false,primaryError});throw e;}
}catch(e){primaryError??=err(e,phase);phase=`setup-or-target-threw:${phase}`;
 persistOutcome('first-error',{phase,entered,primaryError,observerError,saveError});
}finally{
 try{if(display)display.onEmptyQueue=oldHandler;
  handlerRestored=!!display&&display.onEmptyQueue===oldHandler;
  if(display&&!handlerRestored)throw new Error('onEmptyQueue restoration mismatch');
 }catch(e){restoreError??=err(e,'restore-onEmptyQueue');}
 state=game;
 persistOutcome('finally-scalars',{phase,entered,handlerRestored,handlerWasNull:oldHandler===null,
 primaryError,observerError,saveError,restoreError,targetResult});
}
try{after=snapshot('after-handler-restoration');}
catch(e){observerError??=err(e,'snapshot:after-handler-restoration');}
const final={phase,started,entered,handlerRestored,primaryError,observerError,saveError,restoreError,
 targetResult,before,after,boundaries,setupReceipts,
 identities:{sameHero:game?.u===startupU,sameLevel:game?.level===startupLevel,sameUz:game?.u?.uz===startupUz,
 samePosition:!!startupXY&&game?.u?.ux===startupXY.x&&game?.u?.uy===startupXY.y}};
try{save('final',final);}catch{persistOutcome('final-fallback',{...final,saveError});}
console.log(JSON.stringify({phase,started,entered,targetResult,handlerRestored,primaryError,
 observerError,saveError,restoreError}));
if(primaryError||observerError||saveError||restoreError||entered!==1)process.exitCode=2;
