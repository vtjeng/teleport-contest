import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
import {canwearobj} from '../../../../js/do_wear.js';
import {ARMOR_CLASS} from '../../../../js/objects.js';
import {is_helmet,is_shield,is_gloves,is_boots,is_shirt,is_cloak,is_suit} from '../../../../js/obj.js';
const root=new URL('../../../../',import.meta.url);
test('both production callers guard the complete armor category partition', async()=>{
  const c=readFileSync(new URL('nethack-c/upstream/src/do_wear.c',root),'utf8');
  const js=readFileSync(new URL('js/do_wear.js',root),'utf8');
  assert.match(c,/armor = \(obj->oclass == ARMOR_CLASS\);[\s\S]*?if \(armor\) \{\s*if \(!canwearobj\(obj, &mask, TRUE\)\)/);
  assert.match(c,/obj->oclass == ARMOR_CLASS && !removing\s*&& !canwearobj\(obj, &dummymask, FALSE\)/);
  assert.match(js,/const armor = obj.oclass === ARMOR_CLASS;[\s\S]*?if \(armor\) \{[\s\S]*?await canwearobj\(obj, true, state\)/);
  assert.match(js,/obj.oclass === ARMOR_CLASS && !removing\s*&& !\(await canwearobj\(obj, false, state\)\)/);
  await runSegment({seed:19870624,datetime:'20070624121000',nethackrc:'OPTIONS=name:ArmorProbe,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',moves:'  '});
  const predicates=[is_helmet,is_shield,is_gloves,is_boots,is_shirt,is_cloak,is_suit];
  const counts=Array(7).fill(0);
  for(let otyp=0;otyp<game.objects.length;otyp++) {
    if(game.objects[otyp].oc_class!==ARMOR_CLASS) continue;
    const obj={otyp,oclass:ARMOR_CLASS,quan:1,owornmask:0};
    const matches=predicates.map(f=>f(obj,game));
    assert.equal(matches.filter(Boolean).length,1,`otype ${otyp}`);
    counts[matches.indexOf(true)]++;
    const result=await canwearobj(obj,false,game);
    assert.equal(typeof result.ok,'boolean');
  }
  assert.ok(counts.every(x=>x>0));
  console.log(JSON.stringify({categoryCounts:counts,total:counts.reduce((a,b)=>a+b,0)}));
});
