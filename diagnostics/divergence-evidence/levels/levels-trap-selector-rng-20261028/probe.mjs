import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {traptype_rnd,traptype_roguelvl} from '../../../../js/mktrap.js';
import {level_difficulty} from '../../../../js/dungeon.js';
import {TRAPNUM,MKTRAP_NOSPIDERONWEB} from '../../../../js/const.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));assert.equal(TRAPNUM,26);assert.equal(MKTRAP_NOSPIDERONWEB,4);
const cases=[];
if(mode==='target'){
 for(const context of [...Array.from({length:8},(_,i)=>({difficulty:i+1,hellish:0,single:0})),{difficulty:26,hellish:1,single:0},{difficulty:18,hellish:0,single:1}])
 for(const note of [0,1])for(const flags of [0,4])for(let chosen=1;chosen<26;chosen++)for(let extra=0;extra<7;extra++)cases.push({context,note,flags,chosen,extra});
}else for(let extra=0;extra<7;extra++)cases.push({context:{difficulty:1,hellish:0,single:0},note:0,flags:0,chosen:1,extra});
const rows=[],inputs=[];let rejection=0,secondaryDraws=0;const kinds=new Set();
for(const {context:{difficulty,hellish,single},note,flags,chosen,extra} of cases){
 const uz={dnum:single?2:hellish?1:0,dlevel:single||hellish?1:difficulty};
 const state={u:{uz,uhave:{}},dungeons:[{depth_start:1,num_dunlevs:30,entry_lev:1,flags:{hellish:false}},{depth_start:26,num_dunlevs:30,entry_lev:1,flags:{hellish:true}},{depth_start:18,num_dunlevs:1,entry_lev:1,flags:{hellish:false}}],branches:[{end1:{dnum:0,dlevel:18},end2:{dnum:2,dlevel:1},end1_up:false}],knox_level:{dnum:2,dlevel:1},level:{flags:{noteleport:Boolean(note)}}};
 assert.equal(level_difficulty(state),difficulty);
 const tape=[];const random={rnd(n){assert.equal(tape.length,0);assert.equal(n,25);tape.push(['rnd',n,chosen]);return chosen;},rn2(n){assert.equal(n,7);tape.push(['rn2',n,extra]);return extra;}};
 const result=mode==='target'?traptype_rnd(flags,{state,random}):traptype_roguelvl({state,random});
 assert.equal(tape.length,mode==='target'&&chosen===13?2:1);if(mode==='target'&&chosen===13)secondaryDraws++;if(!result)rejection++;kinds.add(result);rows.push([result,tape.length]);inputs.push([mode==='target'?0:1,difficulty,hellish,single,note,flags,chosen,extra].join(' '));
}
const tmp=mkdtempSync(join(tmpdir(),'levels-trap-selector-'));
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',exe]);const raw=execFileSync(exe,[],{input:inputs.join('\n')+'\n',encoding:'utf8',maxBuffer:4e6});const c=raw.trim().split('\n').map(s=>s.split(' ').map(Number));assert.deepEqual(rows,c);const hash=x=>createHash('sha256').update(x).digest('hex');console.log(JSON.stringify({mode,comparisons:rows.length,rejection,secondaryDraws,resultKinds:[...kinds].sort((a,b)=>a-b),inputSha256:hash(inputs.join('\n')+'\n'),matchingRowsSha256:hash(JSON.stringify(rows)),scope:'Exact selection result and draw count with checked bounds and supplied draw values; no trap construction or runtime effects.'},null,2));}finally{rmSync(tmp,{recursive:true,force:true});}
