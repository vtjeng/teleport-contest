import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_LICH,PM_XORN,NON_PM} from '../../../../js/monsters.js';
import {WATER,ROOM,POLY_TRAP} from '../../../../js/const.js';
import {set_apparxy} from '../../../../js/monmove.js';
import {recalc_block_point,vision_recalc} from '../../../../js/vision.js';
import {passes_walls} from '../../../../js/mondata.js';


import {maketrap} from '../../../../js/trap.js';
import {runDirectMonsterAction} from '../../../../js/unported_monster_actions.js';
test('full action preserves WATER target through polymorph but ends before attack; next floor-target turn casts',async()=>{
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
 const status=await runDirectMonsterAction(mon,{...env,random:{...random,rn2:n=>{draws.push(['rn2',n]);return n===2 || (n===10 && mon.data===game.mons[PM_LICH])?0:n-1;}}});
 console.log(JSON.stringify({hero:[x,y],monster:[mon.mx,mon.my],target:[mon.mux,mon.muy],status,actionDraws:draws,lines}));
 assert.equal(mon.data,game.mons[PM_LICH]);
 assert.deepEqual(lines,['The xorn turns into a lich!']);
 assert.equal(mon.mspec_used??0,0);
 assert.doesNotMatch(game._ttyToplines??'',/casts a spell/);
 assert.deepEqual([mon.mx,mon.my,mon.mux,mon.muy],[x+2,y,x+1,y+1]);
 // Control: change only guessed-square terrain to ROOM for the next native
 // lich turn. Ordinary set_apparxy now admits it, and the stationary caster
 // reaches mattacku/castmu through the same production action adapter.
 game.level.at(x+1,y+1).typ=ROOM;recalc_block_point(x+1,y+1,game);vision_recalc(0,{state:game});
 lines.length=0;draws.length=0;
 for(let i=0;i<20;i++)game.nhDisplay.terminal.pushKey(32);
 await runDirectMonsterAction(mon,{...env,random:{...random,rn2:n=>{draws.push(['rn2',n]);return n===10?0:n-1;}}});
 console.log(JSON.stringify({control:'next stationary lich turn with ROOM target',monster:[mon.mx,mon.my],target:[mon.mux,mon.muy],draws,lines,topline:game._ttyToplines}));
 assert.match(game._ttyToplines,/casts a spell at thin air!/);
});
