// js/files.js set_savefile_name(), set_error_savefile(), check_panic_save(),
// plname_from_file() and get_saved_games(), and js/unixunix.js regularize(),
// name, read and list save files as the UNIX build of files.c does, so a
// segment restores only its own hero's save.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    check_panic_save, chmod_savefile, create_savefile, delete_savefile, get_saved_games,
    have_savefile_name, open_savefile, plname_from_file, restore_saved_game,
    set_error_savefile, set_savefile_name,
} from '../js/files.js';
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
        // wizard and discover are flags.debug and flags.explore.
        flags: { female, ...mode },
        u: { ualign: { type: align } },
    });
}
const text = (buffer) => buffer.split('\0')[0];
// gs.SAVEF after set_savefile_name() for a hero of that name.
function savefileName(plname) {
    const state = { plname };
    set_savefile_name(state);
    return state.gs.SAVEF;
}
// gs.SAVEF after set_error_savefile() follows it.
function errorSavefileName(plname) {
    const state = { plname };
    set_savefile_name(state);
    set_error_savefile(state);
    return state.gs.SAVEF;
}

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
    assert.equal(savefileName('Alice'), `save/${RECORDER_UID}Alice`);
    assert.equal(savefileName('Bob x.y'), `save/${RECORDER_UID}Bob_x_y`);
    assert.equal(savefileName('wizard'), `save/${RECORDER_UID}wizard`);
    // unixmain.c opens a save only after set_playmode() has renamed a debug
    // hero, so a debug segment never finds another hero's save.
    assert.ok(UNIXMAIN_C.indexOf('set_playmode(); /* sets plname to "wizard" for wizard mode */')
        < UNIXMAIN_C.indexOf('nhfp = restore_saved_game()'));
    assert.match(OPTIONS_C, /if \(authorize_wizard_mode\(\)\)\s*gp\.plnamelen = \(int\) strlen\(strcpy\(svp\.plname, "wizard"\)\);/u);
});

