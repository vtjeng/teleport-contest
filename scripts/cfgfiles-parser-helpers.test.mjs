// Source-pinned tests for cfgfiles.c's section parser helpers.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    adjust_prefix,
    choose_random_part,
    config_error_init,
    free_config_sections,
    handle_config_section,
    is_config_section,
} from '../js/cfgfiles.js';
import { PREFIX_COUNT } from '../js/const.js';
import { read_sym_file } from '../js/files.js';
import { parseNethackrc } from '../js/options.js';

function parserState() {
    const startupEvents = [];
    return {
        startupEvents,
        configErrorFrame: config_error_init(startupEvents),
        gc: {
            config_section_chosen: null,
            config_section_current: null,
        },
    };
}

test('adjust_prefix strips the legacy suffix and appends one slash', () => {
    // cfgfiles.c:451-458 ignores trailing ;n and calls UNIX append_slash().
    const state = { gf: { fqn_prefix: Array(PREFIX_COUNT).fill(null) } };
    adjust_prefix('/var/lib/nethack;2', 4, state);
    assert.equal(state.gf.fqn_prefix[4], '/var/lib/nethack/');

    adjust_prefix('/already/;ignored', 4, state);
    assert.equal(state.gf.fqn_prefix[4], '/already/');

    // An empty post-suffix value does not replace the previous prefix.
    adjust_prefix(';2', 4, state);
    assert.equal(state.gf.fqn_prefix[4], '/already/');
    adjust_prefix(null, 4, state);
    assert.equal(state.gf.fqn_prefix[4], '/already/');
});

test('choose_random_part keeps C separator and empty-part behavior', () => {
    // cfgfiles.c:466-503 calls rn2(nsep), including rn2(1), then walks to the
    // chosen separator without treating empty leading/trailing parts as names.
    const calls = [];
    const random = (bound) => {
        calls.push(bound);
        return 1;
    };
    assert.equal(choose_random_part('north,south', ',', random), 'south');
    assert.deepEqual(calls, [2]);
    assert.equal(choose_random_part('single', ',', (bound) => {
        assert.equal(bound, 1);
        return 0;
    }), 'single');
    assert.equal(choose_random_part(',south', ',', () => 0), 'south');
    assert.equal(choose_random_part(',south', ',', () => 1), null);
    assert.equal(choose_random_part('north,', ',', () => 1), null);
    assert.equal(choose_random_part('a|b', '|', () => 1), 'b');
    assert.equal(choose_random_part(null, ',', () => {
        throw new Error('NULL must not draw');
    }), null);
});

test('is_config_section validates the exact C suffix grammar', () => {
    // cfgfiles.c:530-548 trims spaces/tabs around the name, but only literal
    // spaces may separate the closing bracket from an optional comment.
    assert.equal(is_config_section('  [  chosen  ]  # comment'), 'chosen');
    assert.equal(is_config_section('[]'), '');
    assert.equal(is_config_section('[chosen]#comment'), 'chosen');
    assert.equal(is_config_section('[chosen]\t#comment'), null);
    assert.equal(is_config_section('[chosen] trailing'), null);
    assert.equal(is_config_section('chosen'), null);
    assert.equal(is_config_section('[unclosed'), null);
});

test('free_config_sections clears both C-owned selection pointers', () => {
    // cfgfiles.c:509-515 frees and NULLs chosen before current.
    const state = parserState();
    state.gc.config_section_chosen = 'chosen';
    state.gc.config_section_current = 'current';
    free_config_sections(state);
    assert.equal(state.gc.config_section_chosen, null);
    assert.equal(state.gc.config_section_current, null);
});

