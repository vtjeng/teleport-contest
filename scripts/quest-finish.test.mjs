import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { quest_chat } from '../js/quest.js';

const QUEST_C = readFileSync(
    new URL('../nethack-c/upstream/src/quest.c', import.meta.url), 'utf8',
);
const DOTHROW_C = readFileSync(
    new URL('../nethack-c/upstream/src/dothrow.c', import.meta.url), 'utf8',
);
const QUEST_JS = readFileSync(new URL('../js/quest.js', import.meta.url), 'utf8');
const DOTHROW_JS = readFileSync(
    new URL('../js/dothrow.js', import.meta.url), 'utf8',
);
const QUEST_FINISH_C = QUEST_C.slice(
    QUEST_C.indexOf('finish_quest(struct obj *obj)'),
    QUEST_C.indexOf('staticfn void\nchat_with_leader'),
);
const QUEST_CHAT_C = QUEST_C.slice(
    QUEST_C.indexOf('chat_with_leader(struct monst *mtmp)'),
    QUEST_C.indexOf('staticfn void\nleader_speaks'),
);
const QUEST_FINISH_JS = QUEST_JS.slice(
    QUEST_JS.indexOf('export async function finish_quest('),
    QUEST_JS.indexOf('async function chat_with_leader('),
);

function leaderState({ gotThanks = false, amulet = false, questArtifact = null } = {}) {
    // The defaults select Rule 3 (artifact returned before the Amulet); the
    // second test overrides gotThanks and amulet to select Rule 1.
    return {
        // The artifact and monster ids are test sentinels: the object and
        // monster below use these same values to reach the C identity checks.
        urole: { questarti: 42 },
        u: {
            uhave: { amulet, questart: Boolean(questArtifact) },
            uevent: {},
        },
        svq: {
            quest_status: {
                leader_m_id: 77,
                got_thanks: gotThanks,
                // Keep the leader eligible and avoid the unrelated cheater check.
                pissed_off: false,
                met_nemesis: true,
            },
        },
        invent: questArtifact,
    };
}

function leader() {
    // C chat_with_leader accepts this peaceful role leader when its id matches.
    return { m_id: 77, mpeaceful: true };
}

test('finish_quest and both direct callers match the selected C branches', () => {
    assert.match(QUEST_FINISH_C,
        /if \(obj && !is_quest_artifact\(obj\)\)[\s\S]*?if \(Deaf\)[\s\S]*?fully_identify_obj\(obj\);/u);
    assert.match(QUEST_FINISH_C,
        /if \(u\.uhave\.amulet\)[\s\S]*?qt_pager\("hasamulet"\);[\s\S]*?carrying\(AMULET_OF_YENDOR\)/u);
    assert.match(QUEST_FINISH_C,
        /qt_pager\(!Qstat\(got_thanks\) \? "offeredit" : "offeredit2"\);[\s\S]*?carrying\(BELL_OF_OPENING\)[\s\S]*?com_pager\("quest_complete_no_bell"\);/u);
    assert.match(QUEST_FINISH_C,
        /Qstat\(got_thanks\) = TRUE;[\s\S]*?u\.uevent\.qcompleted = 1;[\s\S]*?fully_identify_obj\(obj\);[\s\S]*?update_inventory\(\);/u);
    assert.match(DOTHROW_C,
        /finish_quest\(obj\); \/\* acknowledge quest completion \*\//u);
    assert.match(QUEST_CHAT_C, /finish_quest\(\(struct obj \*\) 0\)/u);
    assert.match(QUEST_CHAT_C, /finish_quest\(otmp\)/u);

    assert.match(QUEST_FINISH_JS,
        /await pager\(qs\.got_thanks \? 'offeredit2' : 'offeredit'\);[\s\S]*?await commonPager\('quest_complete_no_bell'\);[\s\S]*?qs\.got_thanks = true;[\s\S]*?u\.uevent\.qcompleted = 1;[\s\S]*?identifyObject\(obj, state\);[\s\S]*?refreshInventory\(inventoryEnv\);/u);
    assert.match(DOTHROW_JS, /await finish_quest\(obj, operationEnv\);/u);
    assert.match(QUEST_JS, /await finish_quest\(null, ops\);/u);
    assert.match(QUEST_JS, /await finish_quest\(otmp, ops\);/u);
    assert.doesNotMatch(DOTHROW_JS, /note_unported\('quest\.c finish_quest'\)/u);
});

test('quest_chat wires the carried-artifact finish and preserves C effect order', async () => {
    // The source uses the role's quest artifact id (42) and an otherwise
    // irrelevant object type; this isolates identity matching in is_quest_artifact.
    const artifact = { oartifact: 42, otyp: -1, nobj: null };
    const state = leaderState({ questArtifact: artifact });
    const events = [];

    await quest_chat(leader(), state, {
        pager: async (msgid) => events.push(`pager:${msgid}`),
        commonPager: async (msgid) => events.push(`common:${msgid}`),
        identifyObject: (obj) => {
            assert.equal(obj, artifact);
            events.push('identify');
        },
        refreshInventory: () => events.push('inventory'),
        unsupported: (reason) => assert.fail(`unexpected quest refusal: ${reason}`),
    });

    // C prints offeredit, recommends the missing Bell, sets got_thanks and
    // qcompleted, then identifies the returned artifact and refreshes inventory.
    assert.deepEqual(events, [
        'pager:offeredit',
        'common:quest_complete_no_bell',
        'identify',
        'inventory',
    ]);
    assert.equal(state.svq.quest_status.got_thanks, true);
    assert.equal(state.u.uevent.qcompleted, 1);
});

test('quest_chat uses the hasamulet pager after the leader already thanked the hero', async () => {
    // This state reaches C's Rule 1 path: an Amulet is carried after thanks,
    // so finish_quest receives NULL and must not set qcompleted again.
    const state = leaderState({ gotThanks: true, amulet: true });
    const pages = [];

    await quest_chat(leader(), state, {
        pager: async (msgid) => pages.push(msgid),
        unsupported: (reason) => assert.fail(`unexpected quest refusal: ${reason}`),
    });

    assert.deepEqual(pages, ['hasamulet']);
    assert.equal(state.svq.quest_status.got_thanks, true);
    assert.equal(Object.hasOwn(state.u.uevent, 'qcompleted'), false);
});
