import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';import{decodeScreen}from'../../../../frozen/screen-decode.mjs';import{compareSessionOutputs}from'../../../../scripts/diff-fresh.mjs';
const here=dirname(fileURLToPath(import.meta.url)),found={};
for(const name of ['xp-overshoot-revisit','xp-maxlevel','xp-maxlevel-control']){
 const read=f=>JSON.parse(gunzipSync(readFileSync(resolve(here,name,f+'.gz'))));const c=read('recorded.session.json'),js=read('js-output.json');assert.equal(compareSessionOutputs(c,js).passed,true,name);const states=[];
 for(const[step,s]of c.segments[0].steps.entries()){const row=decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()).find(r=>/Xp:/u.test(r));if(row&&row!==states.at(-1)?.row)states.push({step,row});}
 found[name]=states;console.log(JSON.stringify({name,states}));
}
const a=found['xp-overshoot-revisit'];assert.deepEqual(a.map(x=>x.row.match(/Xp:(\d+)\/(\d+)/u).slice(1).map(Number)),[[1,0],[1,19],[2,39],[3,41],[3,41]]);
assert.ok(a.at(-1).row.startsWith('Dlvl:21 '));
const t=found['xp-maxlevel'].at(-1).row,c=found['xp-maxlevel-control'].at(-1).row;
assert.ok(t.endsWith('Xp:30/100000020'));assert.ok(c.endsWith('Xp:30/100000000'));
assert.equal(t.match(/HP:[^ ]+ Pw:[^ ]+/u)[0],c.match(/HP:[^ ]+ Pw:[^ ]+/u)[0]);
console.log('All public paths match and reach the declared states; MAXULEV award remains BELOW the 110000000 threshold.');
