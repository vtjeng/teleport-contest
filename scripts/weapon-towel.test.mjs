import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_INVENT } from '../js/const.js';
import { TOWEL } from '../js/objects.js';
import { dry_a_towel, wet_a_towel } from '../js/weapon.js';

const WEAPON_C = readFileSync(
    new URL('../nethack-c/upstream/src/weapon.c', import.meta.url), 'utf8',
);

test('wet_a_towel and dry_a_towel keep C amount signs, clamping, and wield state',
    async () => {
        const sourceStart = WEAPON_C.indexOf(
            'finish_towel_change(struct obj *obj, int newspe)',
        );
        const wetStart = WEAPON_C.indexOf(
            'wet_a_towel(\n    struct obj *obj,', sourceStart,
        );
        const dryStart = WEAPON_C.indexOf(
            'dry_a_towel(\n    struct obj *obj,', wetStart,
        );
        assert.ok(sourceStart >= 0 && wetStart > sourceStart && dryStart > wetStart);
        assert.match(WEAPON_C.slice(sourceStart, wetStart),
            /newspe = min\(newspe, 7\);\s*obj->spe = max\(newspe, 0\);/u);
        assert.match(WEAPON_C.slice(wetStart, dryStart),
            /\(amt <= 0\) \? obj->spe - amt : amt/u);
        assert.match(WEAPON_C.slice(dryStart, dryStart + 1300),
            /\(amt < 0\) \? obj->spe \+ amt : amt/u);

        // A carried towel starts at spe=2 so the negative wet amount adds two,
        // crossing C's damp-to-wet threshold while it remains wielded.
        const towel = { otyp: TOWEL, spe: 2, where: OBJ_INVENT, nobj: null };
        const refreshed = [];
        const state = {
            invent: towel,
            iflags: { perm_invent: true },
            program_state: { in_moveloop: true },
            uwep: towel,
            unweapon: true,
        };
        const env = {
            hooks: { updateInventory: (current) => refreshed.push(current) },
            message: async () => {},
        };

        await wet_a_towel(towel, -2, false, state, env);
        assert.equal(towel.spe, 4);
        assert.equal(state.unweapon, false);

        // amt=0 selects dry spe=0; the C helper must set unweapon for the now
        // dry wielded towel and refresh the carried inventory once more.
        await dry_a_towel(towel, 0, false, state, env);
        assert.equal(towel.spe, 0);
        assert.equal(state.unweapon, true);
        assert.deepEqual(refreshed, [state, state]);
    });

test('towel wetness clamps after source-directed changes', async () => {
    // Starting at spe=6 and adding three exercises C's maximum of seven.
    const towel = { otyp: TOWEL, spe: 6, where: 0 };
    await wet_a_towel(towel, -3, false, {}, { message: async () => {} });
    assert.equal(towel.spe, 7);

    // Starting at spe=1 and subtracting three exercises C's minimum of zero.
    towel.spe = 1;
    await dry_a_towel(towel, -3, false, {}, { message: async () => {} });
    assert.equal(towel.spe, 0);
});
