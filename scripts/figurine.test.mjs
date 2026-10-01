import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    OBJ_FLOOR,
    OBJ_INVENT,
    ROOM,
    TREE,
} from '../js/const.js';
import { figurine_location_checks } from '../js/apply.js';
import { resetGame } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { monst_globals_init, PM_GNOME } from '../js/monsters.js';
import { FIGURINE, BOULDER } from '../js/objects.js';

const APPLY_C = readFileSync(
    new URL('../nethack-c/upstream/src/apply.c', import.meta.url), 'utf8',
);
const DOG_C = readFileSync(
    new URL('../nethack-c/upstream/src/dog.c', import.meta.url), 'utf8',
);
const SPELL_C = readFileSync(
    new URL('../nethack-c/upstream/src/spell.c', import.meta.url), 'utf8',
);

function locationState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 10, uy: 10, uswallow: false };
    monst_globals_init(state);
    state.level.at(5, 5).typ = ROOM;
    return state;
}

test('figurine_location_checks follows apply.c occupancy and terrain order',
    async () => {
        const state = locationState();
        const figurine = {
            otyp: FIGURINE,
            where: OBJ_FLOOR,
            corpsenm: PM_GNOME,
        };

        // A valid room is admitted before the obstruction and boulder checks.
        assert.equal(
            await figurine_location_checks(
                figurine, { x: 5, y: 5 }, true, state,
            ),
            true,
        );
        // apply.c rejects the x=0 boundary through isok() before reading levl.
        assert.equal(
            await figurine_location_checks(
                figurine, { x: 0, y: 5 }, true, state,
            ),
            false,
        );

        // Ordinary gnomes cannot pass through the solid-rock terrain value.
        state.level.at(5, 5).typ = 0;
        assert.equal(
            await figurine_location_checks(
                figurine, { x: 5, y: 5 }, true, state,
            ),
            false,
        );

        // The tree branch selects its distinct source message.
        state.level.at(5, 5).typ = TREE;
        const messages = [];
        assert.equal(
            await figurine_location_checks(
                figurine,
                { x: 5, y: 5 },
                false,
                state,
                { message: async (text) => messages.push(text) },
            ),
            false,
        );
        assert.deepEqual(messages, ['You cannot place a figurine in a tree!']);

        // C checks the floor boulder only after passwall and rock throwing.
        state.level.at(5, 5).typ = ROOM;
        state.level.objects[5][5] = { otyp: BOULDER, nexthere: null };
        assert.equal(
            await figurine_location_checks(
                figurine, { x: 5, y: 5 }, true, state,
            ),
            false,
        );

        // A carried figurine inside an engulfer fails before coordinate tests.
        figurine.where = OBJ_INVENT;
        state.u.uswallow = true;
        assert.equal(
            await figurine_location_checks(figurine, null, true, state),
            false,
        );
    });

test('figurine and spell ports name the complete C behavior and caller sites',
    () => {
        // Pin the source branches that supply the object, retry, and spell
        // entry behavior; runtime recordings cover the impure branches.
        assert.match(DOG_C, /pick_familiar_pm\(struct obj \*otmp, boolean quietly\)/);
        assert.match(DOG_C, /mtmp = makemon\(pm, x, y, mmflags\);/);
        assert.match(DOG_C, /while \(!mtmp && --trycnt > 0\);/);
        assert.match(DOG_C, /chance = rn2\(10\);/);
        assert.match(APPLY_C, /fig_transform\(anything \*arg, long timeout\)/);
        assert.match(APPLY_C, /figurine_location_checks\(struct obj \*obj, coord \*cc, boolean quietly\)/);
        assert.match(APPLY_C, /use_figurine\(struct obj \*\*optr\)/);
        assert.match(SPELL_C, /case SPE_CREATE_FAMILIAR:\s+\(void\) make_familiar\(\(struct obj \*\) 0, u\.ux, u\.uy, FALSE\);/);
    });
