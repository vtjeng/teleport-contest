// Focused test for do.c goto_level()'s builds_up(&u.uz) true arm
// (do.c:1681-1685), which sets dunlev_ureached when the hero first enters an
// up-building dungeon (Sokoban or Vlad's Tower). The C code assigns
// dunlev_reached = dunlev when dunlev_reached is 0 or when dunlev is
// shallower than dunlev_reached.
//
// Evidence: the recipe teleports a wizard-mode hero to Sokoban with seed 42.
// After arrival, u.uz.dnum equals sokoban_dnum and dunlev_reached equals the
// arrival dunlev. The first 11 screens, cursors, and 2844 PRNG calls match
// the C reference; the divergence at step 12 is in Sokoban level creation
// (makemaz), which is a separate goal.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { builds_up, dunlev, dunlev_reached } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

function loadRecipe() {
    return JSON.parse(readFileSync('recipes/sokoban-level-teleport.session.json', 'utf8'));
}

test('goto_level sets dunlev_reached on first arrival in an up-building dungeon', async () => {
    const recipe = loadRecipe();
    assert.equal(recipe.segments.length, 1);
    const seg = recipe.segments[0];
    // The recipe must contain only inputs, never previously recorded steps.
    assert.equal(Object.hasOwn(seg, 'steps'), false);

    await runSegment(seg);
    const state = game;

    // After the level teleport, the hero stands in Sokoban.
    // state.sokoban_dnum is assigned by init_dungeons() from dungeon.lua.
    const sokobanDnum = state.sokoban_dnum;
    assert.equal(state.u.uz.dnum, sokobanDnum,
        'hero should be in Sokoban after the level teleport');

    // builds_up() must return true for Sokoban: its entry_lev equals
    // num_dunlevs (the entry is the deepest level, and you ascend).
    assert.equal(builds_up(state.u.uz, state), true,
        'Sokoban is an up-building dungeon');

    // On first arrival, dunlev_reached should equal dunlev (do.c:1682-1684).
    // dunlev_reached was 0 before the hero visited any Sokoban level,
    // so the assignment fires unconditionally.
    const dl = dunlev(state.u.uz);
    const dlr = dunlev_reached(state.u.uz, state);
    assert.equal(dlr, dl,
        `dunlev_reached (${dlr}) should equal dunlev (${dl}) on first entry`);

    // The wizard-mode level teleport selects the first listed Sokoban level
    // (soko1, dlevel 1), which in an up-building dungeon is the shallowest.
    // The entry level (num_dunlevs) is the deepest; the hero ascends toward 1.
    assert.equal(dl, 1,
        'wizard teleport to Sokoban arrives at dlevel 1 (soko1, the top)');
});
