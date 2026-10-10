import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { resetGhostlyMonsterAttitudes } from '../js/bones.js';
import { newMonster } from '../js/monst.js';
import { PM_DWARF, monst_globals_init, reset_mvitals } from '../js/monsters.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';

test('drop_upon_death uses the canonical burning-object predicate', async () => {
    const cSource = await readFile(
        new URL('../nethack-c/upstream/src/bones.c', import.meta.url), 'utf8',
    );
    const jsSource = await readFile(
        new URL('../js/bones.js', import.meta.url), 'utf8',
    );
    assert.match(cSource,
        /if \(\(cont \|\| artifact_light\(otmp\)\) && obj_is_burning\(otmp\)\)\s*end_burn\(otmp, TRUE\)/u);
    assert.match(jsSource,
        /if \(\(cont \|\| artifact_light\(otmp\)\) && obj_is_burning\(otmp\)\)\s*await end_burn\(otmp, true, \{ state \}\)/u);
    assert.match(jsSource, /import \{ obj_is_burning \} from '\.\/light\.js';/u);
});

test('savebones releases leashes before unpunishing the hero', async () => {
    const cSource = await readFile(
        new URL('../nethack-c/upstream/src/bones.c', import.meta.url), 'utf8',
    );
    const jsSource = await readFile(
        new URL('../js/bones.js', import.meta.url), 'utf8',
    );
    assert.match(cSource,
        /make_bones:\s*unleash_all\(\);[\s\S]*?if \(Punished\)\s*unpunish\(\)/u);
    assert.match(jsSource,
        /\/\/ make_bones:\s*unleash_all\(state\);[\s\S]*?if \(state\.uball\) unpunish\(state\);/u);
    assert.match(jsSource, /import \{ unleash_all \} from '\.\/apply\.js';/u);
    assert.doesNotMatch(jsSource, /unleash_all\(\) -- no leash logic/u);
});

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
