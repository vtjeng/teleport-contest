import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { NO_SPELL } from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import {
    MAXSPELL,
    SPE_BLANK_PAPER,
    SPE_BOOK_OF_THE_DEAD,
    SPE_FORCE_BOLT,
    SPE_HEALING,
} from '../js/objects.js';
import {
    force_learn_spell,
    spe_Fresh,
} from '../js/spell.js';
import { SPELL_KNOWLEDGE_KEEN } from '../js/startup_skills.js';

function spellState() {
    const state = {
        svs: {
            spl_book: Array.from(
                { length: MAXSPELL + 1 },
                () => ({ sp_id: NO_SPELL, sp_lev: 0, sp_know: 0 }),
            ),
        },
    };
    init_objects(state, () => 0);
    return state;
}

test('force_learn_spell creates, refreshes, and rejects source spell slots', () => {
    const state = spellState();

    assert.equal(force_learn_spell(SPE_FORCE_BOLT, state), 'a');
    assert.deepEqual(state.svs.spl_book[0], {
        sp_id: SPE_FORCE_BOLT,
        sp_lev: state.objects[SPE_FORCE_BOLT].oc_level,
        sp_know: SPELL_KNOWLEDGE_KEEN,
    });

    state.svs.spl_book[0].sp_know = 0;
    assert.equal(force_learn_spell(SPE_FORCE_BOLT, state), 'a');
    assert.equal(state.svs.spl_book[0].sp_know, SPELL_KNOWLEDGE_KEEN);

    state.svs.spl_book[0].sp_know = SPELL_KNOWLEDGE_KEEN;
    assert.equal(force_learn_spell(SPE_FORCE_BOLT, state), '\0');
    assert.equal(state.svs.spl_book[0].sp_know, SPELL_KNOWLEDGE_KEEN);
    assert.equal(force_learn_spell(SPE_BLANK_PAPER, state), '\0');
    assert.equal(force_learn_spell(SPE_BOOK_OF_THE_DEAD, state), '\0');

    const full = spellState();
    for (let index = 0; index < MAXSPELL; ++index) {
        full.svs.spl_book[index] = {
            sp_id: SPE_FORCE_BOLT,
            sp_lev: 1,
            sp_know: 0,
        };
    }
    assert.equal(force_learn_spell(SPE_HEALING, full), '\0');
    assert.equal(full.svs.spl_book[MAXSPELL].sp_id, NO_SPELL);
});

test('force_learn_spell mirrors the C slot scan and field writes', () => {
    const c = readFileSync('nethack-c/upstream/src/spell.c', 'utf8');
    const start = c.indexOf('force_learn_spell(short otyp)');
    const end = c.indexOf('\n/*', start);
    const body = c.slice(start, end);

    assert.ok(body.includes('known_spell(otyp) == spe_Fresh'));
    assert.ok(body.includes('spellid(i) == NO_SPELL || spellid(i) == otyp'));
    assert.ok(body.includes('svs.spl_book[i].sp_lev = objects[otyp].oc_level'));
    assert.ok(body.includes('incrnknow(i, 0)'));
    assert.ok(body.includes('return spellet(i)'));
    assert.equal(spe_Fresh, 1);
});
