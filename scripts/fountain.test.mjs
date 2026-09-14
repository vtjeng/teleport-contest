// fountain.c dowatersnakes() (38-60).
//
// The running witness reaches the ordinary sighted, non-hallucinating arm.
// This test keeps that arm's source shape visible while isolating its four
// observable responsibilities: rn1(5, 2), the stream message, MM_NOMSG
// moccasin creation at the hero's square, and the common dryup tail.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    ALTAR,
    FIRE_RES,
    FAST,
    FAINTING,
    FOUNTAIN,
    FROMOUTSIDE,
    G_GONE,
    HALLUC,
    LEVITATION,
    MM_NOMSG,
    ROOM,
    SICK,
    SICK_VOMITABLE,
    SINK,
    S_LRING,
    TIMEOUT,
    UNCHANGING,
} from '../js/const.js';
import { breaksink, drinkfountain, drinksink } from '../js/fountain.js';
import { game } from '../js/gstate.js';
import { UnsupportedEatError, vomit } from '../js/eat.js';
import {
    PM_ACID_BLOB,
    PM_SEWER_RAT,
    PM_WATER_ELEMENTAL,
    PM_WATER_MOCCASIN,
    PM_YELLOW_DRAGON,
} from '../js/monsters.js';
import { DILITHIUM_CRYSTAL, LUCKSTONE, POTION_CLASS, POT_SPEED, POT_WATER } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { d, rn1, rn2, rnd, rne } from '../js/rng.js';

// fountain.c drinksink() chooses one of twenty fates, then only its default
// branch draws temperature choices. The scripted queues check short-circuit
// evaluation as well as the message; an extra or omitted draw fails the test.
test('drinksink preserves the default temperature draw order', async () => {
    const source = await readFile(
        new URL('../nethack-c/upstream/src/fountain.c', import.meta.url), 'utf8');
    assert.match(source, /switch \(rn2\(20\)\)/u);
    assert.match(source, /rn2\(3\) \? \(rn2\(2\) \? "cold" : "warm"\) : "hot"/u);
    for (const [draws, temperature] of [
        [[[20, 0]], 'very cold'], // Fate 0 has no temperature draw.
        [[[20, 1]], 'very warm'], // Fate 1 has no temperature draw.
        [[[20, 14], [3, 0]], 'hot'], // First default fate; hot skips rn2(2).
        [[[20, 18], [3, 1], [2, 0]], 'warm'], // Last unconditional default fate.
        [[[20, 19], [3, 2], [2, 1]], 'cold'], // Nonhallucinating 19 falls through.
    ]) {
        await startedGame();
        const pending = [...draws];
        const messages = [];
        await drinksink(game, {
            message: (line) => messages.push(line),
            random: { rn2(bound) {
                const expected = pending.shift();
                assert.ok(expected, `unexpected rn2(${bound})`);
                assert.equal(bound, expected[0]);
                return expected[1];
            } },
        });
        assert.deepEqual(pending, []);
        assert.deepEqual(messages, [`You take a sip of ${temperature} water.`]);
    }
});

