// Source pins for hack.c pickup_checks/dopickup3788–3891,
// pickup.c loot_mon2431–2481 and steed.c rider_cant_reach17–20.
import assert from 'node:assert/strict';
import test from 'node:test';
import {BLINDED,CQ_CANNED,ECMD_TIME,FLYING,LEVITATION,MAGICAL_BREATHING,
 OBJ_INVENT,OBJ_MINVENT,P_BASIC,P_RIDING,POOL,LAVAPOOL,ROOM,HOLE,TRAPDOOR,W_SADDLE,WWALKING} from '../js/const.js';
import {cmdq_add_key} from '../js/cmd.js';
import {game} from '../js/gstate.js';
import {dopickup,pickup_checks} from '../js/hack.js';
import {runSegment} from '../js/jsmain.js';
import {PM_FLOATING_EYE,PM_FIRE_ELEMENTAL,PM_FOG_CLOUD,PM_PONY,PM_PURPLE_WORM,PM_RED_DRAGON} from '../js/monsters.js';
import {mksobj,place_object} from '../js/obj.js';
import {objectGenerationEnv} from '../js/object_generation.js';
import {ELVEN_DAGGER,SADDLE} from '../js/objects.js';
import {loot_mon} from '../js/pickup.js';
import {rider_cant_reach} from '../js/steed.js';
import {clearTtyMessageWindow} from '../js/tty_message.js';
async function fixture(){
 // Independent Samurai setup provides ordinary source state and no pet.
 await runSegment({seed:122061001,datetime:'21110304123400',nethackrc:
  'OPTIONS=role:Samurai,race:human,gender:female,align:lawful,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',moves:''});
 clearTtyMessageWindow(game);game._ttyToplines='';
 game.level.at(game.u.ux,game.u.uy).typ=ROOM;
 const messages=[];const env={state:game,message:async line=>messages.push(line)};
 return{state:game,messages,env};
}
function floorObject(f){const obj=mksobj(ELVEN_DAGGER,true,false,objectGenerationEnv({state:f.state}));
 place_object(obj,f.state.u.ux,f.state.u.uy,{state:f.state});return obj;}
function monster(f,species=PM_PONY){return{data:f.state.mons[species],mnum:species,m_id:9998,
 mx:f.state.u.ux,my:f.state.u.uy,mhp:20,mhpmax:20,mtame:10,mpeaceful:1,
 minvent:null,misc_worn_check:0};} // Non-colliding id and healthy fixture; naming/extraction read these fields.
function saddle(f,mon){const obj=mksobj(SADDLE,true,false,objectGenerationEnv({state:f.state}));
 obj.cursed=false;obj.where=OBJ_MINVENT;obj.ocarry=mon;obj.owornmask=W_SADDLE;
 obj.nobj=mon.minvent;mon.minvent=obj;mon.misc_worn_check=W_SADDLE;return obj;}

