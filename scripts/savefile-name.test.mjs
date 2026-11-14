// js/files.js set_savefile_name(), js/unixunix.js regularize() and
// js/restore.js get_saved_games() name and list save files as the UNIX build
// of files.c does, so a segment restores only its own hero's save.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { set_savefile_name } from '../js/files.js';
import { resetGame } from '../js/gstate.js';
import { get_saved_games } from '../js/restore.js';
import { InMemoryStorage, setStorageForTesting } from '../js/storage.js';
import { RECORDER_UID, regularize } from '../js/unixunix.js';

const FILES_C = readFileSync('nethack-c/upstream/src/files.c', 'utf8');
const UNIXUNIX_C = readFileSync('nethack-c/upstream/sys/unix/unixunix.c', 'utf8');
const UNIXMAIN_C = readFileSync('nethack-c/upstream/sys/unix/unixmain.c', 'utf8');
const OPTIONS_C = readFileSync('nethack-c/upstream/src/options.c', 'utf8');

test('regularize() turns the characters unixunix.c names into underscores', () => {
    assert.match(UNIXUNIX_C, /while \(\(lp = strchr\(s, '\.'\)\) != 0 \|\| \(lp = strchr\(s, '\/'\)\) != 0\s*\|\| \(lp = strchr\(s, ' '\)\) != 0\)\s*\*lp = '_';/u);
    // The SYSV length cut is compiled out on LINUX, the recorder's build.
    assert.match(UNIXUNIX_C, /#if defined\(SYSV\) && !defined\(AIX_31\) && !defined\(SVR4\) && !defined\(LINUX\)/u);
    // One of each replaced character, a hyphen and a digit, which stay.
    assert.equal(regularize('A.b/c d-9'), 'A_b_c_d-9');
    // A 40-character name keeps its length: no cut on LINUX.
    assert.equal(regularize('x'.repeat(40)), 'x'.repeat(40));
});

test('set_savefile_name() follows the UNIX arm of files.c', () => {
    assert.match(FILES_C, /#ifdef UNIX\s*Sprintf\(gs\.SAVEF, "save\/%d%s", \(int\) getuid\(\), svp\.plname\);\s*regoffset = 5;/u);
    // Three names: plain, one regularize() changes, and debug mode's
    // "wizard" (options.c set_playmode()).
    assert.equal(set_savefile_name({ plname: 'Alice' }), `save/${RECORDER_UID}Alice`);
    assert.equal(set_savefile_name({ plname: 'Bob x.y' }), `save/${RECORDER_UID}Bob_x_y`);
    assert.equal(set_savefile_name({ plname: 'wizard' }), `save/${RECORDER_UID}wizard`);
    // unixmain.c opens a save only after set_playmode() has renamed a debug
    // hero, so a debug segment never finds another hero's save.
    assert.ok(UNIXMAIN_C.indexOf('set_playmode(); /* sets plname to "wizard" for wizard mode */')
        < UNIXMAIN_C.indexOf('nhfp = restore_saved_game()'));
    assert.match(OPTIONS_C, /if \(authorize_wizard_mode\(\)\)\s*gp\.plnamelen = \(int\) strlen\(strcpy\(svp\.plname, "wizard"\)\);/u);
});

test('get_saved_games() lists this uid\'s save files by saved name, sorted', () => {
    assert.match(FILES_C, /if \(sscanf\(entry->d_name, "%d%63s", &uid, name\) == 2\) \{\s*if \(uid == myuid\)/u);
    assert.match(FILES_C, /qsort\(result, j, sizeof \(char \*\), strcmp_wrap\);/u);
    const state = resetGame();
    const storage = new InMemoryStorage();
    // Two of this uid's saves, written in reverse order to show the sort,
    // another uid's save, and a non-save file: only the first two count.
    storage.setItem(`vfs:${set_savefile_name({ plname: 'Zed' })}`, JSON.stringify({ plname: 'Zed' }));
    storage.setItem(`vfs:${set_savefile_name({ plname: 'Amy' })}`, JSON.stringify({ plname: 'Amy' }));
    storage.setItem(`vfs:save/${RECORDER_UID + 1}Other`, JSON.stringify({ plname: 'Other' }));
    storage.setItem('vfs:record', '');
    setStorageForTesting(storage);
    try {
        assert.deepEqual(get_saved_games(state), ['Amy', 'Zed']);
    } finally {
        setStorageForTesting(null);
    }
});