test('set_error_savefile() and check_panic_save() name and find the panic save', () => {
    // The UNIX arm appends ".e" to gs.SAVEF; check_panic_save() looks for
    // that name with COMPRESS_EXTENSION, then without it.
    assert.match(FILES_C, /#else\s*Strcat\(gs\.SAVEF, "\.e"\);\s*#endif\s*#endif\s*\}/u);
    assert.match(FILES_C, /set_error_savefile\(\);\s*savef = fqname\(gs\.SAVEF, SAVEPREFIX, 0\);/u);
    assert.match(UNIXMAIN_C, /if \(check_panic_save\(\)\)\s*ask_about_panic_save\(\);/u);
    // Debug mode's "wizard" and a name regularize() changes.
    assert.equal(errorSavefileName('wizard'), `save/${RECORDER_UID}wizard.e`);
    assert.equal(errorSavefileName('Bob x.y'), `save/${RECORDER_UID}Bob_x_y.e`);
    const storage = new InMemoryStorage();
    setStorageForTesting(storage);
    try {
        // A regular save alone is not a panic save.
        storage.setItem(`vfs:${savefileName('wizard')}`, '{}');
        // check_panic_save() appends ".e" to gs.SAVEF as it stands, which
        // unixmain.c's restore_saved_game() has just set for the hero.
        const checked = (plname) => {
            const state = { plname };
            set_savefile_name(state);
            const result = check_panic_save(state);
            // files.c:1349 resets gs.SAVEF to the regular name.
            assert.equal(state.gs.SAVEF, savefileName(plname));
            return result;
        };
        assert.equal(checked('wizard'), false);
        storage.setItem(`vfs:${errorSavefileName('wizard')}`, '{}');
        assert.equal(checked('wizard'), true);
        // Another hero's name does not reach it.
        assert.equal(checked('Alice'), false);
    } finally {
        setStorageForTesting(null);
    }
});

test('get_saved_games() lists this uid\'s save files by saved name, sorted', () => {
    assert.match(FILES_C, /if \(sscanf\(entry->d_name, "%d%63s", &uid, name\) == 2\) \{\s*if \(uid == myuid\)/u);
    assert.match(FILES_C, /qsort\(result, j, sizeof \(char \*\), strcmp_wrap\);/u);
    const state = resetGame();
    const storage = new InMemoryStorage();
    // Two of this uid's saves, written in reverse order to show the sort,
    // another uid's save, and a non-save file: only the first two count.
    storage.setItem(`vfs:${savefileName('Zed')}`, snapshotFor('Zed', 'Wiz', 'Elf', false, -1));
    storage.setItem(`vfs:${savefileName('Amy')}`, snapshotFor('Amy', 'Pri', 'Hum', true, 1));
    storage.setItem(`vfs:save/${RECORDER_UID + 1}Other`, snapshotFor('Other', 'Sam', 'Hum', false, 1));
    storage.setItem('vfs:record', '');
    setStorageForTesting(storage);
    try {
        assert.deepEqual(get_saved_games(state).map(text), [
            'Amy-Pri-Hum-Fem-Law', 'Zed-Wiz-Elf-Mal-Cha',
        ]);
        // plname_from_file() left gs.SAVEF at a file it listed (1366).
        assert.match(state.gs.SAVEF, new RegExp(`^save/${RECORDER_UID}(?:Amy|Zed)$`, 'u'));
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
    storage.setItem('vfs:save/1Ex', snapshotFor('Ex', 'Val', 'Dwa', true, 1, { explore: true }));
    storage.setItem('vfs:save/1wizard', snapshotFor('wizard', 'Pri', 'Hum', false, 0, { debug: true, explore: true }));
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

test('gs.SAVEF is kept, not rebuilt from the hero\'s name', () => {
    // Only these three statements write gs.SAVEF in files.c's UNIX build.
    assert.match(FILES_C, /Sprintf\(gs\.SAVEF, "save\/%d%s", \(int\) getuid\(\), svp\.plname\);/u);
    assert.match(FILES_C, /Strcat\(gs\.SAVEF, "\.e"\);/u);
    assert.match(FILES_C, /plname_from_file\([^)]*\)\s*\{[^}]*?Strcpy\(gs\.SAVEF, filename\);/u);
    // dosave0() and delete_savefile() read it without setting it.
    assert.match(SAVE_C, /if \(!program_state\.something_worth_saving \|\| !gs\.SAVEF\[0\]\)\s*goto done;/u);
    assert.match(FILES_C, /delete_savefile\(void\)\s*\{\s*const char \*sfname = fqname\(gs\.SAVEF, SAVEPREFIX, 0\);/u);
    const storage = new InMemoryStorage();
    setStorageForTesting(storage);
    try {
        // A new process has no save-file name (decl.c).
        const state = { plname: 'player' };
        assert.equal(have_savefile_name(state), false);
        // unixmain.c:242 names the file for the name typed first; no such
        // file exists yet.
        assert.equal(restore_saved_game(state), null);
        assert.equal(have_savefile_name(state), true);
        // role_init()'s plnamesuffix() renames the hero (role.c:1988); the
        // save still goes to the first name's file.
        state.plname = 'games';
        create_savefile(snapshotFor('games', 'Wiz', 'Gno', false, 0), state);
        assert.notEqual(storage.getItem(`vfs:save/${RECORDER_UID}player`), null);
        assert.equal(storage.getItem(`vfs:save/${RECORDER_UID}games`), null);
        // The next process finds no file under the saved hero's own name.
        const next = { plname: 'games' };
        assert.equal(restore_saved_game(next), null);
        // The saved-games list reads the file and leaves gs.SAVEF on it, so
        // a save made after that overwrites it and a delete removes it.
        assert.deepEqual(get_saved_games(next).map(text), ['games-Wiz-Gno-Mal-Neu']);
        assert.equal(next.gs.SAVEF, `save/${RECORDER_UID}player`);
        assert.notEqual(open_savefile(next), null);
        delete_savefile(next);
        assert.equal(storage.getItem(`vfs:save/${RECORDER_UID}player`), null);
    } finally {
        setStorageForTesting(null);
    }
});

test('a save file being restored is not listed among the saved games', () => {
    // unixmain.c:246 makes the opened save file unreadable, so files.c
    // plname_from_file()'s open_savefile() fails for it until it is deleted
    // or unixmain.c:271 restores its mode.
    assert.match(UNIXMAIN_C, /\(void\) chmod\(fq_save, 0\); \/\* disallow parallel restores \*\//u);
    assert.match(UNIXMAIN_C, /\(void\) chmod\(fq_save, FCMASK\); \/\* back to readable \*\//u);
    const state = resetGame();
    const storage = new InMemoryStorage();
    setStorageForTesting(storage);
    try {
        state.plname = 'Ivo';
        set_savefile_name(state);
        create_savefile(snapshotFor('Ivo', 'Kni', 'Hum', false, 1), state);
        assert.notEqual(restore_saved_game(state), null);
        assert.deepEqual(get_saved_games(state).map(text), ['Ivo-Kni-Hum-Mal-Law']);
        chmod_savefile(false, state);
        assert.deepEqual(get_saved_games(state), []);
        // The compressor's failure and its --More-- are recorded as a gap.
        assert.ok(state.unported.has('files.c docompress_file'));
        chmod_savefile(true, state);
        assert.deepEqual(get_saved_games(state).map(text), ['Ivo-Kni-Hum-Mal-Law']);
    } finally {
        setStorageForTesting(null);
    }
});

test('startup adds gs.SAVEF to the struct that holds shk.c\'s sale state', async () => {
    // decl.c:720-721 start gs.sell_response at 'a' and gs.sell_how at
    // SELL_NORMAL (0); shk.c sellobj() reads both for an object thrown into
    // a shop. js/jsmain.js once replaced the whole struct when it
    // initialized gs.SAVEF, which made that sale ask "Sell it?"
    // (recordings/shk.c/first-owned-book-projectile-sale).
    const { runSegmentStrict } = await import('../js/jsmain.js');
    // Any new game will do: a named Valkyrie and one search.
    await runSegmentStrict({
        seed: 4471,
        datetime: '20240229120000',
        nethackrc: 'OPTIONS=name:Ilse,role:Valkyrie,race:dwarf,gender:female,align:lawful\n'
            + 'OPTIONS=!legacy,!tutorial\n',
        moves: 's',
        storage: new InMemoryStorage(),
    });
    // runSegment() replaces the game object, so read it afterwards.
    const { game } = await import('../js/gstate.js');
    assert.equal(game.gs.sell_response, 'a');
    assert.equal(game.gs.sell_how, 0);
    // unixmain.c:242 restore_saved_game() and files.c:1349 named the file.
    assert.equal(game.gs.SAVEF, `save/${RECORDER_UID}Ilse`);
});
