import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const root=new URL('../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('source observations preserve C dispatch and distinguish missing transition oracle',()=>{
 const movement=read('nethack-c/upstream/src/monmove.c');
 assert.match(movement,/if \(mtmp->mtame\) \{\s*return postmov\(mtmp, ptr, omx, omy, dog_move\(mtmp, after\)/);
 const dog=read('nethack-c/upstream/src/dogmove.c');
 assert.match(dog,/if \(!edog && !mtmp->isminion\) \{/);
 const mon=read('nethack-c/upstream/src/mon.c');
 const start=mon.indexOf('\nnewcham(')+1;const transition=mon.slice(start,mon.indexOf('\n}',start)+2);
 assert.match(transition,/set_mon_data\(mtmp, mdat\)/);
 assert.doesNotMatch(transition,/mtmp->(?:mtame|isminion)\s*=(?!=)/);
 // This checks direct assignments only, not effects of every called helper.
 // It cannot establish the full C transition and is not a parity oracle.
 const admission=read('js/unported_monster_actions.js');
 assert.match(admission,/const guardian = monster.mtame\s*&& monster.isminion\s*&& monster.data\?\.pmidx === PM_ANGEL/);
 assert.match(admission,/if \(monster.mtame && !guardian\)\s*unsupported\('tame minion movement'\)/);
});
