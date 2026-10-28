import assert from 'node:assert/strict';
import { resetGame } from '../../../../js/gstate.js';
import { initRng } from '../../../../js/rng.js';
import { init_dungeons, Is_special } from '../../../../js/dungeon.js';
import { DUNGEON_DATA } from '../../../../js/dungeon_data.js';
function route(s,e) {
 const d=s.dungeons[e.dnum];if(!d)return 'floating';
 if(Is_special(e,s))return 'named';if(d.fill_lvl)return 'filler';
 if(e.dnum===s.quest_dnum)return 'quest';
 if(d.proto)return 'prototype-fallback-unproved';
 if(e.dnum===s.medusa_level.dnum && e.dlevel>s.medusa_level.dlevel)return 'unnamed-maze';
 return 'rooms';
}
// Source-derived bounds for the unchained/Oracle-linked main-dungeon branches.
const main=DUNGEON_DATA[0], oracle=main.levels.find(l=>l.name==='oracle');
const maxOracle=oracle.base+oracle.range-1;
const minDungeon=main.base;
const medusa=main.levels.find(l=>l.name==='medusa');
const minMedusa=minDungeon+medusa.base+1;
for(const name of ['The Gnomish Mines','Sokoban','The Quest']) {
 const b=main.branches.find(b=>b.name===name);
 const max=(b.chainlevel?maxOracle:0)+b.base+Math.max(0,(b.range??1)-1);
 assert.ok(max<minMedusa,`${name} must remain before possible unnamed mazes`);
}
const counts={};let endpoints=0,positiveControls=0;
for(let seed=28103700;seed<28103764;seed++) {
 const s=resetGame();s.urole={filecode:'Arc'};initRng(seed);init_dungeons(s);
 for(const b of s.branches)for(const e of [b.end1,b.end2]) {
  const kind=route(s,e);counts[kind]=(counts[kind]??0)+1;
  assert.notEqual(kind,'unnamed-maze');assert.notEqual(kind,'prototype-fallback-unproved');endpoints++;
 }
 // Synthetic detector control, not an authorized/reachable game fixture:
 // adding an active branch endpoint on an unnamed lower main level must be flagged.
 const e={dnum:s.medusa_level.dnum,dlevel:s.medusa_level.dlevel+1};
 if(!Is_special(e,s)){assert.equal(route(s,e),'unnamed-maze');positiveControls++;}
}
assert.ok(positiveControls>0);
console.log(JSON.stringify({positiveControls,seeds:[28103700,28103763],endpoints,counts,minMedusa,maxOracle,
 scope:'Finite initialization checks support the source-based shipped-template route proof; not universal helper equivalence.'},null,2));
