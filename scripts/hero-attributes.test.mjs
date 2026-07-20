import assert from 'node:assert/strict';
import test from 'node:test';

import { init_attr, newhp, vary_init_attr } from '../js/attrib.js';
import { newpw, newuexp } from '../js/exper.js';

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

function queuedRandom(values) {
    const queue = [...values];
    const take = (bound) => {
        assert.ok(queue.length > 0, `missing deterministic value for bound ${bound}`);
        const value = queue.shift();
        assert.ok(value >= 0 && value < bound, `${value} is outside bound ${bound}`);
        return value;
    };
    return {
        rn2: take,
        rn1: (range, base) => take(range) + base,
        rnd: (bound) => take(bound) + 1,
        done: () => assert.equal(queue.length, 0),
    };
}

test('newhp and newpw preserve initial advancement order and alignment state', () => {
    const state = baseState();
    // Draws exercise role HP, race HP, role Pw, then race Pw in source order.
    const random = queuedRandom([2, 0, 3, 1]);
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
    const random = queuedRandom([2, 0]);
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
    const random = queuedRandom([3, 1, 5]);
    assert.equal(newhp(state, random), 9);
    // Healer's 3/2 modifier applies after rn1(11,1) returns 6.
    assert.equal(newpw(state, random), 9);
    random.done();
});

test('init_attr distributes the requested total with role weights', () => {
    const state = baseState();
    // Six base attributes total 42. These weighted draws assign the remaining
    // three points to Strength, Intelligence, and Charisma respectively.
    const random = queuedRandom([0, 20, 99]);
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
    const random = queuedRandom([0, 0, 1, 1, 1, 1, 1]);
    vary_init_attr(state, random);
    assert.equal(state.u.acurr.a[0], 5);
    assert.equal(state.u.amax.a[0], 5);
    random.done();
});

test('newuexp keeps the three source ranges', () => {
    // Levels 1, 10, and 20 select each branch of exper.c newuexp().
    assert.equal(newuexp(1), 20);
    assert.equal(newuexp(10), 10_000);
    assert.equal(newuexp(20), 10_000_000);
});
