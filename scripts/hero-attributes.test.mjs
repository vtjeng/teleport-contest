import assert from 'node:assert/strict';
import test from 'node:test';

import {
    acurrstr,
    adjattrib,
    effective_attribute,
    exerchk,
    exerper,
    init_attr,
    losestr,
    newhp,
    poison_strdmg,
    set_moreluck,
    vary_init_attr,
} from '../js/attrib.js';
import {
    A_CON,
    A_STR,
    A_WIS,
    CLAIRVOYANT,
    CONFUSION,
    EXT_ENCUMBER,
    FROMOUTSIDE,
    HALLUC,
    HALLUC_RES,
    HVY_ENCUMBER,
    KILLED_BY,
    KILLED_BY_AN,
    LUCKADD,
    MOD_ENCUMBER,
    NOT_HUNGRY,
    REGENERATION,
    SICK,
    WEAK,
    WOUNDED_LEGS,
} from '../js/const.js';
import { newpw, newuexp } from '../js/exper.js';
import { PM_MONK } from '../js/monsters.js';
import { LUCKSTONE } from '../js/objects.js';

function advancement(infix, inrnd, lofix, lornd, hifix, hirnd) {
    return { infix, inrnd, lofix, lornd, hifix, hirnd };
}

function baseState() {
    return {
        moves: 0,
        flags: { initalign: 1 },
        urole: {
            filecode: 'Hea',
            xlev: 10,
            initrecord: 10,
            attrbase: [7, 7, 7, 7, 7, 7],
            attrdist: [20, 20, 20, 15, 15, 10],
            hpadv: advancement(8, 4, 1, 6, 1, 3),
            enadv: advancement(2, 4, 1, 3, 1, 2),
        },
        urace: {
            attrmin: [3, 3, 3, 3, 3, 3],
            attrmax: [18, 18, 18, 18, 18, 18],
            hpadv: advancement(2, 2, 0, 2, 0, 1),
            enadv: advancement(1, 2, 0, 1, 0, 1),
        },
        u: { ulevel: 0, ualign: {} },
    };
}

function queuedRandom(values, expectedCalls) {
    const queue = [...values];
    const calls = [];
    const take = (descriptor, bound) => {
        calls.push(descriptor);
        assert.ok(queue.length > 0, `missing deterministic value for bound ${bound}`);
        const value = queue.shift();
        assert.ok(value >= 0 && value < bound, `${value} is outside bound ${bound}`);
        return value;
    };
    return {
        rn2: (bound) => take(`rn2(${bound})`, bound),
        rn1: (range, base) => take(`rn1(${range},${base})`, range) + base,
        rnd: (bound) => take(`rnd(${bound})`, bound) + 1,
        done() {
            assert.equal(queue.length, 0);
            assert.deepEqual(calls, expectedCalls);
        },
    };
}

test('acurrstr folds every encoded Strength band the source names', () => {
    // attrib.c acurrstr()'s own comment lists the bands. acurr(A_STR) holds
    // 18/xx as 18+xx and 19..25 as 100+n, and acurrstr() maps them back into
    // the 3..25 range the rest of the game does arithmetic on.
    const folded = (encoded) => acurrstr({
        u: { acurr: { a: { [A_STR]: encoded } } },
    });
    // acurr() itself floors at 3, so the max(,3) below 18 is redundant there
    // and the plain value survives.
    assert.equal(folded(3), 3);
    assert.equal(folded(18), 18);
    // 18/01 and 18/31 both become 19.
    assert.equal(folded(19), 19);
    assert.equal(folded(49), 19);
    // 18/32..18/81 become 20.
    assert.equal(folded(50), 20);
    assert.equal(folded(99), 20);
    // 18/82..18/100 and the encoded 19..21 all become 21.
    assert.equal(folded(100), 21);
    assert.equal(folded(121), 21);
    // Encoded 22..25 come back as themselves.
    assert.equal(folded(122), 22);
    assert.equal(folded(125), 25);
});

test('newhp and newpw preserve initial advancement order and alignment state', () => {
    const state = baseState();
    // Draws exercise role HP, race HP, role Pw, then race Pw in source order.
    const random = queuedRandom(
        [2, 0, 3, 1],
        ['rnd(4)', 'rnd(2)', 'rnd(4)', 'rnd(2)'],
    );
    assert.equal(newhp(state, random), 14);
    assert.deepEqual(state.u.ualign, { type: 0, record: 10 });
    assert.equal(state.u.uhpinc[0], 14);
    assert.equal(newpw(state, random), 9);
    assert.equal(state.u.ueninc[0], 9);
    random.done();
});

