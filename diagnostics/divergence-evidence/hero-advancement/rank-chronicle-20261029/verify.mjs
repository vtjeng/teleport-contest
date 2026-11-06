import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const here=dirname(fileURLToPath(import.meta.url));
for(const role of ['control','target']){
 const read=f=>JSON.parse(gunzipSync(readFileSync(resolve(here,role,f+'.gz'))));
 const c=read('recorded.session.json'),js=read('js-output.json');assert.equal(compareSessionOutputs(c,js).passed,true);
 const screens=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(x=>x.ch).join('').trimEnd()));
 const log=screens.find(r=>r.includes('Logged events:'));assert.ok(log);
 const events=log.filter(r=>/^\s*1:/.test(r)).map(r=>r.replace(/^\s*1: /,''));
 const expected=['wizard the neutral male human Wizard entered the dungeon','gained experience level 2','attained the rank of Conjurer (level 3)'];
 if(role==='target')expected.push('lost experience level 3','regained experience level 3');
 assert.deepEqual(events,expected);console.log(JSON.stringify({role,events}));
}