test('handle_config_section gates, reports, and clears sections like C', () => {
    // cfgfiles.c:554-581 first removes the previous current section, reports a
    // header without CHOOSE, and treats [] as end-of-sections.
    const state = parserState();
    state.configErrorFrame.line_num = 1;
    state.configErrorFrame.origline = '[chosen]';
    assert.equal(handle_config_section('[chosen]', state), true);
    assert.deepEqual(state.configErrorFrame.output, [
        '\n[chosen]',
        ' * Line 1: Section "[chosen]" without CHOOSE.',
    ]);

    state.gc.config_section_chosen = 'chosen';
    assert.equal(handle_config_section('[chosen]', state), true);
    assert.equal(state.gc.config_section_current, 'chosen');
    assert.equal(handle_config_section('OPTIONS=name:wrong', state), false);
    assert.equal(handle_config_section('[other]', state), true);
    assert.equal(state.gc.config_section_current, 'other');
    assert.equal(handle_config_section('OPTIONS=name:wrong', state), true);

    state.gc.config_section_chosen = 'other';
    assert.equal(handle_config_section('OPTIONS=name:right', state), false);
    assert.equal(handle_config_section('[]', state), true);
    assert.equal(state.gc.config_section_chosen, null);
    assert.equal(state.gc.config_section_current, null);
});

test('parseNethackrc uses cfgfiles.c section state without local duplicates', () => {
    // cfgfiles.c parse_conf_buf():1768-1798 handles headers and CHOOSE before
    // the options.c statement parser. The empty header ends section filtering.
    const parsed = parseNethackrc([
        'CHOOSE=blue,red',
        '[blue]',
        'OPTIONS=legacy',
        '[red]',
        'OPTIONS=!legacy',
        '[]',
        'OPTIONS=name:After',
        '',
    ].join('\n'), () => 0);
    assert.equal(parsed.name, 'After');
    assert.equal(parsed.gc.config_section_chosen, null);
    assert.equal(parsed.gc.config_section_current, null);
    assert.equal(parsed.flags.legacy, true);
    assert.deepEqual(parsed.configErrorFrame.output, []);
});

test('read_sym_file forgets the CHOOSE choice and the current section', () => {
    // files.c read_sym_file() hands dat/symbols to parse_conf_file(), and
    // cfgfiles.c parse_conf_file() frees the sections before and after its
    // loop, whichever set the caller asked for.
    const filesC = readFileSync(
        new URL('../nethack-c/upstream/src/files.c', import.meta.url), 'utf8',
    );
    const cfgfilesC = readFileSync(
        new URL('../nethack-c/upstream/src/cfgfiles.c', import.meta.url), 'utf8',
    );
    const readSym = filesC.slice(filesC.indexOf('\nread_sym_file(int which_set)'));
    assert.match(
        readSym.slice(0, readSym.indexOf('\n}\n')),
        /parse_conf_file\(fp, proc_symset_line\);/u,
    );
    const parseConf = cfgfilesC.slice(cfgfilesC.indexOf('\nparse_conf_file(FILE *fp,'));
    assert.equal(
        parseConf.slice(0, parseConf.indexOf('\n}\n'))
            .split('free_config_sections();').length - 1,
        2,
    );

    // A set dat/symbols holds, one it does not hold, and the built-in
    // default, which the port answers without consulting its table: the
    // three results differ and all three clear both fields.
    for (const [name, found] of [
        ['DECgraphics', true], ['NoSuchSymbols', false], ['default', true],
    ]) {
        const state = parserState();
        state.gc.config_section_chosen = 'marsh';
        state.gc.config_section_current = 'marsh';
        assert.equal(read_sym_file(name, state), found, name);
        assert.equal(state.gc.config_section_chosen, null, name);
        assert.equal(state.gc.config_section_current, null, name);
    }

    // The same through the parser: after the symset line no section is
    // current, so the showexp line under the unchosen [fen] applies, where
    // without the symset line the choice of [marsh] skips it.
    const withSymset = parseNethackrc(
        'CHOOSE=marsh\n[marsh]\nOPTIONS=symset:DECgraphics\n[fen]\nOPTIONS=showexp\n',
        () => 0,
    );
    assert.equal(withSymset.flags.showexp, true);
    const without = parseNethackrc(
        'CHOOSE=marsh\n[marsh]\n[fen]\nOPTIONS=showexp\n', () => 0,
    );
    assert.equal(Boolean(without.flags.showexp), false);
});
