import assert from 'node:assert/strict';
import test from 'node:test';

import { A_NEUTRAL } from '../js/const.js';
import { qt_pager } from '../js/questpgr.js';
import { QUEST_TEXT } from '../js/quest_text_data.js';
import { quest_stat_check, quest_talk } from '../js/quest.js';
import { MS_LEADER, MS_NEMESIS } from '../js/monsters.js';
import { roles } from '../js/roles.js';
import {
    loadQuestLeaderBadalignRecipe,
    loadQuestLeaderFirstMeetingRecipe,
} from './run-quest-leader-first-meeting.mjs';

test('quest leader first-meeting recipe is a clean replay input', () => {
    const recipe = loadQuestLeaderFirstMeetingRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.ok(recipe.segments[0].moves.includes('#chat\nl  y .'));
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
});

test('quest leader badalign recipe is a clean replay input', () => {
    const recipe = loadQuestLeaderBadalignRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    // The rest that lets dochug() give the waiting leader its turn, then the
    // two --More-- dismissals, the declined adjustment, and the space that
    // dismisses badalign and lets the expulsion happen.
    assert.ok(recipe.segments[0].moves.endsWith('kkkk..  n '));
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
});

test('Priest quest pager contains the first meeting and assignment text', () => {
    assert.match(QUEST_TEXT.Pri.leader_first.text, /great challenge/u);
    assert.match(QUEST_TEXT.Pri.assignquest.text, /Great Festivals/u);
});

test('every role has the badalign text chat_with_leader() delivers', () => {
    // dat/quest.lua gives every role its own badalign entry, so qt_pager()
    // never falls through to the common section for it.
    for (const filecode of Object.keys(QUEST_TEXT)) {
        if (filecode.startsWith('_')) continue;
        assert.equal(typeof QUEST_TEXT[filecode].badalign?.text, 'string',
            `${filecode} is missing badalign text`);
    }
});

// The Archeologist's badalign line reads "suitable for %ra" and "the %a path",
// so it pins convert_arg()'s rank and alignment substitutions together.
// dat/quest.lua:215-222.
function archeologistPagerState() {
    return {
        plname: 'Wren',
        urole: { ...roles[0], filecode: 'Arc' },
        flags: { female: false },
        u: {
            ulevel: 20, // rank index 5: Spelunker
            ualign: { type: A_NEUTRAL, record: 0 },
            ualignbase: [A_NEUTRAL, A_NEUTRAL],
            uprops: [],
        },
        svq: { quest_status: {} },
    };
}

test('qt_pager substitutes the hero rank into the badalign text', async () => {
    const state = archeologistPagerState();
    const lines = [];
    // dat/nhlib.lua shuffles a three-entry table when the pager's Lua state
    // loads; the fixed answers keep this test off the live PRNG.
    const shuffleDraws = [];
    const random = (bound) => {
        shuffleDraws.push(bound);
        return 0;
    };

    await qt_pager('badalign', state, random, {
        pline: () => assert.fail('badalign is output="text", not a pline'),
        window: (_state, rows) => lines.push(...rows.map((row) => row.text)),
    });

    assert.deepEqual(shuffleDraws, [3, 2]);
    assert.ok(lines.some((line) => line.includes('suitable for a Spelunker!')),
        `no rank substitution in ${JSON.stringify(lines)}`);
    assert.ok(lines.some((line) => line.includes('the neutral path')),
        `no alignment substitution in ${JSON.stringify(lines)}`);
    assert.ok(lines[0].startsWith('"Wren!'),
        `no capitalized name in ${JSON.stringify(lines[0])}`);
});

// C ref: quest.c quest_talk() (494-511) and quest_stat_check() (513-518).
function questTalkState() {
    return {
        u: { ux: 5, uy: 4, uz: { dnum: 3, dlevel: 1 } },
        svq: { quest_status: { leader_m_id: 77 } },
    };
}

test('quest_talk stays silent for a monster with no quest voice', async () => {
    const state = questTalkState();
    await quest_talk(
        { m_id: 12, data: { msound: MS_LEADER } },
        {
            state,
            unsupported: (reason) => assert.fail(`unexpected: ${reason}`),
        },
    );
});

test('quest_talk refuses the nemesis it cannot speak for', async () => {
    const state = questTalkState();
    const refusals = [];
    await quest_talk(
        { m_id: 12, data: { msound: MS_NEMESIS } },
        { state, unsupported: (reason) => refusals.push(reason) },
    );
    assert.deepEqual(refusals, ['the quest nemesis speaking']);
});

test('quest_stat_check tracks only the nemesis in_battle flag', () => {
    const state = questTalkState();
    // Adjacent to the hero at (5,4), awake and able to move.
    const nemesis = {
        data: { msound: MS_NEMESIS, mflags1: 0 },
        mx: 4, my: 4, mcanmove: true, msleeping: false,
    };
    quest_stat_check(nemesis, state);
    assert.equal(state.svq.quest_status.in_battle, true);

    // Asleep: helpless() holds, so the nemesis is no longer in battle.
    nemesis.msleeping = true;
    quest_stat_check(nemesis, state);
    assert.equal(state.svq.quest_status.in_battle, false);

    // A non-nemesis leaves the flag alone rather than clearing it.
    state.svq.quest_status.in_battle = true;
    quest_stat_check(
        { data: { msound: MS_LEADER, mflags1: 0 }, mx: 4, my: 4,
            mcanmove: true, msleeping: false },
        state,
    );
    assert.equal(state.svq.quest_status.in_battle, true);
});
