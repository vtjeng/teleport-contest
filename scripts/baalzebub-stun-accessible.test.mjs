import assert from 'node:assert/strict';
import test from 'node:test';
// C gazemu AD_STUN uses pline_mon; expectation is source-derived, not a new C execution.
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {newMonster,place_monster,m_at} from '../js/monst.js';
import {PM_BAALZEBUB,NON_PM,AT_GAZE,AD_STUN} from '../js/monsters.js';
import {gazemu} from '../js/mhitu.js';
import {canseemon} from '../js/display.js';
import {accessible} from '../js/monmove.js';
import {cansee} from '../js/vision.js';
import {STUNNED,TIMEOUT} from '../js/const.js';
for(const enabled of [true,false]) test(`native stunning gaze location, accessiblemsg=${enabled}`,async()=>{
 await runSegment({seed:7710048,datetime:'20261028120000',nethackrc:`OPTIONS=name:Gaze,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,${enabled?'':'!'}accessiblemsg\n`,moves:''});
 assert.equal(Boolean(game.a11y.accessiblemsg),enabled);const x=57,y=2;
 assert.ok(accessible(x,y,game)&&cansee(x,y,game));assert.equal(m_at(x,y,game),null);
 const data=game.mons[PM_BAALZEBUB];const m=newMonster({data,mnum:PM_BAALZEBUB,cham:NON_PM,m_id:903,m_lev:data.mlevel,mcanmove:1,mcansee:1,mhp:100,mhpmax:100});place_monster(m,x,y,game);m.nmon=game.level.monlist;game.level.monlist=m;assert.ok(canseemon(m,game));
 const a=data.mattk.find(a=>a.aatyp===AT_GAZE&&a.adtyp===AD_STUN);assert.ok(a);const lines=[],draws=[];const random={};for(const key of ['rn2','rnd','d','rn1'])random[key]=(...args)=>{draws.push([key,...args]);return key==='d'?args[0]:1;};
 await gazemu(m,a,{state:game,random,message:async s=>lines.push(s),stopOccupation:async()=>{},unsupported:s=>assert.fail(s)});
 const stun=game.u.uprops[STUNNED].intrinsic&TIMEOUT;assert.equal(stun,2);
 const expected=`${enabled?'(5west): ':''}Baalzebub stares piercingly at you!`;
 assert.deepEqual(draws,[['rn2',5],['d',2,6],['rn2',6]]);
 assert.deepEqual(lines,[expected,'You stagger...']);
});
