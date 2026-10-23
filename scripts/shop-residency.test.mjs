import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {MAXNROFROOMS, ROOMOFFSET} from '../js/const.js';
import {set_residency} from '../js/shk.js';
import {compareSessionOutputs, formatReport, runJsSession} from './diff-fresh.mjs';
import {createScoringWorkspace, removeScoringWorkspace} from './scoring-workspace.mjs';

test('shop residency follows the persisted C room index and home-level guard', () => {
    // decl.c aliases gs.subrooms to &svr.rooms[MAXNROFROOMS + 1].
    // Persisted JS levels retain these rooms under their parent, while the
    // generation-time state.subrooms may belong to another level.
    const home = {dnum: 2, dlevel: 4};
    const roomIndex = MAXNROFROOMS + 1;
    const subroom = {roomnoidx: roomIndex, resident: null};
    const parent = {roomnoidx: 0, nsubrooms: 1, sbrooms: [subroom]};
    const stale = {roomnoidx: roomIndex, resident: null};
    const state = {u: {uz: {...home}}, level: {rooms: [parent]}, subrooms: [stale]};
    const keeper = {mextra: {eshk: {shoproom: roomIndex + ROOMOFFSET, shoplevel: home}}};
    set_residency(keeper, false, state);
    assert.equal(subroom.resident, keeper);
    assert.equal(stale.resident, null);
    set_residency(keeper, true, state);
    assert.equal(subroom.resident, null);
    state.u.uz = {dnum: 2, dlevel: 5};
    set_residency(keeper, false, state);
    assert.equal(subroom.resident, null);
    state.u.uz = {...home};
    keeper.mextra.eshk.shoproom = ROOMOFFSET;
    set_residency(keeper, false, state);
    assert.equal(parent.resident, keeper);
    set_residency(keeper, true, state);
    assert.equal(parent.resident, null);
});

for (const kind of ['subrooms', 'quiet', 'control']) {
    test(`Minetown shop residency ${kind} matches recorded C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/shk.c/shop-residency-${kind}.session.json`, import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
