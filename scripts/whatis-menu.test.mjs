import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HALLUC, HALLUC_RES } from '../js/const.js';
import { do_look, UnsupportedWhatisError, whatisMenuItems } from '../js/pager.js';

const SOURCE = readFileSync(new URL('../nethack-c/upstream/src/pager.c', import.meta.url), 'utf8');

function stateFor({ hallucinating = false, resistant = false } = {}) {
    const uprops = [];
    // Any positive timeout activates the property. One avoids depending on
    // potion duration; HALLUC_RES suppresses Hallucination in the C macro.
    uprops[HALLUC] = { intrinsic: hallucinating ? 1 : 0 };
    uprops[HALLUC_RES] = { intrinsic: resistant ? 1 : 0 };
    return { flags: { lootabc: false }, u: { uprops, uswallow: false } };
}

test('Hallucination retains the three ordinary whatis choices', () => {
    assert.match(SOURCE, /if \(!u\.uswallow && !Hallucination\)/u);
    // pager.c:do_look adds these before the Hallucination guard. The hidden
    // y/n group accelerators remain available in the non-lootabc menu.
    assert.deepEqual(whatisMenuItems(stateFor({ hallucinating: true })), [
        { value: '/', selector: '/', groupSelector: 'y', label: 'something on the map' },
        { value: 'i', selector: 'i', label: "something you're carrying" },
        { value: '?', selector: '?', groupSelector: 'n', label: 'something else (by symbol or name)' },
    ]);
});

test('ordinary and hallucination-resistant heroes retain the list choices', () => {
    // pager.c:do_look adds m/M/o/O/t/T/e/E in this definition order, only
    // when the hero is neither swallowed nor hallucinating.
    const values = ['/', 'i', '?', 'm', 'M', 'o', 'O', 't', 'T', 'e', 'E'];
    for (const state of [stateFor(), stateFor({ hallucinating: true, resistant: true })]) {
        assert.deepEqual(whatisMenuItems(state).map(({ value }) => value), values);
    }
});

test('quick hallucinatory lookup remains an explicit outside-limit path', async () => {
    // pager.c mode 1 bypasses the selection menu and immediately chooses the
    // map path. This correction verifies menu cancellation, not that lookup.
    await assert.rejects(do_look(1, null, stateFor({ hallucinating: true })),
        (error) => error instanceof UnsupportedWhatisError
            && error.reason === 'a hallucinating hero');
});
