// Source-pinned spell.c:cast_protection1104–1178 integer/feedback/order checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLINDED, CLOUD, HALLUC, P_CLERIC_SPELL, P_EXPERT, ROOM, STONE, TREE } from '../js/const.js';
import { monst_globals_init, PM_HUMAN, PM_FOG_CLOUD, PM_ENERGY_VORTEX, PM_TRAPPER, PM_PURPLE_WORM, PM_GRAY_OOZE } from '../js/monsters.js';
import { objects_globals_init, RIN_PROTECTION } from '../js/objects.js';

function hero(level = 1, naturalAc = 10) {
    // The C table covers natural AC10/0/-10. A protection ring supplies the
    // latter two values without changing the canonical human species AC10.
    const state = { u: { ulevel: level, uac: naturalAc, uspellprot: 0,
        uspmtime: 0, usptime: 0, umonnum: PM_HUMAN, ux: 1, uy: 1,
        uprops: [], weapon_skills: [] }, level: { flags: {}, at: () => ({typ: ROOM}) } };
    monst_globals_init(state);
    objects_globals_init(state);
    if (naturalAc !== 10) state.uleft = {otyp: RIN_PROTECTION, spe: 10 - naturalAc};
    return state;
}
async function owner() {
    const { cast_protection } = await import('../js/spell.js');
    assert.equal(typeof cast_protection, 'function');
    return cast_protection;
}

test('cast_protection follows the source diminishing-protection table', async () => {
    const cast = await owner();
    const source = readFileSync('nethack-c/upstream/src/spell.c','utf8');
    assert.match(source, /natac = \(10 - natac\) \/ 10;/u);
    assert.match(source, /gain = loglev - \(int\) u.uspellprot \/ \(4 - min\(3, natac\)\);/u);
    // First three nonzero entries from the source table, levels1/2/4/8/16.
    const rows = [[1,10,[1,2,3]],[1,0,[1,2,3]],[1,-10,[1,2,2]],
        [2,10,[2,4,5]],[2,0,[2,4,5]],[2,-10,[2,3,4]],
        [4,10,[3,6,8]],[4,0,[3,5,7]],[4,-10,[3,5,6]],
        [8,10,[4,7,10]],[8,0,[4,7,9]],[8,-10,[4,6,7]],
        [16,10,[5,9,12]],[16,0,[5,9,11]],[16,-10,[5,8,9]]];
    for (const [level, ac, totals] of rows) {
        const state = hero(level,ac);
        for (const total of totals) {
            await cast(state,{message() {}});
            assert.equal(state.u.uspellprot,total);
            assert.equal(state.u.uac,ac-total);
        }
    }
});

