import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stop_occupation } from '../../../../js/allmain.js';
import { cmdq_add_ec, cmdq_peek, extcmdRow } from '../../../../js/cmd.js';
import { CQ_CANNED } from '../../../../js/const.js';
const state = () => ({ context: {}, iflags: {}, flags: {}, disp: {},
    u: { uinvulnerable: false, usleep: 0 }, multi: 0, go: {} });
test('C source pins the stop message and adjacent state transition', () => {
    const c = readFileSync(new URL('../../../../nethack-c/upstream/src/allmain.c', import.meta.url), 'utf8');
    assert.match(c, /if \(!maybe_finished_meal\(TRUE\)\)\s*You\("stop %s\.", go\.occtxt\);/u);
    assert.match(c, /go\.occupation = \(int \(\*\)\(void\)\) 0;\s*disp\.botl = TRUE;/u);
});
for (const text of ['waiting', 'searching']) test(`non-eating ${text} stop preserves text and state`, async () => {
    const s = state(); s.go = { occupation: () => 1, occtxt: text }; s.multi = 3;
    cmdq_add_ec(CQ_CANNED, extcmdRow('wait'), s);
    const messages = [];
    await stop_occupation(s, { message: async message => messages.push(message) });
    assert.deepEqual(messages, [`You stop ${text}.`]);
    assert.equal(s.go.occupation, null);
    assert.equal(s.disp.botl, true);
    assert.equal(s.multi, 0);
    assert.equal(cmdq_peek(CQ_CANNED, s), null);
});
test('no occupation control preserves helplessness and clears queued commands', async () => {
    const s = state(); s.multi = -1;
    cmdq_add_ec(CQ_CANNED, extcmdRow('wait'), s);
    const messages = [];
    await stop_occupation(s, { message: async message => messages.push(message) });
    assert.deepEqual(messages, []);
    assert.equal(s.multi, -1);
    assert.equal(cmdq_peek(CQ_CANNED, s), null);
});
