import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { reset_trapset, set_trap } from '../js/apply.js';
import {
    BEAR_TRAP,
    LANDMINE,
    OBJ_FLOOR,
    OBJ_INVENT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { BEARTRAP, LAND_MINE } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/apply.c/beartrap-setting-independent.session.json',
    import.meta.url,
), 'utf8'));
const landmineRecipe = JSON.parse(readFileSync(new URL(
    '../recipes/apply.c/landmine-setting-independent.session.json',
    import.meta.url,
), 'utf8'));

// C ref: apply.c reset_trapset() (2812-2817).
test('reset_trapset preserves the location and time fields', () => {
    const state = {
        gt: {
            trapinfo: {
                tobj: { otyp: BEARTRAP },
                tx: 12,
                ty: 8,
                time_needed: 3,
                force_bungle: true,
            },
        },
    };

    reset_trapset(state);

    assert.deepEqual(state.gt.trapinfo, {
        tobj: null,
        tx: 12,
        ty: 8,
        time_needed: 3,
        force_bungle: false,
    });
});

// C ref: apply.c set_trap() (2922-2926). The occupation callback returns one
// while its decremented timer remains positive, and zero after an interruption.
test('set_trap returns its source continuation and interruption values',
    async () => {
        const trapinfo = {
            tobj: { where: OBJ_INVENT },
            tx: 4,
            ty: 5,
            time_needed: 2,
            force_bungle: false,
        };
        const state = {
            gt: { trapinfo },
            u: { ux: 4, uy: 5 },
        };

        assert.equal(await set_trap(state), 1);
        assert.equal(trapinfo.time_needed, 1);

        trapinfo.tobj.where = OBJ_FLOOR;
        assert.equal(await set_trap(state), 0);
        assert.deepEqual(trapinfo, {
            tobj: null,
            tx: 4,
            ty: 5,
            time_needed: 1,
            force_bungle: false,
        });
    });

// C ref: apply.c doapply() (4388-4393), use_trap() (2821-2911), and set_trap()
// (2916-2952). This reaches the real apply command, consumes the trap after
// its occupation, and checks the trap object that maketrap() put on the level.
test('applying a bear trap sets and finishes the occupation on floor', async () => {
    await runSegment(recipe.segments[0]);

    assert.match(game._ttyToplines,
        /You begin setting your bear trap\.  You finish arming the bear trap\./u);
    const madeTrap = game.level.traps.find((trap) =>
        trap.ttyp === BEAR_TRAP && trap.madeby_u,
    );
    assert.ok(madeTrap, 'set_trap installs a hero-made bear trap');
    assert.deepEqual(game.gt.trapinfo, {
        tobj: null,
        tx: game.u.ux,
        ty: game.u.uy,
        time_needed: 0,
        force_bungle: false,
    });
    assert.equal(game.go.occupation, null);
    for (let obj = game.invent; obj; obj = obj.nobj)
        assert.notEqual(obj.otyp, BEARTRAP, 'useup consumes the applied trap');
});

test('applying a land mine reaches the source-specific trap type', async () => {
    await runSegment(landmineRecipe.segments[0]);

    assert.match(game._ttyToplines,
        /You begin setting your land mine\.  You finish arming the land mine\./u);
    assert.ok(game.level.traps.some((trap) =>
        trap.ttyp === LANDMINE && trap.madeby_u,
    ));
    for (let obj = game.invent; obj; obj = obj.nobj)
        assert.notEqual(obj.otyp, LAND_MINE, 'useup consumes the applied mine');
});
