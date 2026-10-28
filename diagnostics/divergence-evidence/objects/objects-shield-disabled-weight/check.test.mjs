import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
import {shield_simple_name} from '../../../../js/objnam.js';import {SMALL_SHIELD,LARGE_SHIELD,SHIELD_OF_REFLECTION} from '../../../../js/objects.js';
test('shield weight call is preprocessor-disabled; reflection discovery remains live',()=>{
 const c=readFileSync(new URL('../../../../nethack-c/upstream/src/objnam.c',import.meta.url),'utf8');const body=c.match(/shield_simple_name\(struct obj \*shield\)\n\{[\s\S]*?\n\}/)[0];assert.match(body,/weight\(shield\)/);
 const pre=execFileSync(process.env.CC||'clang',['-E','-P','-x','c','-'],{input:body,encoding:'utf8'});assert.doesNotMatch(pre,/weight\(shield\)|heavy shield|light shield/);assert.match(pre,/shield->dknown \? "silver shield" : "smooth shield"/);
 assert.equal(shield_simple_name(null),'shield');for(const otyp of [SMALL_SHIELD,LARGE_SHIELD])for(const dknown of [0,1])assert.equal(shield_simple_name({otyp,dknown}),'shield');
 assert.equal(shield_simple_name({otyp:SHIELD_OF_REFLECTION,dknown:0}),'smooth shield');assert.equal(shield_simple_name({otyp:SHIELD_OF_REFLECTION,dknown:1}),'silver shield');
});
