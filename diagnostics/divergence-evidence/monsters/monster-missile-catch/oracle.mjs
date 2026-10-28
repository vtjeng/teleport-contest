import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('unchanged C catch function hands the successful roll to inventory owner and returns TRUE',()=>{
 const src=readFileSync(new URL('../../../../nethack-c/upstream/src/mthrowu.c',import.meta.url),'utf8');
 const start=src.indexOf('\nu_catch_thrown_obj(')+1;assert.ok(start>0);const fn=src.slice(start,src.indexOf('\n}',start)+2);
 const code=`#include <stdio.h>
#include <string.h>
typedef int boolean;
#define TRUE 1
#define FALSE 0
#define A_DEX 0
#define PM_MONK 1
#define PM_ROGUE 2
#define ACURR(x) 10
#define Role_if(x) 0
#define Blind 0
#define Confusion 0
#define Stunned 0
#define Fumbling 0
#define VENOM_CLASS 2
#define SLT_ENCUMBER 1
#define BUFSZ 256
#define Snprintf snprintf
struct obj{int oclass,owt;};
struct {struct {int data;}youmonst;}gy;
int roll,handed,draws;
int nohands(int data){return 0;}
int freehand(void){return 1;}
int calc_capacity(int weight){return 0;}
int rn2(int n){if(n!=90)return 2;draws++;return roll;}
const char*simpleonames(struct obj*o){return "orcish dagger";}
struct obj*hold_another_object(struct obj*o,const char*drop,const char*name,const char*success){handed++;printf("handoff=%s\\n",success);return o;}
boolean ${fn}
int main(void){for(roll=0;roll<2;roll++){struct obj dagger={1,10};handed=draws=0;int result=u_catch_thrown_obj(&dagger);printf("roll=%d result=%d handed=%d draws=%d\\n",roll,result,handed,draws);}return 0;}`;
 const dir=mkdtempSync(join(tmpdir(),'missile-catch-'));
 try{writeFileSync(join(dir,'o.c'),code);execFileSync('cc',['-std=c99',join(dir,'o.c'),'-o',join(dir,'o')]);const out=execFileSync(join(dir,'o'),{encoding:'utf8'});console.log(out);assert.equal(out,'handoff=You catch the orcish dagger!\nroll=0 result=1 handed=1 draws=1\nroll=1 result=0 handed=0 draws=1\n');}finally{rmSync(dir,{recursive:true,force:true});}
});
