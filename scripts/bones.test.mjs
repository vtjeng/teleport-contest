import assert from 'node:assert/strict';
import test from 'node:test';

import { resetGhostlyMonsterAttitudes } from '../js/bones.js';
import { newMonster } from '../js/monst.js';
import { PM_DWARF, monst_globals_init, reset_mvitals } from '../js/monsters.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';

test('ghostly restoration recomputes monster attitude for the new hero', () => {
    // restore.c:getlev() resets peacefulness after loading a bones level. A
    // dwarf that was peaceful for a lawful dead hero is hostile to this
    // neutral human, and its malign value must follow the new attitude.
    const state = {
        ...rawMonsterGenerationState(),
        level: { monlist: null },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    const dwarf = newMonster({
        data: state.mons[PM_DWARF],
        mnum: PM_DWARF,
        mpeaceful: true,
    });
    state.level.monlist = dwarf;

    resetGhostlyMonsterAttitudes(state);

    assert.equal(dwarf.mpeaceful, false);
    assert.equal(dwarf.malign, Math.abs(dwarf.data.maligntyp));
});
