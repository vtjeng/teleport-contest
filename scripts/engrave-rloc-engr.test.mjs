import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { COLNO, DUST, HEADSTONE, ROOM, ROWNO, STONE } from '../js/const.js';
import { engr_at, rloc_engr } from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { SPE_TELEPORT_AWAY, WAN_TELEPORTATION } from '../js/objects.js';
import { zap_map } from '../js/zap.js';

function fixture() {
    const level = new GameMap();
    for (let x = 0; x < COLNO; ++x)
        for (let y = 0; y < ROWNO; ++y) level.at(x, y).typ = ROOM;
    const state = { level, u: { ux: 23, uy: 12 }, youmonst: {} };
    // Distinct valid coordinates separate the original text, collision and hero guards.
    const ep = { engr_x: 8, engr_y: 7, engr_type: DUST, engr_txt: ['Relocate'], eread: true };
    state.head_engr = ep;
    return { state, ep };
}

test('rloc_engr retries existing text, hero position and bad terrain in source order', () => {
    const { state, ep } = fixture();
    ep.nxt_engr = { engr_x: 4, engr_y: 3 };
    state.level.at(5, 4).typ = STONE;
    const coordinates = [4, 3, 23, 12, 5, 4, 6, 5];
    const events = [];
    rloc_engr(ep, state, {
        random: { rn2: bound => {
            events.push(bound);
            const value = coordinates.shift();
            // C rn1(COLNO-3,2) shifts only the column draw by two.
            return bound === COLNO - 3 ? value - 2 : value;
        } },
        redraw: (x, y) => events.push([x, y]),
    });
    assert.deepEqual(events, [...Array(4).fill([COLNO - 3, ROWNO]).flat(), [6, 5]]);
    assert.equal(engr_at(8, 7, state), null);
    assert.equal(engr_at(6, 5, state), ep);
    assert.equal(ep.eread, true); // Only the doengrave caller clears its text flags.
    assert.deepEqual(ep.engr_txt, ['Relocate']);
});

test('rloc_engr exhausts exactly 200 source attempts without changing or redrawing text', () => {
    const { state, ep } = fixture();
    // This occupied destination makes the || skip goodpos completely.
    ep.nxt_engr = { engr_x: 4, engr_y: 3 };
    state.level.at = () => assert.fail('occupied engraving must short-circuit goodpos');
    const bounds = [];
    rloc_engr(ep, state, {
        random: { rn2: bound => {
            bounds.push(bound);
            return bound === COLNO - 3 ? 2 : 3; // Column 4, row 3, as above.
        } },
        redraw: () => assert.fail('C exhaustion returns before newsym'),
    });
    assert.deepEqual(bounds, Array(200).fill([COLNO - 3, ROWNO]).flat()); // engrave.c:1669.
    assert.equal(ep.engr_x, 8);
    assert.equal(ep.engr_y, 7);
    assert.equal(state.head_engr, ep);
});

test('both direct source callers run rloc_engr at their source boundary', async () => {
    const engraving = await readFile(new URL('../js/engrave.js', import.meta.url), 'utf8');
    const zap = await readFile(new URL('../js/zap.js', import.meta.url), 'utf8');
    assert.match(engraving, /if \(de\.teleengr\) \{\s*rloc_engr\(de\.oep, state, env\);\s*de\.oep\.eread = false;\s*de\.oep\.erevealed = false;/u);
    assert.match(zap, /case WAN_TELEPORTATION:\s*case SPE_TELEPORT_AWAY:\s*rloc_engr\(engraving, state,/u);
});

test('downward wand and spell teleportation preserve C headstone protection', async () => {
    for (const otyp of [WAN_TELEPORTATION, SPE_TELEPORT_AWAY]) {
        const { state, ep } = fixture();
        ep.engr_type = HEADSTONE;
        state.u.dz = 1; // zap.c's downward effect; headstones skip its engraving switch.
        await zap_map(ep.engr_x, ep.engr_y, { otyp }, state, {
            rn2: () => assert.fail('a protected headstone never enters rloc_engr'),
        });
        assert.equal(engr_at(8, 7, state), ep);
    }
});
