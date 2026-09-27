import assert from 'node:assert/strict';
import test from 'node:test';

import { QUEST_TEXT } from '../js/quest_text_data.js';
import { qt_pager, skip_pager } from '../js/questpgr.js';

const ROLE_FILECODES = [
    'Arc', 'Bar', 'Cav', 'Hea', 'Kni', 'Mon', 'Pri',
    'Ran', 'Rog', 'Sam', 'Tou', 'Val', 'Wiz',
];

test('quest artifact pager text is generated for every role', () => {
    for (const filecode of ROLE_FILECODES) {
        assert.equal(typeof QUEST_TEXT[filecode]?.gotit?.text, 'string',
            `${filecode} has no generated gotit text`);
        assert.equal(QUEST_TEXT[filecode].gotit.output, 'text');
    }
});

test('skip_pager matches questpgr.c wizkit suppression before Lua setup', () => {
    // C ref: questpgr.c:skip_pager() returns TRUE only while
    // program_state.wizkit_wishing is set.
    assert.equal(skip_pager({ program_state: { wizkit_wishing: true } }), true);
    assert.equal(skip_pager({ program_state: { wizkit_wishing: false } }), false);
    assert.equal(skip_pager({}), false);
});

test('a skipped quest pager does not initialize Lua or emit output', async () => {
    let draws = 0;
    let outputs = 0;
    const state = { program_state: { wizkit_wishing: true } };
    const output = {
        pline: async () => { outputs++; },
        window: async () => { outputs++; },
    };

    await qt_pager('gotit', state, () => {
        draws++;
        return 0;
    }, output);

    assert.equal(draws, 0);
    assert.equal(outputs, 0);
});
