import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    HWALL,
    MATCH_WALL,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    STONE,
    W_RANDOM,
} from '../js/const.js';
import {
    THEMEROOM_FILL_DEFINITIONS,
    ThemeroomSelection,
    is_themeroom_fill_eligible,
    selection_area,
    selection_negate,
    selection_room,
    select_themeroom_fill,
} from '../js/themerooms.js';

function selectedPoints(selection) {
    const points = [];
    selection.iterate((x, y) => points.push([x, y]));
    return points;
}

test('selection percentage is x-major while iteration is y-major', () => {
    // This 2x2 rectangle is the smallest shape whose x-major and y-major
    // traversals differ. The first two percentage draws retain column two.
    const selection = selection_area(2, 3, 3, 4);
    const draws = [0, 49, 50, 99];
    const bounds = [];
    const filtered = selection.percentage(50, (bound) => {
        bounds.push(bound);
        return draws.shift();
    });

    assert.deepEqual(selection.bounds(), { lx: 2, ly: 3, hx: 3, hy: 4 });
    assert.equal(selection.numpoints(), 4);
    assert.deepEqual(bounds, [100, 100, 100, 100]);
    assert.deepEqual(selectedPoints(filtered), [[2, 3], [2, 4]]);
    assert.deepEqual(selectedPoints(selection), [
        [2, 3], [3, 3],
        [2, 4], [3, 4],
    ]);
});

test('selection rndcoord chooses and removes in x-major order', () => {
    // These three points have opposing x/y order, so index one identifies the
    // middle x-major point rather than relying on rectangular traversal.
    const selection = new ThemeroomSelection([
        { x: 2, y: 4 },
        { x: 3, y: 3 },
        { x: 4, y: 2 },
    ]);
    const bounds = [];
    const first = selection.rndcoord(true, (bound) => {
        bounds.push(bound);
        return 1;
    }, { x: 2, y: 2 });
    const second = selection.rndcoord(false, (bound) => {
        bounds.push(bound);
        return 1;
    });

    assert.deepEqual(first, { x: 1, y: 1 });
    assert.deepEqual(second, { x: 4, y: 2 });
    assert.deepEqual(bounds, [3, 2]);
    assert.equal(selection.numpoints(), 2);
    assert.equal(selection.get(3, 3), false);
});

test('selection map filtering preserves terrain and random-lit semantics', () => {
    const selection = selection_area(2, 3, 3, 4);
    const terrain = new Map([
        // STONE and HWALL both satisfy NetHack's MATCH_WALL pseudo-type.
        ['2,3', { typ: STONE, lit: false }],
        ['2,4', { typ: ROOM, lit: false }],
        ['3,3', { typ: HWALL, lit: true }],
        ['3,4', { typ: ROOM, lit: true }],
    ]);
    const visited = [];
    const walls = selection.filter_mapchar(MATCH_WALL, (x, y) => {
        visited.push([x, y]);
        return terrain.get(`${x},${y}`);
    });

    assert.deepEqual(visited, [[2, 3], [2, 4], [3, 3], [3, 4]]);
    assert.deepEqual(selectedPoints(walls), [[2, 3], [3, 3]]);

    const draws = [1, 1, 0, 0];
    const randomLit = selection.filter_mapchar(ROOM, (x, y) => ({
        typ: ROOM,
        lit: terrain.get(`${x},${y}`).lit,
    }), {
        // lit=-1 requests an independent rn2(2) result for each terrain match.
        lit: -1,
        random(bound) {
            assert.equal(bound, 2);
            return draws.shift();
        },
    });
    assert.deepEqual(selectedPoints(randomLit), [[2, 3], [2, 4]]);
});

test('selection negate and grow return new source-shaped selections', () => {
    const wholeMap = selection_negate();
    assert.equal(wholeMap.numpoints(), COLNO * ROWNO);

    let iterated = 0;
    wholeMap.iterate(() => { ++iterated; });
    // Lua selection:iterate deliberately omits unusable map column zero.
    assert.equal(iterated, (COLNO - 1) * ROWNO);

    const center = selection_area(10, 10, 10, 10);
    const allDirections = center.grow();
    assert.equal(center.numpoints(), 1);
    assert.equal(allDirections.numpoints(), 9);

    const calls = [];
    const north = center.grow(W_RANDOM, (bound) => {
        calls.push(bound);
        return 0; // random_wdir index zero is W_NORTH in sp_lev.c.
    });
    assert.deepEqual(calls, [4]);
    assert.deepEqual(selectedPoints(north), [[10, 9], [10, 10]]);
});

test('selection_room excludes room edges and mismatched room numbers', () => {
    // This 3x2 room samples both exclusion conditions from
    // selection_from_mkroom() while leaving four selected floor locations.
    const room = { lx: 2, ly: 3, hx: 4, hy: 4, roomnoidx: 0 };
    const selected = selection_room(room, (x, y) => ({
        edge: x === 2 && y === 3,
        roomno: x === 4 && y === 4 ? ROOMOFFSET + 1 : ROOMOFFSET,
    }));

    assert.deepEqual(selectedPoints(selected), [
        [3, 3], [4, 3],
        [2, 4], [3, 4],
    ]);
});

test('D:1 fill chooser follows source order and lit eligibility', () => {
    const names = THEMEROOM_FILL_DEFINITIONS.map((definition) => definition.name);
    assert.deepEqual(names, [
        'Ice room',
        'Cloud room',
        'Boulder room',
        'Spider nest',
        'Trap room',
        'Garden',
        'Buried treasure',
        'Buried zombies',
        'Massacre',
        'Statuary',
        'Light source',
        'Temple of the gods',
        'Ghost of an Adventurer',
        'Storeroom',
        'Teleportation hub',
    ]);

    const cases = [
        {
            label: 'lit room',
            lit: true,
            // Boulder is too difficult and Light source requires darkness.
            // Garden is the fifth eligible entry.
            replacementBound: 5,
            expectedName: 'Garden',
        },
        {
            label: 'dark room',
            lit: false,
            // With Garden excluded, Light source is the ninth eligible entry.
            replacementBound: 9,
            expectedName: 'Light source',
        },
    ];
    for (const testCase of cases) {
        const bounds = [];
        const pick = select_themeroom_fill(1, { lit: testCase.lit }, (bound) => {
            bounds.push(bound);
            return bound === testCase.replacementBound ? 0 : bound - 1;
        });
        assert.equal(pick.name, testCase.expectedName, testCase.label);
        assert.deepEqual(
            bounds,
            Array.from({ length: 13 }, (_, index) => index + 1),
            testCase.label,
        );
    }
});

test('fill eligibility includes Boulder starting at difficulty four', () => {
    const boulder = THEMEROOM_FILL_DEFINITIONS.find(
        (definition) => definition.name === 'Boulder room',
    );
    assert.equal(is_themeroom_fill_eligible(boulder, 3, { lit: true }), false);
    assert.equal(is_themeroom_fill_eligible(boulder, 4, { lit: true }), true);

    const bounds = [];
    select_themeroom_fill(4, { lit: true }, (bound) => {
        bounds.push(bound);
        return bound - 1;
    });
    // At difficulty four, Boulder joins the 13 lit-room D:1 choices.
    assert.deepEqual(bounds, Array.from({ length: 14 }, (_, index) => index + 1));
    assert.throws(
        () => select_themeroom_fill(1, { lit: 1 }, () => 0),
        /boolean room\.lit/,
    );
});
