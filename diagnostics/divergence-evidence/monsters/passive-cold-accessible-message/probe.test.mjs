import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_KITTEN,PM_BLUE_JELLY,NON_PM} from '../../../../js/monsters.js';
import {GPCOORDS_MAP} from '../../../../js/const.js';
import {mattackm} from '../../../../js/mhitm.js';
import {cansee} from '../../../../js/vision.js';
import {accessible} from '../../../../js/monmove.js';

test('native kitten versus blue jelly passive cold loses accessible coordinate prefix',async()=>{
 for(const enabled of [false,true]){
  await runSegment({seed:7710048,datetime:'20260214031500',nethackrc:'OPTIONS=name:Passive,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none\n',moves:''});
  for(const column of game.level.monsters)column.fill(null);game.level.monlist=null;
  let pair;
  for(let x=game.u.ux-5;x<=game.u.ux+5&&!pair;x++)for(let y=game.u.uy-3;y<=game.u.uy+3&&!pair;y++)if(accessible(x,y,game)&&accessible(x+1,y,game)&&cansee(x,y,game)&&cansee(x+1,y,game)&&!(y===game.u.uy&&(x===game.u.ux||x+1===game.u.ux)))pair=[x,y];
  assert.ok(pair);
  const [x,y]=pair;
  const spawn=(pm,a,hp)=>{const mon=newMonster({data:game.mons[pm],m_id:6000+pm,mx:a,my:y,m_lev:game.mons[pm].mlevel,cham:NON_PM,mhp:hp,mhpmax:hp,mcanmove:1,mcansee:1});place_monster(mon,a,y,game);mon.nmon=game.level.monlist;game.level.monlist=mon;return mon;};
  const attacker=spawn(PM_KITTEN,x,16),defender=spawn(PM_BLUE_JELLY,x+1,32);
  game.a11y.accessiblemsg=enabled;game.iflags.getpos_coords=GPCOORDS_MAP;
  const lines=[],draws=[];
  const random={rn2:n=>{draws.push(['rn2',n]);return n>1?1:0;},rnd:n=>{draws.push(['rnd',n]);return n;},d:(n,k)=>{draws.push(['d',n,k]);return n;},rn1:(n,b)=>b,rnl:()=>0,rne:()=>1,rnz:n=>n};
  game.gb.bhitpos={x:defender.mx,y:defender.my};game.gn.notonhead=false;
  await mattackm(attacker,defender,{state:game,random,message:async s=>lines.push(s),unsupported:s=>assert.fail(s)});
  const expected=`${enabled?`<${x},${y}>: `:''}The kitten is suddenly very cold!`;
  const observed=lines.find(s=>s.includes('suddenly very cold'));
  console.log(JSON.stringify({enabled,attacker:[x,y],expected,observed,hp:attacker.mhp,draws,lines}));
  assert.equal(attacker.mhp,11);

  if(enabled&&process.env.EXPECT_CURRENT_GAP==='1')assert.notEqual(observed,expected);
  else assert.equal(observed,expected);
 }
});
