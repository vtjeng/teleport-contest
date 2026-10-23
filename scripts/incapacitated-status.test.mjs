import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    botl_incapacitated_conditions, condopt, status_condition_cache_keys,
} from '../js/display.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

const fresh = () => ({ multi: 0, u: { usleep: 0 },
    iflags: { status_conditions: {
        unconscious: true, paralyzed: true, sleep: true, busy: true,
    } } });
const active = state => Object.entries(botl_incapacitated_conditions(state))
    .filter(([option, value]) => value && state.iflags.status_conditions[option])
    .map(([option]) => option);
const recover = state => { state.multi = 0; assert.deepEqual(active(state), []); };

test('C incapacitation conditions select states and clear displayed flags on recovery', () => {
    const state = fresh();
    assert.deepEqual(active(state), []);
    state.multi = -5;
    state.nomovemsg = 'You awake with a headache.';
    assert.deepEqual(active(state), ['unconscious']);
    recover(state);
    state.multi = -5;
    state.nomovemsg = 'You can move again.';
    state.multi_reason = 'frozen by a potion';
    assert.deepEqual(active(state), ['paralyzed']);
    recover(state);
    state.multi = -5;
    state.nomovemsg = 'You wake up.';
    state.multi_reason = 'sleeping';
    state.u.usleep = 1;
    assert.deepEqual(active(state), ['sleep']);
    recover(state);
    state.multi = -5;
    state.nomovemsg = '';
    state.multi_reason = 'disrobing';
    state.u.usleep = 0;
    assert.deepEqual(active(state), ['busy']);
    recover(state);
});

test('C negative-multi cache retains classifications and earlier flags until recovery', () => {
    const state = fresh();
    state.multi = -5;
    state.nomovemsg = 'You awake with a headache.';
    assert.deepEqual(active(state), ['unconscious']);
    state.u.usleep = 1;
    assert.deepEqual(active(state), ['unconscious'], 'same message uses cached !usleep result');
    state.nomovemsg = 'You regain consciousness.';
    assert.deepEqual(active(state), ['unconscious', 'sleep'], 'C sets another flag without clearing the old one');
    recover(state);
    assert.deepEqual(active(fresh()), [], 'a separate game has no cached flags');
});

test('C option reset clears a flag but leaves the cached classification across recovery', () => {
    const state = fresh();
    state.multi = -3;
    state.nomovemsg = 'You can move again.';
    state.multi_reason = 'paralyzed by a floating eye';
    state.multireasonbuf = '12:paralyzed by a floating eye';
    assert.deepEqual(active(state), ['paralyzed']);
    recover(state);
    condopt(state, 'paralyzed', true);
    state.multi = -3;
    state.multi_reason = 'frozen by a gelatinous cube';
    state.multireasonbuf = '34:frozen by a gelatinous cube';
    assert.deepEqual(active(state), [], 'same C buffer offset retains cached classification even when disabled');
    assert.equal(state.gb.incapacitated_conditions.tests.paralyzed, true);
    condopt(state, 'paralyzed', true);
    assert.equal(state.gb.incapacitated_conditions.tests.paralyzed, false);
    state.multireasonbuf = '345:frozen by a gelatinous cube';
    assert.deepEqual(active(state), ['busy'], 'different buffer offset refreshes both caches');
    recover(state);
    state.multi = -2;
    state.nomovemsg = null;
    state.multi_reason = null;
    assert.deepEqual(active(state), ['busy']);
    assert.deepEqual(state.gb.incapacitated_conditions.available, [false, false]);
});

test('C pointer cache keys distinguish null, empty literals, and named mutable buffers', () => {
    assert.deepEqual(status_condition_cache_keys({}), { messageKey: null, reasonKey: null });
    assert.deepEqual(status_condition_cache_keys({ nomovemsg: '', multi_reason: 0 }),
        { messageKey: 'literal:', reasonKey: null });
    assert.equal(status_condition_cache_keys({ nomovemsg: 'mimic', eatmbuf: 'mimic' }).messageKey, 'eatmbuf');
    assert.equal(status_condition_cache_keys({ nomovemsg: 'You finish taking off your cloak.',
        multi_reason: 'disrobing' }).messageKey, 'offdelaybuf');
    assert.equal(status_condition_cache_keys({ nomovemsg: 'You totally digest a rat.',
        multi_reason: 'digesting something' }).messageKey, 'engulf_msgbuf');
    assert.equal(status_condition_cache_keys({ multi_reason: 'frozen by a cube',
        multireasonbuf: '321:frozen by a cube' }).reasonKey, 'multireasonbuf:4');
    assert.equal(status_condition_cache_keys({ multi_reason: 'reading a book',
        multireasonbuf: '321:frozen by a cube' }).reasonKey, 'literal:reading a book');
});

for (const kind of ['paralyzed', 'busy-fallback', 'disabled', 'sleep',
    'unconscious-rest', 'unconscious-disabled', 'sequence', 'sequence-disabled']) {
    test('incapacitation status ' + kind + ' matches public C output and animations', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                '../recordings/botl.c/incapacitated-status-' + kind + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
