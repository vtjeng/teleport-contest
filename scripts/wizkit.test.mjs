// cfgfiles.c cnf_line_WIZKIT() stores gw.wizkit, and files.c read_wizkit()
// reads it at the start of a new game in debug mode. The blocked recipe
// recipes/files.c/wizkit-missing-file-blocked reaches the "Access to <name>
// denied" report; these tests pin the stored name and the arms that print
// nothing.

import assert from 'node:assert/strict';
import test from 'node:test';

import { read_wizkit } from '../js/files.js';
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

test('read_wizkit notes a kit name the port cannot rule out as a file', async () => {
    // "rumors" is a playground file and "kits/one" reaches the host
    // filesystem; C would open either and wish for its lines.
    for (const wizkit of ['rumors', 'kits/one', '.nethackrc', 'minefill.lua']) {
        game.unported = new Set();
        await read_wizkit({ wizard: true, wizkit });
        assert.deepEqual([...game.unported], ['files.c fopen_wizkit_file'], wizkit);
    }
});
