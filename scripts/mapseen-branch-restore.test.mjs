// mapseen-branch-restore.test.mjs -- a restored mapseen's br must be one of
// the restored svb.branches.
//
// C ref: dungeon.c save_mapseen() writes mptr->br as its index in
// svb.branches, and load_mapseen() walks the restored svb.branches to that
// index. recbranch_mapseen() compares mapseen.br with a branch from the chain
// by identity, so a restored br that is a copy rather than a chain member
// makes it report "Two branches on the same level?" where C says nothing.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load_mapseen, save_mapseen } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';

function chainOf(branches) {
    branches.forEach((br, i) => { br.next = branches[i + 1] ?? null; });
    return { svb: { branches: branches[0] ?? null } };
}

function branchChain(state) {
    const chain = [];
    for (let br = state.svb?.branches ?? null; br; br = br.next) chain.push(br);
    return chain;
}

test('save_mapseen() and load_mapseen() carry br as its svb.branches index', () => {
    // Three branches, so the middle one has index 1 and "no branch" walks
    // off the end at index 3 (C's brindx after the loop runs out).
    const saved = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const savedState = chainOf(saved);
    const withBranch = { br: saved[1], lev: { dnum: 0, dlevel: 3 } };
    const withoutBranch = { br: null, lev: { dnum: 0, dlevel: 4 } };

    const out1 = save_mapseen(withBranch, savedState);
    const out2 = save_mapseen(withoutBranch, savedState);
    assert.equal(out1.branch_index, 1);
    assert.equal(out2.branch_index, 3);
    assert.equal('br' in out1, false, 'the branch object is not saved');

    // Restore against fresh branch objects, as restore_dungeon() allocates.
    const restored = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const restoredState = chainOf(restored);
    const in1 = load_mapseen(JSON.parse(JSON.stringify(out1)), restoredState);
    const in2 = load_mapseen(JSON.parse(JSON.stringify(out2)), restoredState);
    assert.equal(in1.br, restored[1]);
    assert.equal(in2.br, null);
    assert.deepEqual(in1.lev, { dnum: 0, dlevel: 3 });
});

// The recipe's first segment enters the Gnomish Mines from D:3, climbs back
// and saves; its second segment begins "\nn" (dismiss the welcome-back
// --More--, decline to keep the save file). Stopping there leaves the game
// exactly as restore built it, before any later stair crossing reassigns br.
test('a restored mapseen.br is a member of the restored svb.branches', async () => {
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/dungeon.c/recbranch-mapseen-after-restore.session.json',
        import.meta.url), 'utf8'));
    const [first, second] = recipe.segments;
    const storage = new InMemoryStorage();
    await runSegmentStrict({ ...first, storage });
    await runSegmentStrict({ ...second, moves: '\nn', storage });

    const chain = branchChain(game);
    const withBranch = game.svm.mapseenchn.filter((mptr) => mptr.br);
    // D:3 (dnum 0, dlevel 3) is the level whose Mines branch the first
    // segment crossed.
    assert.ok(withBranch.some((mptr) =>
        mptr.lev.dnum === 0 && mptr.lev.dlevel === 3),
    'the saved branch on D:3 survives the restore');
    for (const mptr of game.svm.mapseenchn) {
        if (!mptr.br) continue;
        assert.ok(chain.includes(mptr.br),
            `mapseen ${mptr.lev.dnum}:${mptr.lev.dlevel} br is not in svb.branches`);
    }
});
