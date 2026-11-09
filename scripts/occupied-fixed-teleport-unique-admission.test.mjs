import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runSegmentStrict as runSegment} from '../js/jsmain.js';
import {moveloop_core} from '../js/allmain.js';
import {commandKeyCode} from '../js/command_bindings.js';
import {game} from '../js/gstate.js';
import {m_at} from '../js/monst.js';
import {G_UNIQ} from '../js/monsters.js';

// teleport.c tele_trap() moves any resident of a fixed destination with
// enexto() and rloc_to(); it has no arm for a unique species. With the
// destination's brown mold flagged unique, stepping onto the trap must end as
// the recorded C game does for the ordinary mold: the hero on the destination
// <62,4> and the mold at <61,5>.
test('a unique resident of a fixed teleport destination is relocated like any other',async()=>{
 const recipe=JSON.parse(readFileSync(new URL('../recipes/teleport.c/post53-occupied-bounded-brown-mold-peaceful.session.json',import.meta.url)));
 const segment=recipe.segments[0];
 // The recipe ends 'l' (step onto the trap), 'y' (confirm) and '.' (wait).
 assert.ok(segment.moves.endsWith('ly.'));
 await runSegment({...segment,moves:segment.moves.slice(0,-3)});
 const monster=m_at(62,4,game);
 assert.deepEqual([game.u.ux,game.u.uy],[64,2]);
 monster.data={...monster.data,geno:monster.data.geno|G_UNIQ};
 game.nhDisplay.pushKey(commandKeyCode('l'));
 game.nhDisplay.pushKey(commandKeyCode('y'));
 await moveloop_core();
 assert.deepEqual([game.u.ux,game.u.uy],[62,4]);
 assert.equal(m_at(62,4,game),null);
 assert.deepEqual([monster.mx,monster.my],[61,5]);
 assert.equal(m_at(61,5,game),monster);
});