test('newhp reads initial alignment from the canonical role table', () => {
    const state = baseState();
    // Chaotic catches the old state.aligns fallback, which silently produced
    // neutral when a normal game state did not carry a duplicate table.
    state.flags.initalign = 2;
    const random = queuedRandom([2, 0], ['rnd(4)', 'rnd(2)']);
    assert.equal(newhp(state, random), 14);
    assert.deepEqual(state.u.ualign, { type: -1, record: 10 });
    random.done();
});

test('level advancement applies constitution and role energy modifiers', () => {
    const state = baseState();
    state.u.ulevel = 5;
    // Constitution 17 adds two HP; Wisdom 14 contributes seven to Pw range.
    state.u.acurr = { a: [10, 10, 14, 10, 17, 10] };
    // HP role d6=4 and race d2=2; Pw rn1 range draw is 5.
    const random = queuedRandom(
        [3, 1, 5],
        ['rnd(6)', 'rnd(2)', 'rn1(11,1)'],
    );
    assert.equal(newhp(state, random), 9);
    // Healer's 3/2 modifier applies after rn1(11,1) returns 6.
    assert.equal(newpw(state, random), 9);
    random.done();
});

test('advancement uses effective Constitution and Wisdom with source caps', () => {
    const state = baseState();
    state.u.ulevel = 5;
    state.u.acurr = { a: [10, 10, 14, 10, 14, 10] };
    state.u.abon = { a: [200, 0, 4, 0, 4, 0] };
    state.u.atemp = [0, 0, 0, 0, 0, 0];

    assert.equal(effective_attribute(state, A_STR), 125);
    assert.equal(effective_attribute(state, A_CON), 18);
    assert.equal(effective_attribute(state, A_WIS), 18);

    const random = queuedRandom(
        [
            3, 1, // newhp(): role d6=4, race d2=2.
            12, // newpw(): rn1(13,1) returns 13.
        ],
        ['rnd(6)', 'rnd(2)', 'rn1(13,1)'],
    );
    assert.equal(newhp(state, random), 10);
    assert.equal(state.u.uhpinc[5], 10);
    assert.equal(newpw(state, random), 19);
    assert.equal(state.u.ueninc[5], 19);
    random.done();

    state.u.abon.a[A_CON] = -30;
    state.u.abon.a[A_WIS] = 30;
    assert.equal(effective_attribute(state, A_CON), 3);
    assert.equal(effective_attribute(state, A_WIS), 25);
});

test('init_attr distributes the requested total with role weights', () => {
    const state = baseState();
    // Six base attributes total 42. These weighted draws assign the remaining
    // three points to Strength, Intelligence, and Charisma respectively.
    const random = queuedRandom(
        [0, 20, 99],
        ['rn2(100)', 'rn2(100)', 'rn2(100)'],
    );
    assert.equal(init_attr(45, state, random), 0);
    assert.deepEqual(state.u.acurr.a, [8, 8, 7, 7, 7, 8]);
    assert.deepEqual(state.u.amax.a, [8, 8, 7, 7, 7, 8]);
    random.done();
});

test('vary_init_attr consumes the source checks and clamps a decrease', () => {
    const state = baseState();
    state.u.acurr = { a: [7, 7, 7, 7, 7, 7] };
    state.u.amax = { a: [7, 7, 7, 7, 7, 7] };
    // Attribute 0 varies by -2; the other five rn2(20) checks do not vary.
    const random = queuedRandom(
        [0, 0, 1, 1, 1, 1, 1],
        [
            'rn2(20)', 'rn2(7)', 'rn2(20)', 'rn2(20)',
            'rn2(20)', 'rn2(20)', 'rn2(20)',
        ],
    );
    vary_init_attr(state, random);
    assert.equal(state.u.acurr.a[0], 5);
    assert.equal(state.u.amax.a[0], 5);
    random.done();
});