test('drinksink rejects water and consumes a temporary uncursed potion', async () => {
    await startedGame();
    // Clear the startup message before dopotion writes its real tty message.
    game._pending_message = '';
    game._ttyToplines = '';
    game._ttyPreviousMessage = '';
    game._ttyMessageStopped = false;
    // Existing intrinsic speed avoids the separate permanent-speed message;
    // the temporary timeout added by the potion remains independently visible.
    game.u.uprops[FAST].intrinsic = FROMOUTSIDE;
    const source = await readFile(
        new URL('../nethack-c/upstream/src/fountain.c', import.meta.url), 'utf8');
    assert.match(source, /if \(otmp->otyp != POT_WATER\)\s+break;/u);
    assert.match(source, /otmp->cursed = otmp->blessed = 0;/u);
    const choices = [POT_WATER, POT_SPEED]; // Rejected first object, consumed retry.
    const totals = game.go.oclass_prob_totals[POTION_CLASS];
    const ident = game.context.ident;
    const inventory = game.invent;
    let fateDrawn = false;
    let bucDraws = 0;
    const random = {
        d, rn1, rne,
        rnd(bound) {
            if (bound === totals) {
                const type = choices.shift();
                assert.ok(type, 'only water should cause a retry');
                // mkobj.c scans the C-generated potion probabilities. Pick
                // the first weight belonging to the selected object type.
                let weight = 1;
                for (let index = game.svb.bases[POTION_CLASS]; index < type; ++index)
                    weight += game.objects[index].oc_prob;
                return weight;
            }
            if (bound === 2) return 1; // next_ident() advances once per object.
            return rnd(bound);
        },
        rn2(bound) {
            if (!fateDrawn) {
                assert.equal(bound, 20);
                fateDrawn = true;
                return 4; // The faucet's random potion branch.
            }
            if (bound === 4 || bound === 2) {
                ++bucDraws;
                return 0; // blessorcurse(4) makes both generated potions cursed.
            }
            return rn2(bound);
        },
    };
    await drinksink(game, { random, message: () => {} });
    assert.deepEqual(choices, []);
    assert.equal(bucDraws, 4); // Both attempts run blessorcurse's two draws.
    assert.equal(game.context.ident, ident + 2); // Both temporary objects allocated.
    assert.equal(game.invent, inventory); // Neither potion entered inventory.
    // potion.c peffect_speed: uncursed duration is rn1(10,100); leaving
    // mkobj's curse in place would subtract 60 turns from that duration.
    const duration = game.u.uprops[FAST].intrinsic & TIMEOUT;
    assert.ok(duration >= 100 && duration < 110);
    assert.ok(game.objects[POT_SPEED].oc_name_known);
});

test('drinksink levitation and hallucinated hand avoid temperature draws', async () => {
    await startedGame();
    const messages = [];
    game.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE;
    await drinksink(game, {
        message: (line) => messages.push(line),
        random: { rn2: () => assert.fail('levitation precedes rn2(20)') },
    });
    assert.deepEqual(messages, ['You are floating high above the sink.']);
    game.u.uprops[LEVITATION].intrinsic = 0; // Permit drinking again.
    game.u.uprops[HALLUC].intrinsic = 1; // Nonzero timeout enables fate 19.
    messages.length = 0;
    let draws = 0;
    await drinksink(game, {
        message: (line) => messages.push(line),
        random: { rn2(bound) {
            assert.equal(bound, 20); // No subsequent rn2(3) in this arm.
            assert.equal(++draws, 1);
            return 19; // fountain.c's hallucinated hand case.
        } },
    });
    assert.equal(draws, 1);
    assert.deepEqual(messages, [
        'From the murky drain, a hand reaches up... --oops--',
    ]);
});

test('breaksink clears sink loot and blessing while updating feature counts', async () => {
    await startedGame();
    const { ux: x, uy: y } = game.u;
    const location = game.level.at(x, y);
    location.typ = SINK;
    location.flags = S_LRING; // Prior ring loot must not become fountain loot.
    location.horizontal = 1; // Sink/fountain field alias must be cleared.
    const messages = [];
    await breaksink(x, y, game, { message: (line) => messages.push(line) });
    assert.deepEqual(messages, ['The pipes break!  Water spurts out!']);
    assert.equal(location.typ, FOUNTAIN);
    assert.equal(location.flags, 1); // rm.h SET_FOUNTAIN_LOOTED sets F_LOOTED=1.
    assert.equal(location.horizontal, 0);
    let fountains = 0;
    let sinks = 0;
    for (const column of game.level.locations)
        for (const square of column) {
            fountains += Number(square.typ === FOUNTAIN);
            sinks += Number(square.typ === SINK);
        }
    assert.equal(game.level.flags.nfountains, fountains);
    assert.equal(game.level.flags.nsinks, sinks);
});

