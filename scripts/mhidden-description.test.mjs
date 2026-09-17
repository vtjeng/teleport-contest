import assert from 'node:assert/strict';
import test from 'node:test';

import {
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    ROOM,
} from '../js/const.js';
import { mhidden_description } from '../js/startup_a11y.js';
import { M2_NEUTER } from '../js/monsters.js';
import { S_fountain } from '../js/symbols.js';

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


test('furniture hidden descriptions append the article exactly once', () => {
    const state = {
        u: { ux: 10, uy: 10 },
        level: { at: () => undefined, regions: [] },
    };
    const mimic = {
        mx: 10,
        my: 10,
        m_ap_type: M_AP_FURNITURE,
        mappearance: S_fountain,
    };

    const cases = [
        [{ includePrefix: true, includeArticle: true },
            ', mimicking a fountain'],
        [{ includePrefix: true, includeArticle: false },
            ', mimicking fountain'],
        [{ includePrefix: false, includeArticle: true }, 'a fountain'],
        [{ includePrefix: false, includeArticle: false }, 'fountain'],
    ];
    for (const [options, expected] of cases) {
        assert.equal(mhidden_description(mimic, state, options), expected);
    }
});

test('alternate-monster articles follow pager prefix gating', () => {
    const alternate = {
        mflags2: 0,
        pmnames: ['male gnome', 'female gnome', 'neutral gnome'],
    };
    const state = {
        u: { ux: 10, uy: 10 },
        level: { at: () => undefined, regions: [] },
        mons: [alternate],
    };
    const mimic = {
        // C pager.c uses monst.h Mgender (female ? FEMALE : MALE), even
        // though mondata.c gender() would answer NEUTRAL for this species.
        data: { mflags2: M2_NEUTER },
        mx: 10,
        my: 10,
        m_ap_type: M_AP_MONSTER,
        mappearance: 0,
    };

    // pager.c applies an() whenever MHID_PREFIX is set, even when the
    // caller omitted MHID_ARTICLE. With no prefix it appends the bare
    // species name for either article flag.
    const cases = [
        [{ includePrefix: true, includeArticle: true },
            ', masquerading as a male gnome'],
        [{ includePrefix: true, includeArticle: false },
            ', masquerading as a male gnome'],
        [{ includePrefix: false, includeArticle: true }, 'male gnome'],
        [{ includePrefix: false, includeArticle: false }, 'male gnome'],
    ];
    for (const [options, expected] of cases) {
        assert.equal(
            mhidden_description(mimic, state, {
                showAlternateMonster: true,
                ...options,
            }),
            expected,
        );
    }
});
