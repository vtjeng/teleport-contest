import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root=new URL('../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
export function cHealthOracle(nurse){
 const mon=read('nethack-c/upstream/src/mon.c');
 const a=mon.indexOf('int\nhealmon('),b=mon.indexOf('/* force all chameleons',a);
 assert.ok(a>=0&&b>a);
 const make=read('nethack-c/upstream/src/makemon.c');
 const c=make.indexOf('max_increase = rnd((int) victim->m_lev + 1);');
 const d=make.indexOf('    } else {',c);
 assert.ok(c>=0&&d>c);
 const dir=mkdtempSync(join(tmpdir(),'nurse-health-oracle-'));
 try{
  const src=`#include <stdio.h>\n#include <stdlib.h>\n#define Upolyd 0\n#define max(a,b) ((a)>(b)?(a):(b))\nstruct monst {int mhp,mhpmax,m_lev;};\nstruct {struct monst youmonst;}gy;struct {int mh,uhp;}u;\nvoid healup(int a,int b,int c,int d){(void)a;(void)b;(void)c;(void)d;abort();}\nint rnd(int n){(void)n;return 1;}int rn2(int n){return n>1?1:0;}\n${mon.slice(a,b)}\nint main(int argc,char **argv){if(argc!=2)return 2;struct monst monster={32,120,15},defender={20,40,11};if(!atoi(argv[1])){defender.mhpmax=60;defender.m_lev=14;}struct monst *mtmp=&monster,*victim=&defender;int max_increase,cur_increase,hp_threshold=mtmp->m_lev*8;if(atoi(argv[1]))healmon(mtmp,mtmp->mhpmax,0);\n${make.slice(c,d)}\nmtmp->mhpmax += max_increase;mtmp->mhp += cur_increase;printf("%d %d\\n",mtmp->mhp,mtmp->mhpmax);return 0;}\n`;
  writeFileSync(join(dir,'oracle.c'),src);
  execFileSync(process.env.CC??'cc',['-std=c99','-Wall','-Wextra',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
  return execFileSync(join(dir,'oracle'),[nurse?'1':'0'],{encoding:'utf8'}).trim().split(' ').map(Number);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
