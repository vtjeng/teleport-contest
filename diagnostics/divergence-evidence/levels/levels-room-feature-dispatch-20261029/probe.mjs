import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {GameMap} from '../../../../js/game.js';
import {mkfount,mksink,mkaltar} from '../../../../js/room_features.js';
import {somexyspace,fill_special_room} from '../../../../js/mklev.js';
import {IS_DOOR,SDOOR,DOOR,ROOM,FOUNTAIN} from '../../../../js/const.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const p=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(p,'source-contract.json')));
for(const[f,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(f)).digest('hex'),h,f);
const oracle=readFileSync(join(p,'oracle.c'),'utf8');for(const {path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
// Private predicate is copied verbatim for dependency injection, not exported or rewritten.
// The production find_okay_roompos and somexyspace functions execute directly.
const src=readFileSync('js/mklev.js','utf8'),start=src.indexOf('function bydoor('),bydoorSource=src.slice(start,src.indexOf('\n}',start)+2);assert(start>0);
const makeBydoor=new Function('game','isok','IS_DOOR','SDOOR',bydoorSource+'; return bydoor;');
const tmp=mkdtempSync(join(tmpdir(),'levels-feature-dispatch-'));const rows=[];let features=0,fills=0;
try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(p,'oracle.c'),'-o',exe]);
const control=Number(mode==='control');
for(const [api,fn,values] of [[0,mkfount,[0,1,2,3,4,5,6]],[1,mksink,[0]],[2,mkaltar,[0,1,2]]])for(const rtype of [0,1])for(const pos of [0,2,4])for(const prior of [0,1])for(const value of values){
 const state={level:new GameMap(),u:{uz:{dnum:0,dlevel:1}}},room={lx:10,hx:14,ly:6,hy:10,irregular:false,nsubrooms:0,rtype};
 for(let x=10;x<=14;x++)for(let y=6;y<=10;y++){state.level.at(x,y).typ=control?FOUNTAIN:ROOM;state.level.at(x,y).horizontal=Boolean(prior);}
 state.level.at(30,5).typ=FOUNTAIN;state.level.at(32,5).typ=30;state.level.flags.nfountains=control?26:1;state.level.flags.nsinks=1;
 let calls=0,draws=0,bound=0;const randomCore=n=>{assert(pos<n);calls++;return pos;};const pred=makeBydoor(state,(x,y)=>x>0&&x<80&&y>=0&&y<21,IS_DOOR,SDOOR);
 const env={state,randomCore,randomOneBased:(n,b)=>b+randomCore(n),random:{rn2:n=>{assert(value<n);draws++;bound=n;return value;}},hooks:{somexyspace,bydoor:(x,y)=>pred(x,y)}};
 fn(room,env);const loc=state.level.at(10+pos,6+pos),actual=[loc.typ,Number(loc.horizontal),loc.flags,state.level.flags.nfountains,state.level.flags.nsinks,calls,draws,bound];
 const args=[0,api,rtype,pos,prior,value,control];const expected=execFileSync(exe,args.map(String),{encoding:'utf8'}).trim().split(' ').map(Number);assert.deepEqual(actual,expected,JSON.stringify(args));rows.push([args,actual]);features++;
}
const types=[0,1,4,8,2,6,5,7,10,3,14];const configs=mode==='target'?[...types.flatMap(t=>[[t,0],[t,t<2?1:2]]),[14,1]]:types.map(t=>[t,0]);
const names=['has_shop','has_vault','has_zoo','has_court','has_morgue','has_beehive','has_barracks','has_temple','has_swamp'];
for(const [rtype,needfill]of configs)for(const tree of [0,1,2])for(const asyncShop of [0,1]){
 const state={level:new GameMap()};const mask=()=>names.reduce((m,n,i)=>m+(Number(Boolean(state.level.flags[n]))<<i),0);const root={lx:10,hx:20,ly:4,hy:16,rtype,needfill:control?0:needfill,sbrooms:[],nsubrooms:0};
 const shop={lx:12,hx:14,ly:6,hy:9,rtype:14,needfill:control?0:1,sbrooms:[],nsubrooms:0};const temple={lx:16,hx:18,ly:11,hy:14,rtype:10,needfill:control?0:2,sbrooms:[],nsubrooms:0};let rooms=[root,shop,temple];
 if(tree===1){root.sbrooms=[shop,temple];root.nsubrooms=2;}if(tree===2){const mid={lx:12,hx:18,ly:6,hy:14,rtype:0,needfill:0,nsubrooms:1,sbrooms:[]},leaf={lx:14,hx:16,ly:8,hy:12,rtype:14,needfill:control?0:1,nsubrooms:0,sbrooms:[]};root.sbrooms=[mid];root.nsubrooms=1;mid.sbrooms=[leaf];rooms=[root,mid,leaf];}
 const trace=[];await fill_special_room(root,{state,stockRoom:(type,room,env)=>{assert.equal(env.state,state);trace.push(rooms.indexOf(room),type,mask());return asyncShop?Promise.resolve():undefined;}});
 const actual=[mask(),...trace],args=[1,rtype,needfill,tree,0,0,control];const expected=execFileSync(exe,args.map(String),{encoding:'utf8'}).trim().split(' ').map(Number);assert.deepEqual(actual,expected,JSON.stringify([args,asyncShop]));if(control)assert.deepEqual(actual,[0]);rows.push([args,asyncShop,actual]);fills++;
}
console.log(JSON.stringify({mode,features,fills,total:rows.length,observationsSha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex'),equal:true}));
}finally{rmSync(tmp,{recursive:true,force:true});}
