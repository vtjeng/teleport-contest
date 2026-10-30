// Combined-branch interaction controls. C expectations are source-derived;
// these checks do not claim a new native C constructor execution.
import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {mklev} from '../js/mklev.js';
import {ICE, M_AP_NOTHING} from '../js/const.js';
import {PM_JACKAL, PM_CHAMELEON} from '../js/monsters.js';

for (const [label, lit, asleep, expectedLit, expectedSleep] of [
  ['C option strings and one-bit storage', 'yes', 'yes', false, false],
  ['boolean control', true, true, true, true],
]) test(`combined map normalization/metadata/native descriptor: ${label}`, async () => {
  await runSegment({seed:0x5eed,datetime:'20400314015926',recorderIsDst:false,
    nethackrc:'OPTIONS=name:BroadInteraction,role:Tourist,race:human,gender:female,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!debug_mongen\n',moves:''});
  assert.ok(game.u.uhp > 0);
  await mklev({specialLevelLoader:async des => {
    des.level_init({style:'solidfill',fg:'.',lit:false});
    des.level_flags('icedpools');
    des.map({x:10,y:6,map:'II\nII\0ignored',lit});
    for (let x=10;x<12;x++) for (let y=6;y<8;y++) {
      const cell=game.level.at(x,y);
      assert.equal(cell.typ,ICE);assert.equal(Boolean(cell.lit),expectedLit);
      assert.equal(cell.icedpool,8);
    }
    const monster=await des.monster({id:'chameleon',appear_as:'mon:jackal',
      x:0,y:0,asleep,peaceful:false,female:false,inventory:false});
    assert.ok(monster);assert.equal(monster.cham,PM_CHAMELEON);
    assert.equal(monster.mnum,PM_JACKAL);assert.equal(monster.m_ap_type ?? 0,M_AP_NOTHING);
    assert.equal(Boolean(monster.msleeping),expectedSleep);
    assert.deepEqual([monster.mx,monster.my],[10,6]);
  }});
});
