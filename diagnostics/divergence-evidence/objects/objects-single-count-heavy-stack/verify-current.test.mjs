// Passing evidence check of the current defect; revise/remove after repair.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {ROCK} from '../../../../js/objects.js';
test('C picks up one; JS reaches the capacity preflight boundary with the stack intact',async()=>{
 const s=JSON.parse(readFileSync(new URL('target-capture-c.json',import.meta.url))).segments[0];assert.ok(s.steps[31].screen.includes('1000 rocks drop to the floor'));assert.ok(s.steps[35].screen.includes('e - a rock.'));
 const boundaries=[];await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundaries.push(e)});
 assert.equal(boundaries.length,1);assert.match(boundaries[0].reason,/pickup\(\) requiring a partial or failed lift/);
 for(let o=game.invent;o;o=o.nobj)assert.notEqual(o.otyp,ROCK);
 const stack=game.level.objects[game.u.ux][game.u.uy];assert.equal(stack.otyp,ROCK);assert.equal(stack.quan,1000);
});
