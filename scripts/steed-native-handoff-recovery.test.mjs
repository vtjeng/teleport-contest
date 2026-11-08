import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { M_ATTK_HIT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { PM_FIRE_GIANT } from '../js/monsters.js';
import { mhitm_knockback } from '../js/uhitm.js';

// The admitted v64 prefix creates and mounts a saddled pony via actual game
// commands. A giant is then created by the normal runtime constructor.
async function mountedAttackState() {
    const path = new URL(
        '../challenges/cases/v64/v64-mounted-controlled-horse-action4.session.json',
        import.meta.url,
    );
    const source = JSON.parse(readFileSync(path, 'utf8')).segments[0];
    const moves = source.moves.slice(0, source.moves.indexOf('zo>horse'));
    assert.notEqual(moves, source.moves);
    await runSegment({
        seed: source.seed,
        datetime: source.datetime,
        nethackrc: source.nethackrc
            .replace(',monpolycontrol', '')
            .replace(',debug_mongen', ''),
        moves,
    });
    assert.ok(game.u.usteed);
    const giant = await makemon_runtime(game.mons[PM_FIRE_GIANT],
        game.u.ux, game.u.uy - 1, 0, { state: game });
    assert.ok(giant);
    return giant;
}

for(const knock of [true,false])test(`mounted knock=${knock}`,async()=>{
 const attacker=await mountedAttackState();const state=game;
 for(let i=0;i<40;i++)game.nhDisplay.pushKey(32);
 const rolls=[1,knock?0:1,0,0,1],bounds=[];let error=null;
 try{await mhitm_knockback(attacker,state.youmonst,attacker.data.mattk[0],{value:M_ATTK_HIT},false,state,{state,message:async()=>{}},{rn2:n=>{bounds.push(n);assert.ok(rolls.length);return rolls.shift();}});}catch(e){error=e.message;}
 assert.equal(error,null);
 assert.equal(!!state.u.usteed,!knock);
 assert.equal(!!game.u.usteed,!knock);
 assert.deepEqual(bounds,knock?[3,6,2,2,4]:[3,6]);
});
