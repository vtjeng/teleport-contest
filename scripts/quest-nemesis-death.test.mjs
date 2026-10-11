import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { nemdead } from '../js/quest.js';
import { QUEST_TEXT_DATA } from '../js/quest_text_data.js';
import { stinky_nemesis } from '../js/questpgr.js';

const QUEST_C = readFileSync('nethack-c/upstream/src/quest.c', 'utf8');
const QUESTPGR_C = readFileSync('nethack-c/upstream/src/questpgr.c', 'utf8');
const MON_C = readFileSync('nethack-c/upstream/src/mon.c', 'utf8');
const QUEST_JS = readFileSync('js/quest.js', 'utf8');
const QUESTPGR_JS = readFileSync('js/questpgr.js', 'utf8');
const MON_JS = readFileSync('js/mon.js', 'utf8');

function cFunction(source, name) {
    const start = source.indexOf(`\n${name}(`);
    const end = source.indexOf('\n}', start);
    assert.ok(start >= 0 && end > start, `${name} exists in its C source`);
    return source.slice(start, end);
}

test('nemdead marks the quest state before one role-specific pager call', async () => {
    const draws = [];
    const lines = [];
    const state = {
        program_state: {},
        svq: { quest_status: { killed_nemesis: false } },
        urole: { filecode: 'Arc' },
    };
    const output = {
        async pline(line) {
            assert.equal(state.svq.quest_status.killed_nemesis, true);
            lines.push(line);
        },
        async window() {
            assert.fail('the simple role message uses pline');
        },
    };
    const random = (bound) => {
        draws.push(bound);
        return 0;
    };

    await nemdead(state, { random, output });
    await nemdead(state, { random, output });

    assert.deepEqual(draws, [3, 2], 'only the first call initializes the pager');
    assert.deepEqual(lines, [
        'The body of your nemesis dissipates in a cloud of noxious fumes.',
    ]);

    const c = cFunction(QUEST_C, 'nemdead');
    assert.match(c, /if \(!Qstat\(killed_nemesis\)\)\s*\{\s*Qstat\(killed_nemesis\) = TRUE;\s*qt_pager\("killed_nemesis"\);/u);
});

test('stinky_nemesis reads raw text and follows C phrase ordering', async () => {
    for (const [filecode, expected] of [['Arc', true], ['Wiz', false], ['Pri', true]]) {
        const draws = [];
        const state = { program_state: {}, urole: { filecode } };
        const result = await stinky_nemesis({ ignored: true }, state, (bound) => {
            draws.push(bound);
            return 0;
        });
        assert.equal(result, expected, filecode);
        assert.deepEqual(draws, [3, 2], 'raw text avoids random array selection');
    }

    const c = cFunction(QUESTPGR_C, 'stinky_nemesis');
    const cPagerStart = QUESTPGR_C.indexOf('\ncom_pager_core(');
    const cPagerEnd = QUESTPGR_C.indexOf('\n}', cPagerStart);
    const cPager = QUESTPGR_C.slice(cPagerStart, cPagerEnd);
    const jsPagerStart = QUESTPGR_JS.indexOf('async function comPagerCore(');
    const jsPagerEnd = QUESTPGR_JS.indexOf('\n}', jsPagerStart);
    const jsPager = QUESTPGR_JS.slice(jsPagerStart, jsPagerEnd);
    assert.match(c, /com_pager_core\(gu\.urole\.filecode, "killed_nemesis", FALSE, &mesg\)/u);
    assert.match(c, /strNsubst\(mesg, "\\n", " ", 0\)/u);
    assert.match(c, /strstri\(mesg, "noxious"\)[\s\S]*strstri\(p, " gas"\) \|\| strstri\(p, " fumes"\)/u);
    assert.match(cPager, /if \(rawtext\)\s*\{\s*\*rawtext = dupstr\(text\);\s*res = TRUE;\s*goto compagerdone;/u);
    assert.match(jsPager, /section, msgid, showerror, state, random, output, rawText = null/u);
    assert.match(jsPager, /if \(rawText\)[\s\S]*?rawText\.value = entry[\s\S]*?return true;/u);
    assert.ok(jsPager.indexOf('if (rawText)') < jsPager.indexOf('await deliverByPline'));
    assert.equal(QUEST_TEXT_DATA.Arc.killed_nemesis.text.includes('noxious fumes'), true);
    assert.equal(QUEST_TEXT_DATA.Wiz.killed_nemesis.text.includes('choking dust'), true);
});

test('nemesis death helpers are wired in m_detach source order', () => {
    const c = cFunction(MON_C, 'm_detach');
    const nemdeadAt = c.indexOf('nemdead();');
    const stinkyAt = c.indexOf('stinky_nemesis(mtmp)');
    const gasAt = c.indexOf('nemesis_stinks(mx, my);');
    const dropAt = c.indexOf('relobj(mtmp, 1, FALSE);');
    assert.ok(nemdeadAt >= 0 && nemdeadAt < stinkyAt && stinkyAt < gasAt && gasAt < dropAt);
    assert.match(c, /if \(due_to_death\)[\s\S]*if \(mtmp->data->msound == MS_NEMESIS\)/u);

    const jsStart = MON_JS.indexOf('export function m_detach(');
    const jsEnd = MON_JS.indexOf('\nfunction monsterOnLevelChain', jsStart);
    const js = MON_JS.slice(jsStart, jsEnd);
    const jsNemdeadAt = js.indexOf('await nemdead(state');
    const jsStinkyAt = js.indexOf('await stinky_nemesis(mtmp');
    const jsGasAt = js.indexOf('await nemesis_stinks(mx, my, state');
    const jsDropAt = js.indexOf('await relobj(mtmp, 1, false');
    assert.ok(jsNemdeadAt >= 0 && jsNemdeadAt < jsStinkyAt
        && jsStinkyAt < jsGasAt && jsGasAt < jsDropAt);
    assert.match(QUEST_JS, /status\.killed_nemesis = true;[\s\S]*?qt_pager\(\s*'killed_nemesis'/u);
    assert.match(QUEST_JS, /context\.mon_moving = true;[\s\S]*?finally\s*\{\s*context\.mon_moving = saveMonMoving;/u);
    assert.match(QUEST_JS, /create_gas_cloud\(mx, my, 5, 8/u);
    assert.match(QUESTPGR_JS, /const normalized = rawText\.value\.replaceAll\('\\n', ' '\)/u);
});
