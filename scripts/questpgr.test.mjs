import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { com_pager, deliver_splev_message, qtext_pronoun } from '../js/questpgr.js';

const QUESTPGR_SOURCE = readFileSync('nethack-c/upstream/src/questpgr.c', 'utf8');
const CMD_C_SOURCE = readFileSync('nethack-c/upstream/src/cmd.c', 'utf8');
const DO_C_SOURCE = readFileSync('nethack-c/upstream/src/do.c', 'utf8');
const CMD_SOURCE = readFileSync('js/cmd.js', 'utf8');
const DO_SOURCE = readFileSync('js/do.js', 'utf8');

test('common array pager shuffles once, then chooses a Lua array entry', async () => {
    const draws = [];
    const lines = [];
    const result = await com_pager('angel_cuss', {}, {
        // Zero chooses the first stable result at each source RNG boundary.
        random(bound) {
            draws.push(bound);
            return 0;
        },
        message: async (line) => lines.push(line),
    });

    assert.equal(result, true);
    // The first two bounds are nhlib's private shuffle; 14 selects a cuss line.
    assert.deepEqual(draws, [3, 2, 14]);
    // This quoted text is the first common.angel_cuss Lua array entry.
    assert.deepEqual(lines, ['"Repent, and thou shalt be saved!"']);
});

test('common string pager converts Lua substitutions and emits one line', async () => {
    const draws = [];
    const lines = [];
    const state = {
        // No leader object makes questpgr.c:ldrname() use its source fallback.
        urole: { homebase: 'the Lonely Tower' },
    };
    await com_pager('quest_portal_demand', state, {
        // The Lua initializer shuffles its alignment table before lookup.
        random(bound) {
            draws.push(bound);
            return 0;
        },
        message: async (line) => lines.push(line),
    });

    // This message is a single string, so only the private shuffle draws occur.
    assert.deepEqual(draws, [3, 2]);
    // %l is converted by the same common pager path as portal and cuss text.
    assert.deepEqual(lines, ['You again sense your leader demanding your attendance.']);
});

// questpgr.c:200-236 names plural artifacts independently of gender entries.
test('quest pronouns pin plural artifacts and subject genders to C', () => {
    const state = {svq: {quest_status: {godgend: 0, ldrgend: 1, nemgend: 2}}};
    for (const name of ['the Eyes of the Overworld', 'the arrows']) {
        assert.equal(qtext_pronoun('o', 'h', state, name), 'they');
        assert.equal(qtext_pronoun('o', 'i', state, name), 'them');
        assert.equal(qtext_pronoun('o', 'J', state, name), 'Their');
    }
    assert.equal(qtext_pronoun('o', 'j', state, 'the Orb of Fate'), 'its');
    assert.equal(qtext_pronoun('d', 'H', state), 'He');
    assert.equal(qtext_pronoun('l', 'i', state), 'her');
    assert.equal(qtext_pronoun('n', 'J', state), 'Its');
    assert.equal(qtext_pronoun('?', 'h', state), 'it');
    assert.equal(qtext_pronoun('o', '?', state), '?');
});

test('deliver_splev_message follows questpgr.c and both active callers', () => {
    const start = QUESTPGR_SOURCE.indexOf('\ndeliver_splev_message(void)');
    const end = QUESTPGR_SOURCE.indexOf('\n}', start);
    assert.ok(start >= 0 && end > start);
    const source = QUESTPGR_SOURCE.slice(start, end);
    assert.match(source, /if \(gl\.lev_message\)\s*\{\s*deliver_by_pline\(gl\.lev_message\);\s*free\(\(genericptr_t\) gl\.lev_message\);\s*gl\.lev_message = NULL;/u);
    assert.match(CMD_C_SOURCE, /deliver_splev_message\(\); \/\* level entry \*\//u);
    assert.match(DO_C_SOURCE, /deliver_splev_message\(\);/u);
    assert.match(CMD_SOURCE, /await deliver_splev_message\(state\);\s*await check_special_room\(false, state\);/u);
    assert.match(DO_SOURCE, /import \{ com_pager, deliver_splev_message \} from '\.\/questpgr\.js';[\s\S]*?await deliver_splev_message\(state\);/u);
    assert.doesNotMatch(DO_SOURCE, /async function deliver_splev_message\(/u);
});

test('deliver_splev_message converts lines before clearing the source message', async () => {
    const output = [];
    const state = { gl: { lev_message: 'You arrive at 100%% safety.\n' } };

    await deliver_splev_message(state, {
        async pline(line, actualState) {
            output.push({ line, pending: actualState.gl.lev_message });
        },
    });

    assert.deepEqual(output, [{
        line: 'You arrive at 100% safety.',
        pending: 'You arrive at 100%% safety.\n',
    }]);
    assert.equal(state.gl.lev_message, null);

    state.gl.lev_message = '';
    await deliver_splev_message(state, { async pline() {
        assert.fail('an empty C string emits no lines');
    } });
    assert.equal(state.gl.lev_message, null);
});
