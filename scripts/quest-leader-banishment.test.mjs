// C ref: quest.c chat_with_leader() converted-alignment verdict.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    A_CHAOTIC, A_NEUTRAL, LL_ACHIEVE, MIN_QUEST_ALIGN,
    MIN_QUEST_LEVEL, UTOTYPE_DEFERRED, UTOTYPE_PORTAL,
} from '../js/const.js';
import { quest_chat } from '../js/quest.js';
import { monst_globals_init, PM_CLERIC } from '../js/monsters.js';
import { roles } from '../js/roles.js';

function audience(converted) {
    const priest = roles.find(role => role.filecode === 'Pri');
    const state = {
        moves: 0,
        multi: 0,
        context: {},
        wizard: false,
        urole: { ...priest, lgod: 'L', ngod: 'N', cgod: 'C' },
        qstart_level: { dnum: 1, dlevel: 5 },
        dungeons: [{ dname: 'The Dungeons' }, { dname: 'The Quest' }],
        branches: [{ end1: { dnum: 0, dlevel: 10 },
            end2: { dnum: 1, dlevel: 1 } }],
        u: {
            ulevel: MIN_QUEST_LEVEL,
            uz: { dnum: 1, dlevel: 5 },
            uevent: {},
            ualign: { type: converted ? A_CHAOTIC : A_NEUTRAL,
                record: MIN_QUEST_ALIGN },
            ualignbase: [A_NEUTRAL, converted ? A_CHAOTIC : A_NEUTRAL],
            uhave: { questart: false },
            utolev: { dnum: 0, dlevel: 0 },
        },
        svq: { quest_status: { leader_m_id: 77, got_quest: false,
            got_thanks: false, pissed_off: false, met_leader: false } },
        gamelog: [],
    };
    monst_globals_init(state);
    const leader = { m_id: 77, mpeaceful: true,
        data: state.mons[PM_CLERIC], female: false, mextra: {} };
    return { state, leader };
}

test('converted hero is banished by the quest leader', async () => {
    const { state, leader } = audience(true);
    const pages = [];
    await quest_chat(leader, state, {
        random: { rn2: () => 0 },
        pager: async id => pages.push(`quest:${id}`),
        commonPager: async id => pages.push(`common:${id}`),
        unsupported: reason => assert.fail(`unported: ${reason}`),
    });
    assert.deepEqual(pages, ['quest:leader_first', 'common:banished']);
    assert.equal(state.svq.quest_status.met_leader, true);
    assert.equal(state.svq.quest_status.pissed_off, true);
    assert.equal(state.u.utotype, UTOTYPE_PORTAL | UTOTYPE_DEFERRED);
    assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 10 });
    assert.deepEqual(state.gamelog, [{ turn: 0, flags: LL_ACHIEVE,
        text: 'the high priest has expelled you from the quest' }]);
});

test('unchanged alignment still earns the quest at the same audience', async () => {
    const { state, leader } = audience(false);
    const pages = [];
    await quest_chat(leader, state, {
        random: { rn2: () => 0 },
        pager: async id => pages.push(id),
        unsupported: reason => assert.fail(`unported: ${reason}`),
    });
    assert.deepEqual(pages, ['leader_first', 'assignquest']);
    assert.equal(state.svq.quest_status.got_quest, true);
    assert.equal(state.svq.quest_status.pissed_off, false);
});
