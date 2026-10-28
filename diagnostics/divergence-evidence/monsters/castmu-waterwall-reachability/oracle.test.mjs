import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('compiled upstream set_apparxy rejects WATER and accepts ROOM in the same draw sequence',()=>{
 const read=n=>readFileSync(new URL('../../../../nethack-c/upstream/'+n,import.meta.url),'utf8');
 const c=read('src/monmove.c');const start=c.indexOf('void\nset_apparxy(');const end=c.indexOf('\n/*\n * mon-to-mon displacement',start);assert.ok(start>0&&end>start);
 const rm=read('include/rm.h');assert.ok(rm.includes('#define ACCESSIBLE(typ) ((typ) >= DOOR)'));
 const value=name=>Number(rm.match(new RegExp('\\b'+name+'\\s*=\\s*(\\d+)'))[1]);
 const dir=mkdtempSync(join(tmpdir(),'castwater-selector-'));
 try{
 writeFileSync(join(dir,'oracle.c'),`#include <stdio.h>
#include <stdlib.h>
typedef int boolean;typedef int coordxy;
#define FALSE 0
#define TRUE 1
#define Invis 0
#define Displaced 0
#define Underwater 0
#define PM_XORN 0
#define PM_DISPLACER_BEAST 1
struct species {int unused;} mons[3];
struct monst {int mx,my,mux,muy,mtame,mcansee;struct species *data;};
struct {int ux,uy;struct monst *ustuck;} u={18,15,0};
struct {void *invent;} gi;
struct {int typ;} levl[80][21];
int draws[]={1,1,2,2,2},used;
int rn2(int n){int v=draws[used++];if(used>5||v>=n)exit(3);return v;}
long money_cnt(void*p){return 0;}
int u_at(int x,int y){return x==u.ux&&y==u.uy;}
int perceives(struct species*p){return 0;}
int passes_walls(struct species*p){return 0;}
int isok(int x,int y){return x>0&&x<80&&y>=0&&y<21;}
int couldsee(int x,int y){return isok(x,y);}
int accessible(int x,int y){return levl[x][y].typ>=${value('DOOR')};}
int closed_door(int x,int y){return 0;}
int can_ooze(struct monst*m){return 0;}
int can_fog(struct monst*m){return 0;}
${c.slice(start,end)}
int main(int argc,char **argv){for(int x=0;x<80;x++)for(int y=0;y<21;y++)levl[x][y].typ=${value('ROOM')};levl[18][16].typ=atoi(argv[1]);struct monst m={19,15,17,15,0,0,&mons[2]};set_apparxy(&m);printf("%d %d %d\\n",m.mux,m.muy,used);}
`);
 execFileSync('cc',['-std=c99',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 for(const [terrain,expected] of [[value('WATER'),'19 16 5\n'],[value('ROOM'),'18 16 3\n']]){
  const output=execFileSync(join(dir,'oracle'),[String(terrain)],{encoding:'utf8'});assert.equal(output,expected);console.log(JSON.stringify({oracle:'unmodified upstream set_apparxy with fixed fixture predicates',terrain,output:output.trim()}));
 }
 const casting=read('src/mcastu.c');assert.match(casting,/is_waterwall\(mtmp->mux, mtmp->muy\) \? "empty water"/);
 // C skips later attack slots after a successful-location hit moves hero.
 const attack=read('src/mhitu.c');assert.match(attack,/if \(firstfoundyou && !foundyou\)\s*continue;/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('compiled upstream post-move attack gate blocks adjacency to remembered target',()=>{
 const read=n=>readFileSync(new URL('../../../../nethack-c/upstream/src/'+n,import.meta.url),'utf8');
 const c=read('monmove.c'), mon=read('mon.c');
 const nearStart=mon.indexOf('boolean\nmonnear('),nearEnd=mon.indexOf('\n/* really free',nearStart);
 const rangeStart=c.indexOf('    *inrange = (dist2'),rangeEnd=c.indexOf('\n\n',rangeStart);
 const gateStart=c.indexOf('            if (!nearby\n'),gateEnd=c.indexOf('        case MMOVE_DIED:',gateStart);
 assert.ok(nearStart>0&&nearEnd>nearStart&&rangeStart>0&&rangeEnd>rangeStart&&gateStart>0&&gateEnd>gateStart);
 const dir=mkdtempSync(join(tmpdir(),'castwater-gate-'));
 try{
 writeFileSync(join(dir,'gate.c'),`#include <stdio.h>
typedef int boolean;typedef int coordxy;
struct species {int unused;} mons[1];
struct monst {int mx,my,mux,muy;struct species *data;};
#define NODIAG(n) 0
#define BOLT_LIM 8
#define AT_WEAP 254
int dist2(int a,int b,int x,int y){return (a-x)*(a-x)+(b-y)*(b-y);}
${mon.slice(nearStart,nearEnd)}
void range(struct monst *mtmp,int *inrange,int *nearby){${c.slice(rangeStart,rangeEnd)}}
int ranged_attk_available(struct monst*m){return 1;}
int attacktype(struct species*p,int t){return 0;}
int find_offensive(struct monst*m){return 0;}
int engulfing_u(struct monst*m){return 0;}
int mattacku(struct monst*m){return 2;}
int gate(struct monst *mtmp){int inrange,nearby;struct species *mdat=mtmp->data;range(mtmp,&inrange,&nearby);switch(1){case 1:
${c.slice(gateStart,gateEnd)}
}return 1;}
int main(void){struct monst m={20,15,19,16,&mons[0]};printf("adjacent target: %d\\n",gate(&m));m.mux=18;m.muy=15;printf("distant target: %d\\n",gate(&m));}
`);
 execFileSync('cc',['-std=c99',join(dir,'gate.c'),'-o',join(dir,'gate')]);
 const output=execFileSync(join(dir,'gate'),[],{encoding:'utf8'});
 assert.equal(output,'adjacent target: 0\ndistant target: 1\n');
 console.log(JSON.stringify({oracle:'exact C monnear, range assignments, postmove attack gate; native lich predicates fixed',output:output.trim()}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
