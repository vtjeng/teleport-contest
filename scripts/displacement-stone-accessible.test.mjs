import assert from 'node:assert/strict';
import test from 'node:test';
import {sobj_at} from '../js/invent.js';
import {STATUE} from '../js/objects.js';
import {M_ATTK_AGR_DIED} from '../js/const.js';
// C mdisplacem uses pline_mon only for petrification; source-derived expectation, no new C execution.
import {runSegment} from '../js/jsmain.js';import {game} from '../js/gstate.js';import {newMonster,place_monster,m_at} from '../js/monst.js';import {PM_DISPLACER_BEAST,PM_COCKATRICE,NON_PM} from '../js/monsters.js';import {mdisplacem} from '../js/mhitm.js';import {mm_displacement} from '../js/mon.js';import {accessible} from '../js/monmove.js';import {cansee} from '../js/vision.js';
for(const enabled of [true,false]) test(`native displacement petrification location, accessiblemsg=${enabled}`,async()=>{
 await runSegment({seed:7710048,datetime:'20261028120000',nethackrc:`OPTIONS=name:Stone,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,${enabled?'':'!'}accessiblemsg\n`,moves:''});
 assert.equal(Boolean(game.a11y.accessiblemsg),enabled);const y=2;function mon(pm,x,id){assert.ok(accessible(x,y,game)&&cansee(x,y,game));assert.equal(m_at(x,y,game),null);const data=game.mons[pm];const m=newMonster({data,mnum:pm,cham:NON_PM,m_id:id,m_lev:data.mlevel,mcanmove:1,mcansee:1,mhp:100,mhpmax:100});place_monster(m,x,y,game);m.nmon=game.level.monlist;game.level.monlist=m;return m;}
 const a=mon(PM_DISPLACER_BEAST,57,910),b=mon(PM_COCKATRICE,58,911);assert.ok(mm_displacement(a,b,game));const lines=[],draws=[];
 const result=await mdisplacem(a,b,false,{state:game,random:{rn2:n=>{draws.push(['rn2',n]);return n>1?1:0;},rnd:n=>{draws.push(['rnd',n]);return 1;},rn1:(n,b)=>{draws.push(['rn1',n,b]);return b;},rne:n=>{draws.push(['rne',n]);return 1;}},unsupported:s=>assert.fail(s),message:async s=>lines.push(s),redraw:()=>{},flushScreen:async()=>{}});
 assert.equal(result,M_ATTK_AGR_DIED);assert.equal(a.mhp,0);
 assert.equal(m_at(57,2,game),null);assert.equal(m_at(58,2,game),b);
 const statue=sobj_at(STATUE,57,2,game);assert.ok(statue);assert.equal(statue.corpsenm,PM_DISPLACER_BEAST);
 assert.deepEqual(lines,['The displacer beast tries to move the cockatrice out of its way.',`${enabled?'(5west): ':''}The displacer beast turns to stone!`]);
 assert.deepEqual(draws,[['rn2',7],['rnd',2],['rn2',3],['rn2',4],['rn2',5],['rn2',7],['rn2',8],['rn2',11],['rn2',15],['rn2',16],['rn2',21],['rn2',2]]);
});
