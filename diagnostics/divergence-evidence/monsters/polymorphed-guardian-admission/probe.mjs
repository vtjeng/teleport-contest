import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {PM_ANGEL,PM_OGRE} from '../../../../js/monsters.js';
import {newcham} from '../../../../js/mon.js';
import {runSimpleMonsterAction} from '../../../../js/unported_monster_actions.js';
for(const polymorph of [false,true])test(`Astral guardian admission polymorph=${polymorph}`,async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../../../../recipes/monmove.c/guardian-angel-movement-cat.session.json',import.meta.url),'utf8'));
 await runSegment(recipe.segments[0]);
 let guardian;for(let m=game.level.monlist;m;m=m.nmon)if(m.mtame&&m.isminion&&m.data===game.mons[PM_ANGEL])guardian=m;
 assert.ok(guardian,'shipped public-input recipe produces a genuine guardian');
 assert.ok(guardian.mextra.emin);assert.ok(!guardian.mextra.edog);
 const env={state:game,message:async()=>{},redraw:()=>{},redrawSquare:()=>{}};
 for(let i=0;i<100;i++)game.nhDisplay.terminal.pushKey(32);
 if(polymorph)assert.equal(await newcham(guardian,game.mons[PM_OGRE],env),true);
 assert.equal(guardian.isminion,true);assert.equal(guardian.mtame,10);assert.ok(guardian.mextra.emin);assert.ok(!guardian.mextra.edog);
 let error,result;try{result=await runSimpleMonsterAction(guardian,env);}catch(e){error=e.message;}
 console.log(JSON.stringify({polymorph,species:guardian.data.pmnames[2],mtame:guardian.mtame,isminion:guardian.isminion,emin:!!guardian.mextra.emin,edog:!!guardian.mextra.edog,result,error}));
 if(polymorph&&process.env.EXPECT_CURRENT_GAP==='1')assert.match(error,/tame minion movement/);
 else assert.equal(error,undefined);
});
