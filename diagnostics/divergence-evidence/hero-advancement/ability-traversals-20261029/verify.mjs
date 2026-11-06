import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const source=readFileSync('nethack-c/upstream/src/attrib.c','utf8');
const tags={archeologist:'arc',barbarian:'bar',caveman:'cav',healer:'hea',knight:'kni',monk:'mon',priest:'pri',ranger:'ran',rogue:'rog',samurai:'sam',tourist:'tou',valkyrie:'val',wizard:'wiz','elf-wizard':'wiz','gnome-wizard':'wiz','dwarf-archeologist':'arc','orc-barbarian':'bar'};
for(const file of readdirSync(resolve(here,'recipes')).sort()){
 const name=file.replace(/\.json$/,'');
 const read=f=>JSON.parse(gunzipSync(readFileSync(resolve(here,name,f+'.gz'))));
 const c=read('recorded.session.json'),js=read('js-output.json');
 assert.equal(compareSessionOutputs(c,js).passed,true,name);
 const screens=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(x=>x.ch).join('').trimEnd()));
 const text=screens.flat().join(' ').replace(/\s+/g,' ');
 if(tags[name]){
  assert.ok(screens.some(r=>r.some(x=>/Xp:30\/100000000/u.test(x))),`${name}: reached 30`);
  assert.ok(screens.at(-1).some(x=>/Xp:1\/19/u.test(x)),`${name}: returned to 1`);
  const table=source.match(new RegExp(`\\b${tags[name]}_abil\\[\\]\\s*=\\s*\\{([\\s\\S]*?)\\{\\s*0,`));assert.ok(table,name);
  const messages=[];
  for(const entry of table[1].matchAll(/\{\s*(\d+),\s*&\([^)]+\),\s*"([^"]*)",\s*"([^"]*)"/g)){
   if(Number(entry[1])<=1)continue;
   if(entry[2])messages.push(`You feel ${entry[2]}!`);
   const loss=entry[3]|| (entry[2]?`less ${entry[2]}`:'');if(loss)messages.push(`You feel ${loss}!`);
  }
  if(name==='elf-wizard')messages.push('You feel awake!','You feel tired!');
  for(const message of messages)assert.ok(text.includes(message),`${name}: ${message}`);
  console.log(JSON.stringify({name,traversal:'1->30->1',expectedMessages:messages}));
 }else if(name==='control')assert.ok(screens.at(-1).some(x=>/Xp:1\/0/u.test(x)));
 else if(name.startsWith('martial')){
  const menus=screens.filter(r=>r.some(x=>/slots? available/u.test(x)));
  const slots=menus.map(r=>Number(r.find(x=>/slots? available/u.test(x)).match(/\((\d+) slot/u)[1]));
  const ranks=menus.map(r=>r.find(x=>/martial arts/u.test(x)).match(/martial arts\s+(\w+)/u)[1]);
  assert.deepEqual(slots,name==='martial-control'?[0]:[0,1,1,0]);
  assert.deepEqual(ranks,name==='martial-control'?['Master']:['Master','Expert','Skilled','Basic']);
  console.log(JSON.stringify({name,slots,ranks}));
 }else if(name.startsWith('silent')){
  const views=[];let active=null;
  c.segments[0].steps.forEach((s,i)=>{if(s.key==='\x18'){active=[];views.push(active);}else if(s.key==='#')active=null;if(active)active.push(...screens[i]);});
  const seen=views.map(r=>r.join(' ').includes('You see invisible because of your experience.'));
  assert.deepEqual(seen,name==='silent-control'?[false]:[false,true,false]);
  console.log(JSON.stringify({name,experienceSeeInvisibleByView:seen}));
 }
}
console.log('All 22 recordings and reached-state assertions pass.');
