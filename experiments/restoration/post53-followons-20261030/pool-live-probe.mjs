import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { M_ATTK_HIT, POOL, ROOM } from '../../../js/const.js';
import { game } from '../../../js/gstate.js';
import { runSegment } from '../../../js/jsmain.js';
import { makemon_runtime } from '../../../js/makemon_create.js';
import { GameMap } from '../../../js/game.js';
import { PM_FIRE_GIANT } from '../../../js/monsters.js';
import { teleds } from '../../../js/teleport.js';
import { mhitm_knockback } from '../../../js/uhitm.js';
import { planningState } from '../../../js/unported_monster_actions.js';

const C_DOTHROW = readFileSync('nethack-c/upstream/src/dothrow.c', 'utf8');

async function knockbackSetup(pool) {
    await runSegment({
        seed: 41415253,
        datetime: '20421210121212',
        nethackrc: 'OPTIONS=name:PoolKnock,role:Wizard,race:human,'
            + 'gender:female,align:neutral,playmode:debug,pettype:none,'
            + '!legacy,!tutorial,!splash_screen,!autopickup,!safe_wait\n',
        moves: '',
    });
    game.level=new GameMap();
    for(let x=40;x<=50;x++)for(let y=2;y<=12;y++)Object.assign(game.level.at(x,y),{typ:ROOM,lit:true});
    game.u.urooms=[];game.u.ushops=[];
    // The room is finalized before gameplay. Give the destination the same
    // valid pool terrain as the C special-level witness, or dry room floor.
    assert.equal(game.level.at(44, 5).typ, ROOM);
    game.level.at(44, 5).typ = pool ? POOL : ROOM;
    await teleds(43, 6, 0, game, { redraw: () => {} });
    // Runtime monster creation may dismiss the startup message first.
    for (let i = 0; i < 16; i++) game.nhDisplay.pushKey(32);
    const giant = await makemon_runtime(
        game.mons[PM_FIRE_GIANT], 42, 7, 0, { state: game },
    );
    assert.ok(giant);
    const planned = planningState(game);
    let plannedGiant = planned.level.monlist;
    while (plannedGiant && plannedGiant.m_id !== giant.m_id)
        plannedGiant = plannedGiant.nmon;
    assert.ok(plannedGiant);
    return { planned, plannedGiant, giant };
}

assert.match(C_DOTHROW,/\(void\) drown\(\);/);
for(const planning of [true,false])for(const pool of [true,false]){
 const {planned,plannedGiant,giant}=await knockbackSetup(pool);
 const state=planning?planned:game,attacker=planning?plannedGiant:giant;
 for(let i=0;i<100;i++)game.nhDisplay.pushKey(32);
 const rolls=[1,0,0,0,1],bounds=[];let handoff=false,error=null;
 try{await mhitm_knockback(attacker,state.youmonst,attacker.data.mattk[0],{value:M_ATTK_HIT},false,state,{state,planning,message:async()=>{},requestPlanningInput(){handoff=true;throw Error('live handoff');}},{rn2:n=>{bounds.push(n);assert.ok(rolls.length);return rolls.shift();}});}catch(e){error=e.message;}
 console.log(JSON.stringify({planning,pool,error,handoff,hero:[state.u.ux,state.u.uy],liveHero:[game.u.ux,game.u.uy],hp:state.u.uhp,gameover:state.program_state?.gameover,bounds,last:game._ttyToplines}));
}
