import assert from 'node:assert/strict';
import test from 'node:test';

import { encodeUtf8ByteString } from '../js/hacklib.js';
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
    UnsupportedPosixDuplicatedCaptureError,
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
        assert.equal(ape.regex.pattern, ape.pattern);
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
    const splitBytes = encodeUtf8ByteString(list(split)[0].pattern);
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
    for (const pattern of [
        '[[:digit:]]+ wand',
        '([a-z]+|scroll){1,3}',
        String.raw`\\d+`,
        'a+?',
        'wand|',
    ]) {
        const parsed = parseNethackrc(
            `AUTOPICKUP_EXCEPTION=\">${pattern}\"\n`,
        );
        assert.deepEqual(list(parsed), [{ pattern, grab: false }], pattern);
        assert.deepEqual(parsed.configErrorFrame.output, [], pattern);
    }
});

test('POSIX ERE compile failures report libc-compatible diagnostics', () => {
    const cases = [
        ['(', String.raw`Unmatched ( or \(`],
        ['[z-a]', 'Invalid range end'],
        ['(?:wand)', 'Invalid preceding regular expression'],
        ['[[:bogus:]]', 'Invalid character class name'],
        ['a{2,1}', String.raw`Invalid content of \{\}`],
        [String.raw`(a)\1{a,`, String.raw`Invalid content of \{\}`],
        ['a{a,,', String.raw`Invalid content of \{\}`],
        ['a{a,', String.raw`Invalid content of \{\}`],
        ['a{1a,', String.raw`Invalid content of \{\}`],
        ['a{,', String.raw`Unmatched \{`],
        ['a{1,', String.raw`Unmatched \{`],
        ['a{a', String.raw`Unmatched \{`],
        ['a{1', String.raw`Unmatched \{`],
        ['a{32768}', 'Regular expression too big'],
        ['\\', 'Trailing backslash'],
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

// Each diagnostic below comes from a direct regcomp(REG_EXTENDED | REG_NOSUB)
// probe against the same libc and C.UTF-8 environment the recorder inherits.
test('the POSIX validator covers each libc diagnostic category it emits', () => {
    const failures = [
        ['[', 'Invalid regular expression'],
        ['[a', 'Unmatched [, [^, [:, [., or [='],
        ['[z-a]', 'Invalid range end'],
        ['[[=ab=]]', 'Invalid collation character'],
        ['[[:bogus:]]', 'Invalid character class name'],
        ['a{2,1}', String.raw`Invalid content of \{\}`],
        ['a{32768}', 'Regular expression too big'],
        ['\\', 'Trailing backslash'],
        ['(?:wand)', 'Invalid preceding regular expression'],
        ['(', String.raw`Unmatched ( or \(`],
        ['a{1', String.raw`Unmatched \{`],
    ];
    for (const [pattern, diagnostic] of failures) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), false, pattern);
        assert.equal(regex_error_desc(regex), diagnostic, pattern);
    }
});

test('the POSIX validator accepts non-JavaScript bracket and branch syntax', () => {
    for (const pattern of [
        '[[:digit:]]',
        '[[=a=]]',
        '[[.a.]]',
        String.raw`\(literal\)\{braces\}`,
        '(|wand)',
        'wand|',
        '()',
    ]) {
        const regex = regex_init();
        assert.equal(regex_compile(pattern, regex), true, pattern);
        assert.equal(regex.pattern, pattern, pattern);
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
    const parsed = parseNethackrc(
        'AUTOPICKUP_EXCEPTION=">(wand)\\1"\n',
    );
    const state = {};
    installParsedGa(state, parsed);
    assert.equal(state.ga.apelist, parsed.ga.apelist);
    assert.equal(state.ga.apelist.regex, parsed.ga.apelist.regex);
    assert.equal(regex_match('wandwand', state.ga.apelist.regex), true);
    assert.equal(regex_match('wand1', state.ga.apelist.regex), false);
});

test('startup installation retains the duplicated-capture matcher boundary',
    () => {
        const parsed = parseNethackrc(
            String.raw`AUTOPICKUP_EXCEPTION=">(wand){2}\1"` + '\n',
        );
        const state = {};
        installParsedGa(state, parsed);
        assert.equal(state.ga.apelist, parsed.ga.apelist);
        assert.equal(state.ga.apelist.regex.kind,
            'duplicated-capture-boundary');
        assert.throws(
            () => regex_match('wandwandwand', state.ga.apelist.regex),
            UnsupportedPosixDuplicatedCaptureError,
        );
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
