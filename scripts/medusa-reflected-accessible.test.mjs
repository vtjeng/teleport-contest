import assert from 'node:assert/strict';
import test from 'node:test';
// C gazemu uses pline_mon at this site; source-derived expectation, no new C execution.
import {mksobj} from '../js/obj.js';
import {addinv,sobj_at} from '../js/invent.js';
import {SHIELD_OF_REFLECTION,STATUE} from '../js/objects.js';
import {setworn} from '../js/worn.js';
import {setwornEnv} from '../js/do_wear.js';
import {W_ARMS,REFLECTING} from '../js/const.js';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
import {newMonster,place_monster,m_at} from '../js/monst.js';
import {PM_MEDUSA,NON_PM,AT_GAZE,AD_STON} from '../js/monsters.js';
import {gazemu} from '../js/mhitu.js';
import {canseemon} from '../js/display.js';
import {accessible} from '../js/monmove.js';
import {cansee} from '../js/vision.js';
import {STUNNED,TIMEOUT} from '../js/const.js';
for(const enabled of [true,false]) test(`native reflected Medusa, accessiblemsg=${enabled}`,async()=>{
 await runSegment({seed:7710048,datetime:'20261028120000',nethackrc:`OPTIONS=name:Gaze,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,${enabled?'':'!'}accessiblemsg\n`,moves:''});
 assert.equal(Boolean(game.a11y.accessiblemsg),enabled);const x=57,y=2;
 assert.ok(accessible(x,y,game)&&cansee(x,y,game));assert.equal(m_at(x,y,game),null);
 const data=game.mons[PM_MEDUSA];const m=newMonster({data,mnum:PM_MEDUSA,cham:NON_PM,m_id:903,m_lev:data.mlevel,mcanmove:1,mcansee:1,mhp:100,mhpmax:100});place_monster(m,x,y,game);m.nmon=game.level.monlist;game.level.monlist=m;assert.ok(canseemon(m,game));
 const shield=addinv(mksobj(SHIELD_OF_REFLECTION,false,false,{state:game}),{state:game});await setworn(shield,W_ARMS,setwornEnv(game));assert.ok(game.u.uprops[REFLECTING].extrinsic);
 const a=data.mattk.find(a=>a.aatyp===AT_GAZE&&a.adtyp===AD_STON);assert.ok(a);const lines=[],draws=[];const random={};for(const key of ['rn2','rnd','d','rn1','rne','rnz','rnl'])random[key]=(...args)=>{draws.push([key,...args]);return key==='d'?args[0]:(key==='rn2'?(args[0]>1?1:0):key==='rn1'?args[1]:1);};
 await gazemu(m,a,{state:game,random,message:async s=>lines.push(s),stopOccupation:async()=>{},unsupported:s=>assert.fail(s)});
 const stun=game.u.uprops[STUNNED].intrinsic&TIMEOUT;assert.equal(stun,0);
 const expected=`${enabled?'(5west): ':''}Medusa is turned to stone!`;
 assert.ok(lines.includes(expected));
 assert.equal(m.mhp,0);assert.equal(m_at(57,2,game),null);assert.equal(game.u.ulevel,2);assert.equal(sobj_at(STATUE,57,2,game)?.corpsenm,PM_MEDUSA);assert.deepEqual(lines,["Medusa's gaze is reflected by your shield.",expected,'You kill Medusa!','Welcome to experience level 2.']);assert.equal(draws.length,15);

});
