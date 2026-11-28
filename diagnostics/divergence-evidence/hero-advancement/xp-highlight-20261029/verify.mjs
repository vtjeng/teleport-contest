import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
const here=dirname(fileURLToPath(import.meta.url));
for(const [role,xp,level,cutoff,relation,finalColor] of [['control',9,1,50,'>=',1],['target',10,1,50,'>=',2],['terminal-control',18,1,100,'=',1],['terminal-target',19,1,100,'=',2],['gain-reset',20,2,100,'=',1]]){
 const expectedRules=[['<',1],[relation,2]].map(([relation,color])=>({field:'experience-level',behavior:'percentage',relation,value:cutoff,text:'',style:{attrib:0,color}}));
 const read=f=>JSON.parse(gunzipSync(readFileSync(resolve(here,role,f+'.gz'))));const c=read('recorded.session.json'),js=read('js-output.json');assert.equal(compareSessionOutputs(c,js).passed,true);
 const segment=JSON.parse(readFileSync(resolve(here,'recipes',role+'.json'))).segments[0];
 const cells=(s,expectedLevel)=>{const row=decodeScreen(s.screen).find(r=>r.map(x=>x.ch).join('').includes('Xp:'));assert.ok(row);const x=row.map(x=>x.ch).join('').indexOf('Xp:');assert.equal(row.slice(x,x+4).map(c=>c.ch).join(''),'Xp:'+expectedLevel);assert.notEqual(row[x+4].ch,'/');return row.slice(x,x+4);};
 for(const [i,color] of [[0,1],[c.segments[0].steps.length-1,finalColor]])assert.ok(cells(c.segments[0].steps[i],i===0?1:level).every(c=>c.color===color&&c.attr===0));
 const states=[];
 for(const phase of ['initial','final']){let boundary;await runSegment({...segment,moves:phase==='initial'?'':segment.moves},{onBoundary:e=>boundary=e});if(boundary)throw boundary;assert.deepEqual(game.iflags.status_hilites,expectedRules);assert.equal(game.flags.showexp,false);assert.equal(game.u.ulevel,phase==='initial'?1:level);assert.equal(game.u.uexp,phase==='initial'?0:xp);const selected=game.gb.status_hilite_rule[0][13];assert.deepEqual(selected,expectedRules[phase==='final'&&finalColor===2?1:0]);states.push({phase,xp:game.u.uexp,selected,percent:game.gb.status_hilite_percent[0][13]});}
 console.log(JSON.stringify({role,states,fullCJSParity:true,gateIsolation:false}));
}
