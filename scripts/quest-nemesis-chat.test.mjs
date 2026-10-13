import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MS_GUARDIAN, MS_NEMESIS } from '../js/monsters.js';
import { quest_chat } from '../js/quest.js';

function conversationState({ metNemesis = false, questart = false,
    killedNemesis = false } = {}) {
    return {
        // A distinct leader ID ensures these cases use the msound switch.
        svq: { quest_status: {
            leader_m_id: 77,
            met_nemesis: metNemesis,
            killed_nemesis: killedNemesis,
        } },
        u: { uhave: { questart } },
    };
}

test('quest nemesis chat pages before setting met_nemesis', async () => {
    const state = conversationState();
    const events = [];
    const nemesis = { m_id: 12, data: { msound: MS_NEMESIS } };

    const handled = await quest_chat(nemesis, state, {
        pager: async (msgid) => {
            events.push(msgid);
            assert.equal(state.svq.quest_status.met_nemesis, false);
        },
        unsupported: (reason) => assert.fail(`unexpected: ${reason}`),
    });

    assert.equal(handled, true);
    assert.deepEqual(events, ['discourage']);
    assert.equal(state.svq.quest_status.met_nemesis, true);
});

test('repeat quest nemesis chat keeps met_nemesis set', async () => {
    // C only increments the bitfield when the prior value is false.
    const state = conversationState({ metNemesis: true });
    const events = [];
    const nemesis = { m_id: 12, data: { msound: MS_NEMESIS } };

    const handled = await quest_chat(nemesis, state, {
        pager: async (msgid) => events.push(msgid),
        unsupported: (reason) => assert.fail(`unexpected: ${reason}`),
    });

    assert.equal(handled, true);
    assert.deepEqual(events, ['discourage']);
    assert.equal(state.svq.quest_status.met_nemesis, true);
});

test('quest guardian selects before and after dialogue from quest state',
    async () => {
        // Without both source predicates, C uses guardtalk_before.
        const beforeState = conversationState({
            questart: true,
            killedNemesis: false,
        });
        const before = [];
        const guardian = { m_id: 12, data: { msound: MS_GUARDIAN } };
        await quest_chat(guardian, beforeState, {
            pager: async (msgid) => before.push(msgid),
            unsupported: (reason) => assert.fail(`unexpected: ${reason}`),
        });

        // C selects guardtalk_after only when both flags are true.
        const afterState = conversationState({
            questart: true,
            killedNemesis: true,
        });
        const after = [];
        await quest_chat(guardian, afterState, {
            pager: async (msgid) => after.push(msgid),
            unsupported: (reason) => assert.fail(`unexpected: ${reason}`),
        });

        assert.deepEqual(before, ['guardtalk_before']);
        assert.deepEqual(after, ['guardtalk_after']);
    });

test('quest chat keeps its C helper order and production dispatch', () => {
    const cQuest = readFileSync(new URL('../nethack-c/upstream/src/quest.c',
        import.meta.url), 'utf8');
    const cSounds = readFileSync(new URL('../nethack-c/upstream/src/sounds.c',
        import.meta.url), 'utf8');
    const jsQuest = readFileSync(new URL('../js/quest.js', import.meta.url),
        'utf8');
    const jsSounds = readFileSync(new URL('../js/sounds.js', import.meta.url),
        'utf8');

    assert.match(cQuest,
        /chat_with_nemesis\(void\)[\s\S]*?qt_pager\("discourage"\);\s*if \(!Qstat\(met_nemesis\)\)\s*Qstat\(met_nemesis\+\+\);/u);
    assert.match(cQuest,
        /chat_with_guardian\(void\)[\s\S]*?if \(u\.uhave\.questart && Qstat\(killed_nemesis\)\)\s*qt_pager\("guardtalk_after"\);\s*else\s*qt_pager\("guardtalk_before"\);/u);
    assert.match(cQuest,
        /case MS_NEMESIS:\s*chat_with_nemesis\(\);\s*break;\s*case MS_GUARDIAN:\s*chat_with_guardian\(\);/u);
    assert.match(jsQuest,
        /await ops\.pager\('discourage'\);\s*if \(!qs\.met_nemesis\) qs\.met_nemesis = true;/u);
    assert.match(jsQuest,
        /state\.u\.uhave\.questart && qs\.killed_nemesis\s*\? 'guardtalk_after' : 'guardtalk_before'/u);
    assert.match(jsQuest,
        /mtmp\.data\?\.msound === MS_NEMESIS[\s\S]*?chat_with_nemesis\(ops\)[\s\S]*?mtmp\.data\?\.msound === MS_GUARDIAN[\s\S]*?chat_with_guardian\(ops\)/u);
    assert.match(cSounds,
        /case MS_LEADER:\s*case MS_NEMESIS:\s*case MS_GUARDIAN:\s*quest_chat\(mtmp\);/u);
    assert.match(jsSounds,
        /case MS_LEADER:\s*case MS_NEMESIS:\s*case MS_GUARDIAN:[\s\S]*?await quest_chat\(mtmp, state,/u);
});
