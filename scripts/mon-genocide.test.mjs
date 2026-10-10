import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {G_EXTINCT, G_GENOD, MON_DETACH, W_AMUL} from '../js/const.js';
import {game} from '../js/gstate.js';
import {makemap_prepost} from '../js/cmd.js';
import {runSegment} from '../js/jsmain.js';
import {kill_genocided_monsters} from '../js/mon.js';
import {accessible} from '../js/monmove.js';
import {m_at, newMonster, place_monster, remove_monster} from '../js/monst.js';
import {NON_PM, PM_CHAMELEON, PM_LICHEN, PM_NEWT} from '../js/monsters.js';
import {AMULET_OF_LIFE_SAVING, EGG, SACK} from '../js/objects.js';
import {loadMonGenocideCases, verifyMonGenocideSegment} from './run-mon-genocide.mjs';

async function hero() {
    // Independent initialization supplies the live level, death counters and hero conduct.
    await runSegment({seed:1180624,datetime:'20981107161500',moves:'',
        nethackrc:'OPTIONS=name:GenocideTest,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n'});
    // Construct only this test's live chain; retain the generated room/vision state.
    for(let mon=game.level.monlist;mon;mon=mon.nmon)remove_monster(mon.mx,mon.my,game);
    game.level.monlist=null;
    return game;
}
let identity=118100;
function spawn(pmidx, extra={}) {
    for(const[dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const x=game.u.ux+dx, y=game.u.uy+dy;
        if(!accessible(x,y,game)||m_at(x,y,game))continue;
        const mon=newMonster({data:game.mons[pmidx],cham:NON_PM,m_id:++identity,
            mhp:8,mhpmax:8,mcanmove:true,mcansee:true,mx:x,my:y,...extra});
        place_monster(mon,x,y,game);
        mon.nmon=game.level.monlist;game.level.monlist=mon;
        return mon;
    }
    throw new Error('fixture needs a free adjacent room square');
}
function noRandom() {
    return Object.fromEntries(['d','rn1','rn2','rnd','rne'].map(name=>[name,()=>{
        throw new Error(`ordinary genocide unexpectedly drew ${name}`);
    }]));
}
function egg(label, events, species=PM_NEWT) {
    const obj={corpsenm:species,nobj:null,age:118,owornmask:0};
    Object.defineProperty(obj,'otyp',{get(){events.push(label);return EGG;}});
    return obj;
}

test('genocide uses current data, ignores extinction and leaves hero kills/corpses untouched',async()=>{
    const state=await hero();
    const spared=spawn(PM_LICHEN,{mnum:PM_NEWT}); // C reads data, not a stale mnum.
    const first=spawn(PM_NEWT),second=spawn(PM_NEWT);
    state.svm.mvitals[PM_NEWT].mvflags|=G_GENOD;
    state.svm.mvitals[PM_LICHEN].mvflags|=G_EXTINCT; // Extinction alone never kills.
    const deaths=state.svm.mvitals[PM_NEWT].died;
    const experience=state.u.uexp,kills=state.u.uconduct.killer;
    const floor=state.level.objlist;
    await kill_genocided_monsters(state,{random:noRandom()});
    for(const mon of[first,second]) {
        assert.equal(mon.mhp,0);assert.ok(mon.mstate&MON_DETACH);
        assert.equal(m_at(mon.mx,mon.my,state),null);
    }
    assert.equal(spared.mhp,8);
    assert.equal(state.svm.mvitals[PM_NEWT].died,deaths+2);
    assert.equal(state.u.uexp,experience);assert.equal(state.u.uconduct.killer,kills);
    assert.equal(state.level.objlist,floor,'mondead creates no corpse');
});

test('genocide saves the next pointer before the existing death owner mutates links',async()=>{
    const state=await hero();
    const tail=spawn(PM_NEWT),head=spawn(PM_NEWT);
    state.svm.mvitals[PM_NEWT].mvflags|=G_GENOD;
    await kill_genocided_monsters(state,{random:noRandom(),hooks:{newsym(){
        if(head.mhp===0)head.nmon=null; // The source traversal already captured tail.
    }}});
    assert.equal(head.mhp,0);assert.equal(tail.mhp,0);
});

test('genociding the original chameleon kills it in an otherwise valid current form',async()=>{
    const state=await hero();
    const mon=spawn(PM_NEWT,{cham:PM_CHAMELEON});
    state.svm.mvitals[PM_CHAMELEON].mvflags|=G_GENOD;
    const deaths=state.svm.mvitals[PM_CHAMELEON].died;
    await kill_genocided_monsters(state,{random:noRandom()});
    assert.equal(mon.mhp,0);assert.equal(mon.data,state.mons[PM_CHAMELEON]);
    assert.equal(mon.cham,NON_PM);
    assert.equal(state.svm.mvitals[PM_CHAMELEON].died,deaths+1);
});

test('genociding only the current form awaits the source shapechange before egg sweeps',async()=>{
    const state=await hero();
    const mon=spawn(PM_NEWT,{cham:PM_CHAMELEON});
    state.svm.mvitals[PM_NEWT].mvflags|=G_GENOD;
    state.wizard=true;state.iflags.mon_polycontrol=true;
    const events=[];
    mon.minvent=egg('monster egg',events,PM_LICHEN); // A viable egg keeps its hatch timer.
    let announce,release;
    const reached=new Promise(resolve=>{announce=resolve;});
    const draws=[];
    const random={rn2(bound){draws.push(['rn2',bound]);return 1;},
        rn1(bound,start){draws.push(['rn1',bound,start]);return start;},
        rnd(bound){draws.push(['rnd',bound]);return 1;},
        d(count,faces){draws.push(['d',count,faces]);return count;},
        rne(bound){draws.push(['rne',bound]);return 1;}};
    const operation=kill_genocided_monsters(state,{random,
        canSeeMonster:()=>true,canSpotMonster:()=>true,
        getlin:async()=> 'lichen', // Real wizard monpolycontrol input chooses a safe form.
        message:async text=>{events.push(text);announce();await new Promise(resolve=>{release=resolve;});},
        redrawSquare:()=>{}});
    await reached;
    assert.equal(mon.data,state.mons[PM_LICHEN]);assert.ok(mon.mhp>0);
    assert.equal(mon.cham,PM_CHAMELEON);
    assert.equal(events.length,1,'minvent sweep waits for the change message');
    assert.match(events[0],/turns into a lichen/u);
    // C selector rn2(3) precedes wizard input, then level-zero newmonhp uses rnd(4).
    assert.deepEqual(draws,[['rn2',3],['rnd',4]]);
    release();await operation;
    assert.equal(events.at(-1),'monster egg');
});

test('egg sweep skips dead monsters and visits live inventory then four global lists in C order',async()=>{
    const state=await hero();const events=[];
    const live=spawn(PM_LICHEN),dead=spawn(PM_NEWT);
    dead.mhp=0;dead.data=null;dead.minvent=egg('dead inventory',events);
    live.minvent={otyp:SACK,cobj:egg('live container',events),nobj:null};
    state.invent=egg('hero inventory',events);
    state.level.objlist=egg('floor objects',events);
    state.gm.migrating_objs=egg('migrating objects',events);
    state.level.buriedobjlist=egg('buried objects',events);
    state.svm.mvitals[PM_NEWT].mvflags|=G_GENOD;
    await kill_genocided_monsters(state,{random:noRandom()});
    assert.deepEqual(events,['live container','hero inventory','floor objects','migrating objects','buried objects']);
    assert.equal(state.unported.has('timeout.c kill_egg'),false);
    assert.equal(state.invent.age,118,'the timer cancellation leaves egg data intact');
});

test('genocide retains the existing life-saving death boundary without claiming it',async()=>{
    const state=await hero();
    const mon=spawn(PM_NEWT,{misc_worn_check:W_AMUL});
    mon.minvent={otyp:AMULET_OF_LIFE_SAVING,owornmask:W_AMUL,nobj:null};
    state.svm.mvitals[PM_NEWT].mvflags|=G_GENOD;
    await assert.rejects(kill_genocided_monsters(state),
        /monster kill path requires unsupported/u);
    assert.equal(mon.minvent.otyp,AMULET_OF_LIFE_SAVING);
    assert.equal(mon.mstate&MON_DETACH,0);
});

test('all four production callers await the shared source owner and remove the private stub',()=>{
    const read=readFileSync(new URL('../js/read.js',import.meta.url),'utf8');
    const level=readFileSync(new URL('../js/do.js',import.meta.url),'utf8');
    const command=readFileSync(new URL('../js/cmd.js',import.meta.url),'utf8');
    const source=readFileSync(new URL('../nethack-c/upstream/src/mon.c',import.meta.url),'utf8');
    assert.match(source,/mtmp2 = mtmp->nmon;[\s\S]*?DEADMONSTER\(mtmp\)/u);
    assert.match(source,/newcham\(mtmp, \(struct permonst \*\) 0, NC_SHOW_MSG\)/u);
    assert.equal((read.match(/await kill_genocided_monsters\(state(?:, env)?\);/gu)??[]).length,2);
    assert.match(level,/await losedogs\(\{ state \}\);\s*await kill_genocided_monsters\(state\);/u);
    assert.match(command,/await losedogs\(\{ state \}\);\s*await kill_genocided_monsters\(state\);/u);
    for(const text of[read,level,command])assert.doesNotMatch(text,/note_unported\('mon\.c kill_genocided_monsters'\)/u);
    assert.doesNotMatch(level,/function kill_genocided_monsters/u);
});

// #wizmakemap's post-map callback also runs through sp_lev.c
// lspo_finalize_level and must use the shared sweep.
test('the existing post-map callback removes genocided monsters before arrival checks',async()=>{
    const state=await hero();
    const mon=spawn(PM_NEWT);
    state.svm.mvitals[PM_NEWT].mvflags|=G_GENOD;
    // cls() first dismisses the startup TTY message, as a command would.
    state.nhDisplay.pushKey(' '.charCodeAt(0));
    await makemap_prepost(false,false,state);
    assert.equal(mon.mhp,0);
    assert.ok(mon.mstate&MON_DETACH);
    assert.equal(m_at(mon.mx,mon.my,state),null);
    assert.equal(state.unported.has('mon.c kill_genocided_monsters'),false);
});

test('independent recorded input routes reach genocide removal and shapechange state',async()=>{
    for(const {recipe} of loadMonGenocideCases())
        await verifyMonGenocideSegment(recipe.segments[0]);
});
