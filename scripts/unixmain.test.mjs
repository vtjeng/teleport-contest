import assert from 'node:assert/strict';
import test from 'node:test';

import { check_user_string } from '../js/unixmain.js';

// sys/unix/unixmain.c check_user_string() (696-730) is pure: it reads the
// option string and the account name and changes nothing. Each expected value
// below is read from that source.
test('check_user_string matches whole account names in a sysconf list', () => {
    // The recorder's process account, jsmain.js RECORDER_ACCOUNT, is the
    // get_unix_pw() stand-in, so no loginName means "root".
    const asRoot = {};
    // unixmain.c:703-704: a leading '*' allows any user before any name test.
    assert.equal(check_user_string('*', asRoot), true);
    assert.equal(check_user_string('* nobody', asRoot), true);
    // :721-723: the name must match a whole whitespace-delimited word, so the
    // committed sysconf list "root games" admits root ...
    assert.equal(check_user_string('root games', asRoot), true);
    // ... and a later word is found after :725-726 skips the first.
    assert.equal(check_user_string('games root', asRoot), true);
    // :722: a word that merely starts with the name is not a match.
    assert.equal(check_user_string('rootbeer games', asRoot), false);
    // :714: the loop stops once fewer than pwlen characters remain, so a list
    // shorter than the name cannot match.
    assert.equal(check_user_string('ro', asRoot), false);
    // The recorder's sysconf comments SHELLERS out; dosh() tests the empty
    // string before calling here, but an empty list rejects on its own too.
    assert.equal(check_user_string('', asRoot), false);
    // :717-719: leading and interior whitespace is skipped, not matched.
    assert.equal(check_user_string('  games\troot ', asRoot), true);
});

test('check_user_string reads the player name under CHECK_PLNAME', () => {
    // :705-706: sysopt.check_plname switches the compared name to plname.
    const state = { sysopt: { check_plname: true }, plname: 'Ren', loginName: 'root' };
    assert.equal(check_user_string('root games', state), false);
    assert.equal(check_user_string('Ren', state), true);
    // :709-710: an empty name is rejected before the list is scanned, even
    // though the empty string is a prefix of every word.
    assert.equal(check_user_string('root games', { loginName: '' }), false);
});
