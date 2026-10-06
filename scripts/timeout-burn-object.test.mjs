// timeout.c see_lamp_flicker1345–1356, lantern_message1360–1375 and
// burn_object1383–1680. Fixtures initialize production owners, then pin
// callback branches whose rare object placement is costly to reach in play.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {BLINDED,BURN_OBJECT,HALLUC,LS_OBJECT,OBJ_DELETED,OBJ_FLOOR,OBJ_FREE,
 OBJ_INVENT,OBJ_MIGRATING,OBJ_MINVENT,REVIVE_MON,TIMER_OBJECT,W_QUIVER} from '../js/const.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {new_light_source} from '../js/light.js';
import {PM_GNOME,PM_LICHEN,LOW_PM} from '../js/monsters.js';
import {newObject,place_object,weight} from '../js/obj.js';
import {BRASS_LANTERN,CANDELABRUM_OF_INVOCATION,OIL_LAMP,POT_OIL,TALLOW_CANDLE,WAX_CANDLE} from '../js/objects.js';
import {burn_object,lantern_message,peek_timer,run_timers,see_lamp_flicker,start_timer} from '../js/timeout.js';
import {planningState} from '../js/unported_monster_actions.js';

async function fixture(otyp,age,where=OBJ_INVENT,quantity=1){
 // Independent source setup uses the Samurai's five-item initial inventory.
 await runSegment({seed:121061101,datetime:'21100102123400',nethackrc:
  'OPTIONS=role:Samurai,race:human,gender:female,align:lawful,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!debug_mongen',moves:''});
 const obj=newObject({otyp,oclass:game.objects[otyp].oc_class,quan:quantity,
  age,spe:3,lamplit:true,timed:0,dknown:true,known:true,where:OBJ_FREE,
  o_id:9999,ox:game.u.ux,oy:game.u.uy}); // Non-colliding fixture id, not a source RNG draw.
 if(where===OBJ_INVENT){obj.where=where;obj.nobj=game.invent;game.invent=obj;}
 else if(where===OBJ_FLOOR)place_object(obj,game.u.ux,game.u.uy,{state:game});
 else if(where===OBJ_MINVENT){
  const mon={data:game.mons[PM_GNOME],m_id:9998,mx:game.u.ux,my:game.u.uy,mhp:10,
   mtame:0,minvent:obj,nmon:game.level.monlist};
  obj.where=where;obj.ocarry=mon;game.level.monlist=mon;game.level.monsters[mon.mx][mon.my]=mon;
 }else if(where===OBJ_MIGRATING){obj.where=where;game.gm.migrating_objs=obj;}
 new_light_source(game.u.ux,game.u.uy,2,LS_OBJECT,obj,game); // Minimum ordinary-candle radius.
 const messages=[],redraws=[],inventory=[];
 const env={state:game,message:async text=>messages.push(text),newsym:(x,y)=>redraws.push([x,y]),
  hooks:{updateInventory:()=>inventory.push(obj.lamplit)}};
 return{obj,env,messages,redraws,inventory};
}
function assertDark(obj){assert.equal(obj.lamplit,false);assert.equal(game.gl.light_base,null);}

test('burn timer warning unlinks first and schedules the next candle segment',async()=>{
 const f=await fixture(TALLOW_CANDLE,75); // First candle warning; next segment is 75-15=60 turns.
 start_timer(0,TIMER_OBJECT,BURN_OBJECT,f.obj,game);
 let reached,finish;const announced=new Promise(resolve=>{reached=resolve;});
 f.env.message=async text=>{assert.equal(text,'Your candle is getting short.');
  assert.equal(f.obj.timed,0);assert.equal(game.gt.timer_base,null);
  reached();await new Promise(resolve=>{finish=resolve;});};
 const operation=run_timers(game,f.env);await announced;
 assert.equal(f.obj.age,75);finish();await operation;
 assert.equal(f.obj.age,15);assert.equal(f.obj.timed,1);
 assert.equal(peek_timer(BURN_OBJECT,f.obj,game),game.moves+60);
});

test('candle plural warning and final consumption keep feedback before deletion',async()=>{
 const f=await fixture(WAX_CANDLE,15,OBJ_INVENT,2); // A stack enters the plural age-15 arm.
 await burn_object(f.obj,game.moves,f.env);
 assert.deepEqual(f.messages,["Your candles' flames flicker low!"]);
 assert.equal(f.obj.age,0);assert.equal(f.obj.timed,1);
 game.moves=peek_timer(BURN_OBJECT,f.obj,game);f.messages.length=0;
 f.env.message=async text=>{assert.equal(f.obj.where,OBJ_INVENT);f.messages.push(text);};
 await run_timers(game,f.env);
 assert.deepEqual(f.messages,['Your candles are consumed!','Their flames die.']);
 assertDark(f.obj);assert.equal(f.obj.where,OBJ_DELETED);
});