test('exerper preserves ten-turn hunger, burden, and status draw order',
    async () => {
    const state = baseState();
    state.moves = 10;
    state.urole.mnum = PM_MONK;
    state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
    state.u.amax = { a: [10, 10, 10, 10, 10, 10] };
    state.u.aexe = [0, 0, 0, 0, 0, 0];
    // Nutrition 1,001 is the first SATIATED value. Together with Monk,
    // heavy burden, and the five active statuses below, this reaches every
    // source-ordered exercise call in one ten-turn pass.
    state.u.uhunger = 1001;
    state.u.uprops = {
        [CLAIRVOYANT]: { intrinsic: 1 },
        // These properties have no source blocker. A populated blocked field
        // must not suppress their exercise effects.
        [REGENERATION]: { intrinsic: 1, blocked: 1 },
        [SICK]: { intrinsic: 1, blocked: 1 },
        [CONFUSION]: { intrinsic: 1, blocked: 1 },
        [HALLUC]: { intrinsic: 1 },
        [WOUNDED_LEGS]: { intrinsic: 1, blocked: 1 },
    };
    const bounds = [];
    // Decreases use one of rn2(2); 18 beats effective attribute 10 for each
    // rn2(19) increase. The values make every selected call change AEXE.
    const values = [1, 1, 18, 1, 18, 18, 1, 1, 1];
    const random = {
        rn2(bound) {
            bounds.push(bound);
            const value = values.shift();
            assert.ok(value < bound);
            return value;
        },
    };
    let encumberMessages = 0;

    await exerper(state, {
        random,
        // Heavy burden selects Strength gain followed by Dexterity loss.
        nearCapacity: () => HVY_ENCUMBER,
        encumberMessage: () => encumberMessages++,
    });

    assert.deepEqual(
        bounds,
        [2, 2, 19, 2, 19, 19, 2, 2, 2],
    );
    assert.deepEqual(
        state.u.aexe,
        [2, 0, -1, -3, -1, 0],
    );
    // exercise() calls encumber_msg() after both Strength gains and the
    // Constitution loss, regardless of whether the random gain succeeded.
    assert.equal(encumberMessages, 3);
    assert.deepEqual(values, []);
});

test('exerper applies clairvoyance blocking and hallucination resistance',
    async () => {
    const state = baseState();
    state.moves = 5;
    state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
    state.u.amax = { a: [10, 10, 10, 10, 10, 10] };
    state.u.aexe = [0, 0, 0, 0, 0, 0];
    state.u.uhunger = 900;
    state.u.uprops = {
        [CLAIRVOYANT]: { intrinsic: 1, blocked: 1 },
        [HALLUC]: { intrinsic: 1 },
        // Hallucination resistance has no blocker in the source macro, so
        // even this otherwise inconsistent blocked field still resists.
        [HALLUC_RES]: { extrinsic: 1, blocked: 1 },
    };

    await exerper(state, {
        random: {
            rn2() {
                assert.fail('blocked clairvoyance and resisted hallucination draw');
            },
        },
        nearCapacity: () => 0,
        encumberMessage: () => {},
    });

    assert.deepEqual(state.u.aexe, [0, 0, 0, 0, 0, 0]);
});

test('exerper awaits physical encumbrance output before later upkeep',
    async () => {
        const state = baseState();
        state.moves = 10;
        state.u.uhunger = 50;
        state.u.uhs = WEAK;
        let releaseMessage;
        const messageGate = new Promise((resolve) => {
            releaseMessage = resolve;
        });
        const order = [];

        const upkeep = exerper(state, {
            random: {
                rn2(bound) {
                    assert.equal(bound, 2);
                    return 0;
                },
            },
            encumberMessage: async () => {
                order.push('message start');
                await messageGate;
                order.push('message end');
            },
            nearCapacity: () => {
                order.push('capacity');
                return 0;
            },
        });
        await Promise.resolve();
        assert.deepEqual(order, ['message start']);

        releaseMessage();
        await upkeep;
        assert.deepEqual(order, [
            'message start',
            'message end',
            'capacity',
        ]);
    });

