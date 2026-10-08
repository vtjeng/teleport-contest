import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as ballOwner from '../js/ball.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {clearTtyMessageWindow} from '../js/tty_message.js';
import {mksobj} from '../js/obj.js';
import {objectGenerationEnv} from '../js/object_generation.js';
import {HEAVY_IRON_BALL,HELMET,FEDORA} from '../js/objects.js';
import {PM_FLOATING_EYE} from '../js/monsters.js';
import {HALF_PHDAM,OBJ_FLOOR,OBJ_INVENT,OBJ_FREE,W_WEP,NO_KILLER_PREFIX} from '../js/const.js';

const c=readFileSync('nethack-c/upstream/src/ball.c','utf8');
// Independent initialized hero: no monsters/pet act during these direct checks.
const input={seed:1432801,datetime:'20551204112213',nethackrc:'OPTIONS=name:BallFall,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug,pettype:none,!acoustics,!autopickup,!debug_mongen\n',moves:''};
async function fixture(){
    await runSegment(input);
    // The completed startup replay can leave its welcome line pending. These
    // direct owner checks start with an empty canonical tty message window.
    clearTtyMessageWindow(game);
    const ball=mksobj(HEAVY_IRON_BALL,false,false,objectGenerationEnv({state:game}));
    // Neighboring coordinates activate C's hit-chance term; floor ownership
    // leaves ballrelease a no-op unless a test explicitly carries the ball.
    ball.where=OBJ_FLOOR;ball.ox=game.u.ux+1;ball.oy=game.u.uy;
    game.uball=ball;game.uarmh=null;
    game.u.uhp=game.u.uhpmax=100; // Survive C's maximum unprotected damage31.
    game.u.uprops[HALF_PHDAM].intrinsic=0;game.u.uprops[HALF_PHDAM].extrinsic=0;
    return ball;
}
function effects({chance=1,roll=3}={}){
    const calls=[],messages=[];
    return {calls,messages,env:{random:{rn2(bound){calls.push(['rn2',bound]);return chance;},rn1(bound,base){calls.push(['rn1',bound,base]);return base+roll;},rnd(){throw Error('unexpected rnd');},rne(){throw Error('unexpected rne');}},message:async text=>messages.push(text)}};
}

test('ballfall source guard, hit expression and ordered damage call have a canonical owner',()=>{
    assert.match(c,/if \(!uball \|\| \(uball && carried\(uball\) && welded\(uball\)\)\)/u);
    assert.match(c,/\(uwep == uball\) \? FALSE : \(boolean\) rn2\(5\)/u);
    assert.match(c,/ballrelease\(TRUE\);[\s\S]*?int dmg = rn1\(7, 25\);/u);
    assert.match(c,/dmg = 3;[\s\S]*?losehp\(Maybe_Half_Phys\(dmg\), "crunched in the head by an iron ball",\s*NO_KILLER_PREFIX\)/u);
    assert.equal(typeof ballOwner.ballfall,'function');
});

// These values pin source short-circuit paths and the exact bounded draws,
// rather than copying an admitted case's expected damage or RNG result.
test('ballfall null, welded carried and colocated balls skip all draws',async()=>{
    let ball=await fixture();let e=effects();game.uball=null;
    await ballOwner.ballfall(game,e.env);assert.deepEqual(e.calls,[]);assert.deepEqual(e.messages,[]);
    game.uball=ball;ball.where=OBJ_INVENT;ball.cursed=true;game.uwep=ball;
    await ballOwner.ballfall(game,e.env);assert.deepEqual(e.calls,[]);assert.equal(game.uwep,ball);
    ball=await fixture();ball.ox=game.u.ux;ball.oy=game.u.uy;e=effects();
    await ballOwner.ballfall(game,e.env);assert.deepEqual(e.calls,[]);assert.deepEqual(e.messages,[]);
});

test('ballfall zero chance draws only rn2(5) and applies no damage',async()=>{
    await fixture();const e=effects({chance:0});await ballOwner.ballfall(game,e.env);
    assert.deepEqual(e.calls,[['rn2',5]]);assert.deepEqual(e.messages,[]);assert.equal(game.u.uhp,100);
});

test('ballfall computes a wielded carried ball no-hit before releasing its slot',async()=>{
    const ball=await fixture();const e=effects();
    ball.where=OBJ_INVENT;ball.nobj=null;ball.owornmask=W_WEP;
    game.invent=ball;game.uwep=ball;game.go.oldcap=0;
    await ballOwner.ballfall(game,e.env);
    assert.deepEqual(e.calls,[]);
    assert.equal(game.uwep,null);assert.equal(game.invent,null);
    assert.equal(ball.where,OBJ_FREE);assert.equal(game.u.uhp,100);
});

