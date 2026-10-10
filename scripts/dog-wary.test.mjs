// Source-derived branches of dog.c:wary_dog (1292-1360).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as dog from '../js/dog.js';
import { bhitm } from '../js/zap.js';
import { game } from '../js/gstate.js';
import { SPE_STONE_TO_FLESH, SPBOOK_CLASS } from '../js/objects.js';
import { M_AP_MONSTER, M_AP_NOTHING } from '../js/const.js';
import { M1_NOEYES, S_FELINE, S_HUMAN } from '../js/monsters.js';

function fixture(overrides = {}) {
    // Nonzero pet-history sentinels distinguish death resets from retained
    // life-saving values. Hunger 900 exceeds moves 100 plus C's 500 floor.
    const edog = { mhpmax_penalty: 0, killed_by_u: 0, abuse: 0,
        revivals: 2, ogoal: { x: 4, y: 5 }, hungrytime: 900,
        droptime: 7, dropdist: 9, whistletime: 11, apport: 8,
        ...overrides.edog };
    // Ordinary eyes and empty monster flags isolate tameness from anatomy.
    // Tameness ten gives rn2(11); HP six/max twelve let healing be checked.
    // Coordinates four/five pin redraw order; meating three is an active meal.
    const monster = { data: { mflags1: 0, mflags2: 0, mflags3: 0, mlet: S_HUMAN },
        mx: 4, my: 5, mtame: 10, mpeaceful: true, mhp: 6, mhpmax: 12,
        meating: 3, m_ap_type: M_AP_NOTHING, mextra: { edog },
        ...overrides.monster };
    const state = { moves: 100, u: { uprops: {} }, youmonst: { data: monster.data } };
    const events = [];
    const draws = [...(overrides.draws ?? [])];
    const env = { state, canSee: () => true, canSpot: () => true,
        random: { rn2(bound) {
            const draw = draws.shift();
            assert.ok(draw, `unexpected rn2(${bound})`);
            assert.equal(bound, draw[0]);
            events.push(['rn2',bound]);
            return draw[1];
        } },
        redraw: (x,y) => events.push(['redraw',x,y]),
        message: async text => events.push(['message',text]),
    };
    return { monster, edog, state, env, events, draws };
}

test('wary_dog finishes eating before its untame return', async () => {
    const f = fixture({ monster: { mtame: 0, m_ap_type: M_AP_MONSTER, mappearance: 42 } });
    // An untame non-mimic still loses its temporary eating disguise.
    await dog.wary_dog(f.monster, true, f.env);
    assert.equal(f.monster.meating, 0);
    assert.equal(f.monster.m_ap_type, M_AP_NOTHING);
    assert.equal(f.monster.mappearance, 0);
    assert.deepEqual(f.events, [['redraw',4,5]]);
});

test('hero-killed pet heals starvation first and draws even rn2(1)', async () => {
    for (const killed of [1,true]) { // C integer and canonical JS xkilled flag.
        const f=fixture({ edog: { killed_by_u: killed, mhpmax_penalty: 4 }, draws: [[1,0]] });
        await dog.wary_dog(f.monster,true,f.env);
        assert.equal(f.monster.mhpmax,16); // Twelve plus restored penalty four.
        assert.equal(f.monster.mhp,10); // Six plus restored penalty four.
        assert.equal(f.edog.mhpmax_penalty,0);
        assert.equal(f.monster.mtame,0);
        assert.equal(f.monster.mpeaceful,1);
        assert.deepEqual(f.events,[['rn2',1],['redraw',4,5]]);
    }
});

test('abuse boundaries preserve C hostility and peacefulness draws', async () => {
    // Abuse > 2 enters this arm; only [0,10) permits the peace draw.
    for (const abuse of [3,9,10,-1]) {
        const f=fixture({edog:{abuse,killed_by_u:1}, draws: abuse>=0&&abuse<10 ? [[abuse+1,1]] : []});
        await dog.wary_dog(f.monster,true,f.env);
        assert.equal(f.monster.mtame,0);
        assert.equal(f.monster.mpeaceful,0);
        assert.equal(f.draws.length,0);
    }
});

test('still-tame revival resets pet slate and death-only fields', async () => {
    for (const dead of [false,true]) {
        const f=fixture({ edog:{abuse:2,hungrytime:900}, draws:[[11,7]] });
        // Tameness ten consumes rn2(11); seven retains the pet.
        await dog.wary_dog(f.monster,dead,f.env);
        assert.equal(f.monster.mtame,7);
        assert.equal(f.monster.mpeaceful,true);
        assert.equal(f.edog.revivals,3);
        assert.equal(f.edog.killed_by_u,0);
        assert.equal(f.edog.abuse,0);
        assert.deepEqual(f.edog.ogoal,{x:-1,y:-1});
        assert.equal(f.edog.hungrytime,dead?600:900); // moves+500, always for death.
        assert.deepEqual([f.edog.droptime,f.edog.dropdist,f.edog.whistletime,f.edog.apport],
            dead?[0,10000,0,5]:[7,9,11,8]); // C death reset versus life-saving retention.
        assert.deepEqual(f.events,[['rn2',11]]);
    }
    const f=fixture({edog:{hungrytime:599},draws:[[11,1]]});
    await dog.wary_dog(f.monster,false,f.env);
    assert.equal(f.edog.hungrytime,600); // Below the strict moves+500 floor.
});

