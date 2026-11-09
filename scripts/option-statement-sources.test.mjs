// js/options.js parseoptions() and the option handlers it dispatches run
// without refusals for statements no caller builds. That holds because every
// caller hands parseoptions() FALSE for tinitial and tfrom_file and a
// statement made from an allopt[] name, each name matches its own row, the
// menu_* handlers are keyed by the row's own optfn, and optfn_boolean()'s
// female and pauper arms sit behind its set_in_config test. Each test below
// fails when one of those stops holding; the last pins the options.js stand-ins
// that remain and fails if a removed one returns.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { OPTION_MINMATCH } from '../js/options.js';
import { allopt } from '../js/optlist_data.js';
import { assertExceptionCount } from './exception-count.mjs';

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

const OPTIONS_SOURCE = stripComments(readFileSync(
    new URL('../js/options.js', import.meta.url), 'utf8',
));

// global.h enum optset_restrictions.
const SET_IN_CONFIG = 1;

test('every parseoptions() caller passes an allopt name and two FALSE flags', () => {
    const calls = [...OPTIONS_SOURCE.matchAll(
        /(?<!function )parseoptions\(\s*state,\s*([\s\S]+?),\s*(\w+),\s*(\w+),\s*helpers,?\s*\)/gu,
    )].map((match) => [match[1].trim(), match[2], match[3]]);
    assert.deepEqual(calls, [
        // toggle_bool_option() and applyOptionMenuPick()'s boolean arm.
        ['buf', 'false', 'false'],
        // handler_pickup_types().
        ["'pickup_types'", 'false', 'false'],
        ['buf', 'false', 'false'],
        // applyOptionMenuPick()'s getlin() arm for a handler-less option.
        ['`${option.name}:${answer}`', 'false', 'false'],
    ]);
    // Both `buf`s are an optional '!' and the row's own name.
    const bufs = [...OPTIONS_SOURCE.matchAll(/const buf = ([^;]+);\s*(?:if \()?await parseoptions\(/gu)]
        .map((match) => match[1].replace(/\s+/gu, ' '));
    assert.deepEqual(bufs, [
        "(booleanOptionValue(state, option) ? '!' : '') + option.name",
        "(booleanOptionValue(state, option) ? '!' : '') + option.name",
    ]);
    assert.ok(allopt.some(({ name }) => name === 'pickup_types'));
    // No other file calls it.
    const jsDir = new URL('../js/', import.meta.url);
    const others = readdirSync(jsDir)
        .filter((file) => file.endsWith('.js') && file !== 'options.js')
        .filter((file) => /\bparseoptions\(/u.test(
            stripComments(readFileSync(new URL(file, jsDir), 'utf8')),
        ));
    assert.deepEqual(others, []);
});

test('every allopt name reaches its own row before the alias table', () => {
    // parseoptions() strips a leading '!' or "no" before matching, then
    // match_optname() needs at least minmatch characters.
    for (const [index, option] of allopt.entries()) {
        assert.doesNotMatch(option.name, /^(?:!|no)/iu, option.name);
        assert.ok(option.name.length >= OPTION_MINMATCH[index], option.name);
    }
});

test('the menu option set handlers are keyed by their rows\' optfn', () => {
    const block = OPTIONS_SOURCE.match(
        /const MENU_OPTION_FUNCTIONS = Object\.freeze\(\{([\s\S]*?)\}\);/u,
    );
    assert.ok(block, 'MENU_OPTION_FUNCTIONS not found');
    const names = [...block[1].matchAll(/(\w+): optfn_\1,/gu)].map((m) => m[1]);
    assert.equal(names.length, 14);
    for (const name of names) {
        const row = allopt.find((option) => option.name === name);
        assert.equal(row?.optfn, name, name);
    }
    // Every row parseoptions() would send to one of them is in the table.
    const menuRows = allopt
        .filter(({ optfn }) => /^menu_/u.test(optfn) && optfn !== 'menu_objsyms')
        .map(({ optfn }) => optfn);
    assert.deepEqual(menuRows.filter((optfn) => !names.includes(optfn)), []);
});

test('optfn_boolean() returns before its female and pauper arms', () => {
    // The set_in_config test at options.c:5199-5201 answers optn_err for a
    // statement parseoptions() reads after the game has started.
    for (const name of ['female', 'pauper']) {
        const row = allopt.find((option) => option.name === name);
        assert.equal(row.opttyp, 'BoolOpt', name);
        assert.equal(row.setwhere, SET_IN_CONFIG, name);
    }
    assert.match(OPTIONS_SOURCE,
        /if \(!state\.go\.opt_initial && option\.setwhere === set_in_config\)\s*return optn_err;/u);
});

// The two stand-ins options.js keeps: termcap.c tty_number_pad() writes only
// the keypad-mode escape, and optfn_pickup_types()'s live config_error_add()
// arm is a visible site for a later port.
const REMAINING_NOTES = [
    "note_unported('wintty.c tty_number_pad')",
    "note_unported('cfgfiles.c config_error_add')",
];

test('options.js keeps only its pinned stand-ins', () => {
    const notes = [...OPTIONS_SOURCE.matchAll(/note_unported\([^)]*\)/gu)]
        .map((match) => match[0]);
    assertExceptionCount(notes.length, REMAINING_NOTES.length, {
        what: 'note_unported() calls in js/options.js',
        pin: 'REMAINING_NOTES in scripts/option-statement-sources.test.mjs',
    });
    assert.deepEqual(notes, REMAINING_NOTES);
    for (const pattern of [
        /UnsupportedOptionMenuError/u,
        /UNPARSED_COMPOUND_OPTIONS|requireParsedNumber|nameForValue/u,
        /optfn_palette_legacy|UnportedConfigStatement/u,
    ]) assert.doesNotMatch(OPTIONS_SOURCE, pattern);
    // cmd.js no longer hands options.js its own update_rest_on_space().
    const cmd = stripComments(readFileSync(
        new URL('../js/cmd.js', import.meta.url), 'utf8',
    ));
    assert.doesNotMatch(cmd, /updateRestOnSpace\s*:/u);
});
