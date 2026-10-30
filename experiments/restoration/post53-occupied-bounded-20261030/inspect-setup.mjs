import {readFileSync} from 'node:fs';
import {runSegment} from '../../js/jsmain.js';
import {game} from '../../js/gstate.js';
let boundary;await runSegment(JSON.parse(readFileSync(process.argv[2])).segments[0],{onBoundary:e=>boundary=e.message});
const monsters=[];for(let m=game.level.monlist;m;m=m.nmon)monsters.push({id:m.m_id,name:m.data?.pmnames?.[0],species:m.mnum,x:m.mx,y:m.my,peaceful:m.mpeaceful,inventory:!!m.minvent,asleep:m.msleeping});
console.log(JSON.stringify({boundary,hero:[game.u.ux,game.u.uy],moves:game.moves,monsters,traps:game.level.traps,regions:game.level.regions.length,rooms:game.level.rooms.map(r=>({type:r.rtype,lx:r.lx,hx:r.hx,ly:r.ly,hy:r.hy}))}));
