import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
import {ROOMOFFSET} from '../../../../js/const.js';
const seed=Number(process.argv[2]??28104000);
const recipe=JSON.parse(readFileSync(new URL(`${seed}.recipe.json`,import.meta.url)));
await runSegment(recipe.segments[0]);
const room=r=>({index:r.roomnoidx,rtype:r.rtype,orig:r.orig_rtype??null,
 roomno:game.level.at(r.lx,r.ly).roomno,expectedRoomno:r.roomnoidx+ROOMOFFSET});
console.log(JSON.stringify({seed,top:game.level.rooms.slice(0,game.level.nroom).map(room),
 sub:game.subrooms.slice(0,game.nsubroom).map(room)},null,2));

if(process.argv.includes('--assert-orig'))assert.ok(game.subrooms.slice(0,game.nsubroom).every(r=>r.orig_rtype===r.rtype),'C finalization copies subroom original types; runtime C field capture still pending');
if(process.argv.includes('--assert-top'))assert.ok(game.level.rooms.slice(0,game.level.nroom).every(r=>r.orig_rtype===r.rtype));
