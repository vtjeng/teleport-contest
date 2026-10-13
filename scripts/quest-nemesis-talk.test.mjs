import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MS_GUARDIAN, MS_NEMESIS } from '../js/monsters.js';
import { quest_stat_check, quest_talk } from '../js/quest.js';

const QUEST_C = readFileSync('nethack-c/upstream/src/quest.c', 'utf8');
const MONMOVE_C = readFileSync('nethack-c/upstream/src/monmove.c', 'utf8');
const MONMOVE_JS = readFileSync('js/monmove.js', 'utf8');

function conversationState({ inBattle = false, madeGoal = 0,
    metNemesis = false, questart = false } = {}) {
    return {
        svq: { quest_status: {
            leader_m_id: 77,
            in_battle: inBattle,
            made_goal: madeGoal,
            met_nemesis: metNemesis,
        } },
        u: { uhave: { questart } },
    };
}

function nemesis() {
    return { m_id: 12, data: { msound: MS_NEMESIS } };
}

function testOps(state, events, random = () => assert.fail('unexpected RNG')) {
    return {
        state,
        random,
        async pager(msgid) {
            events.push(msgid);
        },
        unsupported(reason) {
            assert.fail(`unexpected unsupported path: ${reason}`);
        },
    };
}

test('quest nemesis proximity speech follows C pager selection and state order',
    async () => {
        for (const [before, wanted] of [
            [{ madeGoal: 0 }, 'nemesis_first'],
            [{ madeGoal: 2, metNemesis: true }, 'nemesis_next'],
            [{ madeGoal: 4, metNemesis: true }, 'nemesis_other'],
            [{ madeGoal: 2, questart: true }, 'nemesis_wantsit'],
        ]) {
            const state = conversationState(before);
            if (before.madeGoal === 0)
                delete state.svq.quest_status.made_goal;
            const events = [];
            await quest_talk(nemesis(), testOps(state, events));
            assert.deepEqual(events, [wanted]);
            assert.equal(state.svq.quest_status.made_goal,
                Math.min(before.madeGoal + 1, 7));
            assert.equal(state.svq.quest_status.met_nemesis, true);
        }
    });

test('quest nemesis battle speech uses C one-in-five gate without progress',
    async () => {
        for (const [roll, wanted] of [[0, ['discourage']], [1, []]]) {
            const state = conversationState({
                inBattle: true,
                madeGoal: 5,
                metNemesis: true,
            });
            const events = [];
            const draws = [];
            await quest_talk(nemesis(), testOps(state, events, (bound) => {
                draws.push(bound);
                return roll;
            }));
            assert.deepEqual(draws, [5]);
            assert.deepEqual(events, wanted);
            assert.equal(state.svq.quest_status.made_goal, 5);
            assert.equal(state.svq.quest_status.met_nemesis, true);
        }
    });

test('quest_stat_check sets the nemesis battle flag from helplessness and range',
    () => {
        const state = conversationState();
        state.u.ux = 3;
        state.u.uy = 2;
        const monster = {
            data: { msound: MS_NEMESIS },
            mx: 2,
            my: 2,
            msleeping: false,
            mcanmove: true,
        };
        quest_stat_check(monster, state);
        assert.equal(state.svq.quest_status.in_battle, true);

        monster.mcanmove = false;
        quest_stat_check(monster, state);
        assert.equal(state.svq.quest_status.in_battle, false);

        state.svq.quest_status.in_battle = 'unchanged';
        quest_stat_check({ ...monster, data: { msound: MS_GUARDIAN } }, state);
        assert.equal(state.svq.quest_status.in_battle, 'unchanged');
    });

test('nemesis talk and battle-state caller match quest.c and dochug wiring', () => {
    const nemesisStart = QUEST_C.indexOf('nemesis_speaks(void)');
    const nemesisEnd = QUEST_C.indexOf('\n/* create cloud', nemesisStart);
    const nemesisSource = QUEST_C.slice(nemesisStart, nemesisEnd);
    assert.ok(nemesisStart >= 0 && nemesisEnd > nemesisStart);
    assert.match(nemesisSource,
        /if \(!Qstat\(in_battle\)\)[\s\S]*?u\.uhave\.questart[\s\S]*?nemesis_wantsit[\s\S]*?nemesis_first[\s\S]*?nemesis_next[\s\S]*?nemesis_other/u);
    assert.match(nemesisSource,
        /if \(Qstat\(made_goal\) < 7\)\s*Qstat\(made_goal\)\+\+;\s*Qstat\(met_nemesis\) = TRUE;/u);
    assert.match(nemesisSource,
        /\}\s*else[\s\S]*?if \(!rn2\(5\)\)\s*qt_pager\("discourage"\);/u);
    assert.match(QUEST_C,
        /quest_talk\(struct monst \*mtmp\)[\s\S]*?case MS_NEMESIS:\s*nemesis_speaks\(\);\s*break;/u);
    assert.match(QUEST_C,
        /quest_stat_check\(struct monst \*mtmp\)[\s\S]*?Qstat\(in_battle\) = \(!helpless\(mtmp\) && monnear\(mtmp, u\.ux, u\.uy\)\);/u);

    const normalC = MONMOVE_C.slice(MONMOVE_C.indexOf('/* special speeches for quest monsters */'));
    assert.match(normalC, /if \(!helpless\(mtmp\) && nearby\)\s*quest_talk\(mtmp\);/u);
    assert.match(MONMOVE_C,
        /quest_stat_check\(mtmp\);[\s\S]*?quest_talk\(mtmp\); \/\* give the leaders a chance to speak \*\//u);
    assert.match(MONMOVE_JS,
        /questStatCheck\(monster, state\);[\s\S]*?await questTalk\(monster, \{ state, random, unsupported \}\);/u);
    assert.match(MONMOVE_JS,
        /if \(!helpless\(monster\) && range\.nearby\)\s*await questTalk\(monster, \{ \.\.\.env, state \}\);/u);
});
