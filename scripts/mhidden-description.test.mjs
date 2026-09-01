import assert from 'node:assert/strict';
import test from 'node:test';

import { M_AP_OBJECT, ROOM } from '../js/const.js';
import { mhidden_description } from '../js/startup_a11y.js';

test('object-shaped mimic with unexplored memory falls back to something', () => {
    const state = {
        u: { ux: 10, uy: 10 },
        level: {
            flags: { hero_memory: true },
            regions: [],
            at() {
                return { typ: ROOM, remembered_glyph: undefined };
            },
            monsters: [],
        },
    };
    const mimic = {
        mx: 12,
        my: 10,
        m_ap_type: M_AP_OBJECT,
        mappearance: 1,
    };

    assert.equal(
        mhidden_description(mimic, state),
        ', mimicking something',
    );
});
