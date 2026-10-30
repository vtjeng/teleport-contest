import {runSegment} from '../../js/jsmain.js';
import {game} from '../../js/gstate.js';
import {ROOM,TELEP_TRAP} from '../../js/const.js';
import {m_at} from '../../js/monst.js';
import {t_at} from '../../js/trap.js';
const rc='OPTIONS=name:BoundedArrival,role:Barbarian,race:human,gender:male,align:neutral\nOPTIONS=pettype:none,!legacy,!tutorial,!splash_screen,playmode:debug\n';
for(let i=256;i<2048;i++){
 const seed=2026103100+i;let boundary;
 await runSegment({seed,datetime:'20320815101500',nethackrc:rc,moves:''},{onBoundary:e=>{boundary=e.message;}});
 const fixed=(game.level.traps??[]).filter(t=>t.ttyp===TELEP_TRAP&&!t.once&&t.teledest?.x>0&&t.teledest?.y>=0);
 const rows=fixed.map(t=>{
  const {x,y}=t.teledest;const cells=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
   const a=x+dx,b=y+dy,l=game.level.at(a,b);
   cells.push({x:a,y:b,typ:l?.typ,monster:!!m_at(a,b,game),trap:!!t_at(a,b,game),objects:!!game.level.objects[a]?.[b]});
  }
  return {source:[t.tx,t.ty],dest:[x,y],cells};
 });
 console.log(JSON.stringify({seed,boundary,hero:[game.u.ux,game.u.uy],rooms:game.level.rooms.map(r=>r.rtype),fixed:rows}));
 if(rows.some(r=>r.cells.every(c=>c.typ===ROOM&&!c.monster&&!c.trap&&!c.objects)))break;
}
