import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const here=dirname(fileURLToPath(import.meta.url));
for(const name of ['below','equal','above','skill-spent-control','skill-refund']){
 const read=file=>JSON.parse(gunzipSync(readFileSync(resolve(here,name,file+'.gz'))));
 const c=read('recorded.session.json'),js=read('js-output.json');
 assert.equal(compareSessionOutputs(c,js).passed,true,name);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(x=>x.ch).join('').trimEnd()));
 const all=rows.map(r=>r.join('\n')).join('\n');
 if(['below','equal','above'].includes(name)){
  const expected={below:'Xp:1/19',equal:'Xp:2/20',above:'Xp:2/21'}[name];
  assert.ok(rows.at(-1).some(r=>r.endsWith(expected)),name);
  assert.equal(all.includes('Welcome to experience level 2.'),name!=='below');
 }
 if(name==='skill-spent-control'){
  assert.ok(rows.at(-1).some(r=>r.includes('(0 slots available)')));
  assert.ok(rows.at(-1).some(r=>/long sword\s+Expert/u.test(r)));
 }
 if(name==='skill-refund'){
  const slots=rows.flatMap((r,step)=>r.filter(x=>/slots? available/u.test(x)).map(x=>({step,line:x.trim()})));
  assert.deepEqual(slots.map(x=>Number(x.line.match(/\((\d+) slot/u)[1])),[0,1,2]);
  assert.ok(all.includes('You feel quick!'));
  assert.ok(all.includes('You feel slow!'));
  assert.ok(rows.at(-1).some(r=>/long sword\s+Skilled/u.test(r)));
  console.log(JSON.stringify({name,slots}));
 }
 console.log(`${name}: parity and intended transition assertions pass`);
}