test('floor candle deletion redraws after removing both object chains',async()=>{
 const f=await fixture(TALLOW_CANDLE,0,OBJ_FLOOR);
 await burn_object(f.obj,game.moves,f.env);
 assert.deepEqual(f.messages,['You see a candle consumed!','Its flame dies.']);
 assertDark(f.obj);assert.equal(game.level.objects[f.obj.ox][f.obj.oy],null);
 assert.equal(f.obj.where,OBJ_DELETED);assert.deepEqual(f.redraws,[[f.obj.ox,f.obj.oy]]);
});

test('blind carried candle gives tactile consumption without an ordinary flame line',async()=>{
 const f=await fixture(TALLOW_CANDLE,0);game.u.uprops[BLINDED].extrinsic=1;
 await burn_object(f.obj,game.moves,f.env);
 assert.deepEqual(f.messages,['Your candle is consumed!','']);assertDark(f.obj);
});

test('hallucinated candle consumption shrieks even when the hero is blind',async()=>{
 const f=await fixture(TALLOW_CANDLE,0);game.u.uprops[BLINDED].extrinsic=1;
 game.u.uprops[HALLUC].intrinsic=50; // Active hallucination overrides the empty blind post-message.
 await burn_object(f.obj,game.moves,f.env);
 assert.deepEqual(f.messages,['Your candle is consumed!','It shrieks!']);
});

test('candelabrum expiry clears candle count and recomputes retained weight',async()=>{
 const f=await fixture(CANDELABRUM_OF_INVOCATION,0);const bare=game.objects[f.obj.otyp].oc_weight;
 await burn_object(f.obj,game.moves,f.env);
 assert.deepEqual(f.messages,["Your candelabrum's flames die."]);
 assertDark(f.obj);assert.equal(f.obj.where,OBJ_INVENT);assert.equal(f.obj.spe,0);
 assert.equal(f.obj.owt,bare);assert.ok(f.inventory.length>0);
});

for(const otyp of [OIL_LAMP,BRASS_LANTERN]){
 test(`lamp fuel thresholds restart the canonical timer for type ${otyp}`,async()=>{
  // timeout.c lamp thresholds and source begin_burn delays: 150->100->50->25->0.
  const f=await fixture(otyp,150);
  for(const [age,next,delay]of[[150,100,50],[100,50,50],[50,25,25],[25,0,25]]){
   f.obj.age=age;f.obj.timed=0;game.gt.timer_base=null;f.messages.length=0;
   await burn_object(f.obj,game.moves,f.env);
   assert.equal(f.obj.age,next);assert.equal(peek_timer(BURN_OBJECT,f.obj,game),game.moves+delay);
   assert.deepEqual(f.messages,[otyp===BRASS_LANTERN?'Your lantern is getting dim.':
    age===25?'Your lamp seems about to go out.':age===50?'Your lamp flickers considerably.':'Your lamp flickers.']);
  }
 });
}

test('blind lamp expiry gives tactile feedback but a brass lantern stays silent',async()=>{
 for(const otyp of[OIL_LAMP,BRASS_LANTERN]){
  const f=await fixture(otyp,0);game.u.uprops[BLINDED].extrinsic=1;
  await burn_object(f.obj,game.moves,f.env);assertDark(f.obj);
  assert.deepEqual(f.messages,otyp===OIL_LAMP?['Your lamp has gone out.']:[]);
 }
});

test('lamp flicker and lantern helpers preserve floor and monster ownership messages',async()=>{
 const f=await fixture(OIL_LAMP,100,OBJ_FLOOR);
 await see_lamp_flicker(f.obj,'',f.env);
 assert.deepEqual(f.messages,['You see a lamp flicker.']);
 const g=await fixture(BRASS_LANTERN,100,OBJ_MINVENT);
 await lantern_message(g.obj,g.env);
 assert.deepEqual(g.messages,["The gnome's lantern is getting dim."]);
});

test('hallucinated carried lantern follows dimming with the batteries message',async()=>{
 const f=await fixture(BRASS_LANTERN,100);game.u.uprops[HALLUC].intrinsic=50;
 await burn_object(f.obj,game.moves,f.env);
 assert.deepEqual(f.messages,['Your lantern is getting dim.','Batteries have not been invented yet.']);
});

test('monster ownership naming uses the supplied display RNG during planning',async()=>{
 const f=await fixture(OIL_LAMP,50,OBJ_MINVENT);game.u.uprops[HALLUC].intrinsic=50;
 const displayBefore=structuredClone(game.displayCtx);const mainBefore=structuredClone(game.coreCtx);
 const draws=[];let i=0;const random=bound=>{draws.push(bound);return i++%2===0?PM_LICHEN-LOW_PM:0;};
 await burn_object(f.obj,game.moves,{...f.env,planning:true,displayRandom:random});
 assert.equal(draws.length,4,'Shk_Your and Yname2 each name the hallucinated owner');
 assert.deepEqual(game.displayCtx,displayBefore);assert.deepEqual(game.coreCtx,mainBefore);
 assert.deepEqual(f.messages,[]);assert.deepEqual(f.redraws,[]);assert.deepEqual(f.inventory,[]);
 assert.equal(f.obj.age,25);assert.equal(f.obj.timed,1);
});

