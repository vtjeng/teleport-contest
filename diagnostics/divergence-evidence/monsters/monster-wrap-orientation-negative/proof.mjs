import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {game} from '../../../../js/gstate.js';
import {runSegment} from '../../../../js/jsmain.js';
import {newMonster,place_monster} from '../../../../js/monst.js';
import {PM_PYTHON,PM_JACKAL,NON_PM,AD_WRAP} from '../../../../js/monsters.js';
import {mhitm_adtyping} from '../../../../js/uhitm.js';
const source=readFileSync('nethack-c/upstream/src/uhitm.c','utf8');
const body=source.match(/\nmhitm_ad_wrap\([\s\S]*?\n\}\n/)?.[0];
assert.ok(body);
// Exact final orientation arm; hero branches are deliberately outside this oracle.
const arm=body.match(/    } else \{\n        \/\* mhitm \*\/([\s\S]*?)\n    }\n}/)?.[1];
assert.ok(arm);
assert.match(body,/if \(magr == &gy.youmonst\)/);
assert.match(body,/else if \(mdef == &gy.youmonst\)/);
assert.equal((body.match(/is_pool\(/g)||[]).length,2);
assert.doesNotMatch(arm,/is_pool|done\(|drown|ustuck/);
const dir=mkdtempSync(join(tmpdir(),'wrap-arm-'));
let oracle;
try {
 const c=`#include <stdio.h>\nstruct monst {int mcan;}; struct mhitm_data {int damage;};\n#define canseemon(m) 1\n#define Some_Monnam(m) "Python"\n#define some_mon_nam(m) "jackal"\n#define pline(...) ((void)0)\nstatic int probe(int cancelled,int damage) {struct monst a={cancelled},b={0};struct monst *magr=&a,*mdef=&b;struct mhitm_data h={damage},*mhm=&h;${arm}\nreturn mhm->damage;}\nint main(void){printf("%d %d\\n",probe(0,4),probe(1,4));}\n`;
 writeFileSync(join(dir,'oracle.c'),c);
 execFileSync('cc',['-std=c99','-O0',join(dir,'oracle.c'),'-o',join(dir,'oracle')]);
 oracle=execFileSync(join(dir,'oracle'),[],{encoding:'utf8'}).trim().split(' ').map(Number);
} finally {rmSync(dir,{recursive:true,force:true});}
assert.deepEqual(oracle,[4,0]);
for (const [index,cancelled,damage] of [[0,0,4],[1,1,4]]) test(`monster wrap cancelled=${cancelled} damage=${damage}`,async()=>{
 await runSegment({seed:7710051,datetime:'20261028120000',nethackrc:'OPTIONS=name:Wrap,role:Valkyrie,race:human,gender:female,align:neutral,!legacy,!tutorial,!splash_screen,pettype:none\n',moves:''});
 for(const col of game.level.monsters)col.fill(null);game.level.monlist=null;
 const make=(pm,id,x)=>newMonster({data:game.mons[pm],m_id:id,mx:x,my:game.u.uy,mhp:pm===PM_PYTHON?30:4,mhpmax:pm===PM_PYTHON?30:4,m_lev:game.mons[pm].mlevel,cham:NON_PM,mcanmove:1,mcansee:1});
 const a=make(PM_PYTHON,6003,game.u.ux+1),b=make(PM_JACKAL,6004,game.u.ux+2);
 a.mcan=cancelled;place_monster(a,a.mx,a.my,game);place_monster(b,b.mx,b.my,game);a.nmon=b;game.level.monlist=a;
 const attack=a.data.mattk.find(x=>x.adtyp===AD_WRAP);assert.ok(attack);assert.equal(attack.damn,1);assert.equal(attack.damd,4);
 const mhm={damage,specialdmg:0,done:false,hitflags:0},messages=[];
 const stuck=game.u.ustuck;
 await mhitm_adtyping(a,attack,b,mhm,game,{unsupported:r=>assert.fail(r),message:async s=>messages.push(s),random:{rn2:()=>assert.fail('no wrap RNG for monster pair'),rnd:()=>assert.fail('no wrap RNG for monster pair')}});
 console.log(JSON.stringify({cancelled,inputDamage:damage,cDamage:oracle[index],jsDamage:mhm.damage,messages}));
 assert.equal(mhm.damage,oracle[index]);assert.equal(mhm.done,false);assert.equal(game.u.ustuck,stuck);
});
