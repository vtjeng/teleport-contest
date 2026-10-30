import assert from 'node:assert/strict';
import test from 'node:test';
import {runSegment} from '../js/jsmain.js';
import {game} from '../js/gstate.js';
const moves='#wizgenesis\nhostile vampire\n'+'m.  '.repeat(18);
// Historical published input, freshly executed in JS. This does not claim a
// fresh C recording or reuse any cancelled qualifier artifact.
const input={datetime:'20451019123000',nethackrc:'OPTIONS=name:AttackProbe,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,pettype:none,!legacy,!tutorial,!splash_screen,!autopickup,!acoustics\n'};
test('vampire encounter prefix establishes swallowing through actual commands',async()=>{
 await runSegment({...input,seed:98732041,moves:moves.slice(0,45)});
 assert.equal(game.u.uswallow,1);
 assert.ok(game.u.ustuck);
});
test('vampire shape upkeep expels the hero through planned/live command processing',async()=>{
 const replay=await runSegment({...input,seed:98732041,moves:moves.slice(0,48)});
 assert.equal(replay.getScreens().length,49);
 assert.equal(game.u.uswallow,0);
 assert.match(replay.getScreens()[47].split('\n')[0],/You emerge from the fog cloud/);
});
test('alternate-seed encounter remains outside the swallowing target',async()=>{
 const replay=await runSegment({...input,seed:98732042,moves:moves.slice(0,48)});
 assert.equal(replay.getScreens().length,49);
 assert.equal(Boolean(game.u.uswallow),false);
});
