import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
import {mksobj} from '../../../../js/obj.js';
import {SPE_NOVEL,SPE_BLANK_PAPER} from '../../../../js/objects.js';
import {SIR_TERRY_NOVELS} from '../../../../js/do_name.js';
import {OBJ_FREE,PL_PSIZ} from '../../../../js/const.js';
const root=new URL('../../../../',import.meta.url);
test('all 41 novel names bypass no observable oname effect on fresh free books',async()=>{
 const source=readFileSync(new URL('nethack-c/upstream/src/do_name.c',root),'utf8');
 const table=source.match(/sir_Terry_novels\[\] = \{([\s\S]*?)\n\};/)[1];
 const titles=[...table.matchAll(/"([^"\n]*)"/g)].map(m=>m[1]);
 assert.deepEqual(titles,SIR_TERRY_NOVELS);assert.equal(titles.length,41);
 assert.ok(titles.every(t=>Buffer.byteLength(t)+1<=PL_PSIZ));
 assert.doesNotMatch(readFileSync(new URL('nethack-c/upstream/include/artilist.h',root),'utf8'),/\bSPE_NOVEL\b/);
 await runSegment({seed:19870627,datetime:'20070627121000',nethackrc:'OPTIONS=name:NovelProbe,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',moves:'  '});
 assert.ok(game.artilist.every(a=>a.otyp!==SPE_NOVEL));
 for(let i=0;i<titles.length;i++) {
   const draws=[];const random={rn2:n=>{draws.push(['rn2',n]);return i;},rnd:n=>{draws.push(['rnd',n]);return 1;},rn1:()=>{throw Error('unexpected rn1');},rne:()=>{throw Error('unexpected rne');}};
   const obj=mksobj(SPE_NOVEL,false,false,{state:game,random});
   assert.equal(obj.where,OBJ_FREE);assert.equal(Boolean(obj.oartifact),false);
   assert.equal(obj.novelidx,i);assert.equal(obj.oextra.oname,titles[i]);
   assert.deepEqual(draws,[['rnd',2],['rn2',41]]);
 }
 const control=mksobj(SPE_BLANK_PAPER,false,false,{state:game});
 assert.equal(control.oextra?.oname??null,null);
});
test('public novel wish reaches a carried Thud! with matching capture count',async()=>{
 const s=JSON.parse(readFileSync(new URL('capture-c.json',import.meta.url),'utf8')).segments[0];
 let boundary=null;const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});
 assert.equal(boundary,null);assert.equal(g.getScreens().length,s.steps.length);
 let novel;for(let obj=game.invent;obj;obj=obj.nobj)if(obj.otyp===SPE_NOVEL)novel=obj;
 assert.ok(novel);assert.equal(novel.novelidx,33);assert.equal(novel.oextra.oname,'Thud!');
 assert.ok(g.getScreens().at(-1).includes('a paperback book named Thud!'));
 assert.ok(s.steps.at(-1).screen.includes('a paperback book named Thud!'));
});
