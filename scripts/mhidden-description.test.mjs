import assert from 'node:assert/strict';
import test from 'node:test';

import { parse } from 'acorn';

import {
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    MHID_ALTMON,
    MHID_ARTICLE,
    MHID_PREFIX,
    ROOM,
} from '../js/const.js';
import { mhidden_description } from '../js/startup_a11y.js';
import { M2_NEUTER } from '../js/monsters.js';
import { S_fountain, S_hwall, S_stone, S_vwall } from '../js/symbols.js';
import { readJsSources } from './discarded-promises.mjs';
import { withScreenBuffers } from './screen-buffer-fixture.mjs';

test('object-shaped mimic with unexplored memory falls back to something', () => {
    const state = withScreenBuffers({
        u: { ux: 10, uy: 10 },
        level: {
            flags: { hero_memory: true },
            regions: [],
            at() {
                return { typ: ROOM, remembered_glyph: undefined };
            },
            monsters: [],
        },
    });
    const mimic = {
        mx: 12,
        my: 10,
        m_ap_type: M_AP_OBJECT,
        mappearance: 1,
    };

    assert.equal(
        mhidden_description(mimic, MHID_PREFIX | MHID_ARTICLE, state),
        ', mimicking something',
    );
});


test('furniture hidden descriptions append the article exactly once', () => {
    const state = withScreenBuffers({
        u: { ux: 10, uy: 10 },
        level: { at: () => undefined, regions: [] },
    });
    const mimic = {
        mx: 10,
        my: 10,
        m_ap_type: M_AP_FURNITURE,
        mappearance: S_fountain,
    };

    // Each MHID_PREFIX/MHID_ARTICLE combination, with pager.c's text for it.
    const cases = [
        [MHID_PREFIX | MHID_ARTICLE, ', mimicking a fountain'],
        [MHID_PREFIX, ', mimicking fountain'],
        [MHID_ARTICLE, 'a fountain'],
        [0, 'fountain'],
    ];
    for (const [flags, expected] of cases) {
        assert.equal(mhidden_description(mimic, flags, state), expected);
    }
});

// pager.c names every M_AP_FURNITURE appearance from
// defsyms[mappearance].explanation (defsym.h), not only the dungeon-feature
// symbols. makemon.c set_mimic_sym() gives a mimic in a Rogue-level doorway
// S_hwall or S_vwall, both explained as "wall"; S_stone is defsym.h's first
// entry, "stone", the other end of the table.
test('wall- and stone-shaped mimics use the defsyms explanation', () => {
    const state = withScreenBuffers({
        u: { ux: 10, uy: 10 },
        level: { at: () => undefined, regions: [] },
    });
    const cases = [
        [S_vwall, 'a wall'],
        [S_hwall, 'a wall'],
        [S_stone, 'a stone'],
    ];
    for (const [mappearance, expected] of cases) {
        const mimic = {
            mx: 10, my: 10, m_ap_type: M_AP_FURNITURE, mappearance,
        };
        assert.equal(
            mhidden_description(mimic, MHID_ARTICLE, state),
            expected,
        );
    }
});

test('alternate-monster articles follow pager prefix gating', () => {
    const alternate = {
        mflags2: 0,
        pmnames: ['male gnome', 'female gnome', 'neutral gnome'],
    };
    const state = withScreenBuffers({
        u: { ux: 10, uy: 10 },
        level: { at: () => undefined, regions: [] },
        mons: [alternate],
    });
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
        [MHID_PREFIX | MHID_ARTICLE, ', masquerading as a male gnome'],
        [MHID_PREFIX, ', masquerading as a male gnome'],
        [MHID_ARTICLE, 'male gnome'],
        [0, 'male gnome'],
    ];
    for (const [flags, expected] of cases) {
        assert.equal(
            mhidden_description(mimic, MHID_ALTMON | flags, state),
            expected,
        );
    }
});

// uhitm.c flash_hits_mon() passes only MHID_ALTMON, so a furniture mimic
// reads "closed door" with no prefix or article.  S_vwall stands in for any
// furniture appearance: "That wall is really ..." is the C wording.
test('MHID_ALTMON alone gives a bare furniture name', () => {
    const state = withScreenBuffers({
        u: { ux: 10, uy: 10 },
        level: { at: () => undefined, regions: [] },
    });
    const mimic = {
        mx: 10, my: 10, m_ap_type: M_AP_FURNITURE, mappearance: S_vwall,
    };
    assert.equal(mhidden_description(mimic, MHID_ALTMON, state), 'wall');
});

// Every JavaScript call of mhidden_description(), keyed by
// "<file> | <enclosing function>", with the MHID_* mask its C call site
// passes.  A new call fails until it is listed here with its C site, and a
// listed call that changes or disappears fails too.
const CALL_SITES = {
    'js/insight.js | mstatusline': [
        'MHID_PREFIX | MHID_ARTICLE | MHID_ALTMON | MHID_REGION',
        'insight.c mstatusline() 3319-3321'],
    'js/makemon_create.js | runtimeAppearanceMessage': [
        'MHID_ARTICLE | MHID_ALTMON', 'makemon.c makemon() 1487'],
    'js/pager.js | look_at_monster': [
        'MHID_PREFIX | MHID_ARTICLE | MHID_REGION',
        'pager.c look_at_monster() 482'],
    'js/pager.js | self_lookat': [
        'MHID_PREFIX | MHID_ARTICLE | MHID_REGION', 'pager.c self_lookat() 124'],
    'js/uhitm.js | flash_hits_mon': ['MHID_ALTMON',
        'uhitm.c flash_hits_mon() 6361'],
};

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function enclosingName(ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const node = ancestors[i];
        if (!FUNCTION_TYPES.has(node.type)) continue;
        if (node.id) return node.id.name;
        const parent = ancestors[i - 1];
        if (parent?.type === 'VariableDeclarator') return parent.id.name;
    }
    return '<module>';
}

function flagText(node, text) {
    return text.slice(node.start, node.end).replace(/\s+/gu, ' ');
}

function scanCallSites(sources) {
    const found = {};
    for (const [file, text] of Object.entries(sources)) {
        if (!text.includes('mhidden_description(')) continue;
        const ast = parse(text, {
            ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true,
        });
        const visit = (node, ancestors) => {
            if (node.type === 'CallExpression'
                && node.callee.type === 'Identifier'
                && node.callee.name === 'mhidden_description') {
                const key = `${file} | ${enclosingName(ancestors)}`;
                const flags = node.arguments[1];
                (found[key] ??= []).push(flags ? flagText(flags, text) : '');
            }
            ancestors.push(node);
            for (const value of Object.values(node)) {
                if (Array.isArray(value)) {
                    for (const child of value)
                        if (child && typeof child.type === 'string')
                            visit(child, ancestors);
                } else if (value && typeof value.type === 'string') {
                    visit(value, ancestors);
                }
            }
            ancestors.pop();
        };
        visit(ast, []);
    }
    return found;
}

test('every mhidden_description() call passes its C site\'s MHID_* flags', () => {
    const found = scanCallSites(readJsSources());
    const expected = Object.fromEntries(Object.entries(CALL_SITES)
        .map(([key, [flags]]) => [key, [flags]]));
    assert.deepEqual(found, expected);
});