test('minions bypass edog and zero tameness draws peacefulness', async () => {
    const f=fixture({monster:{isminion:true,mextra:{}},draws:[[11,0],[2,0]]});
    await dog.wary_dog(f.monster,true,f.env);
    assert.equal(f.monster.mtame,0);
    assert.equal(f.monster.mpeaceful,0);
    assert.deepEqual(f.events,[['rn2',11],['rn2',2],['redraw',4,5]]);
});

test('life-saving feedback respects visibility and hero and pet eyes', async () => {
    const f=fixture({edog:{killed_by_u:1},draws:[[1,0]]});
    await dog.wary_dog(f.monster,false,f.env);
    assert.equal(f.events[1][0],'message');
    assert.match(f.events[1][1],/seems unable to look you in the eye\./u);
    assert.match(f.events[2][1],/is no longer tame\./u);
    assert.deepEqual(f.events[3],['redraw',4,5]);
    const blindPet=fixture({edog:{abuse:3},draws:[[4,1]]});
    blindPet.monster.data={...blindPet.monster.data,mflags1:M1_NOEYES};
    await dog.wary_dog(blindPet.monster,false,blindPet.env);
    assert.match(blindPet.events[1][1],/avoids your gaze\./u);
    assert.match(blindPet.events[2][1],/has become feral\./u);
    const unseen=fixture({edog:{killed_by_u:1},draws:[[1,0]]});
    unseen.env.canSee=unseen.env.canSpot=()=>false;
    await dog.wary_dog(unseen.monster,false,unseen.env);
    assert.deepEqual(unseen.events,[['rn2',1],['redraw',4,5]]);
    const eyelessHero=fixture({edog:{killed_by_u:1},draws:[[1,0]]});
    eyelessHero.state.youmonst.data={...eyelessHero.monster.data,mflags1:M1_NOEYES};
    await dog.wary_dog(eyelessHero.monster,false,eyelessHero.env);
    assert.equal(eyelessHero.events.filter(event=>event[0]==='message').length,1,
        'no hero eyes suppress the gaze warning but preserve the tameness notice');
});

test('stone-to-flesh beam leaves ordinary creatures asleep after statue revival', async () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/zap.c', import.meta.url), 'utf8');
    // zap.c:490-520 compares the monster class to S_GOLEM/S_MIMIC and
    // assigns wake=FALSE for ordinary creatures. The revived kitten is hit
    // by this same spell's continuation after animate_statue returns it.
    assert.match(source, /case SPE_STONE_TO_FLESH:\s+if \(mtmp->data->mlet == S_GOLEM\)/u);
    const monster = { data: { mlet: S_FELINE }, mx: 4, my: 5,
        mhp: 6, msleeping: true, m_ap_type: M_AP_NOTHING };
    const state = { u: { ustuck: null }, gn: {} };
    const result = await bhitm(monster,
        { otyp: SPE_STONE_TO_FLESH, oclass: SPBOOK_CLASS }, state,
        { rn2: () => assert.fail('ordinary flesh has no RNG branch') });
    assert.equal(result, 0); // C leaves ret at its initial zero value.
    assert.equal(monster.msleeping, true);
});

test('wary_dog releases a leash before retaining only the thrown-steed gap', async () => {
    const f=fixture({monster:{mleashed:true},edog:{killed_by_u:1},draws:[[1,0]]});
    f.state.u.usteed=f.monster;
    const previous=game.unported;
    game.unported=new Set();
    try {
        await dog.wary_dog(f.monster,true,f.env);
        assert.deepEqual([...game.unported],['steed.c dismount_steed']);
        assert.equal(f.monster.mleashed,0,'m_unleash clears the monster attachment');
        assert.equal(f.state.u.usteed,f.monster,'no invented thrown dismount');
        assert.deepEqual(f.events,[
            ['rn2',1],
            ['redraw',4,5],
            ['message','Your leash falls slack.'],
        ]);
    } finally { game.unported=previous; }
});

test('wary_dog planning suppresses live redraw and message defaults', async () => {
    const f=fixture({edog:{killed_by_u:1},draws:[[1,0]]});
    delete f.env.message;
    delete f.env.redraw;
    f.env.planning=true;
    await dog.wary_dog(f.monster,false,f.env);
    assert.deepEqual(f.events,[['rn2',1]]);
    assert.equal(f.monster.mtame,0);
});
