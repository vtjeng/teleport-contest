import assert from 'node:assert/strict';
import test from 'node:test';
import {readdirSync,readFileSync} from 'node:fs';
import * as legacy from '../../../../js/const.js';
import * as live from '../../../../js/explode.js';
const root=new URL('../../../../',import.meta.url);
const expected={MAY_HITMON:2,MAY_HITYOU:4,MAY_HIT:6,MAY_DESTROY:8,MAY_FRACTURE:16};
test('mismatched exports have no production identifier readers; live masks match C',()=>{
  const readers=[];
  for(const file of readdirSync(new URL('js/',root)).filter(f=>f.endsWith('.js')&&f!=='const.js')) {
    const source=readFileSync(new URL('js/'+file,root),'utf8');
    for(const name of Object.keys(expected)) if(new RegExp('\\b'+name+'\\b').test(source)) readers.push(file+':'+name);
  }
  assert.deepEqual(readers,[]);
  for(const [name,cValue] of Object.entries(expected)) {
    assert.notEqual(legacy[name],cValue,'retain real numeric mismatch');
    assert.equal(live['SCATTER_'+name],cValue,'runtime alias');
  }
  const names=['VIS_EFFECTS','MAY_HITMON','MAY_HITYOU','MAY_DESTROY','MAY_FRACTURE'];
  for(let mask=0;mask<32;mask++) {
    const actual=names.reduce((value,name,i)=>value|((mask&(1<<i))?live['SCATTER_'+name]:0),0);
    assert.equal(actual,mask,'all combinations preserve source bit positions');
  }
  const display=readFileSync(new URL('js/display.js',root),'utf8');
  assert.doesNotMatch(display,/statusConstants\s*\[|\.\.\.statusConstants|Object\.\w+\(statusConstants/);
});
