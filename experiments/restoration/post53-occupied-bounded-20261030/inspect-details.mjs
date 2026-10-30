import {readFileSync} from 'node:fs';
import {runSegment} from '../../js/jsmain.js';
import {game} from '../../js/gstate.js';
import {m_at} from '../../js/monst.js';
import {cansee} from '../../js/vision.js';
import {canseemon} from '../../js/display.js';
await runSegment(JSON.parse(readFileSync(process.argv[2])).segments[0]);
const m=m_at(62,4,game), inventory=[];for(let o=game.invent;o;o=o.nobj)inventory.push({type:o.otyp,letter:o.invlet});
console.log(JSON.stringify({hero:[game.u.ux,game.u.uy],inventory,room:game.level.rooms[6],visible:canseemon(m,game),cansee:cansee(62,4,game),monster:Object.fromEntries(Object.entries(m).filter(([k,v])=>v===null||typeof v!=='object'&&typeof v!=='function')),props:game.u.uprops,occupation:!!game.go?.occupation}));