// The hunger arm above is only one of the five places exerper() awaits a
// physical exercise. Each encumbrance band and the five-turn cadence reach
// exercise(A_STR) or exercise(A_CON) as well, and encumber_msg() assigns
// go.oldcap only after its message resolves, so an unawaited call there would
// both reorder output and defer the comparison the next call reads.
test('every exerper physical arm awaits its encumbrance output', async () => {
    // Every case runs at a multiple of ten with Regeneration and Sickness
    // intrinsic, so the ten-turn hunger and capacity arms are followed by two
    // more physical exercises. A dropped await inside an arm therefore starts
    // the next message before this test releases the current one, and a
    // dropped await on the last arm resolves exerper() while a message is
    // still open. Both are invisible without a trailing observer.
    const cases = [
        // Not hungry keeps the hunger switch on exercise(A_CON, TRUE), whose
        // own await the WEAK case above already covers.
        { name: 'unencumbered', capacity: 0, messages: 3 },
        // Moderate and heavy exercise Strength, extreme exercises Dexterity
        // then Constitution, and only Strength and Constitution reach
        // encumber_msg(), so each band adds exactly one message.
        { name: 'moderate encumbrance', capacity: MOD_ENCUMBER, messages: 4 },
        { name: 'heavy encumbrance', capacity: HVY_ENCUMBER, messages: 4 },
        { name: 'extreme encumbrance', capacity: EXT_ENCUMBER, messages: 4 },
    ];

    for (const exerciseCase of cases) {
        const state = baseState();
        state.moves = 10;
        state.u.uhunger = 900;
        state.u.uhs = NOT_HUNGRY;
        // Regeneration exercises Strength and Sickness exercises Constitution
        // in the five-turn block, in that order, after the capacity switch.
        state.u.uprops = {
            [REGENERATION]: { intrinsic: FROMOUTSIDE, extrinsic: 0 },
            [SICK]: { intrinsic: FROMOUTSIDE, extrinsic: 0 },
        };
        const gates = [];
        let settled = false;

        const upkeep = exerper(state, {
            random: { rn2: () => 0 },
            encumberMessage: () => new Promise((resolve) => {
                gates.push(resolve);
            }),
            nearCapacity: () => exerciseCase.capacity,
        }).then(() => {
            settled = true;
        });

        for (let index = 0; index < exerciseCase.messages; ++index) {
            // Drain the microtask queue so however many awaits separate two
            // exercise() calls, the count below is the number started.
            await new Promise((resolve) => { setImmediate(resolve); });
            assert.equal(
                gates.length,
                index + 1,
                `${exerciseCase.name} held at message ${index}`,
            );
            assert.equal(
                settled,
                false,
                `${exerciseCase.name} still owed message ${index}`,
            );
            gates[index]();
        }
        await upkeep;
        assert.equal(gates.length, exerciseCase.messages, exerciseCase.name);
    }
});

test('adjattrib preserves below-minimum base and maximum handling', async () => {
    const state = baseState();
    state.moves = 1;
    state.flags.verbose = true;
    state.u.acurr = { a: [3, 10, 10, 10, 10, 10] };
    state.u.amax = { a: [10, 10, 10, 10, 10, 10] };
    state.u.aexe = [4, 0, 0, 0, 0, 0];
    const messages = [];
    // Decreasing Strength by two makes the tentative base 1. C draws rn2(3)
    // for how much of maximum 10 is lost; value 1 leaves maximum 9.
    const random = queuedRandom([1], ['rn2(3)']);

    assert.equal(
        await adjattrib(A_STR, -2, 0, state, {
            random,
            message: (message) => messages.push(message),
        }),
        false,
    );

    assert.equal(state.u.acurr.a[A_STR], 3);
    assert.equal(state.u.amax.a[A_STR], 9);
    assert.equal(state.u.aexe[A_STR], 4);
    assert.deepEqual(messages, ['Your innate strength has declined.']);
    random.done();
});

test('adjattrib preserves all three source message modes', async () => {
    for (const changed of [false, true]) {
        for (const mode of [1, 0, -1]) {
            const state = baseState();
            const value = changed ? 10 : 18;
            state.flags.verbose = true;
            state.u.acurr = { a: [value, 10, 10, 10, 10, 10] };
            state.u.amax = { a: [value, 10, 10, 10, 10, 10] };
            state.u.aexe = [4, 0, 0, 0, 0, 0];
            state.u.abon = [0, 0, 0, 0, 0, 0];
            state.u.atemp = [0, 0, 0, 0, 0, 0];
            state.u.uprops = {};
            state.program_state = { in_moveloop: 0 };
            const messages = [];

            assert.equal(
                await adjattrib(A_STR, 1, mode, state, {
                    message: (message) => messages.push(message),
                }),
                changed,
            );
            const shouldMessage = changed ? mode <= 0 : mode === 0;
            assert.equal(
                messages.length,
                shouldMessage ? 1 : 0,
                `${changed ? 'changed' : 'unchanged'} mode ${mode}`,
            );
        }
    }
});

