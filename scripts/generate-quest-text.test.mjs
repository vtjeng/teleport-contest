import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    parseQuestText,
} from './generate-quest-text.mjs';
import {
    QUEST_TEXT,
    QUEST_TEXT_DATA,
    QUEST_TEXT_FALLBACKS,
} from '../js/quest_text_data.js';

const questSource = readFileSync(
    new URL('../nethack-c/upstream/dat/quest.lua', import.meta.url),
    'utf8',
);

test('generated quest data matches the complete Lua table', () => {
    // Comparing the entire parsed program checks every role, common message,
    // fallback, named field, and ordered array from the C-loaded source.
    assert.deepEqual(QUEST_TEXT_DATA, parseQuestText(questSource));
});

test('the pager views alias the single generated Lua tables', () => {
    // These checks pin shared references, not copied message or fallback data.
    assert.equal(QUEST_TEXT.Arc, QUEST_TEXT_DATA.Arc);
    assert.equal(QUEST_TEXT.Pri, QUEST_TEXT_DATA.Pri);
    assert.equal(QUEST_TEXT_FALLBACKS, QUEST_TEXT_DATA.msg_fallbacks);
});

test('common cuss and portal entries retain Lua arrays and fields', () => {
    // The 14 angel lines exercise ordered common arrays consumed by cuss().
    assert.equal(QUEST_TEXT_DATA.common.angel_cuss.length, 14);
    // The 27 demon lines exercise the second ordered common cuss array.
    assert.equal(QUEST_TEXT_DATA.common.demon_cuss.length, 27);

    // The portal entry pins its explicit pline mode and multiline text field.
    assert.equal(QUEST_TEXT_DATA.common.quest_portal.output, 'pline');
    assert.equal(
        QUEST_TEXT_DATA.common.quest_portal.text.split('\n').length,
        4,
    );

    // The banished entry pins all three named Lua message fields in source order.
    assert.deepEqual(
        Object.keys(QUEST_TEXT_DATA.common.banished),
        ['synopsis', 'output', 'text'],
    );
});

test('whole-program parsing rejects executable code after the Lua table', () => {
    // This appended statement proves the parser cannot accept a partial program.
    assert.throws(
        () => parseQuestText(`${questSource}\nquesttext = {}`),
        /Unexpected top-level Lua code/u,
    );
});


test('the parser rejects mixed tables outside the audited Lua data shape', () => {
    assert.throws(
        () => parseQuestText(
            'questtext = { common = { mixed = { text = "line", "array" } } }',
        ),
        /Mixed keyed and array values/u,
    );
});
