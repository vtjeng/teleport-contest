// Evidence check for the recorded base; remove/update rejection expectation after repair.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {ART_SUNSWORD} from '../../../../js/artifacts.js';
test('C oracle reaches shine, forced drop and extinguishing; JS rejects that reached branch',async()=>{
 const s=JSON.parse(readFileSync(new URL('target-capture-c.json',import.meta.url))).segments[0];
 for(const expected of ['begins to shine brilliantly!','You turn into a giant bat!','You find you must drop your sword!','The long sword named Sunsword stops shining.'])assert.ok(s.steps.some(x=>x.screen.includes(expected)),expected);
 assert.ok(!s.steps.at(-1).screen.includes('Sunsword'));
 await assert.rejects(runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves}),/uwepgone: artifact-light extinguishing not wired/);
 assert.equal(game.uwep.oartifact,ART_SUNSWORD);assert.ok(game.uwep.lamplit);
});
