import assert from 'node:assert/strict';
import test from 'node:test';

import { noveltitle, SIR_TERRY_NOVELS } from '../js/do_name.js';

function titleDraw(result) {
    let draws = 0;
    return {
        env: {
            random: {
                rn2(bound) {
                    ++draws;
                    assert.equal(bound, SIR_TERRY_NOVELS.length);
                    return result;
                },
            },
        },
        get draws() { return draws; },
    };
}

test('the source novel catalog has all 41 titles in stable order', () => {
    assert.equal(SIR_TERRY_NOVELS.length, 41);
    assert.equal(SIR_TERRY_NOVELS[0], 'The Colour of Magic');
    assert.equal(SIR_TERRY_NOVELS[33], 'Thud!');
    assert.equal(SIR_TERRY_NOVELS[40], "The Shepherd's Crown");
    assert.ok(Object.isFrozen(SIR_TERRY_NOVELS));
});

test('noveltitle stores a random index only for the -1 sentinel', () => {
    const random = titleDraw(33);
    assert.deepEqual(noveltitle(-1, random.env), {
        novelidx: 33,
        title: 'Thud!',
    });
    assert.equal(random.draws, 1);
});

test('noveltitle consumes a draw before honoring a valid saved index', () => {
    const random = titleDraw(33);
    assert.deepEqual(noveltitle(3, random.env), {
        novelidx: 3,
        title: 'Mort',
    });
    assert.equal(random.draws, 1);
});

test('noveltitle leaves invalid indices untouched but uses its draw', () => {
    const random = titleDraw(9);
    assert.deepEqual(noveltitle(99, random.env), {
        novelidx: 99,
        title: 'Moving Pictures',
    });
    assert.equal(random.draws, 1);
});
