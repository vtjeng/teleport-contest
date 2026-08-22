import assert from 'node:assert/strict';
import test from 'node:test';

import {
    count_autocompletions,
    extcmds_match,
    initialExtcmdFlags,
    parseautocomplete,
} from '../js/cmd_autocomplete.js';
import {
    AUTOCOMPLETE,
    AUTOCOMP_ADJ,
    CMD_NOT_AVAILABLE,
    ECM_IGNOREAC,
    ECM_NO1CHARCMD,
    ECM_NOFLAGS,
    extcmdlist,
} from '../js/extcmdlist_data.js';
import { parseNethackrc } from '../js/options.js';
import {
    loadStartupAutocompleteRecipe,
    STARTUP_AUTOCOMPLETE_CASES,
    verifyStartupAutocompleteSegment,
} from './run-startup-autocomplete.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function indexOf(name) {
    const index = extcmdlist.findIndex((entry) => entry.ef_txt === name);
    assert.notEqual(index, -1, `extcmdlist[] contains ${name}`);
    return index;
}

function bits(state, name) {
    return state.extcmdFlags[indexOf(name)] & (AUTOCOMPLETE | AUTOCOMP_ADJ);
}

test('parseautocomplete recurses through comma and colon suffixes first', () => {
    const parsed = parseNethackrc([
        'AUTOCOMPLETE=apply,,!terrain:terrain',
        '',
    ].join('\n'));
    assert.equal(bits(parsed, 'apply'), AUTOCOMPLETE | AUTOCOMP_ADJ);
    assert.equal(bits(parsed, 'terrain'), AUTOCOMP_ADJ);
    assert.equal(count_autocompletions(parsed), 2);

    // A second statement reverts both rows. Repeating it changes neither the
    // current value nor AUTOCOMP_ADJ.
    const reverted = parseNethackrc([
        'AUTOCOMPLETE=apply,,!terrain:terrain',
        'AUTOCOMPLETE=!apply,terrain',
        'AUTOCOMPLETE=!apply,terrain',
        '',
    ].join('\n'));
    assert.equal(bits(reverted, 'apply'), 0);
    assert.equal(bits(reverted, 'terrain'), AUTOCOMPLETE);
    assert.equal(count_autocompletions(reverted), 0);
});

test('parseautocomplete trims spaces and tabs around each command name', () => {
    const parsed = parseNethackrc(
        'AUTOCOMPLETE=\tapply\t , \t!terrain\t\n',
    );
    assert.equal(bits(parsed, 'apply'), AUTOCOMPLETE | AUTOCOMP_ADJ);
    assert.equal(bits(parsed, 'terrain'), AUTOCOMP_ADJ);
    assert.equal(count_autocompletions(parsed), 2);
});

test('empty elements return but an empty negated name is invalid', () => {
    const empty = parseNethackrc('AUTOC= , :\n');
    assert.deepEqual(empty.startupEvents, []);
    assert.equal(count_autocompletions(empty), 0);

    const invalid = parseNethackrc('AUTOCOMPLETE=!\n');
    assert.deepEqual(invalid.startupEvents, [{
        text: "Bad autocomplete: invalid extended command ''.",
        wait: true,
    }]);
    assert.equal(invalid.configErrorFrame.num_errors, 0);
});

test('command names match exactly and case-sensitively', () => {
    const parsed = parseNethackrc([
        'AUTOCOMPLETE=Apply',
        'AUTOCOMPLETE=app',
        'AUTOCOMPLETE=apply',
        '',
    ].join('\n'));
    assert.deepEqual(parsed.startupEvents, [
        {
            text: "Bad autocomplete: invalid extended command 'Apply'.",
            wait: true,
        },
        {
            text: "Bad autocomplete: invalid extended command 'app'.",
            wait: true,
        },
    ]);
    assert.equal(bits(parsed, 'apply'), AUTOCOMPLETE | AUTOCOMP_ADJ);

    // strchr(',') is tried before strchr(':'), even when the colon occurs
    // first. The prefix is not reparsed, so it remains one invalid name.
    const separatorOrder = parseNethackrc(
        'AUTOCOMPLETE=apply:terrain,!wait\n',
    );
    assert.deepEqual(separatorOrder.startupEvents, [{
        text: "Bad autocomplete: invalid extended command 'apply:terrain'.",
        wait: true,
    }]);
    assert.equal(bits(separatorOrder, 'apply'), 0);
});

