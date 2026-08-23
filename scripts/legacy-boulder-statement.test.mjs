import assert from 'node:assert/strict';
import test from 'node:test';

import { cnf_line_BOULDER, get_uchars } from '../js/cfgfiles.js';
import { parseNethackrc } from '../js/options.js';
import {
    LEGACY_BOULDER_CASES,
    loadLegacyBoulderRecipe,
    verifyLegacyBoulderSegment,
} from './run-startup-legacy-boulder.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function scanUchars(value, initial = 0x3F) {
    const list = [initial];
    const errors = [];
    const count = get_uchars(
        value, list, true, 1, 'BOULDER',
        (message) => errors.push(message),
    );
    return { count, byte: list[0], errors };
}

test('get_uchars accumulates one unsigned decimal and stops at whitespace',
    () => {
        assert.deepEqual(scanUchars(''), { count: 0, byte: 0x3F, errors: [] });
        assert.deepEqual(scanUchars(' 48'), {
            count: 1, byte: 0x30, errors: [],
        });
        assert.deepEqual(scanUchars('0'), {
            count: 1, byte: 0x3F, errors: [],
        });
        assert.deepEqual(scanUchars('0 '), {
            count: 1, byte: 0x3F, errors: [],
        });
        assert.deepEqual(scanUchars('256'), {
            count: 1, byte: 0, errors: [],
        });
        assert.deepEqual(scanUchars('4294967344 999x'), {
            count: 1, byte: 0x30, errors: [],
        });
        assert.deepEqual(scanUchars('9'), {
            count: 1, byte: 9, errors: [],
        });
    });

test('get_uchars rejects either byte adjacent to the decimal range', () => {
    for (const value of ['/', ':', '48x', String.raw`\48`]) {
        assert.deepEqual(scanUchars(value), {
            count: 0,
            byte: 0x3F,
            errors: ['Syntax error in BOULDER'],
        }, value);
    }
});

test('cnf_line_BOULDER reports success after queuing its raw wait', () => {
    const result = { startupEvents: [], symbolOperations: [] };
    assert.equal(cnf_line_BOULDER(result, 'x'), true);
    assert.deepEqual(result, {
        startupEvents: [{
            text: 'Syntax error in BOULDER', wait: true,
        }],
        symbolOperations: [],
    });
});

test('the legacy boulder recipe covers its integer and ordering branches', () => {
    const recipe = loadLegacyBoulderRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, LEGACY_BOULDER_CASES.length);
    assert.deepEqual(
        LEGACY_BOULDER_CASES.map(({ label }) => label),
        [
            'decimal narrows and whitespace ends the first value',
            'zero leaves an earlier direct value unchanged',
            'empty direct value leaves S_boulder unchanged',
            'direct prefix follows S_boulder',
            'S_boulder follows direct statement',
            'compound boulder follows direct statement',
            'direct statement follows compound boulder',
            'malformed suffix leaves earlier direct value unchanged',
            'backslash syntax leaves S_boulder unchanged',
            'high byte remains one optionsfull column',
            'ordinary errors surround the immediate raw wait',
        ],
    );
    for (const [index, segment] of recipe.segments.entries()) {
        const entry = LEGACY_BOULDER_CASES[index];
        const parsed = parseNethackrc(segment.nethackrc);
        assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
        assert.equal(
            parsed.configErrorFrame.num_errors,
            entry.configErrors ?? 0,
            entry.label,
        );
        assert.equal(
            parsed.startupEvents.filter(({ wait }) => wait).length,
            entry.waits,
            entry.label,
        );
        assert.ok(segment.moves.includes('mO'), entry.label);
        assert.ok(segment.moves.endsWith('\x1b'), entry.label);
    }
});

test('legacy boulder syntax errors are immediate raw waits, not config errors',
    () => {
        const parsed = parseNethackrc(
            'BOULDER=48\nBOULDER=48x\nBOULDER=0\n',
        );
        assert.deepEqual(parsed.configErrorFrame.output, []);
        assert.deepEqual(parsed.startupEvents, [{
            text: 'Syntax error in BOULDER',
            wait: true,
        }]);
        assert.deepEqual(parsed.symbolOperations, [{
            kind: 'legacy-boulder', byte: 0x30,
        }]);
        assert.deepEqual(parsed.unportedConfigStatements, []);
    });

test('each legacy boulder case reaches the tutorial map and #optionsfull',
    () => withSerializedGrids(async () => {
        for (const segment of loadLegacyBoulderRecipe().segments)
            await verifyLegacyBoulderSegment(segment);
    }));
