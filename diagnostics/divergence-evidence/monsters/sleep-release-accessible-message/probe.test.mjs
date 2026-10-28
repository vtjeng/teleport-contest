import assert from 'node:assert/strict';
import test from 'node:test';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_LICHEN,NON_PM} from '../../../../js/monsters.js';
import {GPCOORDS_MAP} from '../../../../js/const.js';
import {mhitm_ad_stck} from '../../../../js/uhitm.js';
import {put_monsters_to_sleep} from '../../../../js/music.js';
import {accessible} from '../../../../js/monmove.js';

for(const [enabled,held] of [[true,true],[false,true],[true,false]])test(`sleep release accessible=${enabled} held=${held}`,async()=>{
 await runSegment({seed:7710044,datetime:'20261028120000',nethackrc:'OPTIONS=name:Grip,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none\n',moves:''});
 for(const c of game.level.monsters)c.fill(null);game.level.monlist=null;
 const x=game.u.ux+1,y=game.u.uy;assert.ok(accessible(x,y,game));
 const mon=newMonster({data:game.mons[PM_LICHEN],m_id:6001,mx:x,my:y,m_lev:0,cham:NON_PM,mhp:4,mhpmax:4,mcanmove:1,mcansee:1});
 place_monster(mon,x,y,game);game.level.monlist=mon;
 game.a11y.accessiblemsg=enabled;game.iflags.getpos_coords=GPCOORDS_MAP;
 const lines=[],draws=[];
 const random={rn2:n=>{draws.push(['rn2',n]);return n-1;},rnd:n=>n,d:(n,k)=>{draws.push(['d',n,k]);return n;}};
 const env={state:game,random,message:async s=>lines.push(s)};
 if(held){await mhitm_ad_stck(mon,mon.data.mattk[0],game.youmonst,{damage:0},game,env);assert.equal(game.u.ustuck,mon);}
 lines.length=0;draws.length=0;
 await put_monsters_to_sleep(5,game,env);
 assert.equal(mon.mcanmove,false);assert.equal(mon.msleeping,true);assert.equal(game.u.ustuck,null);
 const expected=held?[`${enabled?`<${x},${y}>: `:''}The lichen's grip relaxes.`]:[];
 console.log(JSON.stringify({enabled,held,position:[x,y],expected,observed:lines,draws,frozen:mon.mfrozen}));
 if(enabled&&held&&process.env.EXPECT_CURRENT_GAP==='1')assert.deepEqual(lines,["The lichen's grip relaxes."]);
 else assert.deepEqual(lines,expected);
});