test('drinksink extinct summons and looted ring skip creation', async () => {
    for (const [fate, expected] of [
        [3, ['The sink seems quite dirty.']], // Extinct sewer rat.
        [5, ['Some dirty water backs up in the drain.']], // Already looted ring.
        [7, ['The water moves as though of its own will!', 'But it quiets down.']],
    ]) {
        await startedGame();
        game.mvitals[PM_SEWER_RAT].mvflags |= G_GONE;
        game.mvitals[PM_WATER_ELEMENTAL].mvflags |= G_GONE;
        game.level.at(game.u.ux, game.u.uy).flags = S_LRING;
        const messages = [];
        let draws = 0;
        await drinksink(game, {
            message: (line) => messages.push(line),
            makeMonster: () => assert.fail('extinct species cannot be created'),
            random: { rn2(bound) {
                assert.equal(bound, 20);
                assert.equal(++draws, 1); // No object generation or exercise.
                return fate;
            } },
        });
        assert.equal(draws, 1);
        assert.deepEqual(messages, expected);
    }
});

test('drinksink scalding water respects fire resistance without a damage draw', async () => {
    await startedGame();
    game.u.uprops[FIRE_RES].intrinsic = FROMOUTSIDE;
    const hp = game.u.uhp;
    const messages = [];
    let draws = 0;
    await drinksink(game, {
        message: (line) => messages.push(line),
        random: { rn2(bound) {
            assert.equal(bound, 20);
            assert.equal(++draws, 1);
            return 2; // fountain.c scalding-water fate.
        }, rnd: () => assert.fail('resistance skips rnd(6)') },
    });
    assert.equal(draws, 1);
    assert.equal(game.u.uhp, hp);
    assert.deepEqual(messages, [
        'You take a sip of scalding hot water.', 'It seems quite tasty.',
    ]);
});

test('drinksink records discarded unported effects and respects Unchanging', async () => {
    for (const unchanging of [false, true]) {
        await startedGame();
        game.u.uprops[UNCHANGING].intrinsic = unchanging ? FROMOUTSIDE : 0;
        const messages = [];
        await drinksink(game, {
            message: (line) => messages.push(line),
            random: { rn2(bound) {
                assert.equal(bound, 20);
                return 10; // Toxic-waste fate calls random polyself if allowed.
            } },
        });
        assert.deepEqual(messages, unchanging
            ? ['This water contains toxic wastes!']
            : ['This water contains toxic wastes!', 'You undergo a freakish metamorphosis!']);
        assert.equal(game.unported?.has('polyself.c polyself') ?? false, !unchanging);
    }
    await startedGame();
    const messages = [];
    await drinksink(game, {
        message: (line) => messages.push(line),
        random: { rn2(bound) {
            assert.equal(bound, 20);
            return 13; // Positive-damage gas cloud remains a discarded gap.
        } },
    });
    assert.deepEqual(messages, ['Ew, what a stench!']);
    assert.ok(game.unported.has('region.c create_gas_cloud'));
});

const RC = [
    'OPTIONS=name:SnakeTest,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    '',
].join('\n');

async function startedGame() {
    await runSegment({
        seed: 7712200,
        datetime: '20260801031500',
        nethackrc: RC,
        moves: '',
    });
    return game;
}

test('dowatersnakes follows fountain.c for the ordinary visible arm',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
            'utf8',
        );
        assert.match(source, /int num = rn1\(5, 2\);/u);
        assert.match(
            source,
            /makemon\(&mons\[PM_WATER_MOCCASIN\], u\.ux, u\.uy,\s+MM_NOMSG\)/u,
        );

        await startedGame();
        const location = game.level.at(game.u.ux, game.u.uy);
        location.typ = FOUNTAIN;
        location.horizontal = 0;
        location.flags = 0;

        const messages = [];
        const creations = [];
        const random = {
            rnd(bound) {
                assert.equal(bound, 30);
                return 22;
            },
            rn1(bound, base) {
                assert.equal(bound, 5);
                assert.equal(base, 2);
                return 4;
            },
            rn2(bound) {
                assert.equal(bound, 3);
                return 0;
            },
        };
        const makeMonster = async (species, x, y, flags) => {
            creations.push({ species, x, y, flags });
            return {
                data: species,
                mx: x + 1,
                my: y,
            };
        };

        await drinkfountain(game, { message: (line) => messages.push(line),
            makeMonster, random });

        assert.deepEqual(messages, [
            'An endless stream of snakes pours forth!',
            'The fountain dries up!',
        ]);
        assert.equal(creations.length, 4);
        for (const creation of creations) {
            assert.equal(creation.species, game.mons[PM_WATER_MOCCASIN]);
            assert.deepEqual([creation.x, creation.y], [game.u.ux, game.u.uy]);
            assert.equal(creation.flags, MM_NOMSG);
        }
        assert.equal(location.typ, ROOM);
    });

