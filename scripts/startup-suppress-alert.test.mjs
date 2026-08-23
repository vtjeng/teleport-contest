import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import {
    optionValue,
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    get_current_feature_ver,
    get_feature_notice_ver,
} from '../js/version.js';
import {
    loadStartupSuppressAlertRecipe,
    STARTUP_SUPPRESS_ALERT_CASES,
    verifyStartupSuppressAlertSegment,
} from './run-startup-suppress-alert.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

const SUPPRESS_ALERT_ROW = allopt.find(
    ({ name }) => name === 'suppress_alert',
);

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

test('feature notice versions require two dots and validate their prefix',
    () => {
        for (const value of [null, '', '3', '3.7', 'x.7.0', '3.x.0']) {
            assert.equal(get_feature_notice_ver(value), 0n, String(value));
        }
        assert.equal(get_feature_notice_ver('.7.0'), 0x00070000n);
        assert.equal(get_feature_notice_ver('3..0'), 0x03000000n);
        assert.equal(get_feature_notice_ver('3.7.'), 0x03070000n);
    });

test('feature notice packing follows recorder int and unsigned-long widths',
    () => {
        assert.equal(get_current_feature_ver(), 0x05000000n);
        assert.equal(get_feature_notice_ver('3.7.1tail'), 0x03070100n);
        assert.equal(get_feature_notice_ver('3.7.1.ignored'), 0x03070100n);
        assert.equal(get_feature_notice_ver('0.256.0'), 0x01000000n);
        assert.equal(get_feature_notice_ver('0.0.65536'), 0x01000000n);
        assert.equal(get_feature_notice_ver('4294967301.0.0'), 0x05000000n);
        assert.equal(
            get_feature_notice_ver('3.7.-1'),
            0xFFFFFFFFFFFFFF00n,
        );
    });

test('suppress_alert defaults to zero and empty forms do nothing', () => {
    for (const statement of ['', 'suppress_alert', 'suppress_alert:',
        'suppress_alert=']) {
        const parsed = statement ? parse(statement) : parseNethackrc('');
        assert.equal(parsed.flags.suppress_alert, 0, statement || 'default');
        assert.deepEqual(parsed.configErrorFrame.output, [], statement);
    }
});

test('malformed and all-zero versions preserve prior state without errors',
    () => {
        for (const value of ['bad', '3.7', '3.x.0', '0.0.0']) {
            const line = `OPTIONS=suppress_alert:${value},suppress_alert:3.6.1`;
            const parsed = parseNethackrc(`${line}\n`);
            assert.equal(parsed.flags.suppress_alert, 0x03060100, value);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('valid versions pack into the sole flags field and render decoded parts',
    () => {
        for (const [value, packed, rendered] of [
            ['3.7.0', 0x03070000, '3.7.0'],
            ['3.7.1tail', 0x03070100, '3.7.1'],
            ['0.256.0', 0x01000000, '1.0.0'],
            ['0.0.65536', 0x01000000, '1.0.0'],
            ['4294967301.0.0', 0x05000000, '5.0.0'],
        ]) {
            const parsed = parse(`suppress_alert:${value}`);
            assert.equal(parsed.flags.suppress_alert, packed, value);
            assert.equal(typeof parsed.flags.suppress_alert, 'number', value);
            assert.equal(optionValue(parsed, SUPPRESS_ALERT_ROW, {}), rendered);
            assert.deepEqual(parsed.configErrorFrame.output, [], value);
        }
    });

test('the suppress_alert getter keeps its unmasked major and masked tail',
    () => {
        const parsed = parseNethackrc('');
        assert.equal(optionValue(parsed, SUPPRESS_ALERT_ROW, {}), '(none)');
        parsed.flags.suppress_alert = 0x1234567800;
        assert.equal(
            optionValue(parsed, SUPPRESS_ALERT_ROW, {}),
            '4660.86.120',
        );
    });

test('future packed versions report and preserve right-hand state', () => {
    for (const value of ['5.0.1', '3.7.-1']) {
        const line = `OPTIONS=sup:${value},suppress_alert:3.6.1`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.equal(parsed.flags.suppress_alert, 0x03060100, value);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ` * Line 1: suppress_alert=${value} Invalid reference to a future`
                + ' version ignored.',
        ], value);
    }
});

test('suppress_alert duplicates apply right to left and across later lines',
    () => {
        const parsed = parseNethackrc([
            'OPTIONS=suppress_alert:3.6.1,suppress_alert:4.0.2',
            'OPTIONS=suppress_alert:3.7.0',
        ].join('\n'));
        assert.equal(parsed.flags.suppress_alert, 0x03070000);
        assert.deepEqual(parsed.configErrorFrame.output, []);
    });

test('suppress_alert retains its source option contract', () => {
    assert.equal(SUPPRESS_ALERT_ROW?.setwhere, 4);
    assert.equal(SUPPRESS_ALERT_ROW?.negateok, false);
    assert.equal(SUPPRESS_ALERT_ROW?.valok, true);
    assert.equal(SUPPRESS_ALERT_ROW?.has_handler, false);
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('suppress_alert'), false);
});

test('the fresh suppress-alert matrix contains replay inputs only', () => {
    const recipe = loadStartupSuppressAlertRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_SUPPRESS_ALERT_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured suppress_alert reaches installed state and optionsfull',
    () => withSerializedGrids(async () => {
        for (const segment of loadStartupSuppressAlertRecipe().segments)
            await verifyStartupSuppressAlertSegment(segment);
    }));
