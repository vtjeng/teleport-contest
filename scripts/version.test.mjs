import assert from 'node:assert/strict';
import test from 'node:test';

import { ECMD_OK } from '../js/const.js';
import { doversion, getversionstring } from '../js/version.js';

// C ref: version.c:doversion() prints getversionstring() when
// iflags.menu_requested is false, then returns ECMD_OK without advancing a turn.
test('doversion prints the short version and returns ECMD_OK', async () => {
    const state = { iflags: { menu_requested: false } };
    const messages = [];

    // The help-version comparison normalizes the Linux recorder's Unix build
    // label to the MacOS version_id used by the judge profile.
    assert.equal(
        getversionstring(),
        'MacOS NetHack Version 5.0.0 - last build May  2 2026 12:00:00.',
    );
    const result = await doversion(state, {
        pline: async (message, currentState) => {
            messages.push([message, currentState]);
        },
    });

    assert.equal(result, ECMD_OK);
    assert.deepEqual(messages, [[getversionstring(), state]]);
});