test('dowatersnakes leaves unsupported visibility/extinction arms fail-closed',
    async () => {
        await startedGame();
        const location = game.level.at(game.u.ux, game.u.uy);
        location.typ = FOUNTAIN;
        location.horizontal = 0;
        location.flags = 0;
        game.mvitals[PM_WATER_MOCCASIN].mvflags |= G_GONE;

        await assert.rejects(
            () => drinkfountain(game, {
                random: { rnd: () => 22, rn1: () => 4, rn2: () => 1 },
                message: () => {},
            }),
            /extinct water-snake fountain effect/u,
        );
    });

test('drinkfountain follows fountain.c foul-water fate 20', async () => {
    const source = await readFile(
        new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /case 20:[\s\S]*?pline_The\("water is foul!  You gag and vomit\."\);[\s\S]*?morehungry\(rn1\(20, 11\)\);[\s\S]*?vomit\(\);/u,
    );

    await startedGame();
    const location = game.level.at(game.u.ux, game.u.uy);
    location.typ = FOUNTAIN;
    location.horizontal = 0;
    location.flags = 0;
    game.multi = 0;
    const hungerBefore = game.u.uhunger;
    const messages = [];
    const draws = [];
    const random = {
        rnd(bound) {
            draws.push(`rnd(${bound})`);
            assert.equal(bound, 30);
            return 20;
        },
        rn1(bound, base) {
            draws.push(`rn1(${bound},${base})`);
            assert.equal(bound, 20);
            assert.equal(base, 11);
            return 20;
        },
        rn2(bound) {
            draws.push(`rn2(${bound})`);
            assert.equal(bound, 3);
            return 0;
        },
    };

    await drinkfountain(game, {
        message: (line) => messages.push(line),
        random,
    });

    assert.deepEqual(draws, ['rnd(30)', 'rn1(20,11)', 'rn2(3)']);
    assert.deepEqual(messages, [
        'The water is foul!  You gag and vomit.',
        'The fountain dries up!',
    ]);
    assert.equal(game.u.uhunger, hungerBefore - 20);
    assert.equal(game.multi, -2);
    assert.equal(game.multi_reason, 'vomiting');
    assert.equal(game.nomovemsg, 'You can move again.');
    assert.equal(location.typ, ROOM);
    assert.equal(location.horizontal, 0);
    assert.equal(location.flags, 0);
});

