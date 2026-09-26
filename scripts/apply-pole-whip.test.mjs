import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    find_poleable_mon,
    get_valid_polearm_position,
    snickersnee_used_dist_attk,
} from '../js/apply.js';
import { ART_SNICKERSNEE } from '../js/artifacts.js';
import { COLNO, IN_SIGHT, ROWNO } from '../js/const.js';
import { GLYPH_MON_MALE_OFF } from '../js/glyph_offsets.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ARROW, BOW, BULLWHIP, LANCE } from '../js/objects.js';

function recordedRecipe(path) {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
        .segments[0];
}

const fireWhip = recordedRecipe(
    '../recipes/dothrow.c/dofire-wielded-whip-entry.session.json',
);
const autoquiver = recordedRecipe(
    '../recipes/dothrow.c/dofire-autoquiver-ranger.session.json',
);
const firePole = recordedRecipe(
    '../recipes/dothrow.c/dofire-wielded-polearm-entry.session.json',
);
const applyWhip = recordedRecipe(
    '../recipes/apply.c/apply-wielded-whip-independent.session.json',
);
const applyPole = recordedRecipe(
    '../recipes/apply.c/use-pole-knight-cancel-independent.session.json',
);

// C ref: apply.c snickersnee_used_dist_attk() (3414-3422). The source reads
// only the selected weapon, artifact id, turn, and remembered turn.
test('snickersnee_used_dist_attk compares the wielded artifact turn', () => {
    const sword = { oartifact: ART_SNICKERSNEE };
    const state = {
        uwep: sword,
        moves: 42,
        context: { snickersnee_turn: 42 },
    };

    assert.equal(snickersnee_used_dist_attk(sword, state), true);
    state.context.snickersnee_turn = 41;
    assert.equal(snickersnee_used_dist_attk(sword, state), false);
    state.context.snickersnee_turn = 42;
    assert.equal(snickersnee_used_dist_attk({}, state), false);
    sword.oartifact = 0;
    assert.equal(snickersnee_used_dist_attk(sword, state), false);
});

// C ref: apply.c get_valid_polearm_position() (3321-3330). It admits visible
// cells whose squared distance is in the inclusive pole range.
test('get_valid_polearm_position uses the inclusive squared range', async () => {
    await runSegment({ ...applyPole, moves: '' });
    game.gp ??= {};
    game.gp.polearm_range_min = 4;
    game.gp.polearm_range_max = 4;
    const { ux, uy } = game.u;

    assert.equal(get_valid_polearm_position(ux + 1, uy, game), false);
    assert.equal(get_valid_polearm_position(ux + 2, uy, game), true);
    assert.equal(get_valid_polearm_position(0, uy, game), false);
});

// C ref: apply.c find_poleable_mon() (3284-3318). It returns a position only
// when exactly one visible poleable glyph is in range.
test('find_poleable_mon returns the sole in-range monster location', () => {
    const ux = 20;
    const uy = 10;
    const cells = Array.from({ length: COLNO }, () =>
        Array.from({ length: ROWNO }, () => ({ disp_glyph: null })));
    const monsters = Array.from({ length: COLNO }, () =>
        Array(ROWNO).fill(null));
    const state = {
        flags: { confirm: false },
        gp: { polearm_range_max: 4, polearm_range_min: 4 },
        level: {
            at: (x, y) => cells[x][y],
            monsters,
        },
        u: { ux, uy, uprops: {} },
        viz_array: Array.from({ length: ROWNO }, () =>
            new Uint8Array(COLNO).fill(IN_SIGHT)),
    };
    const target = { x: ux + 2, y: uy };
    cells[target.x][target.y].disp_glyph = { glyph: GLYPH_MON_MALE_OFF };
    monsters[target.x][target.y] = { mtame: false, mpeaceful: false };
    const pos = { x: ux, y: uy };

    assert.equal(find_poleable_mon(pos, state), true);
    assert.deepEqual(pos, target);

    const second = { x: ux, y: uy + 2 };
    cells[second.x][second.y].disp_glyph = { glyph: GLYPH_MON_MALE_OFF };
    monsters[second.x][second.y] = { mtame: false, mpeaceful: false };
    const unchanged = { x: ux, y: uy };
    assert.equal(find_poleable_mon(unchanged, state), false);
    assert.deepEqual(unchanged, { x: ux, y: uy });
});

test('dofire autoquivers arrows, swaps to their launcher, and shoots',
    async () => {
        await runSegment(autoquiver);

        assert.equal(game.uquiver?.otyp, ARROW);
        assert.ok(game.uquiver.quan < 53,
            'the C recording fires its two-arrow volley');
        assert.equal(game.uwep?.otyp, BOW,
            'the queued secondary bow is wielded for the shot');
        assert.equal(game._pending_message, 'You shoot 2 arrows.');
    });

test('dofire swaps to a secondary polearm and autohit rejects self',
    async () => {
        await runSegment(firePole);

        assert.equal(game.uwep?.otyp, LANCE);
        assert.equal(game._pending_message, "Don't know what to hit.");
        assert.equal(game.moves, 3);
    });

test('dofire and doapply both dispatch a wielded bullwhip', async () => {
    await runSegment(fireWhip);
    assert.equal(game.uwep?.otyp, BULLWHIP);
    assert.equal(game._pending_message, 'Snap!');

    await runSegment(applyWhip);
    assert.equal(game.uwep?.otyp, BULLWHIP);
    assert.equal(game._pending_message, 'Snap!');
});

test('doapply wields the Knight lance and runs polearm targeting', async () => {
    await runSegment(applyPole);

    assert.equal(game.uwep?.otyp, LANCE);
    assert.equal(game._pending_message,
        'You miss; there is no one there to hit.');
    assert.equal(game.moves, 3);
});
