import assert from 'node:assert/strict';
import test from 'node:test';

import { textBytes } from '../js/hacklib.js';
import { installParsedGa } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import {
    add_autopickup_exception,
    optionValue,
    parseNethackrc,
} from '../js/options.js';
import {
    regex_compile,
    regex_error_desc,
    regex_init,
    regex_match,
} from '../js/posixregex.js';
import {
    loadStartupAutopickupExceptionRecipe,
    STARTUP_AUTOPICKUP_EXCEPTION_CASES,
    verifyStartupAutopickupExceptionSegment,
} from './run-startup-autopickup-exception.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

const AUTOPICKUP_EXCEPTIONS = allopt.find(
    ({ name }) => name === 'autopickup exceptions',
);

function parsedValue(result) {
    return optionValue(result, AUTOPICKUP_EXCEPTIONS, {});
}

function list(result) {
    const entries = [];
    for (let ape = result.ga.apelist; ape; ape = ape.next) {
        entries.push({ pattern: ape.pattern, grab: ape.grab });
    }
    return entries;
}

function assertCompiledList(state) {
    for (let ape = state.ga?.apelist; ape; ape = ape.next) {
        assert.equal(ape.regex.err, 0, ape.pattern);
        assert.equal(regex_match(ape.pattern, ape.regex), true, ape.pattern);
    }
}

test('the direct statement accepts its exact and five-byte source names', () => {
    for (const name of ['AUTOPICKUP_EXCEPTION', 'AUTOP']) {
        const parsed = parseNethackrc(`${name}=\">wand\"\n`);
        assert.deepEqual(list(parsed), [{ pattern: 'wand', grab: false }]);
        assert.deepEqual(parsed.unportedConfigStatements, []);
        assert.deepEqual(parsed.configErrorFrame.output, []);
    }

    const tooShort = parseNethackrc('AUTO=\">wand\"\n');
    assert.equal(tooShort.ga.apelist, undefined);
    assert.equal(tooShort.configErrorFrame.num_errors, 1);
});

test('add_autopickup_exception preserves the three source mapping forms', () => {
    const parsed = parseNethackrc([
        'AUTOPICKUP_EXCEPTION=\"<scroll\"',
        'AUTOPICKUP_EXCEPTION=\">wand\"',
        'AUTOPICKUP_EXCEPTION=\"corpse\"',
    ].join('\n'));
    assert.deepEqual(list(parsed), [
        { pattern: 'corpse', grab: false },
        { pattern: 'wand', grab: false },
        { pattern: 'scroll', grab: true },
    ]);
    assert.equal(parsedValue(parsed), '(3 currently set)');
    assertCompiledList(parsed);
});

test('quoted mappings accept whitespace or comments and reject junk', () => {
    const parsed = parseNethackrc([
        'AUTOPICKUP_EXCEPTION=\"<food\"   ',
        'AUTOPICKUP_EXCEPTION=\">wand\" # useful',
        'AUTOPICKUP_EXCEPTION=\"armor\" junk',
        'AUTOPICKUP_EXCEPTION=\"ring\"#comment',
    ].join('\n'));
    assert.deepEqual(list(parsed), [
        { pattern: 'ring', grab: false },
        // The source retries the prefixless scanf() after the '>' form reads
        // the trailing '#', so this comment form retains its marker.
        { pattern: '>wand', grab: false },
        { pattern: 'food', grab: true },
    ]);
    assert.equal(parsed.configErrorFrame.num_errors, 1);
    assert.equal(
        parsed.configErrorFrame.output.at(-1),
        ' * Line 3: syntax error in AUTOPICKUP_EXCEPTION.',
    );
});

test('the source sscanf accidents accept unclosed and 254-byte mappings', () => {
    const atLimit = 'a'.repeat(253);
    const beyondLimit = `${atLimit}Z`;
    const parsed = parseNethackrc([
        'AUTOPICKUP_EXCEPTION=\"<unclosed',
        `AUTOPICKUP_EXCEPTION=\">${atLimit}\"`,
        `AUTOPICKUP_EXCEPTION=\"${beyondLimit}\" junk`,
    ].join('\n'));
    assert.deepEqual(list(parsed), [
        { pattern: atLimit, grab: false },
        { pattern: atLimit, grab: false },
        { pattern: 'unclosed', grab: true },
    ]);
    assert.deepEqual(parsed.configErrorFrame.output, []);

    const splitUtf8 = `${'a'.repeat(252)}é`;
    const split = parseNethackrc(
        `AUTOPICKUP_EXCEPTION=\">${splitUtf8}\"\n`,
    );
    const splitBytes = textBytes(list(split)[0].pattern);
    assert.equal(splitBytes.length, 253);
    assert.deepEqual(splitBytes.slice(-2), [0x61, 0xC3]);

    for (const value of ['\"\"']) {
        const rejected = parseNethackrc(`AUTOPICKUP_EXCEPTION=${value}\n`);
        assert.equal(rejected.ga.apelist, undefined, value);
        assert.equal(rejected.configErrorFrame.num_errors, 1, value);
    }
    assert.deepEqual(list(parseNethackrc(
        'AUTOPICKUP_EXCEPTION=\"<\"\n',
    )), [{ pattern: '<', grab: false }]);
    assert.deepEqual(list(parseNethackrc(
        'AUTOPICKUP_EXCEPTION=\">\"\n',
    )), [{ pattern: '>', grab: false }]);
});

