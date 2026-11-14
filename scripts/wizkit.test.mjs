// cfgfiles.c cnf_line_WIZKIT() stores gw.wizkit, and files.c read_wizkit()
// reads it at the start of a new game in debug mode. The recordings of
// recipes/files.c/wizkit-missing-file, wizkit-after-config-error,
// wizkit-playground-not-directory and wizkit-home-not-directory show the
// "Access to <name> denied" and "Couldn't open default gw.wizkit file"
// reports, and wizkit-home-config-* show C reading $HOME/.nethackrc as the
// kit; these tests pin what no recording shows: the 127-byte limit, the
// arms that print nothing, a directory read as an empty kit, and the names
// whose bytes the port does not have.

import assert from 'node:assert/strict';
import test from 'node:test';

import { RECORDER_HOME } from '../js/cfgfiles.js';
import { read_wizkit, resolveRecorderHomePath } from '../js/files.js';
import { GameDisplay } from '../js/game_display.js';
import { game } from '../js/gstate.js';
import { parseNethackrc } from '../js/options.js';

test('WIZKIT keeps the last statement, munged, in at most 127 bytes', () => {
    // parse_config_line() runs mungspaces() over the line and skips one space
    // after '='; the second statement replaces the first.
    assert.equal(
        parseNethackrc('WIZKIT=first\nWIZKIT=  my\tkit  list \n').wizkit,
        'my kit list',
    );
    // strncpy(gw.wizkit, bufp, WIZKIT_MAX - 1): WIZKIT_MAX is 128, so a
    // 130-byte name keeps 127 bytes.
    assert.equal(parseNethackrc(`WIZKIT=${'k'.repeat(130)}\n`).wizkit,
        'k'.repeat(127));
    // A file without the statement leaves gw.wizkit empty.
    assert.equal(parseNethackrc('OPTIONS=color\n').wizkit, '');
});

test('read_wizkit prints nothing outside debug mode or without a kit', async () => {
    // Neither state has a display, so any raw print would throw.
    await read_wizkit({ wizard: false, wizkit: 'nokit' });
    await read_wizkit({ wizard: true, wizkit: '' });
});

test('read_wizkit notes a kit name whose bytes the port does not have', async () => {
    // access() succeeds or reaches the host for each: "rumors" and
    // "minefill.lua" are playground files, "1000wizard.3" a level file the
    // game may have written, "save/kit" a name in the save directory, and
    // "/etc/kit" and "../kit" leave the playground. C would open any that
    // exists and wish for its lines. Neither state has a display, so a raw
    // print before the note would throw.
    for (const wizkit of ['rumors', 'minefill.lua', '1000wizard.3',
        'save/kit', '/etc/kit', '../kit']) {
        game.unported = new Set();
        await read_wizkit({ wizard: true, wizkit });
        assert.deepEqual([...game.unported], ['files.c fopen_wizkit_file'], wizkit);
    }
});

test('read_wizkit reads a playground directory as an empty kit', async () => {
    // access() and fopen(name, "r") both succeed on a directory, and the
    // first fgets() fails, so parse_conf_file() hands proc_wizkit_line()
    // nothing: "." is the playground and "save" its save directory. No state
    // has a display, so a raw print would throw.
    for (const wizkit of ['.', 'save', 'save/']) {
        game.unported = new Set();
        const state = { wizard: true, wizkit };
        await read_wizkit(state);
        assert.deepEqual([...game.unported], [], wizkit);
        // read_wizkit() clears program_state.wizkit_wishing and pops its
        // error frame once the file is read.
        assert.equal(state.program_state.wizkit_wishing, 0, wizkit);
        assert.equal(state.configErrorFrame, undefined, wizkit);
    }
});

function rowText(display, row) {
    return display.grid[row].map((cell) => cell.ch).join('').replace(/ +$/u, '');
}

// Runs read_wizkit() for `wizkit` with a display and `keys` spaces queued
// for the tty_wait_synch() after each raw_printf(); returns the rows the
// raw prints wrote and the keys left unread.
async function wizkitRows(wizkit, keys) {
    // read_wizkit() runs after tty_init_nhwindows() has raised
    // iflags.cbreak, so getret() takes a space (js/tty_startup.js).
    const state = {
        wizard: true, wizkit, iflags: { cbreak: true }, nhDisplay: new GameDisplay(null),
    };
    for (let i = 0; i < keys; ++i) state.nhDisplay.pushKey(' '.charCodeAt(0));
    game.unported = new Set();
    await read_wizkit(state);
    return {
        rows: [0, 1, 2].map((row) => rowText(state.nhDisplay, row)).filter(Boolean),
        unread: state.nhDisplay.inputQueueLength,
        unported: [...game.unported],
    };
}

test('read_wizkit reports access() and $HOME failures with their errno', async () => {
    // ENOENT (2) in the playground, then $HOME/nokit/x fails with ENOENT
    // too, which fopen_wizkit_file() does not report.
    assert.deepEqual(await wizkitRows('nokit/x', 1),
        { rows: ['Access to nokit/x denied (2).'], unread: 0, unported: [] });
    // "rumors" is a playground file, so access() fails with ENOTDIR (20).
    assert.deepEqual(await wizkitRows('rumors/kit', 1),
        { rows: ['Access to rumors/kit denied (20).'], unread: 0, unported: [] });
    // $HOME/.nethackrc is a file, so $HOME/.nethackrc/kit fails with ENOTDIR
    // (20), and C names the judge's HOME (recorder patch 010).
    // tty_raw_print() drops bytes beyond the 80-column terminal edge.
    assert.deepEqual(await wizkitRows('.nethackrc/kit', 2), {
        rows: ['Access to .nethackrc/kit denied (2).',
            `Couldn't open default gw.wizkit file ${RECORDER_HOME}/.nethackrc/kit (20).`
                .slice(0, 80)],
        unread: 0,
        unported: [],
    });
    // access() fails, but fopen() then opens $HOME/.nethackrc itself, whose
    // text this state leaves empty, so nothing is wished for.
    assert.deepEqual(await wizkitRows('./.nethackrc', 1), {
        rows: ['Access to ./.nethackrc denied (2).'],
        unread: 0,
        unported: [],
    });
});

test('resolveRecorderHomePath follows POSIX resolution in a HOME holding .nethackrc', () => {
    // fopen_wizkit_file() opens HOME "/" name (files.c:2516-2521); the
    // recorder's HOME holds only the config file (docs/recording-environment.md).
    const resolve = (name) => resolveRecorderHomePath(name, '.nethackrc');
    assert.deepEqual(resolve('.nethackrc'), { kind: 'file' });
    assert.deepEqual(resolve('./.nethackrc'), { kind: 'file' });
    // "" and "." name HOME itself; a leading "/" doubles the separator only.
    assert.deepEqual(resolve('.'), { kind: 'directory' });
    assert.deepEqual(resolve('/.nethackrc'), { kind: 'file' });
    // ENOENT (2) for any other name, and ENOTDIR (20) for a component after
    // the file, including a trailing slash or "..".
    assert.deepEqual(resolve('kit'), { kind: 'absent', errno: 2 });
    assert.deepEqual(resolve('kit/.nethackrc'), { kind: 'absent', errno: 2 });
    assert.deepEqual(resolve('.nethackrc/kit'), { kind: 'absent', errno: 20 });
    assert.deepEqual(resolve('.nethackrc/'), { kind: 'absent', errno: 20 });
    assert.deepEqual(resolve('.nethackrc/..'), { kind: 'absent', errno: 20 });
    // ".." above HOME reaches the host.
    assert.deepEqual(resolve('../kit'), { kind: 'outside' });
});
