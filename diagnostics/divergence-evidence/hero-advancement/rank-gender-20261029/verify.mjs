import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const here=dirname(fileURLToPath(import.meta.url));
for(const role of ['control','target']){
 const read=f=>JSON.parse(gunzipSync(readFileSync(resolve(here,role,f+'.gz'))));const c=read('recorded.session.json'),js=read('js-output.json');assert.equal(compareSessionOutputs(c,js).passed,true);
 const screens=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(x=>x.ch).join('').trim()));assert.ok(screens.some(r=>r.includes('Logged events:')));const log=screens.flat();
 const events=log.filter(r=>/^1:.*(?:attained|lost experience|regained)/.test(r)).map(r=>r.replace(/^1: /,''));
 const expected=['attained the rank of Conjurer (level 3)','attained the rank of Thaumaturge (level 6)','attained the rank of Magician (level 10)',`attained the rank of ${role==='target'?'Enchantress':'Enchanter'} (level 14)`,'lost experience level 14','regained experience level 14',`attained the rank of ${role==='target'?'Sorceress':'Sorcerer'} (level 18)`,'lost experience level 18','regained experience level 18'];assert.deepEqual(events,expected);console.log(JSON.stringify({role,events}));
}
