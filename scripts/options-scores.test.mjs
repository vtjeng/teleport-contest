// Source pins: options.c:3669-3760, optfn_scores request/state ordering.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as options from '../js/options.js';
import { allopt } from '../js/optlist_data.js';
import { game } from '../js/gstate.js';
import { initUnported } from '../js/unported.js';

// options.c's local enum numbers: init, set, handler, value, config value.
const [DO_INIT, DO_SET, DO_HANDLER, GET_VAL, GET_CNF_VAL] = [1, 2, 3, 4, 5];
const scores = allopt.findIndex(row => row.name === 'scores');
const fields = state => [state.flags.end_top, state.flags.end_around, state.flags.end_own];
function state() {
    // Positive distinct prior values expose resets and missing-value retention.
    return { flags: { end_top: 7, end_around: 4, end_own: true }, go: { opt_initial: false } };
}
function handler(...args) {
    assert.equal(typeof options.optfn_scores, 'function', 'whole canonical request owner is exported');
    return options.optfn_scores(...args);
}

test('scores source requests preserve no-op and outer-negation ordering', () => {
    const s = state();
    for (const request of [DO_INIT, DO_HANDLER]) {
        assert.equal(handler(s, scores, request, false, '', ''), 1);
        assert.deepEqual(fields(s), [7, 4, true]);
    }
    // C checks the mandatory value, resets all fields, then outer negation
    // moves op to eos. A direct handler test pins this even though optlist
    // currently prevents a negated value from reaching it through parseoptions.
    assert.equal(handler(s, scores, DO_SET, true, 'scores:top/own', ''), 1);
    assert.deepEqual(fields(s), [0, 0, false]);
});

test('live scores parsing retains token order, suffixes and signed counts', () => {
    for (const [value, expected] of [
        // Source initials accept any letter suffix, including hacklib '@'.
        ['2troll 5abracadabra ocelot', [2, 5, true]],
        ['2top@/own', [2, 0, true]],
        // Inner negation is tested once; none can be followed by another count.
        ['7top/no-around', [7, 0, false]],
        ['7top/4around/own !notop', [0, 0, false]],
        ['n2top', [2, 0, false]],
        // atoi narrows to the reference platform's signed 32-bit int.
        ['4294967298top/2147483648around/0own', [2, -2147483648, false]],
    ]) {
        const s = state();
        assert.equal(handler(s, scores, DO_SET, false, `scores:${value}`, ''), 1, value);
        assert.deepEqual(fields(s), expected, value);
    }
});

test('scores errors pin source returns and writes while naming live output gap', () => {
    for (const [statement, expected, result] of [
        // Empty mandatory values return optn_err before resetting prior fields.
        ['scores', [7, 4, true], 0],
        ['scores:', [7, 4, true], 0],
        // Negative and unknown tokens return optn_silenterr after earlier writes.
        ['scores:7top/-2around', [7, 0, false], -1],
        ['scores:4around/zqxj', [0, 4, false], -1],
        ['scores:own//top', [0, 0, true], -1],
    ]) {
        const s = state();
        initUnported();
        assert.equal(handler(s, scores, DO_SET, false, statement, ''), result, statement);
        assert.deepEqual(fields(s), expected, statement);
        assert.deepEqual([...game.unported], ['cfgfiles.c config_erradd']);
    }
});

test('both scores getters share source separator and none rules', () => {
    const s = state();
    for (const [top, around, own, expected] of [
        // Source prints only strictly positive counts and a true own field.
        [3, 2, true, '3 top/2 around/own'],
        [3, 0, false, '3 top'], [0, 2, true, '2 around/own'],
        [-1, 0, false, 'none'], [0, 0, true, 'own'],
    ]) {
        [s.flags.end_top, s.flags.end_around, s.flags.end_own] = [top, around, own];
        for (const request of [GET_VAL, GET_CNF_VAL])
            assert.equal(handler(s, scores, request, false, '', ''), expected);
        assert.equal(options.optionValue(s, allopt[scores]), expected);
    }
});

test('production live parseoptions dispatches the scores source owner', async () => {
    const s = options.parseNethackrc('');
    // The full-options caller supplies the selected name/value and FALSE flags.
    assert.equal(await options.parseoptions(s, 'scores:6top/own', false, false), true);
    assert.deepEqual(fields(s), [6, 0, true]);
    const source = readFileSync(new URL('../nethack-c/upstream/src/options.c', import.meta.url), 'utf8');
    assert.ok(source.includes('flags.end_top = flags.end_around = 0, flags.end_own = FALSE;'));
    assert.ok(source.includes('if (negated)\n            op = eos(op);'));
    assert.ok(source.includes('case \'n\': /* none */'));
});