test('swallowed empty checks await digesting feedback and cost one turn',async()=>{
 const f=await fixture();f.state.u.uswallow=1;f.state.u.ustuck=monster(f,PM_PURPLE_WORM);
 assert.equal(await pickup_checks(f.state,f.env),1);
 assert.deepEqual(f.messages,["You pick up the purple worm's tongue.","But it's kind of slimy, so you drop it."]);
});
test('swallowed empty blind non-digester feels; inventory returns minus two without output',async()=>{
 const f=await fixture();f.state.u.uswallow=1;const mon=monster(f,PM_FOG_CLOUD);f.state.u.ustuck=mon;
 f.state.u.uprops[BLINDED].intrinsic=1;
 assert.equal(await pickup_checks(f.state,f.env),1);
 assert.deepEqual(f.messages,["You don't feel anything in here to pick up."]);
 f.messages.length=0;mon.minvent={};assert.equal(await pickup_checks(f.state,f.env),-2);assert.deepEqual(f.messages,[]);
});
test('pool and lava source gates precede empty-pile terrain messages',async()=>{
 for(const [typ,expected]of[[POOL,"You can't even see the bottom, let alone pick up something."],
  [LAVAPOOL,'You would burn to a crisp trying to pick things up.']]){
  const f=await fixture();f.state.level.at(f.state.u.ux,f.state.u.uy).typ=typ;
  assert.equal(await pickup_checks(f.state,f.env),0);assert.deepEqual(f.messages,[expected]);
 }
});
test('water walking ignores blocking and refuses to dive or reach lava',async()=>{
 for(const typ of[POOL,LAVAPOOL]){
  const f=await fixture();f.state.level.at(f.state.u.ux,f.state.u.uy).typ=typ;
  f.state.u.uprops[WWALKING]={intrinsic:1,extrinsic:0,blocked:1};
  assert.equal(await pickup_checks(f.state,f.env),0);
  assert.deepEqual(f.messages,[typ===POOL?'You cannot dive into the water to pick things up.':
   "You can't reach the bottom to pick things up."]);
 }
});
test('flying steed counts; raw magical breathing permits the underwater fallthrough',async()=>{
 const f=await fixture();floorObject(f);f.state.level.at(f.state.u.ux,f.state.u.uy).typ=POOL;
 f.state.u.usteed=monster(f,PM_RED_DRAGON);f.state.u.weapon_skills[P_RIDING]={skill:P_BASIC};
 assert.equal(await pickup_checks(f.state,f.env),0);assert.match(f.messages[0],/cannot dive/u);
 f.messages.length=0;f.state.u.usteed=null;f.state.u.uprops[FLYING].intrinsic=1;
 f.state.u.uprops[MAGICAL_BREATHING]={intrinsic:1,extrinsic:0,blocked:1};f.state.u.uinwater=true;
 assert.equal(await pickup_checks(f.state,f.env),-1);assert.deepEqual(f.messages,[]);
});
test('floating form intercepts underwater while a lava-loving form falls through',async()=>{
 const f=await fixture();floorObject(f);f.state.level.at(f.state.u.ux,f.state.u.uy).typ=POOL;
 f.state.youmonst.data=f.state.mons[PM_FLOATING_EYE];f.state.u.uinwater=true;
 assert.equal(await pickup_checks(f.state,f.env),0);assert.match(f.messages[0],/cannot dive/u);
 f.messages.length=0;f.state.youmonst.data=f.state.mons[PM_FIRE_ELEMENTAL];
 f.state.level.at(f.state.u.ux,f.state.u.uy).typ=LAVAPOOL;
 assert.equal(await pickup_checks(f.state,f.env),-1);assert.deepEqual(f.messages,[]);
});
test('unreachable blind, hole and trapdoor use their source wording',async()=>{
 for(const [trap,blind,expected]of[[null,true,'You cannot reach anything here.'],
  [HOLE,false,'You cannot reach the edge of the hole.'],[TRAPDOOR,false,'You cannot reach the trap door.']]){
  const f=await fixture();floorObject(f);f.state.u.uprops[LEVITATION].intrinsic=1;
  if(blind)f.state.u.uprops[BLINDED].intrinsic=1;
  if(trap)f.state.level.traps.push({tx:f.state.u.ux,ty:f.state.u.uy,ttyp:trap,tseen:1});
  assert.equal(await pickup_checks(f.state,f.env),0);assert.deepEqual(f.messages,[expected]);
 }
});
test('rider reach helper formats the canonical tame mount without RNG',async()=>{
 const f=await fixture();f.state.u.usteed=monster(f);const before=structuredClone(f.state.coreCtx);
 await rider_cant_reach(f.state,f.env);assert.deepEqual(f.messages,["You aren't skilled enough to reach from your pony."]);
 assert.deepEqual(f.state.coreCtx,before);
});
for(const answer of['n','q'])test('saddle '+answer+' preserves ownership and only marks inquiry',async()=>{
 const f=await fixture();const mon=monster(f),obj=saddle(f,mon),inquiry={value:-4},looted={value:false};
 const before=structuredClone(f.state.coreCtx);cmdq_add_key(CQ_CANNED,answer.charCodeAt(0),f.state);
 assert.equal(await loot_mon(mon,inquiry,looted,f.state,f.env),0);
 assert.equal(inquiry.value,1);assert.equal(looted.value,false);assert.equal(mon.minvent,obj);
 assert.equal(obj.owornmask,W_SADDLE);assert.deepEqual(f.state.coreCtx,before);
});
test('cursed saddle and no-limbs attempts preserve equipment with distinct time returns',async()=>{
 for(const limbs of[true,false]){
  const f=await fixture();const mon=monster(f),obj=saddle(f,mon);obj.cursed=true;
  if(!limbs)f.state.youmonst.data=f.state.mons[PM_FOG_CLOUD];
  cmdq_add_key(CQ_CANNED,'y'.charCodeAt(0),f.state);
  assert.equal(await loot_mon(mon,null,null,f.state,f.env),limbs?1:0);
  assert.equal(mon.minvent,obj);assert.equal(obj.where,OBJ_MINVENT);
  assert.match(f.messages[0],limbs?/saddle seems to be stuck/u:/without limbs/u);
 }
});
test('saddle acquisition awaits extraction and messages before exactly rnd three',async()=>{
 const f=await fixture();const mon=monster(f),obj=saddle(f,mon),looted={value:false},draws=[];
 cmdq_add_key(CQ_CANNED,'y'.charCodeAt(0),f.state);
 const env={...f.env,random:{rnd:n=>{draws.push(n);assert.equal(obj.where,OBJ_INVENT);
  assert.equal(obj.owornmask,0);assert.equal(mon.minvent,null);assert.match(f.messages[0],/^You take/u);return 2;}}};
 assert.equal(await loot_mon(mon,null,looted,f.state,env),2);assert.deepEqual(draws,[3]);
 assert.equal(looted.value,true);assert.equal(mon.misc_worn_check&W_SADDLE,0);
});
test('swallowed dopickup negates count, clears multi and consumes monster inventory',async()=>{
 const f=await fixture();const mon=monster(f,PM_FOG_CLOUD);const obj=floorObject(f);
 // Move the source object to minvent, independent of the floor chain.
 f.state.level.objects[f.state.u.ux][f.state.u.uy]=null;f.state.level.objlist=null;
 obj.where=OBJ_MINVENT;obj.nobj=null;obj.nexthere=null;obj.ocarry=mon;mon.minvent=obj;
 f.state.u.uswallow=1;f.state.u.ustuck=mon;f.state.commandCount=1;f.state.multi=4;
 assert.equal(await dopickup(f.state,f.env),ECMD_TIME);assert.equal(f.state.multi,0);
 assert.equal(mon.minvent,null);assert.equal(obj.where,OBJ_INVENT);
});
test('current steed is never queried for its own saddle',async()=>{
 const f=await fixture();const mon=monster(f),obj=saddle(f,mon);f.state.u.usteed=mon;
 const inquiry={value:-4};assert.equal(await loot_mon(mon,inquiry,null,f.state,f.env),0);
 assert.equal(inquiry.value,-4);assert.equal(mon.minvent,obj);
});

// C's nested mounted helpers remain wired even though these production
// routes have an earlier floor guard with the same unskilled-rider state.
test('mounted dip and untrap source guards precede their nested reach helpers', async () => {
 const {readFileSync}=await import('node:fs');
 const source=file=>readFileSync(new URL('../nethack-c/upstream/src/'+file,import.meta.url),'utf8');
 const potion=source('potion.c');
 const dip=potion.slice(potion.indexOf('dodip(void)'));
 assert.ok(dip.indexOf('!can_reach_floor(FALSE)')<dip.indexOf('rider_cant_reach();'));
 const trap=source('trap.c');
 const untrap=trap.slice(trap.indexOf('untrap(\n'));
 assert.match(untrap,/deal_with_floor_trap = can_reach_floor\(FALSE\);[\s\S]*?else if \(!deal_with_floor_trap\)/u);
 const floor=source('engrave.c');
 const reach=floor.slice(floor.indexOf('can_reach_floor(boolean check_pit)'));
 assert.match(reach,/u\.usteed && P_SKILL\(P_RIDING\) < P_BASIC\)\s*return FALSE;/u);
});
