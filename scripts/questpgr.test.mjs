import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { com_pager, deliver_splev_message, qt_pager, qtext_pronoun } from '../js/questpgr.js';
import { msghistory_snapshot } from '../js/topl.js';

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

// A started Barbarian game with a tty message window; each window-delivered
// quest text below is dismissed by queued keys.
async function startedBarbarian() {
    await runSegment({
        seed: 7, // Any seed: these tests read only the role's quest text.
        datetime: '20040612081500',
        nethackrc: 'OPTIONS=name:Homecomer,role:Barbarian,race:human,'
            + 'gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: '',
    });
    return game;
}

test('promoted quest text without a synopsis writes "[text]" to history', async () => {
    // questpgr.c:582-590: the fallback synopsis brackets the raw text and
    // turns every newline into a space before convert_line().
    assert.match(QUESTPGR_SOURCE, /if \(!synopsis\) \{\s*char tmpbuf\[BUFSZ\];\s*Sprintf\(tmpbuf, "\[%\.\*s\]", BUFSZ - 1 - 2, text\);[\s\S]*?strNsubst\(tmpbuf, "\\n", " ", 0\);/u);
    const state = await startedBarbarian();
    // Two keys: the welcome --More--, then the nexttime text window.
    state.nhDisplay.pushKey(27);
    state.nhDisplay.pushKey(27);
    await qt_pager('nexttime', state, () => 0); // 0: first nhlib shuffle result.
    assert.equal(state.nhDisplay.inputQueueLength, 0);
    // Bar nexttime (quest.lua) has default output and a newline, so it is
    // promoted to a window; %H and %l are the Barbarian home and leader.
    assert.equal(msghistory_snapshot(false, state).at(-1),
        '[Once again, you near the Camp of the Duali Tribe.  You know that Pelias will be waiting.]');
});

test('com_pager writes a common entry\'s synopsis to history', async () => {
    // questpgr.c com_pager() goes through the same com_pager_core() as
    // qt_pager(), including its putmsghistory() of the synopsis.
    assert.match(QUESTPGR_SOURCE, /com_pager\(const char \*msgid\)\s*\{\s*\(void\) com_pager_core\("common", msgid, TRUE, \(char \*\*\) 0\);/u);
    const state = await startedBarbarian();
    state.nhDisplay.pushKey(27); // The welcome --More--.
    state.nhDisplay.pushKey(27); // The banished text window.
    await com_pager('banished', state, { random: () => 0 });
    assert.equal(state.nhDisplay.inputQueueLength, 0);
    // common.banished's own synopsis, with the Barbarian %H and %d.
    assert.equal(msghistory_snapshot(false, state).at(-1),
        '[You are banished from the Camp of the Duali Tribe for betraying your allegiance to Crom.]');
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
