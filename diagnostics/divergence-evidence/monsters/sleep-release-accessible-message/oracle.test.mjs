import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=new URL('../../../../',import.meta.url);
function body(path,name){const s=readFileSync(new URL(path,root),'utf8');const start=s.indexOf(`\n${name}(`)+1;assert.ok(start>0);const end=s.indexOf('\n}',start)+2;return s.slice(start,end);}
test('exact C slept_monst and pline_mon preserve location only for held sleeping grabber',()=>{
 const code=`#include <stdio.h>
#include <stdarg.h>
struct monst {int mx,my,data,helpless;};
struct {struct monst *ustuck;int uswallow;} u;
struct {struct monst youmonst;} gy;
int x,y;
int helpless(struct monst *m){return m->helpless;}
int sticks(int d){return d;}
const char *Monnam(struct monst *m){return "The lichen";}
const char *s_suffix(const char *s){return "The lichen's";}
void unstuck(struct monst *m){u.ustuck=0;}
void set_msg_xy(int a,int b){x=a;y=b;}
void vpline(const char *s,va_list a){printf("%d,%d|",x,y);vprintf(s,a);puts("");}
void ${body('nethack-c/upstream/src/pline.c','pline_mon')}
void ${body('nethack-c/upstream/src/mhitm.c','slept_monst')}
int main(void){struct monst m={19,15,0,1};u.ustuck=&m;slept_monst(&m);printf("released=%d\\n",u.ustuck==0);slept_monst(&m);return 0;}`;
 const dir=mkdtempSync(join(tmpdir(),'grip-oracle-'));
 try{writeFileSync(join(dir,'oracle.c'),code);execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);const out=execFileSync(join(dir,'oracle'),{encoding:'utf8'});console.log(out);assert.equal(out,"19,15|The lichen's grip relaxes.\nreleased=1\n");}finally{rmSync(dir,{recursive:true,force:true});}
});