test('drinkfountain follows fountain.c unlooted find-gem fate 27', async () => {
    const source = await readFile(
        new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /case 27:[\s\S]*?if \(!FOUNTAIN_IS_LOOTED\(u\.ux, u\.uy\)\)[\s\S]*?dofindgem\(\);[\s\S]*?break;[\s\S]*?FALLTHROUGH;/u,
    );

    await startedGame();
    const location = game.level.at(game.u.ux, game.u.uy);
    location.typ = FOUNTAIN;
    location.horizontal = 0;
    location.flags = 0;
    const beforeObjects = [];
    for (let object = game.level.objects[game.u.ux][game.u.uy];
        object;
        object = object.nexthere) {
        beforeObjects.push(object);
    }
    const messages = [];
    const draws = [];
    const unexpected = (name) => (...args) => {
        throw new Error(`unexpected ${name}(${args.join(',')}) draw`);
    };
    const random = {
        rnd(bound) {
            draws.push(`rnd(${bound})`);
            // Fate 27 selects the find-gem branch; rnd(30) is from
            // fountain.c:247 and the value is the investigator's C draw.
            if (bound === 30) return 27;
            // The gem range's source probabilities sum to 862; this value
            // selects the same weighted gem as the investigator's C trace.
            if (bound === 862) return 529;
            // mksobj() calls next_ident(), whose patched C rnd(2) draw is 2.
            if (bound === 2) return 2;
            throw new Error(`unexpected rnd(${bound}) draw`);
        },
        rn2(bound) {
            draws.push(`rn2(${bound})`);
            // exercise(A_WIS, TRUE) uses rn2(19); dryup() then uses rn2(3).
            if (bound === 19) return 5;
            if (bound === 3) return 0;
            throw new Error(`unexpected rn2(${bound}) draw`);
        },
        rn1: unexpected('rn1'),
        rne: unexpected('rne'),
    };

    await drinkfountain(game, {
        message: (line) => messages.push(line),
        random,
    });

    assert.deepEqual(draws, [
        'rnd(30)', 'rnd(862)', 'rnd(2)', 'rn2(19)', 'rn2(3)',
    ]);
    assert.deepEqual(messages, [
        'You spot a gem in the sparkling waters!',
        'The fountain dries up!',
    ]);
    const createdObjects = [];
    for (let object = game.level.objects[game.u.ux][game.u.uy];
        object;
        object = object.nexthere) {
        if (!beforeObjects.includes(object)) createdObjects.push(object);
    }
    assert.equal(createdObjects.length, 1);
    assert.ok(
        createdObjects[0].otyp >= DILITHIUM_CRYSTAL
            && createdObjects[0].otyp < LUCKSTONE,
    );
    // dryup() follows dofindgem(), so the fountain tile and its looted flag
    // are both reset after the C rn2(3)=0 draw.
    assert.equal(location.typ, ROOM);
    assert.equal(location.horizontal, 0);
    assert.equal(location.flags, 0);
});

test('vomit keeps special eat.c paths fail-closed', async () => {
    await startedGame();
    const normal = game.youmonst.data;

    function stateFor(species, {
        altar = false,
        multi = 0,
        polymorphed = false,
        sick = false,
        uhs = 1,
    } = {}) {
        const uprops = Array.from(
            { length: SICK + 1 },
            () => ({ intrinsic: 0 }),
        );
        if (sick) uprops[SICK].intrinsic = 1;
        return {
            u: {
                umonnum: polymorphed ? species.pmidx : normal.pmidx,
                umonster: normal.pmidx,
                uhs,
                uprops,
                usick_type: sick ? SICK_VOMITABLE : 0,
                ux: 1,
                uy: 1,
            },
            youmonst: { data: species },
            level: { at: () => ({ typ: altar ? ALTAR : ROOM }) },
            multi,
        };
    }

    const cases = [
        ['polymorph', stateFor(game.mons[PM_ACID_BLOB], {
            polymorphed: true,
        })],
        ['cantvomit form', stateFor(game.mons[PM_SEWER_RAT])],
        ['sickness', stateFor(normal, { sick: true })],
        ['dry heave', stateFor(normal, { uhs: FAINTING })],
        ['existing multi-turn action', stateFor(normal, { multi: 1 })],
        ['acid breath', stateFor(game.mons[PM_YELLOW_DRAGON])],
        ['altar', stateFor(normal, { altar: true })],
        ['acidic form', stateFor(game.mons[PM_ACID_BLOB])],
    ];
    for (const [name, state] of cases) {
        // vomit() reaches nomul(-2) only after every refusal above it, so a
        // refused call leaves `multi` exactly as the case set it. The
        // baseline is captured before the call; an expectation derived from
        // the value under test would accept any write.
        const multiBefore = state.multi;
        assert.throws(() => vomit(state), UnsupportedEatError, name);
        assert.equal(state.multi, multiBefore, name);
    }
});
