import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { newObject, weight } from '../../../../js/obj.js';
import { weight_cap, inv_weight, near_capacity } from '../../../../js/hack.js';
import { resetGame } from '../../../../js/gstate.js';
import { LAST_PROP, NON_PM, OBJ_INVENT } from '../../../../js/const.js';
import { objects_globals_init, ARROW, DART, ROCK, GOLD_PIECE } from '../../../../js/objects.js';
const dir='diagnostics/divergence-evidence/carrying-capacity/inventory-totals';
const mode=process.argv[2]??'target';
assert.ok(['target','control'].includes(mode));
const base='nethack-c/upstream';
const extract=(file,name,type)=>{
 const s=readFileSync(`${base}/src/${file}`,'utf8');
 const a=s.indexOf(`\n${name}(`), b=s.indexOf('\n}',a)+2;
 assert.ok(a>0&&b>a); return type+s.slice(a,b)+'\n';
};
const source=readFileSync(`${dir}/adapter.h`,'utf8')+'\n'
 +extract('attrib.c','acurrstr','schar')
 +extract('mkobj.c','weight','int')
 +['weight_cap','inv_weight','calc_capacity','near_capacity'].map(n=>extract('hack.c',n,'int')).join('\n')
 +String.raw`
int main(void) {
 objects_globals_init();
 int str,con,n;
 while(scanf("%d %d %d",&str,&con,&n)==3) {
  if(n<0||n>10) abort();
  attrs[0]=str; attrs[1]=con;
  struct obj chain[10]; memset(chain,0,sizeof(chain));
  for(int i=0;i<n;i++) {
   int kind; long qty;
   if(scanf("%d %ld",&kind,&qty)!=2||qty<1||qty>10000) abort();
   int types[]={ARROW,DART,ROCK,GOLD_PIECE};
   if(kind<0||kind>3) abort();
   chain[i].otyp=types[kind]; chain[i].oclass=objects[types[kind]].oc_class;
   chain[i].spe=i; chain[i].quan=qty; chain[i].corpsenm=-1; chain[i].where=OBJ_INVENT;
   chain[i].owt=weight(&chain[i]);
   chain[i].nobj=i+1<n?&chain[i+1]:NULL;
   printf("%u ",chain[i].owt);
  }
  gi.invent=n?chain:NULL;
  int cap=weight_cap(), excess=inv_weight(), near=near_capacity();
  printf("%d %d %d %d\n",cap,excess,near,gw.wc);
 }
}
`;
const rows=[];
const add=(str,con,items,label)=>rows.push({str,con,items,label});
if(mode==='control') {
 add(18,10,[],'empty');
 add(18,10,[[0,750]],'at capacity');
 add(18,10,[[0,749],[1,2]],'mixed first burden');
 add(18,10,[[2,75],[3,49]],'low coin quantity');
 add(18,10,[[2,75],[3,50]],'coin rounding threshold');
} else {
 for(const [str,con] of [[3,3],[18,10],[50,10],[125,25]]) {
  const cap=Math.min(1000,25*((str<=18?str:str<=121?19+Math.trunc(str/50):str-100)+con)+50);
  for(const qty of [1,2,3,49,50,51,99,100,149,150,151,999,1000])
  for(const kind of [0,1,2,3]) {
   add(str,con,[[kind,qty]],'single stack');
   if(kind!==3) add(str,con,[[kind,qty],[3,49]],'stack plus coins');
   if(qty>1&&kind!==3) {
    // Independently weighed split chain; splitobj/merge insertion are not invoked.
    add(str,con,[[kind,1],[kind,qty-1]],'two distinct stacks');
   }
  }
  for(let k=2;k<=6;k++) for(const delta of [-1,0,1]) {
   const total=Math.ceil(cap*k/2)+delta;
   // All weights are derived from real catalog objects. Arrow/dart weigh 1;
   // rocks weigh 10. This reaches exact integer threshold neighborhoods.
   for(const gold of [0,49,50,149,150]) {
    const coinWeight=Math.trunc((gold+50)/100);
    const noncoin=total-coinWeight;
    const rocks=Math.floor((noncoin-2)/10), darts=1, arrows=noncoin-10*rocks-darts;
    const items=[[2,rocks],[1,darts],[0,arrows],...(gold?[[3,gold]]:[])];
    add(str,con,items,'mixed threshold');
    add(str,con,[...items].reverse(),'reverse mixed threshold');
   }
  }
 }
}
const temp=mkdtempSync(join(tmpdir(),'capacity-inventory-'));
try {
 writeFileSync(join(temp,'probe.c'),source);
 execFileSync('cc',['-std=c99',`-I${process.cwd()}/${base}/include`,`-I${process.cwd()}/${base}/sys/unix`,join(temp,'probe.c'),`${base}/src/objects.c`,'-o',join(temp,'probe')]);
 const input=rows.map(r=>[r.str,r.con,r.items.length,...r.items.flat()].join(' ')).join('\n')+'\n';
 const result=spawnSync(join(temp,'probe'),[],{input,encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(result.status,0,result.stderr);
 const c=result.stdout.trim().split('\n').map(s=>s.trim().split(/\s+/).map(Number));
 assert.equal(c.length,rows.length);
 const state=resetGame();objects_globals_init(state);
 state.u={acurr:{a:[18,10,10,10,10,10]},abon:[0,0,0,0,0,0],atemp:[0,0,0,0,0,0],uprops:Array.from({length:LAST_PROP+1},()=>({intrinsic:0,extrinsic:0,blocked:0})),umonnum:0,umonster:0,usteed:null,uz:{dnum:0,dlevel:1}};
 state.youmonst={data:{}};state.afternmv=null;
 const failures=[]; const coverage={};
 for(let i=0;i<rows.length;i++) {
  const r=rows[i];coverage[r.label]=(coverage[r.label]??0)+1;
  state.u.acurr.a[0]=r.str;state.u.acurr.a[4]=r.con;
  const chain=r.items.map(([kind,qty],index)=>{
   const otyp=[ARROW,DART,ROCK,GOLD_PIECE][kind];
   const o=newObject({otyp,oclass:state.objects[otyp].oc_class,quan:qty,spe:index,corpsenm:NON_PM,where:OBJ_INVENT});
   o.owt=weight(o,{state});return o;
  });
  chain.forEach((o,i)=>o.nobj=chain[i+1]??null);state.invent=chain[0]??null;
  const js=[...chain.map(o=>o.owt),weight_cap(state),inv_weight(state),near_capacity(state),state.gw.wc];
  if(JSON.stringify(js)!==JSON.stringify(c[i])) failures.push({input:r,c:c[i],js});
 }
 if(mode==='control') assert.deepEqual(c,[[750,-750,0,750],[750,750,0,0,750],[749,2,750,1,1,750],[750,1,750,0,0,750],[750,1,750,1,1,750]]);
 console.log(JSON.stringify({mode,rows:rows.length,coverage,mismatches:failures.length,firstFailures:failures.slice(0,10)},null,2));
 process.exitCode=failures.length?1:0;
} finally {rmSync(temp,{recursive:true,force:true});}
