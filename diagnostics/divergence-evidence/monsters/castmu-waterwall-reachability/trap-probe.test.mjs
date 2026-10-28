// This intentionally splices postmov and mattacku. It is NOT a reachable full-turn witness.
import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster,remove_monster} from '../../../../js/monst.js';
import {PM_LICH,PM_XORN,NON_PM} from '../../../../js/monsters.js';
import {WATER,ROOM,MMOVE_MOVED,POLY_TRAP} from '../../../../js/const.js';
import {set_apparxy,postmov} from '../../../../js/monmove.js';
import {castmu} from '../../../../js/mcastu.js';
import {recalc_block_point,vision_recalc} from '../../../../js/vision.js';
import {passes_walls} from '../../../../js/mondata.js';


import {maketrap} from '../../../../js/trap.js';
import {mattacku} from '../../../../js/mhitu.js';
test('diagnostic only: manually invoking attack after postmov bypasses full-action guard',async()=>{
 await runSegment({seed:7710044,datetime:'20261028120000',nethackrc:'OPTIONS=name:CastWater,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',moves:''});
 for(const column of game.level.monsters)column.fill(null);game.level.monlist=null;
 const x=game.u.ux,y=game.u.uy;
 for(let a=x;a<=x+4;a++)for(let b=y-1;b<=y+2;b++){game.level.at(a,b).typ=ROOM;game.level.objects[a][b]=null;recalc_block_point(a,b,game);}
 game.level.at(x+1,y+1).typ=WATER;recalc_block_point(x+1,y+1,game);vision_recalc(0,{state:game});
 const mon=newMonster({data:game.mons[PM_XORN],m_id:6001,mx:x+3,my:y,mux:x-1,muy:y,m_lev:8,cham:NON_PM,mhp:32,mhpmax:32,mcanmove:1,mcansee:0,mblinded:5});
 place_monster(mon,mon.mx,mon.my,game);game.level.monlist=mon;
 assert.equal(passes_walls(mon.data),true);
 const rolls=[1,2,2];
 set_apparxy(mon,{state:game,random:{rn2:n=>{assert.ok(rolls.length);return rolls.shift();}}});
 assert.deepEqual([mon.mux,mon.muy],[x+1,y+1]);
 const lines=[],draws=[];
 const random={rn2:n=>{draws.push(['rn2',n]);return n-1;},rnd:n=>{draws.push(['rnd',n]);return 1;},rn1:(n,b)=>b,rne:()=>1,rnl:n=>n-1,d:(n,k)=>{draws.push(['d',n,k]);return n;}};
 game.wizard=true;game.iflags.mon_polycontrol=true;
 const env={state:game,random,message:async s=>lines.push(s),getlin:async()=> 'lich',redraw:()=>{},redrawSquare:()=>{},unsupported:s=>assert.fail(s)};
 assert.ok(maketrap(x+2,y,POLY_TRAP,env));
 const old=[mon.mx,mon.my];remove_monster(...old,game);place_monster(mon,x+2,y,game);
 const status=await postmov(mon,...old,MMOVE_MOVED,1,false,false,false,env);
 assert.equal(mon.data,game.mons[PM_LICH]);
 assert.deepEqual([mon.mux,mon.muy],[x+1,y+1]);
 const trapDraws=draws.splice(0);
 await mattacku(mon,{...env,castMonsterSpell:(m,a,t,f,e)=>castmu(m,a,t,f,{...e,monsterName:()=> 'The lich'}),random:{...random,rn2:n=>{draws.push(['rn2',n]);return 0;}}});
 console.log(JSON.stringify({hero:[x,y],monster:[mon.mx,mon.my],target:[mon.mux,mon.muy],status,trapDraws,attackDraws:draws,lines}));
 assert.ok(lines.some(s=>s.includes('casts a spell at thin air!')));
});
