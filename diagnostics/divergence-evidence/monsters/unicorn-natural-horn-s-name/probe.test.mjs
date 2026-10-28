import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { christen_monst } from '../../../../js/do_name.js';
import { runSegment } from '../../../../js/jsmain.js';
import { game } from '../../../../js/gstate.js';
import { newMonster, place_monster } from '../../../../js/monst.js';
import { PM_WHITE_UNICORN } from '../../../../js/monsters.js';
import { NON_PM } from '../../../../js/const.js';
import { canseemon } from '../../../../js/display.js';
import { find_defensive, use_defensive } from '../../../../js/muse.js';
import { msghistory_snapshot } from '../../../../js/topl.js';
test('oracle format is the pinned C natural-horn format',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/muse.c',import.meta.url),'utf8');
 assert.ok(c.includes('pline_The("tip of %s\'s horn glows!", mon_nam(mtmp));'));
});
for(const name of [null,'Ares']) test(`natural horn message: ${name??'unnamed control'}`,async()=>{
 await runSegment({seed:92841,datetime:'20261020120000',nethackrc:'OPTIONS=name:Probe,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',moves:''});
 for(const col of game.level.monsters) col.fill(null);game.level.monlist=null;
 game.nhDisplay.onEmptyQueue=()=>32;
 const m=newMonster({data:game.mons[PM_WHITE_UNICORN],m_id:6902,mx:game.u.ux+1,my:game.u.uy,mux:game.u.ux,muy:game.u.uy,mhp:40,mhpmax:40,mcanmove:1,mcansee:1,mconf:1,cham:NON_PM});
 if(name)christen_monst(m,name,{state:game});
 place_monster(m,m.mx,m.my,game);game.level.monlist=m;
 assert.ok(canseemon(m,game));
 const choice=find_defensive(m,false,{state:game});assert.deepEqual(choice,{kind:'unicorn horn',object:null});
 assert.equal(await use_defensive(m,choice,game),2);assert.equal(m.mconf,0);
 const messages=msghistory_snapshot(false,game);console.log(JSON.stringify({name,choice,messages}));
 assert.ok(messages.join('\n').includes(name?(process.env.EXPECT_C?"The tip of Ares's horn glows!":"The tip of Ares' horn glows!"):"The tip of the white unicorn's horn glows!"));
});
