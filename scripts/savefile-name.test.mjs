// js/files.js set_savefile_name(), plname_from_file() and get_saved_games(),
// and js/unixunix.js regularize(), name, read and list save files as the UNIX
// build of files.c does, so a segment restores only its own hero's save.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { get_saved_games, plname_from_file, set_savefile_name } from '../js/files.js';
import { PL_NSIZ_PLUS } from '../js/const.js';
import { resetGame } from '../js/gstate.js';
import { InMemoryStorage, setStorageForTesting } from '../js/storage.js';
import { RECORDER_UID, regularize } from '../js/unixunix.js';

const FILES_C = readFileSync('nethack-c/upstream/src/files.c', 'utf8');
const UNIXUNIX_C = readFileSync('nethack-c/upstream/sys/unix/unixunix.c', 'utf8');
const UNIXMAIN_C = readFileSync('nethack-c/upstream/sys/unix/unixmain.c', 'utf8');
const OPTIONS_C = readFileSync('nethack-c/upstream/src/options.c', 'utf8');
const SAVE_C = readFileSync('nethack-c/upstream/src/save.c', 'utf8');
const RESTORE_C = readFileSync('nethack-c/upstream/src/restore.c', 'utf8');

// The snapshot fields store_plname_in_file() encodes, for a hero with the
// given name, role and race file codes, sex, alignment type and play mode.
function snapshotFor(plname, role, race, female, align, mode = {}) {
    return JSON.stringify({
        plname,
        urole: { filecode: role },
        urace: { filecode: race },
        flags: { female },
        u: { ualign: { type: align } },
        ...mode,
    });
}
const text = (buffer) => buffer.split('\0')[0];

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
    storage.setItem(`vfs:${set_savefile_name({ plname: 'Zed' })}`, snapshotFor('Zed', 'Wiz', 'Elf', false, -1));
    storage.setItem(`vfs:${set_savefile_name({ plname: 'Amy' })}`, snapshotFor('Amy', 'Pri', 'Hum', true, 1));
    storage.setItem(`vfs:save/${RECORDER_UID + 1}Other`, snapshotFor('Other', 'Sam', 'Hum', false, 1));
    storage.setItem('vfs:record', '');
    setStorageForTesting(storage);
    try {
        assert.deepEqual(get_saved_games(state).map(text), [
            'Amy-Pri-Hum-Fem-Law', 'Zed-Wiz-Elf-Mal-Cha',
        ]);
    } finally {
        setStorageForTesting(null);
    }
});

test('plname_from_file() rebuilds the store_plname_in_file() header', () => {
    assert.match(SAVE_C, /Snprintf\(hero, sizeof hero, "%s-%\.3s-%\.3s-%\.3s-%\.3s",\s*svp\.plname, gu\.urole\.filecode,\s*gu\.urace\.filecode, genders\[flags\.female\]\.filecode,\s*aligns\[1 - u\.ualign\.type\]\.filecode\);/u);
    assert.match(SAVE_C, /hero\[PL_NSIZ_PLUS - 1\] = wizard \? 'D' : discover \? 'X' : '-';/u);
    assert.match(RESTORE_C, /if \(!name_only\)\s*\*eos\(plbuf\) = '-';/u);
    // PL_NSIZ + 4 * (1 + 3) + 1 (global.h): 32 name bytes, four "-Xxx"
    // codes and the playmode byte.
    assert.equal(PL_NSIZ_PLUS, 49);
    const storage = new InMemoryStorage();
    // One file per play mode, and one that does not parse. A neutral male
    // gnome tests aligns[1 - 0]; debug mode outranks explore mode.
    storage.setItem('vfs:save/1Pip', snapshotFor('Pip', 'Hea', 'Gno', false, 0));
    storage.setItem('vfs:save/1Ex', snapshotFor('Ex', 'Val', 'Dwa', true, 1, { discover: true }));
    storage.setItem('vfs:save/1wizard', snapshotFor('wizard', 'Pri', 'Hum', false, 0, { wizard: true, discover: true }));
    storage.setItem('vfs:save/1Bad', '{');
    setStorageForTesting(storage);
    try {
        const pip = plname_from_file('save/1Pip');
        assert.equal(pip.length, PL_NSIZ_PLUS);
        assert.equal(text(pip), 'Pip-Hea-Gno-Mal-Neu');
        assert.equal(pip[PL_NSIZ_PLUS - 1], '-');
        assert.equal(pip[PL_NSIZ_PLUS - 2], '\0');
        assert.equal(plname_from_file('save/1Ex')[PL_NSIZ_PLUS - 1], 'X');
        assert.equal(plname_from_file('save/1wizard')[PL_NSIZ_PLUS - 1], 'D');
        assert.equal(plname_from_file('save/1Bad'), null);
        assert.equal(plname_from_file('save/1None'), null);
        // A 31-byte name, the longest plname[] holds, still fits with all
        // four codes ahead of the NUL.
        const longName = 'n'.repeat(31);
        storage.setItem('vfs:save/1Long', snapshotFor(longName, 'Arc', 'Hum', true, -1));
        assert.equal(text(plname_from_file('save/1Long')), `${longName}-Arc-Hum-Fem-Cha`);
    } finally {
        setStorageForTesting(null);
    }
});
