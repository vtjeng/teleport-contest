import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('unchanged C shrieker hearing guard interrupts occupation',()=>{
 const src=readFileSync(new URL('../../../../nethack-c/upstream/src/mon.c',import.meta.url),'utf8');const start=src.indexOf('\nm_respond_shrieker(')+1;assert.ok(start>0);const fn=src.slice(start,src.indexOf('\n}',start)+2);
 const code=`#include <stdio.h>
#include <stdlib.h>
struct monst{int x;};struct permonst{int x;};struct permonst mons[2];
int deaf,active,spoken,awakened;
#define Deaf deaf
#define PM_PURPLE_WORM 0
#define PM_BABY_PURPLE_WORM 1
#define NO_MM_FLAGS 0
const char*Monnam(struct monst*m){return "The shrieker";}
void pline(const char*s,...){spoken++;}
void stop_occupation(void){active=0;}
int rn2(int n){if(n!=10)exit(3);return 9;}
int montoostrong(int m,int lev){return 0;}
int monmax_difficulty_lev(void){return 10;}
struct monst*makemon(struct permonst*p,int x,int y,int flags){exit(4);}
void aggravate(void){awakened++;}
void ${fn}
int main(void){struct monst m={0};for(deaf=0;deaf<2;deaf++){active=1;spoken=awakened=0;m_respond_shrieker(&m);printf("deaf=%d active=%d spoken=%d aggravate=%d\\n",deaf,active,spoken,awakened);}return 0;}`;
 const dir=mkdtempSync(join(tmpdir(),'shrieker-stop-'));try{writeFileSync(join(dir,'o.c'),code);execFileSync('cc',['-std=c99',join(dir,'o.c'),'-o',join(dir,'o')]);const out=execFileSync(join(dir,'o'),{encoding:'utf8'});console.log(out);assert.equal(out,'deaf=0 active=0 spoken=1 aggravate=1\ndeaf=1 active=1 spoken=0 aggravate=1\n');}finally{rmSync(dir,{recursive:true,force:true});}
});
