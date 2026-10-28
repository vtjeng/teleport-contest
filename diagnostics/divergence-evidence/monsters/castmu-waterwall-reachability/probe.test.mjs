import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_LICH,NON_PM} from '../../../../js/monsters.js';
import {WATER,ROOM} from '../../../../js/const.js';
import {set_apparxy} from '../../../../js/monmove.js';
import {castmu} from '../../../../js/mcastu.js';
import {AT_MAGC} from '../../../../js/monsters.js';
import {cansee,couldsee,recalc_block_point,vision_recalc} from '../../../../js/vision.js';
import {passes_walls} from '../../../../js/mondata.js';

test('native blinded lich rejects a water-wall guess before casting; floor control accepts it',async()=>{
 for(const terrain of [WATER,ROOM]){
  await runSegment({seed:7710044,datetime:'20261028120000',nethackrc:'OPTIONS=name:CastWater,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',moves:''});
  for(const column of game.level.monsters)column.fill(null);game.level.monlist=null;
  const x=game.u.ux,y=game.u.uy;
  const mon=newMonster({data:game.mons[PM_LICH],m_id:6001,mx:x+1,my:y,mux:x-1,muy:y,m_lev:11,cham:NON_PM,mhp:44,mhpmax:44,mcanmove:1,mcansee:0,mblinded:5});
  place_monster(mon,mon.mx,mon.my,game);game.level.monlist=mon;
  assert.equal(passes_walls(mon.data),false);
  game.level.at(x,y+1).typ=terrain;game.level.at(x+1,y+1).typ=ROOM;
  recalc_block_point(x,y+1,game);recalc_block_point(x+1,y+1,game);vision_recalc(0,{state:game});
  assert.equal(couldsee(x,y+1,game),true);assert.equal(couldsee(x+1,y+1,game),true);
  const rolls=[1,1,2,2,2],bounds=[];
  set_apparxy(mon,{state:game,random:{rn2:n=>{bounds.push(n);assert.ok(rolls.length);return rolls.shift();}}});
  assert.deepEqual([mon.mux,mon.muy],terrain===WATER?[x+1,y+1]:[x,y+1]);
  assert.deepEqual(bounds,terrain===WATER?[3,3,3,3,3]:[3,3,3]);
  const lines=[],spellBounds=[];
  await castmu(mon,mon.data.mattk.find(a=>a.aatyp===AT_MAGC),true,false,{state:game,random:{rn2:n=>{spellBounds.push(n);return 0;}},message:async s=>lines.push(s),monsterName:()=> 'The lich',unsupported:s=>assert.fail(s)});
  assert.deepEqual(lines,['The lich casts a spell at thin air!']);assert.deepEqual(spellBounds,[11]);
  console.log(JSON.stringify({terrain,hero:[x,y],selected:[mon.mux,mon.muy],bounds,spellBounds,lines,scope:'ordinary selector route only; source wording discrepancy remains unresolved'}));
 }
});
