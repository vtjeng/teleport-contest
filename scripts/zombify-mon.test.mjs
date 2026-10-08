import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as doPort from '../js/do.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {eaten_stat} from '../js/eat.js';
import {CORPSE, LARGE_BOX} from '../js/objects.js';
import {G_GENOD, OBJ_CONTAINED, OBJ_DELETED, OBJ_FREE, OBJ_INVENT, ROT_CORPSE,
    TIMER_OBJECT, ZOMBIFY_MON} from '../js/const.js';
import {PM_HUMAN, PM_HUMAN_ZOMBIE, PM_LICHEN} from '../js/monsters.js';
import {newObject, place_object, weight} from '../js/obj.js';
import {nh_timeout_requires_live_state, peek_timer, run_timers, start_timer} from '../js/timeout.js';

async function initializedState() {
    // Independent ordinary startup supplies canonical object/monster catalogs.
    await runSegment({seed:15740101, datetime:'20510319101100',
        nethackrc:'OPTIONS=name:ZombieTimer,role:Wizard,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!acoustics,!debug_mongen\n',moves:''});
    game.gt.timer_base=null;
    game.moves=40; // Gives the failed revival a nonzero corpse-age delta.
    return game;
}

// do.c2299-2317 owns the zombie gate and metadata order, not the timeout table.
test('zombify_mon keeps source metadata/species/revival order and production dispatch', () => {
    const c=readFileSync('nethack-c/upstream/src/do.c','utf8');
    const source=c.slice(c.indexOf('zombify_mon(anything'),c.indexOf('/* return TRUE if hero'));
    assert.match(source,/zombie_form[\s\S]*G_GENOD[\s\S]*free_omid\(body\)[\s\S]*free_omonst\(body\)[\s\S]*set_corpsenm\(body, zmon\)[\s\S]*revive_mon\(arg, timeout\)[\s\S]*rot_corpse\(arg, timeout\)/);
    assert.equal(typeof doPort.zombify_mon,'function');
    const js=readFileSync('js/timeout.js','utf8');
    assert.match(js,/name: 'zombify_mon', f: zombifyMonCallback/);
});

test('zombification clears corpse associations before canonical failed revival', async () => {
    const state=await initializedState();
    const container=newObject({otyp:LARGE_BOX,where:OBJ_INVENT,olocked:true,quan:1});
    const body=newObject({otyp:CORPSE,oclass:state.objects[CORPSE].oc_class,
        where:OBJ_CONTAINED,ocontainer:container,corpsenm:PM_HUMAN,age:10,quan:1,
        oeaten:100,oextra:{omid:17,omonst:{mextra:null}}});
    container.cobj=body;
    // Debug wish source keeps both timers. Conversion must cancel this old
    // rot timer before set_corpsenm creates the zombie's new rot timer.
    start_timer(100,TIMER_OBJECT,ROT_CORPSE,body,state);
    const oldRotId=state.gt.timer_base.tid;
    start_timer(0,TIMER_OBJECT,ZOMBIFY_MON,body,state);
    assert.equal(body.timed,2);
    const draws=[], lines=[];
    await run_timers(state,{message:line=>lines.push(line),
        random:{...Object.fromEntries(['rn2','rnd','rn1','rne'].map(name=>[name,()=>assert.fail('unexpected '+name)])),rnz:n=>{draws.push(['rnz',n]);return 10;},
            d:(n,x)=>{draws.push(['d',n,x]);return 100;}}});
    // mkobj.c:set_corpsenm rescales eaten nutrition, schedules rot, and weighs
    // before revive_mon sees the locked container and computes its retry.
    assert.equal(body.oextra.omid,0);
    assert.equal(body.oextra.omonst,null);
    assert.equal(body.corpsenm,PM_HUMAN_ZOMBIE);
    assert.equal(body.oeaten,Math.trunc(100*state.mons[PM_HUMAN_ZOMBIE].cnutrit/state.mons[PM_HUMAN].cnutrit));
    assert.equal(body.owt,weight(body,{state,hooks:{eatenStat:eaten_stat}}));
    assert.equal(body.timed,1);
    assert.notEqual(state.gt.timer_base.tid,oldRotId);
    assert.ok(peek_timer(ROT_CORPSE,body,state)>state.moves);
    assert.deepEqual(draws,[['rnz',10],['d',5,50]]);
    assert.deepEqual(lines,[],'set_corpsenm already supplied the rot timer');
});

test('no zombie form or a genocided zombie form dispatches canonical floor rot without draws', async () => {
    for(const species of [PM_LICHEN,PM_HUMAN]) {
        const state=await initializedState();
        if(species===PM_HUMAN)state.mvitals[PM_HUMAN_ZOMBIE].mvflags|=G_GENOD;
        const body=newObject({otyp:CORPSE,oclass:state.objects[CORPSE].oc_class,
            corpsenm:species,age:10,quan:1,where:OBJ_FREE});
        place_object(body,state.u.ux,state.u.uy,{state});
        start_timer(0,TIMER_OBJECT,ZOMBIFY_MON,body,state);
        assert.equal(nh_timeout_requires_live_state(state),true);
        const redrawn=[];
        await run_timers(state,{newsym:(x,y)=>redrawn.push([x,y]),
            random:{rn2:()=>assert.fail('rot fallback has no random draw')}});
        assert.equal(body.corpsenm,species);
        assert.equal(body.where,OBJ_DELETED);
        assert.equal(body.timed,0);
        assert.equal(state.gt.timer_base,null);
        assert.deepEqual(redrawn,[[state.u.ux,state.u.uy]]);
    }
});
