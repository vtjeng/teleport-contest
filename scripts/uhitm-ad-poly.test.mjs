import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ANTIMAGIC, HALF_PHDAM, UNCHANGING, M_ATTK_HIT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mon_poly } from '../js/mhitm.js';
import { newMonster } from '../js/monst.js';
import { NON_PM, PM_GENETIC_ENGINEER, PM_NEWT, PM_BABY_GRAY_DRAGON } from '../js/monsters.js';
import { mhitm_adtyping } from '../js/uhitm.js';

const source = (file) => readFileSync(new URL(`../nethack-c/upstream/src/${file}`, import.meta.url), 'utf8');
const C = source('uhitm.c');
const MC = source('mhitm.c');
async function start() {
    // Independent B113 clock and seed initialize ordinary, source-owned state.
    await runSegment({seed:12853101, datetime:'20560703121900', moves:'',
        nethackrc:'OPTIONS=name:PolyTest,role:Wizard,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n'});
    game.flags.sparkle = false;
    game.gv.vis = false;
    return game;
}
function monster(state, pm, extra = {}) {
    // Twenty HP and a one-level defender keep source system shock nonlethal;
    // adjacent coordinates allow the production naming and defense helpers.
    return newMonster({data:state.mons[pm],mnum:pm,mx:state.u.ux+1,my:state.u.uy,
        mhp:20,mhpmax:21,m_lev:1,cham:NON_PM,mcan:false,mspec_used:0,...extra});
}
function environment(values = []) {
    const draws=[], lines=[];
    return { draws, lines, env:{ message:async(line)=>lines.push(line), unsupported:assert.fail,
        random:{rn2(bound){const [expected,value]=values.shift()??[];assert.equal(bound,expected);draws.push(bound);return value;},
            rnd(){assert.fail('unexpected rnd');}}, }, done(){assert.equal(values.length,0);} };
}

test('AD_POLY dispatch and nonlethal gates follow the complete C handler', () => {
    assert.match(C,/boolean negated = \(mhitm_mgc_atk_negated\(magr, mdef, FALSE\)\s*\|\| magr->mspec_used\)/u);
    assert.match(C,/if \(!uwep && mhm->damage < mdef->mhp\)/u);
    assert.match(C,/Maybe_Half_Phys\(mhm->damage\) < \(Upolyd \? u\.mh : u\.uhp\)/u);
    assert.match(C,/case AD_POLY:\s*mhitm_ad_poly\(magr, mattk, mdef, mhm\);/u);
    assert.match(MC,/dmg \+= \(mdef->mhpmax \+ 1\) \/ 2;/u);
    assert.match(MC,/if \(mdef->data != oldform && magr != &gy\.youmonst\)\s*magr->mspec_used \+= rnd\(2\);/u);
});

test('a cancelled monster hits but cannot transform the hero or spend negation RNG', async () => {
    const state=await start(); const attacker=monster(state,PM_GENETIC_ENGINEER,{mcan:true});
    const effect=environment();const mhm={damage:1,hitflags:0,done:false};
    await mhitm_adtyping(attacker,attacker.data.mattk[0],state.youmonst,mhm,state,effect.env);
    effect.done();assert.deepEqual(effect.draws,[]);
    assert.deepEqual(effect.lines,['The genetic engineer hits!',"You aren't transformed."]);
    assert.deepEqual(mhm,{damage:1,hitflags:0,done:false});
});

test('cooldown still draws magical cancellation before refusing polymorph', async () => {
    const state=await start(); const attacker=monster(state,PM_GENETIC_ENGINEER,{mspec_used:1});
    // rn2(10)=9 exceeds every source armor-negation threshold.
    const effect=environment([[10,9]]);const mhm={damage:1,hitflags:0,done:false};
    await mhitm_adtyping(attacker,attacker.data.mattk[0],state.youmonst,mhm,state,effect.env);
    effect.done();assert.deepEqual(effect.draws,[10]);assert.equal(mhm.done,false);
    assert.deepEqual(effect.lines,['The genetic engineer hits!']);
});

test('HALF_PHDAM rounds up at the lethal gate before calling mon_poly', async () => {
    const state=await start();state.u.uprops[HALF_PHDAM].intrinsic=1;state.u.uhp=2;
    const attacker=monster(state,PM_GENETIC_ENGINEER);
    // Three damage becomes two, exactly lethal to a two-HP human hero.
    const effect=environment([[10,9]]);const mhm={damage:3,hitflags:0,done:false};
    await mhitm_adtyping(attacker,attacker.data.mattk[0],state.youmonst,mhm,state,effect.env);
    effect.done();assert.equal(mhm.done,false);assert.equal(mhm.damage,3);
});

