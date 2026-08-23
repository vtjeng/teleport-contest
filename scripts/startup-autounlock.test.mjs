import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_FORCE,
    AUTOUNLOCK_KICK,
    AUTOUNLOCK_UNTRAP,
} from '../js/const.js';
import { allopt } from '../js/optlist_data.js';
import {
    optionValue,
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupAutounlockRecipe,
    STARTUP_AUTOUNLOCK_CASES,
    verifyStartupAutounlockSegment,
} from './run-startup-autounlock.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

const AUTOUNLOCK_ROW = allopt.find(({ name }) => name === 'autounlock');

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

test('autounlock defaults, bare values, and negation write numeric flags', () => {
    const cases = [
        ['', AUTOUNLOCK_APPLY_KEY],
        ['autounlock', AUTOUNLOCK_APPLY_KEY],
        ['autounlock:', AUTOUNLOCK_APPLY_KEY],
        ['autounlock=', AUTOUNLOCK_APPLY_KEY],
        ['!autounlock', 0],
        ['!autounlock:', 0],
        ['!autounlock=', 0],
        ['autounlock:none', 0],
        ['autounlock:n', 0],
        ['autounlock:NONE', 0],
    ];
    for (const [statement, expected] of cases) {
        const parsed = statement ? parse(statement) : parseNethackrc('');
        assert.equal(parsed.flags.autounlock, expected, statement || 'default');
        assert.equal(typeof parsed.flags.autounlock, 'number', statement);
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }
});

test('autounlock accepts lower-case prefixes and both source list separators',
    () => {
        const cases = [
            ['u', AUTOUNLOCK_UNTRAP],
            ['a', AUTOUNLOCK_APPLY_KEY],
            ['k', AUTOUNLOCK_KICK],
            ['f', AUTOUNLOCK_FORCE],
            ['u a k f', 15],
            ['u  a   k f', 15],
            ['untrap+apply-key+kick+force', 15],
            ['untrap + apply_key + kick + force', 15],
            ['untrap+applykey+force', 11],
            ['untrap+apply key+force', 11],
        ];
        for (const [value, expected] of cases) {
            const parsed = parse(`autounlock:${value}`);
            assert.equal(parsed.flags.autounlock, expected, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('invalid autounlock tokens report and preserve the previous mask', () => {
    for (const [value, token] of [
        ['all', 'all'],
        ['UNTRAP', 'UNTRAP'],
        ['untrap+apply-key kick', 'apply-key kick'],
        ['apply key', 'key'],
        ['zqxj', 'zqxj'],
    ]) {
        const line = `OPTIONS=autounlock:${value},autounlock:force`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.flags.autounlock, AUTOUNLOCK_FORCE, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: autounlock.',
            ` * Line 1: Invalid value for "autounlock": "${token}".`,
        ], value);
    }
});

test('none combinations and valued negation preserve the previous mask', () => {
    // An empty token is a prefix of "none" under str_start_is(), so the double
    // plus takes this combination error rather than the invalid-token one.
    for (const value of [
        'none+force', 'untrap+none', 'untrap++force', 'untrap',
    ]) {
        const negated = value === 'untrap';
        const spelling = `${negated ? '!' : ''}autounlock:${value}`;
        const line = `OPTIONS=${spelling},autounlock:apply-key`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.flags.autounlock, AUTOUNLOCK_APPLY_KEY, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: autounlock.',
            ' * Line 1: Invalid value combination for "autounlock":'
                + " 'none' with some.",
        ], value);
    }
});

test('autounlock duplicates apply right to left and across later lines', () => {
    const parsed = parseNethackrc([
        'OPTIONS=autounlock:none,autounlock:force',
        'OPTIONS=autounlock:untrap',
    ].join('\n'));
    assert.equal(parsed.flags.autounlock, AUTOUNLOCK_UNTRAP);
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\nOPTIONS=autounlock:none,autounlock:force',
        ' * Line 1: compound option specified multiple times: autounlock.',
        '\nOPTIONS=autounlock:untrap',
        ' * Line 2: compound option specified multiple times: autounlock.',
    ]);
});

test('the optionsfull getter names masks in source order', () => {
    const parsed = parseNethackrc('');
    for (const [mask, expected] of [
        [0, 'none'],
        [AUTOUNLOCK_UNTRAP, 'untrap'],
        [AUTOUNLOCK_APPLY_KEY, 'apply-key'],
        [AUTOUNLOCK_KICK, 'kick'],
        [AUTOUNLOCK_FORCE, 'force'],
        [15, 'untrap + apply-key + kick + force'],
    ]) {
        parsed.flags.autounlock = mask;
        assert.equal(optionValue(parsed, AUTOUNLOCK_ROW, {}), expected);
    }
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('autounlock'), false);
});

test('autounlock retains its source option contract', () => {
    assert.equal(AUTOUNLOCK_ROW?.setwhere, 4);
    assert.equal(AUTOUNLOCK_ROW?.negateok, true);
    assert.equal(AUTOUNLOCK_ROW?.valok, true);
    assert.equal(AUTOUNLOCK_ROW?.has_handler, true);
});

test('the fresh autounlock matrix contains replay inputs only', () => {
    const recipe = loadStartupAutounlockRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_AUTOUNLOCK_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured autounlock reaches optionsfull and no-action locked doors',
    () => withSerializedGrids(async () => {
        for (const segment of loadStartupAutounlockRecipe().segments)
            await verifyStartupAutounlockSegment(segment);
    }));
