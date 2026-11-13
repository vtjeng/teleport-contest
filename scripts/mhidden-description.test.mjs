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
import { S_fountain, S_hwall, S_stone, S_vwall } from '../js/symbols.js';

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

// pager.c names every M_AP_FURNITURE appearance from
// defsyms[mappearance].explanation (defsym.h), not only the dungeon-feature
// symbols. makemon.c set_mimic_sym() gives a mimic in a Rogue-level doorway
// S_hwall or S_vwall, both explained as "wall"; S_stone is defsym.h's first
// entry, "stone", the other end of the table.
test('wall- and stone-shaped mimics use the defsyms explanation', () => {
    const state = {
        u: { ux: 10, uy: 10 },
        level: { at: () => undefined, regions: [] },
    };
    const cases = [
        [S_vwall, 'a wall'],
        [S_hwall, 'a wall'],
        [S_stone, 'a stone'],
    ];
    for (const [mappearance, expected] of cases) {
        const mimic = {
            mx: 10, my: 10, m_ap_type: M_AP_FURNITURE, mappearance,
        };
        assert.equal(mhidden_description(mimic, state, {
            includePrefix: false,
            includeArticle: true,
        }), expected);
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
