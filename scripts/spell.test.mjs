import assert from 'node:assert/strict';
import test from 'node:test';

import { NO_SPELL } from '../js/const.js';
import { age_spells } from '../js/spell.js';

test('age_spells decrements contiguous nonzero spell knowledge once', () => {
    const state = {
        svs: {
            spl_book: [
                { sp_id: 400, sp_know: 20_000 },
                { sp_id: 401, sp_know: 1 },
                { sp_id: 402, sp_know: 0 },
                { sp_id: NO_SPELL, sp_know: 99 },
                { sp_id: 403, sp_know: 99 },
            ],
        },
    };
    age_spells(state);
    assert.deepEqual(
        state.svs.spl_book.map(({ sp_know }) => sp_know),
        [19_999, 0, 0, 99, 99],
    );
});

test('age_spells accepts an empty initialized spellbook', () => {
    const state = { svs: { spl_book: [] } };
    assert.doesNotThrow(() => age_spells(state));
});
