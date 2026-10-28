import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {which_armor} from '../../../../js/worn.js';
import * as masks from '../../../../js/const.js';
const mode=process.argv[2];assert(['target','control'].includes(mode));
const read=p=>readFileSync(p,'utf8');
const body=(s,sig)=>{const a=s.indexOf(sig);assert(a>=0,sig);const b=s.indexOf('\n}',a);assert(b>a);return s.slice(a,b+2);};
const js=read('js/worn.js'), c=read('nethack-c/upstream/src/worn.c');
const helper=body(js,'export function which_armor(');
// Pin the entire helper rather than infer marker dominance from a nearby string.
assert.equal(helper,`export function which_armor(monster, mask, state = game) {
    if (monster === state.youmonst) {
        const slot = WORN_SLOTS.find((entry) => entry.mask === mask
            && (entry.mask & W_ARMOR));
        if (!slot) {
            note_unported('pline.c impossible');
            return null;
        }
        return state[slot.field] ?? null;
    }
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.owornmask & mask) return obj;
    }
    return null;
}`);
const slots=js.slice(js.indexOf('const WORN_SLOTS ='),js.indexOf('\n]);',js.indexOf('const WORN_SLOTS ='))+4);
for(const [name,field] of [['W_ARMH','uarmh'],['W_ARMG','uarmg']])assert(slots.includes(`Object.freeze({ mask: ${name}, field: '${field}' })`));
const header=read('nethack-c/upstream/include/prop.h');
const names=['W_ARM','W_ARMC','W_ARMH','W_ARMS','W_ARMG','W_ARMF','W_ARMU'];
const defs=names.map(n=>{const m=header.match(new RegExp(`#define ${n} (0x[0-9a-f]+)L`));assert(m);assert.equal(Number(m[1]),masks[n]);return `#define ${n} ${m[1]}L`;}).join('\n');
assert.equal(masks.W_ARMOR,names.reduce((v,n)=>v|masks[n],0));
assert.match(header,/#define WORN_HELMET W_ARMH\s/);
for(const [file,func,ca,ja] of [['mhitu','mattacku','WORN_HELMET','W_ARMH'],['mhitm','mdisplacem','W_ARMG','W_ARMG']]){
 const cb=body(read(`nethack-c/upstream/src/${file}.c`),`\n${func}(`);
 const jb=body(read(`js/${file}.js`),`export async function ${func}(`);
 for(const [b,arg] of [[cb,ca],[jb,ja]]){
  const calls=[...b.matchAll(/which_armor\([^\n;]+/g)];assert.equal(calls.length,1);
  assert.match(calls[0][0],new RegExp(`which_armor\\([^,]+, ${arg}(?:,|\\))`));
 }
}
// Pure lookup contract: these are input records, not a simulated equip/attack transition.
const helmet={owornmask:masks.W_ARMH,nobj:null,id:11};
const gloves={owornmask:masks.W_ARMG,nobj:null,id:22};
helmet.nobj=gloves;
const mon={minvent:mode==='target'?helmet:null};
const hero={minvent:null};
const state={youmonst:hero,uarmh:mode==='target'?helmet:null,uarmg:mode==='target'?gloves:null};
const jsResult=[which_armor(mon,masks.W_ARMH,state)?.id??0,which_armor(mon,masks.W_ARMG,state)?.id??0,which_armor(hero,masks.W_ARMH,state)?.id??0,which_armor(hero,masks.W_ARMG,state)?.id??0];
const cb=body(c,'\nwhich_armor(');
const src=`#include <stdio.h>
#include <stdlib.h>
${defs}
struct obj {long owornmask; struct obj *nobj; int id;};
struct monst {struct obj *minvent;};
struct {struct monst youmonst;} gy;
struct obj *uarm,*uarmc,*uarmh,*uarms,*uarmg,*uarmf,*uarmu;
void impossible(const char *s) {(void)s; exit(9);}
struct obj *${cb}
int main(void) {
 struct obj gloves={W_ARMG,0,22},helmet={W_ARMH,&gloves,11};
 struct monst mon={${mode==='target'?'&helmet':'0'}};
 uarmh=${mode==='target'?'&helmet':'0'}; uarmg=${mode==='target'?'&gloves':'0'};
 struct obj *a=which_armor(&mon,W_ARMH),*b=which_armor(&mon,W_ARMG),*d=which_armor(&gy.youmonst,W_ARMH),*e=which_armor(&gy.youmonst,W_ARMG);
 printf("[%d,%d,%d,%d]\\n",a?a->id:0,b?b->id:0,d?d->id:0,e?e->id:0);
}`;
const temp=mkdtempSync(join(tmpdir(),'armor-lookup-'));
try{
 writeFileSync(join(temp,'oracle.c'),src);
 execFileSync('cc',['-std=c11','-Wall','-Wextra','-Wno-unused-variable',join(temp,'oracle.c'),'-o',join(temp,'oracle')]);
 const cResult=JSON.parse(execFileSync(join(temp,'oracle'),{encoding:'utf8'}));
 assert.deepEqual(cResult,mode==='target'?[11,22,11,22]:[0,0,0,0]);assert.deepEqual(jsResult,cResult);
 console.log(JSON.stringify({mode,sourceProof:'both literal armor slots exclude the sole unsupported hero-slot diagnostic',cResult,jsResult,scope:'complete pure lookup; no combat/equipment transition claim'}));
}finally{rmSync(temp,{recursive:true,force:true});}
