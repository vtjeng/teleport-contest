import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runSegment } from '../../../../js/jsmain.js';
for (const [name,file] of [['whole ration control','control-c.json'],['partly eaten ration candidate','capture-c.json']]) {
  test(name,async()=>{
    const s=JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8')).segments[0];
    let boundary=null;
    const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary={name:e.name,message:e.message}});
    assert.equal(boundary,null,JSON.stringify(boundary));
    assert.equal(g.getScreens().length,s.steps.length);
  });
}
