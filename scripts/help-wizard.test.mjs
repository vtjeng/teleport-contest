import assert from 'node:assert/strict';
import test from 'node:test';

import {
    helpMenuItems,
    setopt_cmd,
} from '../js/pager.js';
import { loadHelpWizardCases } from './run-help-wizard.mjs';

test('wizard help keeps source values while filtering rows', () => {
    assert.deepEqual(
        helpMenuItems({ wizard: true }).map(({ value, selector, label }) => ({
            value, selector, label,
        })).slice(-3),
        [
            { value: 14, selector: 'n', label: 'The NetHack license.' },
            { value: 15, selector: 'o', label: 'Support information.' },
            { value: 16, selector: 'p', label: 'List of wizard-mode commands.' },
        ],
    );
    assert.deepEqual(
        helpMenuItems({ wizard: true, sysopt: { hideusage: true } })
            .map(({ value, selector }) => ({ value, selector })).slice(-4),
        [
            { value: 12, selector: 'l' },
            { value: 14, selector: 'm' },
            { value: 15, selector: 'n' },
            { value: 16, selector: 'o' },
        ],
    );
    assert(!helpMenuItems({ wizard: false }).some(
        (item) => item.value === 16,
    ));
    assert(!helpMenuItems({ wizard: false, sysopt: { hideusage: true } })
        .some((item) => item.value === 13));
});

test('setopt_cmd follows current command bindings and C fallbacks', () => {
    assert.equal(setopt_cmd({ iflags: {}, flags: {} }), "'#optionsfull' or 'm O'");
    assert.equal(setopt_cmd({
        iflags: {},
        flags: {},
        commandOperations: [
            { type: 'bind', key: 'x'.charCodeAt(0), command: 'optionsfull' },
        ],
    }), "'x'");
    assert.equal(setopt_cmd({
        iflags: {},
        flags: {},
        commandOperations: [
            { type: 'bind', key: 'm'.charCodeAt(0), command: 'nothing' },
            { type: 'bind', key: 'q'.charCodeAt(0), command: 'reqmenu' },
            { type: 'bind', key: 'z'.charCodeAt(0), command: 'options' },
        ],
    }), "'#optionsfull' or 'q z'");
});

test('wizard recipes select a real production debug-help row', () => {
    for (const { entry, recipe } of loadHelpWizardCases()) {
        assert.match(recipe.segments[0].nethackrc, /playmode:debug/u, entry.label);
        assert.equal(recipe.segments[0].moves, '?p   ', entry.label);
    }
});