test('Unchanging retains hit damage but the nonnegated effect completes', async () => {
    const state=await start();state.u.uprops[UNCHANGING].intrinsic=1;
    const attacker=monster(state,PM_GENETIC_ENGINEER);
    const effect=environment([[10,9]]);const mhm={damage:1,hitflags:0,done:false};
    await mhitm_adtyping(attacker,attacker.data.mattk[0],state.youmonst,mhm,state,effect.env);
    effect.done();assert.deepEqual(mhm,{damage:1,hitflags:M_ATTK_HIT,done:true});
});

test('weapon and lethal damage suppress hero polymorph after the cancellation draw', async () => {
    for(const armed of [false,true]) {
        const state=await start();const target=monster(state,PM_NEWT);
        state.uwep=armed?state.invent:null;
        // Unarmed twenty damage equals target HP; armed one damage is nonlethal.
        const damage=armed?1:20; const effect=environment([[10,9]]);
        const mhm={damage,hitflags:0,done:false};
        await mhitm_adtyping(state.youmonst,state.mons[PM_GENETIC_ENGINEER].mattk[0],target,mhm,state,effect.env);
        effect.done();assert.deepEqual(effect.draws,[10]);assert.equal(mhm.done,false);
    }
});

test('Antimagic preserves hero hit damage without a transformation', async () => {
    const state=await start();state.u.uprops[ANTIMAGIC].intrinsic=1;
    const attacker=monster(state,PM_GENETIC_ENGINEER);const effect=environment();
    assert.equal(await mon_poly(attacker,state.youmonst,1,state,effect.env),1);
    effect.done();assert.deepEqual(effect.draws,[]);assert.deepEqual(effect.lines,[]);
});

test('magic-resistant form bypasses the general resist and shock draws', async () => {
    const state=await start();const attacker=monster(state,PM_GENETIC_ENGINEER);
    const target=monster(state,PM_BABY_GRAY_DRAGON);const effect=environment();
    // resists_magm() recognizes the baby gray dragon source species directly.
    assert.equal(await mon_poly(attacker,target,1,state,effect.env),1);
    effect.done();assert.deepEqual(effect.draws,[]);assert.equal(target.mhp,20);
});

test('system shock deducts incoming damage plus rounded half maximum HP once', async () => {
    const state=await start();const attacker=monster(state,PM_GENETIC_ENGINEER);
    const target=monster(state,PM_NEWT,{mcan:true});
    // WAND_CLASS attack level 12 and defender level 1 produce bound 111;
    // newt MR 0 always fails resist. The zero in rn2(25) chooses system shock.
    const effect=environment([[111,1],[25,0]]);
    assert.equal(await mon_poly(attacker,target,1,state,effect.env),0);
    effect.done();assert.deepEqual(effect.draws,[111,25]);
    // (21+1)/2 = 11, plus one incoming damage, leaves 8 of 20 HP.
    assert.equal(target.mhp,8);assert.equal(attacker.mspec_used,0);
});

test('planning requests the existing live replay boundary without changing either actor', async () => {
    const state=await start();const attacker=monster(state,PM_GENETIC_ENGINEER);
    const marker=new Error('planning input marker');const effect=environment();
    await assert.rejects(mon_poly(attacker,state.youmonst,1,state,{...effect.env,planning:true,
        requestPlanningInput(operation){assert.equal(operation,'mon_poly');throw marker;}}),error=>error===marker);
    effect.done();assert.deepEqual(effect.draws,[]);assert.deepEqual(effect.lines,[]);
    assert.equal(attacker.mspec_used,0);
});


test('general magic resistance keeps incoming damage and skips system shock', async () => {
    const state=await start();const attacker=monster(state,PM_NEWT);
    const target=monster(state,PM_GENETIC_ENGINEER,{mx:1,my:1});
    // The offscreen target keeps TELL’s shield/message helper invisible.
    // Genetic engineer MR 10 resists a zero draw; WAND_CLASS and level one
    // again produce bound 111. Resist does not deduct the zero damage argument.
    const effect=environment([[111,0]]);
    assert.equal(await mon_poly(attacker,target,1,state,effect.env),1);
    effect.done();assert.deepEqual(effect.draws,[111]);assert.equal(target.mhp,20);
});

test('monster-target lethal hit stops after the mandatory magical-negation draw', async () => {
    const state=await start();const attacker=monster(state,PM_GENETIC_ENGINEER);
    const target=monster(state,PM_NEWT);const effect=environment([[10,9]]);
    // Equal damage and target HP fails C's strict less-than polymorph gate.
    const mhm={damage:20,hitflags:0,done:false};
    await mhitm_adtyping(attacker,attacker.data.mattk[0],target,mhm,state,effect.env);
    effect.done();assert.deepEqual(effect.draws,[10]);assert.equal(mhm.done,false);
});