test('cast_protection awaits feedback before state and preserves a running timer', async () => {
    const cast = await owner(); const state=hero(8);
    state.u.weapon_skills[P_CLERIC_SPELL]={skill:P_EXPERT};
    state.u.usptime=7; // Existing timer must survive the source !usptime guard.
    let release; const gate=new Promise(resolve=>{release=resolve;}); let settled=false;
    const pending=cast(state,{async message(text){
        assert.equal(text,'The air around you begins to shimmer with a golden haze.');
        assert.equal(state.u.uspellprot,0); assert.equal(state.u.uspmtime,0);
        await gate;
    }}).then(()=>{settled=true;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(settled,false); assert.equal(state.u.uac,10);
    release();await pending;
    assert.equal(state.u.uspellprot,4);assert.equal(state.u.uac,6);
    assert.equal(state.u.uspmtime,20);assert.equal(state.u.usptime,7);
    assert.equal(state.disp.botl,true);
    const basic=hero();await cast(basic,{message(){}});
    assert.equal(basic.u.uspmtime,10);assert.equal(basic.u.usptime,10);
});

test('cast_protection uses the source atmosphere precedence', async () => {
    const cast=await owner();
    // Source nested ternary: swallowed mist,whirl,wrap,animal,otherwiseooze.
    for(const [species,atmosphere] of [[PM_FOG_CLOUD,'mist'],[PM_ENERGY_VORTEX,'maelstrom'],[PM_TRAPPER,'folds'],[PM_PURPLE_WORM,'maw'],[PM_GRAY_OOZE,'ooze']]){
        const state=hero();state.u.ustuck={data:state.mons[species]};state.u.uswallow=true;state.u.uinwater=true;
        const messages=[];await cast(state,{message:text=>messages.push(text)});
        assert.deepEqual(messages,['The '+atmosphere+' around you begins to shimmer with a golden haze.']);
    }
    for(const [typ,inwater,arboreal,atmosphere] of [[ROOM,true,false,'water'],[CLOUD,false,false,'cloud'],[TREE,false,false,'vegetation'],[STONE,false,true,'vegetation'],[STONE,false,false,'stone'],[ROOM,false,false,'air']]){
        const state=hero();state.level.at=()=>({typ});state.level.flags.arboreal=arboreal;state.u.uinwater=inwater;
        const messages=[];await cast(state,{message:text=>messages.push(text)});
        assert.deepEqual(messages,['The '+atmosphere+' around you begins to shimmer with a golden haze.']);
    }
});

test('cast_protection blind and no-gain branches preserve their distinct feedback', async () => {
    const cast=await owner();const blind=hero();blind.u.uprops[BLINDED]={intrinsic:1};
    await cast(blind,{message(){assert.fail('positive blind gain has no message');},displayRandom(){assert.fail('blind branch must not name colors');}});
    assert.equal(blind.u.uspellprot,1);assert.equal(blind.u.uac,9);
    const full=hero();full.u.uspellprot=4;full.u.uac=6;full.u.usptime=3;full.u.uspmtime=20;
    const messages=[];await cast(full,{message:text=>messages.push(text)});
    assert.deepEqual(messages,['Your skin feels warm for a moment.']);
    assert.equal(full.u.uspellprot,4);assert.equal(full.u.usptime,3);assert.equal(full.u.uspmtime,20);
    assert.equal(full.disp,undefined);
});

test('cast_protection names color before water and avoids atmosphere lookup on repeats', async () => {
    const cast=await owner();const state=hero(2);state.u.uprops[HALLUC]={intrinsic:1};state.u.uinwater=true;
    const draws=[];const messages=[];
    await cast(state,{displayRandom:bound=>{draws.push(bound);return 0;},message:text=>messages.push(text)});
    assert.equal(draws.length,2); // hcolor, then hliquid when hallucinating.
    assert.match(messages[0],/^The .* around you begins to shimmer with an? .* haze\.$/u);
    draws.length=0;state.level.at=()=>{assert.fail('existing protection skips atmosphere');};
    await cast(state,{displayRandom:bound=>{draws.push(bound);return 0;},message:text=>messages.push(text)});
    assert.equal(draws.length,1); // hcolor only, prior protection branch.
    assert.match(messages[1],/^The .* haze around you becomes more dense\.$/u);
});

test('cast_protection truncates negative natural-AC fractions and caps the denominator term', async () => {
    const cast = await owner();
    const negative = hero(2, 11); // (10-naturalAC)/10 is -0.1: C yields zero.
    negative.u.uspellprot = 4;
    negative.u.uac = 7; // Restore naturalAC11 after adding prior protection4.
    await cast(negative, {message() {}});
    assert.equal(negative.u.uspellprot, 5); // Floor would incorrectly grant two.
    const capped = hero(16, -40); // natac5 exceeds the explicit min(3,natac).
    const messages = [];
    await cast(capped, {message:text => messages.push(text)});
    await cast(capped, {message:text => messages.push(text)});
    assert.equal(capped.u.uspellprot, 5); // Denominator1 prevents further gain.
    assert.equal(messages[1], 'Your skin feels warm for a moment.');
});
