// JS-only prerequisite qualification; no C comparison and no discrepancy claim.
import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
const r=JSON.parse(readFileSync(new URL('priest-start.json',import.meta.url)));
for(const casts of [0,15]){
 const s={...r.segments[0],moves:'#levelchange\n30\n'+' '.repeat(35)+('Zb'+' '.repeat(12)).repeat(casts)};
 await runSegment(s,{onBoundary:e=>{throw e}});
 console.log(JSON.stringify({casts,hp:game.u.uhp,energy:game.u.uen,energyMax:game.u.uenmax,hunger:game.u.uhunger,healing:game.u.weapon_skills[29],slots:game.u.weapon_slots,advanced:game.u.skills_advanced,conditions:[17,22].map(i=>game.u.uprops[i])}));
}
