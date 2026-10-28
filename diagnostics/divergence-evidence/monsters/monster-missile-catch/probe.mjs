import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_OGRE,NON_PM} from '../../../../js/monsters.js';
import {ROOM,A_DEX,OBJ_INVENT,OBJ_FLOOR} from '../../../../js/const.js';
import {recalc_block_point,vision_recalc} from '../../../../js/vision.js';
import {ORCISH_DAGGER} from '../../../../js/objects.js';
import {mksobj} from '../../../../js/obj.js';
import {mpickobj} from '../../../../js/steal.js';
import {acurr} from '../../../../js/attrib.js';
import {runDirectMonsterAction} from '../../../../js/unported_monster_actions.js';
for(const catchRoll of [0,1])test(`ordinary ogre orcish dagger throw catch roll ${catchRoll}`,async()=>{
 await runSegment({seed:7710044,datetime:'20261028120000',nethackrc:'OPTIONS=name:CatchProbe,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',moves:''});
 for(const column of game.level.monsters)column.fill(null);game.level.monlist=null;
 const x=game.u.ux,y=game.u.uy;
 for(let a=x;a<=x+5;a++)for(let b=y-1;b<=y+1;b++){game.level.at(a,b).typ=ROOM;game.level.objects[a][b]=null;recalc_block_point(a,b,game);}
 vision_recalc(0,{state:game});
 const mon=newMonster({data:game.mons[PM_OGRE],m_id:6001,mx:x+4,my:y,mux:x,muy:y,m_lev:game.mons[PM_OGRE].mlevel,cham:NON_PM,mhp:20,mhpmax:20,mcanmove:1,mcansee:1});
 place_monster(mon,mon.mx,mon.my,game);game.level.monlist=mon;
 const lines=[],draws=[];
 const catchBound=100-acurr(game,A_DEX);
 const random={rn2:n=>{draws.push(['rn2',n]);return n===catchBound?catchRoll:n-1;},rnd:n=>{draws.push(['rnd',n]);return 1;},rn1:(n,b)=>b,rne:()=>1,rnl:n=>n-1,d:(n,k)=>{draws.push(['d',n,k]);return n;}};
 const env={state:game,random,message:async s=>lines.push(s),redraw:()=>{},redrawSquare:()=>{},unsupported:s=>{throw new Error(s);}};
 const dagger=mksobj(ORCISH_DAGGER,false,false,{state:game});mpickobj(mon,dagger,{state:game});
 for(let i=0;i<30;i++)game.nhDisplay.terminal.pushKey(32);
 assert.equal(mon.minvent,dagger);assert.equal(mon.mw,null);
 draws.length=0;lines.length=0;game.context.mon_moving=true;
 const hpBefore=game.u.uhp;
 let status,error;
 try{status=await runDirectMonsterAction(mon,env);}catch(e){error=e.message;}
 console.log(JSON.stringify({catchRoll,catchBound,hpBefore,hpAfter:game.u.uhp,hero:[x,y],monster:[mon.mx,mon.my],status,error,draws,lines,topline:game._ttyToplines,daggerWhere:dagger.where}));
 assert.ok(draws.some(d=>d[0]==='rn2'&&d[1]===catchBound),'reached real catch decision');
 if(catchRoll===0){
   if(process.env.EXPECT_CURRENT_GAP==='1')assert.match(error,/successful monster missile catch/);
   else {assert.equal(error,undefined);assert.equal(dagger.where,OBJ_INVENT);}
   assert.equal(game.u.uhp,hpBefore);
 }else{
   assert.equal(error,undefined);assert.equal(status,0);assert.equal(game.u.uhp,hpBefore-1);assert.equal(dagger.where,OBJ_FLOOR);
 }
});
