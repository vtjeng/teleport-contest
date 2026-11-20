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
 const views=[];let active;
 for(const s of c.segments[0].steps){if(s.key==='\x18'){active=[];views.push(active);}else if(s.key==='#')active=null;if(active)active.push(...decodeScreen(s.screen).map(r=>r.map(x=>x.ch).join('')));}
 const sleep=views.map(v=>v.join(' ').includes('You are sleep resistant innately.'));
 const stealth=views.map(v=>v.join(' ').includes('You are stealthy because of your experience.'));
 const xp=views.map(v=>v.find(r=>/Xp:/.test(r)).match(/Xp:(\d+\/\d+)/)[1]);
 assert.deepEqual(sleep,role==='control'?[false]:[false,true,true,false,true]);
 assert.deepEqual(stealth,role==='control'?[false]:[false,false,true,false,true]);
 assert.deepEqual(xp,role==='control'?['3/40']:['3/40','4/80','7/640','3/79','7/640']);
 console.log(JSON.stringify({role,sleep,experienceStealth:stealth,xp}));
}
