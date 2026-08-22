import assert from 'node:assert/strict';
import test from 'node:test';

import { allopt } from '../js/optlist_data.js';
import {
    optionValue,
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    activate_chosen_soundlib,
    assign_soundlib,
    get_soundlib_name,
    soundlib_id_from_opt,
    soundlib_nosound,
} from '../js/sounds.js';
import {
    loadStartupSoundlibRecipe,
    STARTUP_SOUNDLIB_CASES,
    verifyStartupSoundlibSegment,
} from './run-startup-soundlib.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

function parse(statement) {
    return parseNethackrc(`OPTIONS=${statement}\n`);
}

function soundlibState(state) {
    return [state.gc.chosen_soundlib, state.ga.active_soundlib];
}

test('sound library state starts on the two source nosound IDs', () => {
    const parsed = parseNethackrc('');
    assert.deepEqual(soundlibState(parsed), [0, 0]);
    assert.equal(parsed.flags.soundlib, undefined);
    assert.equal(soundlib_nosound, 0);
});

test('soundlib accepts exact, case-changed, and unknown nonempty values', () => {
    for (const value of ['nosound', 'NoSound', 'example']) {
        const parsed = parse(`soundlib:${value}`);
        assert.deepEqual(soundlibState(parsed), [0, 0], value);
        assert.equal(parsed.flags.soundlib, undefined, value);
        assert.deepEqual(parsed.configErrorFrame.output, [], value);
    }
    assert.equal(soundlib_id_from_opt('nosound'), 0);
    assert.equal(soundlib_id_from_opt('NoSound'), 0);
    assert.equal(soundlib_id_from_opt('example'), 0);
});

test('missing soundlib values report and preserve prior state', () => {
    for (const suffix of ['', ':', '=']) {
        const line = `OPTIONS=soundlib${suffix},soundlib:nosound`;
        const parsed = parseNethackrc(`${line}\n`);
        assert.deepEqual(soundlibState(parsed), [0, 0], suffix);
        assert.deepEqual(parsed.configErrorFrame.output, [
            `\n${line}`,
            ' * Line 1: compound option specified multiple times: soundlib.',
            ` * Line 1: Missing parameter for 'soundlib${suffix}'.`,
        ], suffix);
    }
});

test('soundlib negation is rejected before the handler', () => {
    const row = allopt.find(({ name }) => name === 'soundlib');
    assert.equal(row?.negateok, false);
    const line = 'OPTIONS=!soundlib:example,soundlib:nosound';
    const parsed = parseNethackrc(`${line}\n`);
    assert.deepEqual(soundlibState(parsed), [0, 0]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        `\n${line}`,
        ' * Line 1: compound option specified multiple times: soundlib.',
        ' * Line 1: The soundlib option may not both have a value and be'
            + ' negated.',
    ]);
});

test('soundlib duplicates apply right to left and count across lines', () => {
    const parsed = parseNethackrc([
        'OPTIONS=soundlib:nosound,soundlib:NoSound',
        'OPTIONS=soundlib:example',
    ].join('\n'));
    assert.deepEqual(soundlibState(parsed), [0, 0]);
    assert.deepEqual(parsed.configErrorFrame.output, [
        '\nOPTIONS=soundlib:nosound,soundlib:NoSound',
        ' * Line 1: compound option specified multiple times: soundlib.',
        '\nOPTIONS=soundlib:example',
        ' * Line 2: compound option specified multiple times: soundlib.',
    ]);
});

test('soundlib activation and getter use active rather than chosen state', () => {
    const state = { gc: { chosen_soundlib: 0 }, ga: { active_soundlib: 0 } };
    assign_soundlib(state, 0);
    activate_chosen_soundlib(state);
    assert.deepEqual(soundlibState(state), [0, 0]);
    assert.equal(get_soundlib_name(state), 'nosound');
    assert.equal(get_soundlib_name(state, 4), 'nos');
    assert.equal(get_soundlib_name(state, 0), '');

    const row = allopt.find(({ name }) => name === 'soundlib');
    assert.equal(optionValue(state, row, {}), 'nosound');
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('soundlib'), false);
});

test('soundlib helpers reject IDs outside the compiled choice table', () => {
    assert.throws(
        () => assign_soundlib({ gc: {} }, 1),
        /assign_soundlib: invalid soundlib \(1\)/u,
    );
    assert.throws(
        () => activate_chosen_soundlib({ gc: { chosen_soundlib: -1 } }),
        /activate_chosen_soundlib: invalid soundlib \(-1\)/u,
    );
    assert.throws(
        () => get_soundlib_name({ ga: { active_soundlib: 1 } }),
        /get_soundlib_name: invalid soundlib \(1\)/u,
    );
});

test('the fresh soundlib matrix contains replay inputs only', () => {
    const recipe = loadStartupSoundlibRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed, datetime }) => [seed, datetime]),
        STARTUP_SOUNDLIB_CASES.map(({ seed, datetime }) => [seed, datetime]),
    );
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
});

test('configured soundlib reaches activation and optionsfull', () => (
    withSerializedGrids(async () => {
        for (const segment of loadStartupSoundlibRecipe().segments)
            await verifyStartupSoundlibSegment(segment);
    })
));
