import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
import {GameMap} from '../../../../js/game.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_VROCK,NON_PM} from '../../../../js/monsters.js';
import {ROOM} from '../../../../js/const.js';
import {monflee} from '../../../../js/monmove.js';
import {vision_reset,vision_recalc} from '../../../../js/vision.js';
for(const cooldown of [0,1]) test(`Vrock fleeing with cooldown ${cooldown}`,async()=>{
 await runSegment({seed:483283,datetime:'20261020120000',nethackrc:'OPTIONS=name:GasProbe,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',moves:''});
 game.level=new GameMap();for(let x=2;x<20;x++)for(let y=2;y<15;y++)Object.assign(game.level.at(x,y),{typ:ROOM,lit:true});
 game.u.ux=4;game.u.uy=4;game.context.mon_moving=true;
 const m=newMonster({data:game.mons[PM_VROCK],mnum:PM_VROCK,cham:NON_PM,m_id:483283,mhp:30,mhpmax:30,mcanmove:true,mcansee:true,mspec_used:cooldown});
 place_monster(m,12,10,game);game.level.monlist=m;vision_reset(game);vision_recalc(0);
 const draws=[];
 await monflee(m,5,true,false,{state:game,random:{rn2(n){draws.push(n);return 0;}}});
 assert.equal(m.mflee,true);assert.equal(m.mfleetim,5);
 if(cooldown){assert.deepEqual(draws,[]);assert.equal(game.level.regions.length,0);assert.equal(m.mspec_used,1);}
 else{assert.deepEqual(draws,[25,4,3,2,1,2,4,3,2,1,3]);assert.equal(m.mspec_used,75);assert.equal(game.level.regions.length,1);assert.equal(game.level.regions[0].arg,8);}
 console.log(JSON.stringify({cooldown,draws,resultCooldown:m.mspec_used,regions:game.level.regions.map(r=>({damage:r.arg,ttl:r.ttl,rectangles:r.rects?.length}))}));
});
