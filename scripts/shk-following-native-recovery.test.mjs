import assert from 'node:assert/strict';
import test from 'node:test';
import {setup} from '../experiments/restoration/post53-following-frontier-20261030/native-debug-shop-setup.mjs';
import {game} from '../js/gstate.js';
import {finishElapsedTurn} from '../js/allmain.js';
import {d,rn1,rn2,rnd,rne,rnl,rnz} from '../js/rng.js';
import {hot_pursuit,shk_move,make_happy_shk} from '../js/shk.js';
import {newcham,validspecmon} from '../js/mon.js';
import {PM_WOOD_NYMPH} from '../js/monsters.js';
import {pluslvl} from '../js/exper.js';
import {rloc_to} from '../js/teleport.js';
import {do_improvisation} from '../js/music.js';
import {mksobj} from '../js/obj.js';
import {addinv} from '../js/invent.js';
import {WOODEN_HARP} from '../js/objects.js';
import {make_deaf} from '../js/potion.js';
import {clearTtyMessageWindow} from '../js/tty_message.js';
import {vision_recalc} from '../js/vision.js';
const random={d,rn1,rn2,rnd,rne,rnl,rnz};
async function elapsed(turns) {
    for(let i=0;i<turns;i++) await finishElapsedTurn(game,random);
}
async function following(turns=6) {
    const keeper=await setup(false);
    const message=async()=>{};
    clearTtyMessageWindow(game);
    while(game.u.ulevel<26) await pluslvl(false,game,{message});
    await elapsed(turns);
    hot_pursuit(keeper,game);
    assert.equal(keeper.mpeaceful,false);
    assert.equal(validspecmon(keeper,PM_WOOD_NYMPH,game),true);
    for(const c of 'wood nymph\n') game.nhDisplay.pushKey(c.charCodeAt(0));
    assert.equal(await newcham(keeper,null,{state:game,message}),true);
    for(let i=0;i<100;i++) game.nhDisplay.pushKey(32);
    await rloc_to(keeper,9,8,{state:game}); // intra-home only
    vision_recalc(0);
    const harp=addinv(mksobj(WOODEN_HARP,false,false,{state:game}),{state:game});
    await do_improvisation(harp,game,{message});
    assert.equal(keeper.isshk,true);
    assert.equal(keeper.mpeaceful,true);
    assert.equal(keeper.mextra.eshk.following,true);
    assert.equal(keeper.mextra.eshk.customer,game.plname);
    assert.equal(game.moves,turns+1);
    return keeper;
}
function observe(roll=8) {
    const messages=[],bounds=[];
    return {messages,bounds,env:{message:async s=>messages.push(s),random:{rn2:n=>{
        bounds.push(n);assert.equal(n,9);return roll;
    }}}};
}
// C shk.c:4903-4931: reminder iff moves > followmsg+4; one rn2(9),
// same-turn/cooldown calls consume none; zero riles, nonzero leaves peaceful.
test('native peaceful follower before reminder threshold consumes no RNG',async()=>{
    const keeper=await following(0),o=observe();
    assert.equal(await shk_move(keeper,game,o.env),0);
    assert.deepEqual(o.messages,[]);assert.deepEqual(o.bounds,[]);
    assert.equal(game.gf?.followmsg??0,0);
});
test('native same-customer reminder speaks once and preserves pursuit',async()=>{
    const keeper=await following(),o=observe();
    assert.equal(await shk_move(keeper,game,o.env),0);
    assert.deepEqual(o.bounds,[9]);
    assert.deepEqual(o.messages,['"Hello, wizard!  Didn\'t you forget to pay?"']);
    assert.equal(game.gf.followmsg,7);
    assert.equal(keeper.mpeaceful,true);assert.equal(keeper.mextra.eshk.following,true);
});
test('native reminder cooldown uses strict four-turn threshold',async()=>{
    const keeper=await following(),o=observe();
    await shk_move(keeper,game,o.env);
    await shk_move(keeper,game,o.env);
    await elapsed(4);
    assert.equal(game.moves,11);
    await shk_move(keeper,game,o.env);
    assert.equal(o.messages.length,1);assert.deepEqual(o.bounds,[9]);
    await elapsed(1);
    await shk_move(keeper,game,o.env);
    assert.equal(o.messages.length,2);assert.deepEqual(o.bounds,[9,9]);
    assert.equal(game.gf.followmsg,12);
});
test('native deaf follower reminder uses gesture and same RNG bound',async()=>{
    const keeper=await following(),o=observe();
    await make_deaf(100,false,game,{message:async()=>{}});
    assert.equal(await shk_move(keeper,game,o.env),0);
    assert.equal(o.messages.length,1);
    assert.match(o.messages[0],/holds out her upturned hand\.$/);
    assert.deepEqual(o.bounds,[9]);assert.equal(game.gf.followmsg,7);
});
test('native reminder zero roll riles keeper after speech',async()=>{
    const keeper=await following(),o=observe(0);
    assert.equal(await shk_move(keeper,game,o.env),0);
    assert.equal(o.messages.length,2);
    assert.match(o.messages[0],/Didn't you forget to pay/);
    assert.match(o.messages[1],/doesn't like customers who don't pay\.$/);
    assert.deepEqual(o.bounds,[9]);assert.equal(keeper.mpeaceful,false);
    assert.equal(keeper.mextra.eshk.following,true);assert.equal(keeper.mextra.eshk.surcharge,true);
});
test('native settlement clears pursuit and bypasses reminder',async()=>{
    const keeper=await following(),o=observe();
    await make_happy_shk(keeper,true,game,{message:async()=>{}});
    assert.equal(Boolean(keeper.mextra.eshk.following),false);
    await shk_move(keeper,game,o.env);
    assert.deepEqual(o.messages,[]);assert.deepEqual(o.bounds,[]);
});
