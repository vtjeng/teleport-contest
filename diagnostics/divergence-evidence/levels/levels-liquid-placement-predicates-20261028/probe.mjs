import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {is_ok_location,set_ok_location_func} from '../../../../js/room_coordinates.js';
import {occupied} from '../../../../js/mktrap.js';
import {GameMap} from '../../../../js/game.js';
import * as C from '../../../../js/const.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));set_ok_location_func(null);
const terrains=mode==='target'?['DRAWBRIDGE_UP']:['STONE','ROOM','POOL','MOAT','WATER','LAVAPOOL','LAVAWALL','ICE','DRAWBRIDGE_DOWN'];
const masks=mode==='target'?[0,4,8,16].flatMap(under=>[0,1,2,3].map(dir=>under|dir)):[0];
const fixtures=[],rows=[];
for(const name of terrains)for(const mask of masks)for(const juiblex of [0,1])for(const humidity of [0,2,4,6]){
 const state={level:new GameMap(),u:{uz:{dnum:0,dlevel:juiblex?2:1}},juiblex_level:{dnum:0,dlevel:2},water_level:{dnum:1,dlevel:1}};
 const cell=state.level.at(11,5);cell.typ=C[name];cell.flags=mask;
 const eligible=Number(is_ok_location(11,5,humidity,{state})),busy=Number(occupied(11,5,state));
 fixtures.push({terrain:name,typ:C[name],mask,juiblex,humidity});rows.push([eligible,busy]);assert.equal(cell.typ,C[name]);assert.equal(cell.flags,mask);
}
const input=fixtures.map(f=>[f.typ,f.mask,f.juiblex,f.humidity].join(' ')).join('\n')+'\n';
const tmp=mkdtempSync(join(tmpdir(),'levels-liquid-predicates-'));
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',exe]);const raw=execFileSync(exe,[],{input,encoding:'utf8'});const c=raw.trim().split('\n').map(s=>s.split(' ').map(Number));assert.deepEqual(rows,c);console.log(JSON.stringify({mode,count:rows.length,inputSha256:createHash('sha256').update(input).digest('hex'),scope:'Fixed interior-cell liquid predicates only, no trap/object/invocation/water-level override; no bridge operation.'})+'\n'+fixtures.map((f,i)=>JSON.stringify({...f,eligible:rows[i][0],occupied:rows[i][1]})).join('\n'));}finally{rmSync(tmp,{recursive:true,force:true});}
