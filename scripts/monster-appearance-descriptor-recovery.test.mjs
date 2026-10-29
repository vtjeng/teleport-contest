// Scoped production-API characterization of sp_lev.c create_monster().
// Expectations are from pinned C switch/gate semantics and native catalog.
// No new C constructor execution or matching gameplay recording is claimed.
// Setup calls only runSegment, mklev, des.level_init and des.monster: no rooms,
// injected monster flags, scripted RNG, movement planning or global newsym hook.
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {getRngLog} from '../js/rng.js';
import {M_AP_MONSTER, M_AP_NOTHING} from '../js/const.js';
import {mon_has_special} from '../js/wizard.js';
import {
  PM_CHAMELEON, PM_DOPPELGANGER, PM_SANDESTIN, PM_GIANT_MIMIC,
  PM_VAMPIRE, PM_VLAD_THE_IMPALER, PM_JACKAL, PM_FOG_CLOUD,
} from '../js/monsters.js';

async function construct(id, appear_as, {inventory = false} = {}) {
  await runSegment({seed: 0x5eed, datetime:'20400314015926', recorderIsDst:false,
    nethackrc:'OPTIONS=name:AppearanceRecovery,role:Tourist,race:human,gender:female,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!debug_mongen\n', moves:''});
  assert.ok(game.u.uhp > 0);
  let snapshot;
  await mklev({specialLevelLoader:async des => {
    await des.level_init({style:'solidfill',fg:'.',lit:0});
    const descriptor={id,x:10,y:6,peaceful:false,asleep:false,female:false};
    if (inventory !== null) descriptor.inventory=inventory;
    if (appear_as !== undefined) descriptor.appear_as=appear_as;
    const beforeRng=getRngLog().length;
    const monster=await des.monster(descriptor);
    snapshot=monster ? {
      id:monster.m_id,mnum:monster.mnum,cham:monster.cham,
      dataMatchesCatalog:monster.data === game.mons[monster.mnum],
      mappearance:monster.mappearance,m_ap_type:monster.m_ap_type,
      mx:monster.mx,my:monster.my,hasSpecial:mon_has_special(monster),
      creationRngCalls:getRngLog().length-beforeRng,
    } : null;
  }});
  return {monster:snapshot,rng:[...getRngLog()]};
}

const cases=[
  {name:'named chameleon',id:'chameleon',cham:PM_CHAMELEON,appearance:'mon:jackal',expected:PM_JACKAL},
  {name:'ordinary non-shapechanger',id:'jackal',appearance:'mon:giant ant',expected:PM_JACKAL},
  {name:'random mimic',id:'giant mimic',appearance:'mon:random',mimic:true},
  {name:'random chameleon',id:'chameleon',cham:PM_CHAMELEON,appearance:'mon:random'},
  {name:'named vampire',id:'vampire',cham:PM_VAMPIRE,appearance:'mon:fog cloud',expected:PM_FOG_CLOUD},
  {name:'Vlad special-item guard',id:'Vlad the Impaler',cham:PM_VLAD_THE_IMPALER,appearance:'mon:fog cloud',inventory:undefined,expected:PM_VLAD_THE_IMPALER,special:true},
  {name:'random vampire',id:'vampire',cham:PM_VAMPIRE,appearance:'mon:random'},
  {name:'random doppelganger',id:'doppelganger',cham:PM_DOPPELGANGER,appearance:'mon:random'},
  {name:'random sandestin',id:'sandestin',cham:PM_SANDESTIN,appearance:'mon:random'},
];
for(const entry of cases){
  const opts=entry.special ? {inventory:null} : {};
  test(`${entry.name}: ordinary native construction control`,async()=>{
    const {monster:m}=await construct(entry.id,undefined,opts);
    assert.ok(m,'native constructor control must succeed');
    assert.equal(m.dataMatchesCatalog,true);
    assert.deepEqual([m.mx,m.my],[11,6]);
    if(entry.cham !== undefined) assert.equal(m.cham,entry.cham);
    if(entry.special) assert.equal(m.hasSpecial,true,'native Vlad must carry the source special item');
  });
  test(`${entry.name}: supported appearance descriptor`,async()=>{
    const mimicControl=entry.mimic ? await construct(entry.id,undefined,opts) : null;
    const {monster:m}=await construct(entry.id,entry.appearance,opts);
    assert.ok(m,'C accepts this descriptor and creates a monster');
    assert.equal(m.dataMatchesCatalog,true);
    assert.deepEqual([m.mx,m.my],[11,6]);
    if(entry.cham !== undefined) assert.equal(m.cham,entry.cham);
    if(entry.expected !== undefined) assert.equal(m.mnum,entry.expected);
    if(entry.mimic){
      assert.equal(m.mnum,PM_GIANT_MIMIC);
      assert.ok(m.creationRngCalls > mimicControl.monster.creationRngCalls,
        'C random appearance performs form selection after the same constructor');
      // C sp_lev.c:2083 explicitly clears appearance when random picks itself.
      if(m.m_ap_type===M_AP_NOTHING) assert.equal(m.mappearance,0);
      else {assert.equal(m.m_ap_type,M_AP_MONSTER);assert.ok(Number.isInteger(m.mappearance) && m.mappearance>=0 && game.mons[m.mappearance]);}
    }
    if(entry.special) assert.equal(m.hasSpecial,true);
  });
}
test('ordinary monster ignores random appearance without changing its RNG',async()=>{
  const control=await construct('jackal');
  const target=await construct('jackal','mon:random');
  assert.ok(control.monster);
  assert.ok(target.monster);
  assert.equal(target.monster.mnum,PM_JACKAL);
  assert.deepEqual(target.rng,control.rng);
});

test('named mimic preserves the already-supported monster appearance control',async()=>{
  const {monster:m}=await construct('giant mimic','mon:jackal');
  assert.ok(m);
  assert.equal(m.mnum,PM_GIANT_MIMIC);
  assert.equal(m.m_ap_type,M_AP_MONSTER);
  assert.equal(m.mappearance,PM_JACKAL);
});