test('ballfall releases an unwielded carried ball before drawing damage',async()=>{
    const ball=await fixture();const e=effects();
    ball.where=OBJ_INVENT;ball.nobj=null;game.invent=ball;game.uwep=null;game.go.oldcap=0;
    const drawDamage=e.env.random.rn1;
    e.env.random.rn1=(bound,base)=>{
        assert.equal(ball.where,OBJ_FREE);assert.equal(game.invent,null);
        return drawDamage(bound,base);
    };
    await ballOwner.ballfall(game,e.env);
    assert.deepEqual(e.calls,[['rn2',5],['rn1',7,25]]);
    assert.equal(game.u.uhp,72); // The fixed offset3 yields damage28.
});

test('ballfall unprotected hit draws rn1(7,25) and uses the source killer',async()=>{
    await fixture();const e=effects();await ballOwner.ballfall(game,e.env);
    assert.deepEqual(e.calls,[['rn2',5],['rn1',7,25]]);
    assert.deepEqual(e.messages,['The iron ball falls on your head.']);
    assert.equal(game.u.uhp,72); // rn1(7,25) with offset3 gives28.
    // losehp stores this exact killer only on death; pin its source argument.
    const js=readFileSync('js/ball.js','utf8');
    assert.match(js,/['"]crunched in the head by an iron ball['"],\s*NO_KILLER_PREFIX/u);
    assert.equal(NO_KILLER_PREFIX,2); // hack.h killer-format constant.
});

test('ballfall rolls full damage before a hard helmet overrides it to3',async()=>{
    await fixture();game.uarmh=mksobj(HELMET,false,false,objectGenerationEnv({state:game}));
    game.flags.verbose=false;const e=effects({roll:6});await ballOwner.ballfall(game,e.env);
    assert.deepEqual(e.calls,[['rn2',5],['rn1',7,25]]);
    assert.deepEqual(e.messages,['The iron ball falls on your head.','Fortunately, you are wearing a hard helmet.']);
    assert.equal(game.u.uhp,97); // C replaces31 with3 even when !verbose.
});

test('ballfall soft helmet feedback follows verbose without reducing damage',async()=>{
    for(const verbose of [false,true]){
        await fixture();game.uarmh=mksobj(FEDORA,false,false,objectGenerationEnv({state:game}));
        game.flags.verbose=verbose;const e=effects({roll:0});await ballOwner.ballfall(game,e.env);
        assert.equal(game.u.uhp,75); // Lowest C damage25, unchanged by cloth.
        assert.equal(e.messages.length,verbose?2:1);
        if(verbose)assert.match(e.messages[1],/fedora does not protect you\.$/u);
    }
});

test('ballfall half-physical damage rounds up after the helmet override',async()=>{
    for(const intrinsic of [true,false]){
        await fixture();const p=game.u.uprops[HALF_PHDAM];p[intrinsic?'intrinsic':'extrinsic']=1;
        const e=effects({roll:0});await ballOwner.ballfall(game,e.env);
        assert.equal(game.u.uhp,87); // (25+1)/2 =13 in hack.h Maybe_Half_Phys.
    }
    await fixture();game.uarmh=mksobj(HELMET,false,false,objectGenerationEnv({state:game}));
    game.u.uprops[HALF_PHDAM].intrinsic=1;await ballOwner.ballfall(game,effects().env);
    assert.equal(game.u.uhp,98); // (3+1)/2 =2 after hard-helmet replacement.
});

test('ballfall plans an uncarried pit impact without writing to live tty or HP',async()=>{
    await fixture();
    const planned={...game,u:{...game.u,uprops:game.u.uprops.map(p=>({...p}))},
        context:{...game.context},disp:{...game.disp},uball:{...game.uball}};
    const before=game.nhDisplay.serialize();const e=effects();
    await ballOwner.ballfall(planned,{planning:true,random:e.env.random});
    assert.equal(planned.u.uhp,72);assert.equal(game.u.uhp,100);
    assert.equal(game.nhDisplay.serialize(),before);
    assert.deepEqual(e.calls,[['rn2',5],['rn1',7,25]]);
});

test('ballfall uses the polymorphed source head anatomy',async()=>{
    await fixture();game.youmonst={...game.youmonst,data:game.mons[PM_FLOATING_EYE]};
    const e=effects();await ballOwner.ballfall(game,e.env);
    // polyself.c sphere_parts[HEAD] calls an eye/sphere's head its body.
    assert.equal(e.messages[0],'The iron ball falls on your body.');
});