test('POSIX ERE validation accepts source syntax that JavaScript misreads', () => {
    // macOS regcomp() accepts each; "\\d" is a literal backslash and d, and
    // a "{" with no digit after it is a literal brace.
    for (const pattern of [
        '[[:digit:]]+ wand',
        '([a-z]+|scroll){1,3}',
        String.raw`\\d+`,
        'wand{,2}',
        '[[:<:]]wand',
    ]) {
        const parsed = parseNethackrc(
            `AUTOPICKUP_EXCEPTION=\">${pattern}\"\n`,
        );
        assert.deepEqual(list(parsed), [{ pattern, grab: false }], pattern);
        assert.deepEqual(parsed.configErrorFrame.output, [], pattern);
    }
});
// Each pattern and its regerror() text are a row of the macOS oracle table
// (experiments/host-parity/regex-oracle/, run 44628090866), except
// "(?:wand)", "a+?" and "wand|", which follow from the oracle's "(?i)a",
// "a+?" and "spear|".
test('POSIX ERE compile failures report macOS libc diagnostics', () => {
    const cases = [
        ['(', 'parentheses not balanced'],
        ['[z-a]', 'invalid character range'],
        ['(?:wand)', 'repetition-operator operand invalid'],
        ['a+?', 'repetition-operator operand invalid'],
        ['wand|', 'empty (sub)expression'],
        ['[[:foo:]]', 'invalid character class'],
        ['a{2,1}', 'invalid repetition count(s)'],
        ['a{1,', 'braces not balanced'],
        ['a{1', 'braces not balanced'],
        ['a{256}', 'maximum repetition exceeds 255'],
        ['\\', 'trailing backslash (\\)'],
    ];
    for (const [pattern, diagnostic] of cases) {
        const line = `AUTOPICKUP_EXCEPTION=\">${pattern}\"`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.ga.apelist, undefined, pattern);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: regex error in AUTOPICKUP_EXCEPTION: ${diagnostic}.`,
        ], pattern);
    }
});
// One pattern for each regcomp() error macOS reports for a pattern NetHack
// can pass, each a row of the macOS oracle table.
test('the POSIX validator covers each libc diagnostic category it emits', () => {
    const failures = [
        ['[[=ab=]]', 'invalid collating element'],
        ['[[:foo:]]', 'invalid character class'],
        ['\\', 'trailing backslash (\\)'],
        ['[a', 'brackets ([ ]) not balanced'],
        ['(', 'parentheses not balanced'],
        ['a{1', 'braces not balanced'],
        ['a{2,1}', 'invalid repetition count(s)'],
        ['[z-a]', 'invalid character range'],
        ['a+?', 'repetition-operator operand invalid'],
        ['(|a)', 'empty (sub)expression'],
        ['a{256}', 'maximum repetition exceeds 255'],
    ];
    for (const [pattern, diagnostic] of failures) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), false, pattern);
        assert.equal(regex_error_desc(regex), diagnostic, pattern);
    }
});
test('the POSIX validator accepts non-JavaScript bracket and branch syntax', () => {
    // Each compiles on macOS (oracle table), including the BSD word start
    // [[:<:]], the character name [[.space.]] and the literal brace {,1}.
    for (const pattern of [
        '[[:digit:]]',
        '[[=a=]]',
        '[[.a.]]',
        '[[.space.]]',
        '[[:<:]]',
        '{,1}',
        '()',
    ]) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        assert.equal(regex_error_desc(regex), 'no explanation', pattern);
    }
});
test('invalid rows do not stop later rows and duplicates stay distinct', () => {
    const parsed = parseNethackrc([
        'AUTOPICKUP_EXCEPTION=\"\"',
        'AUTOPICKUP_EXCEPTION=\">wand\"',
        'AUTOPICKUP_EXCEPTION=\">wand\"',
    ].join('\n'));
    assert.deepEqual(list(parsed), [
        { pattern: 'wand', grab: false },
        { pattern: 'wand', grab: false },
    ]);
    assert.equal(parsedValue(parsed), '(2 currently set)');
    assert.equal(parsed.configErrorFrame.num_errors, 1);
});

test('the source-owned helper prepends to the sole ga.apelist state', () => {
    const result = parseNethackrc('');
    assert.equal(add_autopickup_exception(result, '\"<food\"'), 1);
    assert.equal(add_autopickup_exception(result, '\">wand\"'), 1);
    assert.deepEqual(list(result), [
        { pattern: 'wand', grab: false },
        { pattern: 'food', grab: true },
    ]);
    assertCompiledList(result);
});

test('startup installation retains each parsed node and compiled regex', () => {
    // macOS reads \1 in an extended regex as the digit 1.
    const parsed = parseNethackrc(
        'AUTOPICKUP_EXCEPTION=">(wand)\\1"\n',
    );
    const state = {};
    installParsedGa(state, parsed);
    assert.equal(state.ga.apelist, parsed.ga.apelist);
    assert.equal(state.ga.apelist.regex, parsed.ga.apelist.regex);
    assert.equal(regex_match('wand1', state.ga.apelist.regex), true);
    assert.equal(regex_match('wandwand', state.ga.apelist.regex), false);
});
test('startup installation keeps a repeated group before a digit escape',
    () => {
        const parsed = parseNethackrc(
            String.raw`AUTOPICKUP_EXCEPTION=">(wand){2}\1"` + '\n',
        );
        const state = {};
        installParsedGa(state, parsed);
        assert.equal(state.ga.apelist, parsed.ga.apelist);
        assert.equal(regex_match('>wandwand1', state.ga.apelist.regex), true);
        assert.equal(regex_match('>wandwandwand', state.ga.apelist.regex), false);
    });
test('the fresh autopickup-exception matrix carries replay inputs only', () => {
    const recipe = loadStartupAutopickupExceptionRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_AUTOPICKUP_EXCEPTION_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured exception rows reach installed ga and live counts', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupAutopickupExceptionRecipe().segments)
            await verifyStartupAutopickupExceptionSegment(segment);
    })
));
