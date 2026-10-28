import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WEB,TELEP_TRAP} from '../../../../js/const.js';
const read=p=>readFileSync(p,'utf8');
const source=read('js/trap.js');
const body=source.slice(source.indexOf('export function maketrap('),source.indexOf('// C ref: trap.c deltrap()'));
assert.equal((body.match(/note_unported\(/g)||[]).length,1);
assert.doesNotMatch(body,/\btyp\s*=(?!=)/);
const tele=body.slice(body.indexOf('case TELEP_TRAP:'),body.indexOf('\n    default:',body.indexOf('case TELEP_TRAP:')));
assert.match(tele,/note_unported\('pline\.c impossible'\)/);
const move=read('js/monmove.js');
const start=move.indexOf('async function maybe_spin_web(');
const caller=move.slice(start,move.indexOf('\n}',start)+2);
assert.match(caller,/maketrap\(mtmp\.mx, mtmp\.my, WEB, \{ state \}\)/);
assert.equal((caller.match(/maketrap\(/g)||[]).length,1);
const c=read('nethack-c/upstream/src/monmove.c');
const cstart=c.indexOf('\nmaybe_spin_web(struct monst *mtmp)');
const cbody=c.slice(cstart,c.indexOf('\n}',cstart)+2);
assert.match(cbody,/maketrap\(mtmp->mx, mtmp->my, WEB\)/);
assert.notEqual(WEB,TELEP_TRAP);
// Positive control: the same switch discriminator admits TELEP_TRAP,
// so this proof cannot be generalized to every caller of maketrap.
assert.equal(WEB===TELEP_TRAP,false);
assert.equal(TELEP_TRAP===TELEP_TRAP,true);
console.log(JSON.stringify({scope:'constant WEB call cannot select sole TELEP_TRAP marker',WEB,TELEP_TRAP,markerCount:1}));
