import assert from 'node:assert/strict';
import test from 'node:test';

import {
    cnf_line_WARNINGS,
    get_uchars,
} from '../js/cfgfiles.js';
import { WARNCOUNT } from '../js/const.js';
import { allopt } from '../js/optlist_data.js';
import { assign_warnings, parseNethackrc } from '../js/options.js';
import {
    loadStartupWarningSymbolsRecipe,
    STARTUP_WARNING_SYMBOL_CASES,
    verifyStartupWarningSymbolsSegment,
} from './run-startup-warning-symbols.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

const DEFAULT_WARNINGS = Object.freeze([48, 49, 50, 51, 52, 53]);

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function scanUchars(value, initial, modlist = false, size = WARNCOUNT) {
    const list = [...initial];
    const errors = [];
    const count = get_uchars(
        value, list, modlist, size, 'WARNINGS',
        (message) => errors.push(message),
    );
    return { count, list, errors };
}

test('get_uchars parses a bounded unsigned-decimal byte list', () => {
    assert.deepEqual(
        scanUchars(' 65\t0\n67 4294967552 69 4294967366 tail', [9, 9, 9, 9, 9, 9]),
        {
            count: 6,
            list: [65, 0, 67, 0, 69, 70],
            errors: [],
        },
    );
    assert.deepEqual(
        scanUchars('65 66 67 x', [9, 9, 9, 9, 9, 9]),
        {
            count: 3,
            list: [65, 66, 67, 9, 9, 9],
            errors: ['Syntax error in WARNINGS'],
        },
    );
});

test('get_uchars keeps zero slots only when modifying an existing list', () => {
    assert.deepEqual(
        scanUchars('0 256', [9, 9], true, 2),
        { count: 2, list: [9, 0], errors: [] },
    );
    assert.deepEqual(
        scanUchars('0 256', [9, 9], false, 2),
        { count: 2, list: [0, 0], errors: [] },
    );
});

test('warning symbols start at the six drawing.c defaults in gw', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(parsed.gw.warnsyms, DEFAULT_WARNINGS);
    assert.equal(parsed.flags.warnings, undefined);
});

test('compound warnings expands source escapes and changes only six bytes',
    () => {
        const cases = [
            ['warnings:ABC', [65, 66, 67, 51, 52, 53]],
            [String.raw`warnings:A\66\0XYZ`, [65, 66, 50, 51, 52, 53]],
            ['warnings:ABCDEFGH', [65, 66, 67, 68, 69, 70]],
            ['warnings:éABCDtail', [0xC3, 0xA9, 65, 66, 67, 68]],
            [String.raw`warnings:\mA\o102\x43^Dxy`,
                [0xC1, 66, 67, 4, 120, 121]],
        ];
        for (const [statement, expected] of cases) {
            const parsed = parse(statement);
            assert.deepEqual(parsed.gw.warnsyms, expected, statement);
            assert.deepEqual(parsed.configErrorFrame.output, [], statement);
        }
    });

test('missing and negated compound warnings report without changing gw', () => {
    for (const statement of ['warnings', 'warnings:', 'warnings=']) {
        const line = `OPTIONS=${statement}`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(parsed.gw.warnsyms, DEFAULT_WARNINGS, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: Missing parameter for '${statement}'.`,
        ], statement);
    }
    for (const statement of ['!warnings', '!warnings:', '!warnings:ABC']) {
        const line = `OPTIONS=${statement}`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(parsed.gw.warnsyms, DEFAULT_WARNINGS, statement);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: The warnings option may not both have a value and'
                + ' be negated.',
        ], statement);
    }
});

test('compound warnings duplicates apply right to left and across lines',
    () => {
        const line = 'OPTIONS=warnings:abc,warnings:DEF';
        const parsed = parseNethackrc([
            line,
            'OPTIONS=warnings:xy',
        ].join('\n'));
        assert.deepEqual(parsed.gw.warnsyms, [120, 121, 99, 51, 52, 53]);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: warnings.',
            '\nOPTIONS=warnings:xy',
            ' * Line 2: compound option specified multiple times: warnings.',
        ]);
    });

test('direct WARNINGS uses zero/nonzero assignment and byte narrowing', () => {
    const parsed = parseNethackrc(
        'WARNINGS=65 0 67 4294967552 69 4294967366\n',
    );
    assert.deepEqual(parsed.gw.warnsyms, [65, 49, 67, 51, 69, 70]);
    assert.deepEqual(parsed.startupEvents, []);
    assert.deepEqual(parsed.unportedConfigStatements, []);
});

test('short direct WARNINGS asserts only the initialized source prefix', () => {
    assert.equal(parseNethackrc('WARNINGS=65\n').gw.warnsyms[0], 65);
    assert.equal(parseNethackrc([
        'WARNINGS=65 66 67 68 69 70',
        'WARNINGS=71',
    ].join('\n')).gw.warnsyms[0], 71);
});

test('direct WARNINGS syntax errors wait immediately and discard a partial',
    () => {
        const result = {
            startupEvents: [],
            gw: { warnsyms: [...DEFAULT_WARNINGS] },
        };
        assert.equal(
            cnf_line_WARNINGS(result, '65 66x', assign_warnings),
            true,
        );
        assert.equal(result.gw.warnsyms[0], 65);
        assert.deepEqual(result.startupEvents, [{
            text: 'Syntax error in WARNINGS', wait: true,
        }]);
    });

test('direct and compound warning syntaxes apply in source order', () => {
    assert.deepEqual(parseNethackrc([
        'WARNINGS=65 66 67 68 69 70',
        'OPTIONS=warnings:xy',
    ].join('\n')).gw.warnsyms, [120, 121, 67, 68, 69, 70]);
    assert.deepEqual(parseNethackrc([
        'OPTIONS=warnings:ABCDEF',
        'WARNINGS=71 72 73 74 75 76',
    ].join('\n')).gw.warnsyms, [71, 72, 73, 74, 75, 76]);
});

test('warnings retains its source option and config-statement contracts', () => {
    const row = allopt.find(({ name }) => name === 'warnings');
    assert.equal(row?.setwhere, 1);
    assert.equal(row?.negateok, false);
    assert.equal(row?.valok, true);
    assert.equal(row?.has_handler, false);
});

test('the fresh warning-symbol matrix contains replay inputs only', () => {
    const recipe = loadStartupWarningSymbolsRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_WARNING_SYMBOL_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured warning symbols reach installed startup gw', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupWarningSymbolsRecipe().segments)
            await verifyStartupWarningSymbolsSegment(segment);
    })
));
