import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {bound_digging,get_level_extends} from '../../../../js/mkmaze.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json'))),fixtures=JSON.parse(readFileSync(join(p,'fixtures.json')));
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const[file,names]of [['mkmaze.c',['get_level_extends','bound_digging']],['dungeon.c',['on_level']]]){const src=readFileSync('nethack-c/upstream/src/'+file,'utf8');for(const n of names){const a=src.indexOf('\n'+n+'(')+1;assert(a>0&&oracle.includes(src.slice(a,src.indexOf('\n}',a)+2)),n);}}
const tmp=mkdtempSync(join(tmpdir(),'levels-bound-earth-'));let count=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
for(const fixture of fixtures)for(const maze of [0,1])for(const relation of mode==='target'?[0,1]:[2]){
 const level=new GameMap();level.flags.is_maze_lev=Boolean(maze);const[lx,ly,hx,hy]=fixture.rect;
 for(let x=lx;x<=hx;x++)for(let y=ly;y<=hy;y++)level.at(x,y).typ=25;
 if(fixture.walls){for(let x=lx-1;x<=hx+1;x++)for(const y of [ly-1,hy+1])level.at(x,y).typ=2;for(let y=ly;y<=hy;y++)for(const x of [lx-1,hx+1])level.at(x,y).typ=1;}
 const state={level,u:{uz:relation===0?{dnum:0,dlevel:1}:relation===1?{dnum:2,dlevel:2}:{dnum:2,dlevel:1}},earth_level:{dnum:2,dlevel:1}};
 const before=[];for(let x=0;x<80;x++)for(let y=0;y<21;y++){before.push(level.at(x,y).typ);assert.equal(level.at(x,y).wall_info,0);}
 const bounds=get_level_extends(state);bound_digging(state);const actual=[];for(let x=0;x<80;x++)for(let y=0;y<21;y++){assert.equal(level.at(x,y).typ,before[x*21+y]);actual.push(level.at(x,y).wall_info);}
 const raw=execFileSync(exe,[String(maze),String(relation)],{input:before.join(' ')+'\n',encoding:'utf8'}).trim().split('\n'),expected=Buffer.from(raw[1],'hex');assert.equal(expected.length,1680);assert.deepEqual([bounds.xmin,bounds.ymin,bounds.xmax,bounds.ymax],raw[0].split(' ').map(Number));assert.deepEqual(Buffer.from(actual),expected);if(mode==='control')assert(actual.every(v=>v===0));else assert(actual.some(v=>v===24));
 console.log(JSON.stringify({fixture:fixture.name,maze,relation,bounds,marked:actual.filter(v=>v!==0).length,maskSha256:createHash('sha256').update(expected).digest('hex'),equal:true}));count++;
}console.log(JSON.stringify({mode,count,equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