test('adjattrib awaits change output before encumbrance follow-up',
    async () => {
        const state = baseState();
        state.program_state = { in_moveloop: 1 };
        state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
        state.u.amax = { a: [10, 10, 10, 10, 10, 10] };
        state.u.aexe = [4, 0, 0, 0, 0, 0];
        state.u.abon = [0, 0, 0, 0, 0, 0];
        state.u.atemp = [0, 0, 0, 0, 0, 0];
        state.u.uprops = {};
        const events = [];
        let releaseMessage;
        const messageGate = new Promise((resolve) => {
            releaseMessage = resolve;
        });

        const adjustment = adjattrib(A_STR, 1, -1, state, {
            message() {
                events.push('message');
                return messageGate;
            },
            encumberMessage() {
                events.push('encumber');
            },
        });
        await Promise.resolve();
        assert.deepEqual(events, ['message']);

        releaseMessage();
        assert.equal(await adjustment, true);
        assert.deepEqual(events, ['message', 'encumber']);
    });

// attrib.c losestr() and poison_strdmg() are impure, so recorded play is their
// evidence: recordings/attrib.c/poison-corpse-strength-loss.session.json spends
// the ordinary arm, where the loss fits above the racial minimum. No recipe can
// cheaply drive a hero's Strength down to ATTRMIN(A_STR), so the loop that
// turns the points that do not fit into hit-point damage is pinned here
// instead, with every value read from attrib.c:221-270.
function losestrState({ base, uhpmax = 20, ulevel = 5 }) {
    const state = baseState();
    state.disp = {};
    state.moves = 1;
    state.program_state = { in_moveloop: 1 };
    state.u = {
        ...state.u,
        ulevel,
        uhp: uhpmax,
        uhpmax,
        uhppeak: uhpmax,
        umonnum: 0,
        umonster: 0,
        acurr: { a: [base, 10, 10, 10, 10, 10] },
        amax: { a: [18, 10, 10, 10, 10, 10] },
        abon: [0, 0, 0, 0, 0, 0],
        atemp: [0, 0, 0, 0, 0, 0],
        aexe: [0, 0, 0, 0, 0, 0],
        uprops: {},
    };
    return state;
}

test('losestr turns the points below the racial minimum into damage',
    async () => {
        // urace.attrmin[A_STR] is 3 in baseState(), so losing 4 from a base of
        // 5 leaves 2 points that fit and 2 that do not. Each of the two that
        // do not draws rn1(4, 3): the values 0 and 3 stand for that range's
        // ends, giving 3 + 6 = 9 hit points of damage.
        const state = losestrState({ base: 5, uhpmax: 20, ulevel: 5 });
        const random = queuedRandom([0, 3], ['rn1(4,3)', 'rn1(4,3)']);
        const events = [];

        await losestr(4, 'poisonous corpse', KILLED_BY_AN, state, {
            random,
            losehp: (...args) => events.push(['losehp', ...args]),
            encumberMessage: () => events.push(['encumber']),
        });

        assert.deepEqual(events[0], ['losehp', 9, 'poisonous corpse', KILLED_BY_AN]);
        // setuhpmax(max(uhpmax - dmg, uhpmin)): 20 - 9 = 11 is above
        // minuhpmax(1), which is the experience level 5, so 11 stands.
        assert.equal(state.u.uhpmax, 11);
        // The two points that fit reach adjattrib(A_STR, -2, 1), which is
        // silent and, in the move loop, ends with encumber_msg().
        assert.equal(state.u.acurr.a[A_STR], 3);
        assert.deepEqual(events[1], ['encumber']);
        assert.equal(events.length, 2);
        random.done();
    });

test('losestr floors the reduced maximum at minuhpmax', async () => {
    // Same loop, but the hero's maximum is close to the floor: uhpmax 8 less
    // dmg 3 is 5, below minuhpmax(1), which is the experience level 7.
    const state = losestrState({ base: 3, uhpmax: 8, ulevel: 7 });
    const random = queuedRandom([0], ['rn1(4,3)']);

    await losestr(1, '', KILLED_BY_AN, state, {
        random,
        // An empty killer reason becomes "terminal frailty", KILLED_BY.
        losehp: (n, knam, k_format) => {
            assert.equal(n, 3);
            assert.equal(knam, 'terminal frailty');
            assert.equal(k_format, KILLED_BY);
        },
        encumberMessage: () => assert.fail('no point was left for adjattrib'),
    });

    assert.equal(state.u.uhpmax, 7);
    assert.equal(state.u.acurr.a[A_STR], 3);
    random.done();
});