test('oil potion burnout consumes carried and floor objects, with visible feedback only',async()=>{
 for(const where of[OBJ_INVENT,OBJ_FLOOR]){
  const f=await fixture(POT_OIL,0,where);await burn_object(f.obj,game.moves,f.env);
  assert.deepEqual(f.messages,[where===OBJ_INVENT?'Your potion of oil has burnt away.':
   'You see a burning potion of oil go out.']);assertDark(f.obj);assert.equal(f.obj.where,OBJ_DELETED);
 }
});

test('planning timer consumption changes only its cloned object and light graph',async()=>{
 const f=await fixture(TALLOW_CANDLE,0,OBJ_FLOOR);
 start_timer(0,TIMER_OBJECT,BURN_OBJECT,f.obj,game);
 const clone=planningState(game);
 let copied;for(let obj=clone.level.objlist;obj;obj=obj.nobj)
  if(obj.o_id===f.obj.o_id)copied=obj;
 assert.ok(copied);assert.notEqual(copied,f.obj);
 await run_timers(clone,{planning:true,
  message:()=>{throw new Error('planning wrote a live message');},
  newsym:()=>{throw new Error('planning redrew the live map');}});
 assert.equal(copied.where,OBJ_DELETED);assert.equal(copied.timed,0);
 assert.equal(copied.lamplit,false);assert.equal(clone.gl.light_base,null);
 assert.equal(f.obj.where,OBJ_FLOOR);assert.equal(f.obj.timed,1);
 assert.equal(f.obj.lamplit,true);assert.ok(game.gl.light_base);
});

test('migrating candle and oil expiry clear the destination mask before extraction',async()=>{
 for(const otyp of[TALLOW_CANDLE,POT_OIL]){
  const f=await fixture(otyp,0,OBJ_MIGRATING);f.obj.owornmask=123; // Migration destination encoding, not worn equipment.
  await burn_object(f.obj,game.moves,f.env);
  assert.equal(f.obj.owornmask,0);assert.equal(game.gm.migrating_objs,null);
  assertDark(f.obj);assert.equal(f.obj.where,OBJ_DELETED);assert.deepEqual(f.messages,[]);
 }
});

test('consumed quivered candle uses the existing worn-slot owner',async()=>{
 const f=await fixture(TALLOW_CANDLE,0);game.uquiver=f.obj;f.obj.owornmask=W_QUIVER;
 await burn_object(f.obj,game.moves,f.env);
 assert.equal(game.uquiver,null);assert.equal(f.obj.owornmask,0);assert.equal(f.obj.where,OBJ_DELETED);
});

test('late callbacks silently catch up or consume their remaining fuel',async()=>{
 const f=await fixture(TALLOW_CANDLE,75,OBJ_FLOOR); // 10 away turns leave 65 fuel: next segment consumes 50.
 await burn_object(f.obj,game.moves-10,f.env);
 assert.equal(f.obj.age,15);assert.equal(peek_timer(BURN_OBJECT,f.obj,game),game.moves+50);
 assert.deepEqual(f.messages,[]);
 const g=await fixture(CANDELABRUM_OF_INVOCATION,15,OBJ_FLOOR);
 await burn_object(g.obj,game.moves-15,g.env); // Exact equality consumes the last 15 fuel, retaining the vessel.
 assertDark(g.obj);assert.equal(g.obj.spe,0);assert.equal(g.obj.owt,weight(g.obj,{state:game}));
 const h=await fixture(TALLOW_CANDLE,0,OBJ_FLOOR);
 await burn_object(h.obj,game.moves-1,h.env);assertDark(h.obj);assert.equal(h.obj.where,OBJ_DELETED);
 assert.deepEqual(h.messages,[]);assert.deepEqual(h.redraws,[]);
});

test('refuelled non-threshold age restarts without an invented warning',async()=>{
 const f=await fixture(OIL_LAMP,200);await burn_object(f.obj,game.moves,f.env);
 assert.equal(f.obj.age,150);assert.equal(peek_timer(BURN_OBJECT,f.obj,game),game.moves+50);
 assert.deepEqual(f.messages,[]);
});

test('burn timer admission retains the one-object-timer boundary',async()=>{
 const f=await fixture(TALLOW_CANDLE,75);start_timer(0,TIMER_OBJECT,BURN_OBJECT,f.obj,game);
 // A second future timer is outside the explicit existing drain contract.
 start_timer(50,TIMER_OBJECT,REVIVE_MON,f.obj,game);const head=game.gt.timer_base;
 await assert.rejects(run_timers(game,f.env),/the due object to hold only its own timer/u);
 assert.equal(game.gt.timer_base,head);assert.equal(f.obj.timed,2);assert.equal(f.obj.age,75);
});

test('burn family declarations and source-owned dispatch cover the assigned functions',()=>{
 const c=readFileSync(new URL('../nethack-c/upstream/src/timeout.c',import.meta.url),'utf8');
 assert.match(c,/see_lamp_flicker\(struct obj \*obj, const char \*tailer\)/u);
 assert.match(c,/TTAB\(burn_object, cleanup_burn, "burn_object"\)/u);
 const js=readFileSync(new URL('../js/timeout.js',import.meta.url),'utf8');
 assert.match(js,/name: 'burn_object', f: burn_object, unported: \(\) => null/u);
});
