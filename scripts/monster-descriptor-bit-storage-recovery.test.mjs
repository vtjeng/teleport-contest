// Pinned C sp_lev.c assigns three fields directly into unsigned one-bit
// struct monst members. nhlua.c returns string-option indices, not normalized
// truth values. Existing recorder DWARF independently confirms these widths.
// This is initialized-game JS API coverage with source/profile-derived C
// expectations, not a newly executed C constructor or gameplay recording.
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {PM_GIANT_ANT} from '../js/monsters.js';

async function flagValue(field,value,stored){
  await runSegment({seed:0x5eed,datetime:'20400314015926',recorderIsDst:false,
    nethackrc:'OPTIONS=name:BitStorageRecovery,role:Tourist,race:human,gender:female,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!debug_mongen\n',moves:''});
  assert.ok(game.u.uhp>0);
  let result;
  await mklev({specialLevelLoader:async des=>{
    await des.level_init({style:'solidfill',fg:'.',lit:0});
    const monster=await des.monster({id:'giant ant',x:10,y:6,
      peaceful:false,asleep:false,female:false,inventory:false,[field]:value});
    assert.ok(monster);
    assert.equal(monster.mnum,PM_GIANT_ANT);
    assert.deepEqual([monster.mx,monster.my],[11,6]);
    result=Boolean(monster[stored]);
  }});
  return result;
}
for(const [field,stored] of [['female','female'],['peaceful','mpeaceful'],['asleep','msleeping']]){
  for(const [value,expected] of [
    ['yes',false],['true',false],['false',true],['no',true],
    [false,false],[true,true],[0,false],[1,true],
  ]){
    test(`${field} ${JSON.stringify(value)} obeys C direct one-bit storage`,async()=>{
      assert.equal(await flagValue(field,value,stored),expected);
    });
  }
}
test('conditional cancelled assignment preserves C truth-to-one behavior',async()=>{
  assert.equal(await flagValue('cancelled','yes','mcan'),true);
});