test('losestr spends no damage while the loss fits above the minimum',
    async () => {
        // 18 - 3 is 15, still above urace.attrmin[A_STR], so the loop never
        // runs, no rn1 is drawn and losehp() is never called.
        const state = losestrState({ base: 18 });
        const events = [];

        await losestr(3, 'contaminated water', KILLED_BY, state, {
            random: queuedRandom([], []),
            losehp: () => assert.fail('no damage was due'),
            encumberMessage: () => events.push('encumber'),
        });

        assert.equal(state.u.acurr.a[A_STR], 15);
        assert.equal(state.u.uhpmax, 20);
        assert.deepEqual(events, ['encumber']);
    });

test('losestr refuses both conditions C reports as impossible', async () => {
    // attrib.c:226. Neither a non-positive loss nor a base already below
    // ATTRMIN(A_STR) changes anything.
    for (const [num, base] of [[0, 18], [-1, 18], [1, 2]]) {
        const state = losestrState({ base });
        await losestr(num, 'contaminated water', KILLED_BY, state, {
            random: queuedRandom([], []),
            losehp: () => assert.fail(`losehp ran for num ${num} base ${base}`),
            encumberMessage: () => assert.fail('adjattrib ran'),
        });
        assert.equal(state.u.acurr.a[A_STR], base);
        assert.equal(state.u.uhpmax, 20);
    }
});

test('poison_strdmg loses the strength before the hit points', async () => {
    // attrib.c:274-278 calls losestr() and then losehp() with the same killer.
    // Here the loss fits above the minimum, so the only losehp() is the
    // second call, and adjattrib()'s encumber_msg() has to precede it.
    const state = losestrState({ base: 18 });
    const events = [];

    await poison_strdmg(4, 7, 'poisonous corpse', KILLED_BY_AN, state, {
        random: queuedRandom([], []),
        losehp: (n, knam, k_format) => events.push(`losehp ${n} ${knam} ${k_format}`),
        encumberMessage: () => events.push('encumber'),
    });

    assert.equal(state.u.acurr.a[A_STR], 14);
    assert.deepEqual(events,
        ['encumber', `losehp 7 poisonous corpse ${KILLED_BY_AN}`]);
});

test('exerchk applies and reschedules the move-600 attribute check', async () => {
    const state = baseState();
    state.moves = 600;
    state.multi = 0;
    state.context = { next_attrib_check: 600 };
    state.program_state = { in_moveloop: 1 };
    state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
    state.u.amax = { a: [10, 10, 10, 10, 10, 10] };
    // Strength succeeds; Wisdom fails and decays from -4 to -2.
    state.u.aexe = [3, 0, -4, 0, 0, 0];
    // NOT_HUNGRY runs Constitution exercise before the scheduled check.
    state.u.uhunger = 900;
    state.u.uprops = {};
    const messages = [];
    let encumberMessages = 0;
    // rn2(19)=0 leaves Constitution exercise unchanged. rn2(50)=0 passes
    // Strength's threshold; 49 misses Wisdom's. rn1(200,800)=817 schedules
    // the next check at move 1,417.
    const random = queuedRandom(
        [0, 0, 49, 17],
        ['rn2(19)', 'rn2(50)', 'rn2(50)', 'rn1(200,800)'],
    );

    assert.equal(
        await exerchk(state, {
            random,
            nearCapacity: () => 0,
            encumberMessage: () => encumberMessages++,
            message: (message) => messages.push(message),
        }),
        true,
    );

    assert.equal(state.u.acurr.a[A_STR], 11);
    assert.equal(state.u.aexe[A_STR], 0);
    assert.equal(state.u.aexe[A_WIS], -2);
    assert.equal(state.context.next_attrib_check, 1417);
    assert.equal(state.disp.botl, true);
    assert.equal(encumberMessages, 2);
    assert.deepEqual(messages, [
        'You feel strong!',
        'You must have been exercising diligently.',
    ]);
    random.done();
});

