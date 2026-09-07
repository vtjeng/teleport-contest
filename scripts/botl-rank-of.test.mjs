// Pin botl.c rank_of() (332-358), ported in js/display.js. Every expected
// title is read from the role tables in role.c: Valkyrie at role.c:493-502,
// Priest at role.c:275-284, Caveman at role.c:113-122. The rank index comes
// from xlev_to_rank() (botl.c): levels 1..2 give 0, 3..5 give 1, then one
// index per four levels, with 30 alone giving 8.

import assert from 'node:assert/strict';
import test from 'node:test';

import { rank_of } from '../js/display.js';
import { PM_CAVE_DWELLER, PM_CLERIC, PM_NEWT, PM_VALKYRIE } from '../js/monsters.js';
import { roles } from '../js/roles.js';

const caveman = roles.find((role) => role.mnum === PM_CAVE_DWELLER);

test('rank_of reads the rank row for the level and gender', () => {
    // Valkyrie rank[0] is { "Stripling", 0 }: level 1 maps to index 0 and
    // the row has no female form, so both genders answer the male title.
    assert.equal(rank_of(1, PM_VALKYRIE, false), 'Stripling');
    assert.equal(rank_of(1, PM_VALKYRIE, true), 'Stripling');
    // Level 10 maps to index (10 + 2) / 4 = 3, Valkyrie rank[3] is
    // { "Man-at-arms", "Woman-at-arms" }.
    assert.equal(rank_of(10, PM_VALKYRIE, false), 'Man-at-arms');
    assert.equal(rank_of(10, PM_VALKYRIE, true), 'Woman-at-arms');
    // Level 30 alone maps to index 8, Valkyrie rank[8] is { "Lord", "Lady" }.
    assert.equal(rank_of(30, PM_VALKYRIE, true), 'Lady');
    // Priest rank[4] is { "Curate", 0 } (level 14 -> index 16 / 4 = 4) and
    // rank[6] is { "Lama", 0 } (level 22 -> index 24 / 4 = 6), so a
    // Priestess at those levels takes the male title.
    assert.equal(rank_of(14, PM_CLERIC, false), 'Curate');
    assert.equal(rank_of(22, PM_CLERIC, true), 'Lama');
});

test('rank_of falls back to the hero role for a non-role monster number', () => {
    // PM_NEWT is no role's mnum, so C's loop runs off the roles table and
    // rank_of() reads gu.urole instead. Caveman rank[1] is { "Aborigine", 0 }
    // (level 3 -> index 5 / 4 = 1).
    const state = { urole: caveman };
    assert.equal(rank_of(3, PM_NEWT, true, state), 'Aborigine');
});

test('rank_of walks down to a named rank, then the role name, then Player', () => {
    // No real role has an empty rank row, so these tables are synthetic:
    // a role whose rank[1] row is empty must fall to rank[0], and a role
    // with no rank names at all falls to its name and finally "Player".
    const empty = { m: null, f: null };
    const sparse = {
        mnum: PM_NEWT,
        name: { m: 'Caveman', f: 'Cavewoman' },
        rank: [{ m: 'Troglodyte', f: null }, empty, empty, empty, empty,
            empty, empty, empty, empty],
    };
    assert.equal(rank_of(5, PM_NEWT, true, { urole: sparse }), 'Troglodyte');
    const nameless = {
        mnum: PM_NEWT,
        name: { m: 'Caveman', f: 'Cavewoman' },
        rank: Array(9).fill(empty),
    };
    assert.equal(rank_of(1, PM_NEWT, true, { urole: nameless }), 'Cavewoman');
    assert.equal(rank_of(1, PM_NEWT, false, { urole: nameless }), 'Caveman');
    const anonymous = { mnum: PM_NEWT, name: empty, rank: Array(9).fill(empty) };
    assert.equal(rank_of(1, PM_NEWT, false, { urole: anonymous }), 'Player');
});
