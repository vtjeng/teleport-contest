import assert from 'node:assert/strict';
import test from 'node:test';

import { QUEST_TEXT } from '../js/quest_text_data.js';
import { loadQuestLeaderFirstMeetingRecipe } from './run-quest-leader-first-meeting.mjs';

test('quest leader first-meeting recipe is a clean replay input', () => {
    const recipe = loadQuestLeaderFirstMeetingRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.ok(recipe.segments[0].moves.includes('#chat\nl  y .'));
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
});

test('Priest quest pager contains the first meeting and assignment text', () => {
    assert.match(QUEST_TEXT.Pri.leader_first.text, /great challenge/u);
    assert.match(QUEST_TEXT.Pri.assignquest.text, /Great Festivals/u);
});