test('parseautocomplete changes rows before extcmds_match filters them', () => {
    const parsed = parseNethackrc(
        'AUTOCOMPLETE=!levelchange,clicklook\n',
    );
    assert.equal(bits(parsed, 'levelchange'), AUTOCOMP_ADJ);
    assert.equal(bits(parsed, 'clicklook'), AUTOCOMPLETE | AUTOCOMP_ADJ);
    assert.deepEqual(extcmds_match('lev', ECM_NOFLAGS, parsed), []);
    assert.deepEqual(extcmds_match('cli', ECM_NOFLAGS, parsed), []);

    // The recorder build has no CMD_NOT_AVAILABLE row, so construct the flag
    // combination to pin parseautocomplete()'s source behavior: it searches
    // every extcmdlist[] name and preserves unrelated availability bits.
    const unavailable = { wizard: false, extcmdFlags: initialExtcmdFlags() };
    unavailable.extcmdFlags[indexOf('apply')] |= CMD_NOT_AVAILABLE;
    const errors = [];
    parseautocomplete('apply', true, unavailable, (text) => errors.push(text));
    assert.deepEqual(errors, []);
    assert.equal(
        unavailable.extcmdFlags[indexOf('apply')]
            & (CMD_NOT_AVAILABLE | AUTOCOMPLETE | AUTOCOMP_ADJ),
        CMD_NOT_AVAILABLE | AUTOCOMPLETE | AUTOCOMP_ADJ,
    );
    assert.deepEqual(extcmds_match('ap', ECM_NOFLAGS, unavailable), []);
    assert.equal(count_autocompletions(unavailable), 1);
});

test('extcmds_match retains the first row and applies the one-character filter',
    () => {
        const stock = parseNethackrc('');
        assert.deepEqual(
            extcmds_match(null, ECM_IGNOREAC, stock).slice(0, 2),
            [indexOf('#'), indexOf('?')],
        );
        assert.equal(
            extcmds_match(
                null, ECM_IGNOREAC | ECM_NO1CHARCMD, stock,
            ).includes(indexOf('#')),
            false,
        );

        const enabled = parseNethackrc('AUTOCOMPLETE=apply\n');
        assert.deepEqual(
            extcmds_match('apply', ECM_NOFLAGS, enabled),
            [indexOf('apply')],
        );
    });

test('parseautocomplete can change extcmdlist[] index zero', () => {
    const parsed = parseNethackrc('AUTOCOMPLETE=#\n');
    assert.equal(bits(parsed, '#'), AUTOCOMPLETE | AUTOCOMP_ADJ);
    assert.deepEqual(extcmds_match('#', ECM_NOFLAGS, parsed), [indexOf('#')]);
});

test('each parse owns a fresh copy of the mutable command flags', () => {
    const changed = parseNethackrc('AUTOCOMPLETE=apply\n');
    const stock = parseNethackrc('');
    assert.notEqual(changed.extcmdFlags, stock.extcmdFlags);
    assert.equal(bits(changed, 'apply'), AUTOCOMPLETE | AUTOCOMP_ADJ);
    assert.equal(bits(stock, 'apply'), 0);
    assert.equal(extcmdlist[indexOf('apply')].flags & AUTOCOMPLETE, 0);
});

test('the fresh recipe covers count, completion, filters, waits, and reverts',
    () => {
        const recipe = loadStartupAutocompleteRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, STARTUP_AUTOCOMPLETE_CASES.length);
        assert.deepEqual(
            STARTUP_AUTOCOMPLETE_CASES.map(({ label }) => label),
            [
                'ordinary command enabled',
                'compiled command disabled',
                'mixed separators repeat and revert',
                'minimum statement prefix and empty elements',
                'wizard and internal rows change but stay filtered',
                'case-sensitive invalid name',
                'invalid empty negation precedes valid earlier element',
            ],
        );
        for (const [index, segment] of recipe.segments.entries()) {
            const entry = STARTUP_AUTOCOMPLETE_CASES[index];
            assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
            assert.ok(segment.moves.includes('mO'), entry.label);
            assert.ok(segment.moves.includes(`#${entry.prefix}`), entry.label);
            assert.equal(
                segment.moves.startsWith('\n'.repeat(entry.waits)),
                true,
                entry.label,
            );
        }
    });

test('each fresh case reaches #optionsfull and typed command completion',
    () => withSerializedGrids(async () => {
        for (const segment of loadStartupAutocompleteRecipe().segments)
            await verifyStartupAutocompleteSegment(segment);
    }));