test('exerchk applies a scheduled Wisdom abuse and reschedules it',
    async () => {
        const state = baseState();
        state.moves = 601;
        state.multi = 0;
        state.context = { next_attrib_check: 600 };
        state.program_state = { in_moveloop: 1 };
        state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
        state.u.amax = { a: [10, 10, 10, 10, 10, 10] };
        state.u.aexe = [0, 0, -4, 0, 0, 0];
        state.u.uhunger = 900;
        state.u.uprops = {};
        const messages = [];
        const random = queuedRandom(
            [0, 17],
            ['rn2(50)', 'rn1(200,800)'],
        );

        assert.equal(
            await exerchk(state, {
                random,
                nearCapacity: () => 0,
                encumberMessage: () => assert.fail(
                    'Wisdom abuse has no physical encumbrance message',
                ),
                message: (message) => messages.push(message),
            }),
            true,
        );

        assert.equal(state.u.acurr.a[A_WIS], 9);
        assert.equal(state.u.aexe[A_WIS], 0);
        assert.equal(state.disp.botl, true);
        assert.equal(state.context.next_attrib_check, 1417);
        assert.deepEqual(messages, [
            'You feel foolish!',
            "You haven't been paying attention.",
        ]);
        random.done();
    });

test('exerchk gives only Wisdom the full exercise threshold', async () => {
    for (const [index, changes] of [
        [A_STR, false],
        [A_WIS, true],
    ]) {
        const state = baseState();
        state.moves = 600;
        state.multi = 0;
        state.context = { next_attrib_check: 600 };
        state.program_state = { in_moveloop: 0 };
        state.u.acurr = { a: [10, 10, 10, 10, 10, 10] };
        state.u.amax = { a: [10, 10, 10, 10, 10, 10] };
        state.u.aexe = [0, 0, 0, 0, 0, 0];
        state.u.aexe[index] = 3;
        // HUNGRY has no exerper() attribute draw at this ten-turn boundary,
        // isolating the scheduled Strength/Wisdom threshold comparison.
        state.u.uhunger = 100;
        state.u.uprops = {};
        const random = queuedRandom(
            [3, 0],
            ['rn2(50)', 'rn1(200,800)'],
        );

        await exerchk(state, {
            random,
            nearCapacity: () => 0,
            encumberMessage: () => assert.fail('not in the move loop'),
            message: () => {},
        });

        assert.equal(state.u.acurr.a[index], changes ? 11 : 10);
        assert.equal(state.u.aexe[index], changes ? 0 : 1);
        random.done();
    }
});

test('newuexp keeps the three source ranges', () => {
    // Levels 1, 10, and 20 select each branch of exper.c newuexp().
    assert.equal(newuexp(1), 20);
    assert.equal(newuexp(10), 10_000);
    assert.equal(newuexp(20), 10_000_000);
});

// C ref: attrib.c set_moreluck() (441-453). Three branches: no luck source
// sets moreluck to 0, a non-negative luck bonus sets LUCKADD (3), and a
// negative luck bonus sets -LUCKADD (-3).
test('set_moreluck with no luckstone sets moreluck to 0', () => {
    const state = { u: { moreluck: 99 }, invent: null };
    set_moreluck(state);
    assert.equal(state.u.moreluck, 0);
});

test('set_moreluck with uncursed luckstone sets moreluck to LUCKADD', () => {
    // An uncursed luckstone in inventory. stone_luck(true) counts uncursed
    // stones, yielding a positive sign, so the `luckbon >= 0` branch fires.
    const luckstone = { otyp: LUCKSTONE, blessed: false, cursed: false,
        quan: 1, oartifact: 0, nobj: null };
    const state = { u: { moreluck: 0 }, invent: luckstone, artilist: [] };
    set_moreluck(state);
    assert.equal(state.u.moreluck, LUCKADD);
});

test('set_moreluck with blessed luckstone sets moreluck to LUCKADD', () => {
    // A blessed luckstone yields a positive stone_luck, same LUCKADD result.
    const luckstone = { otyp: LUCKSTONE, blessed: true, cursed: false,
        quan: 1, oartifact: 0, nobj: null };
    const state = { u: { moreluck: 0 }, invent: luckstone, artilist: [] };
    set_moreluck(state);
    assert.equal(state.u.moreluck, LUCKADD);
});

test('set_moreluck with cursed luckstone sets moreluck to -LUCKADD', () => {
    // A cursed luckstone gives stone_luck -1, so moreluck = -LUCKADD.
    const luckstone = { otyp: LUCKSTONE, blessed: false, cursed: true,
        quan: 1, oartifact: 0, nobj: null };
    const state = { u: { moreluck: 0 }, invent: luckstone, artilist: [] };
    set_moreluck(state);
    assert.equal(state.u.moreluck, -LUCKADD);
});
