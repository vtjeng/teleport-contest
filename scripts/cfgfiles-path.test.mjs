// Source-pinned tests for cfgfiles.c's configuration-path helpers.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_CONFIGFILE,
    do_write_config_file,
    fopen_config_file,
    get_configfile,
    get_default_configfile,
    SET_IN_SYSCONF,
    set_configfile_name,
} from '../js/cfgfiles.js';
import { ECMD_OK } from '../js/const.js';
import { resetGame } from '../js/gstate.js';
import { encodeUtf8ByteString } from '../js/hacklib.js';

test('get_default_configfile returns the compiled UNIX basename', () => {
    // cfgfiles.c:126-139 selects .nethackrc for the recorder's UNIX build.
    assert.equal(get_default_configfile(), DEFAULT_CONFIGFILE);
    assert.equal(get_default_configfile(), '.nethackrc');
});

test('set_configfile_name stores a BUFSZ-1-byte path', () => {
    const state = {};
    // BUFSZ is 256 in global.h; strncpy leaves one byte for the C NUL.
    const longName = 'x'.repeat(300);
    set_configfile_name(longName, state);
    assert.equal(state.configfile.length, 255);
    assert.equal(state.configfile, 'x'.repeat(255));
    assert.equal(get_configfile(state), state.configfile);

    // C copies UTF-8 bytes, so a cut inside a two-byte character keeps the
    // first byte rather than silently rounding to a JavaScript character.
    const utf8Name = 'é'.repeat(200);
    set_configfile_name(utf8Name, state);
    assert.equal(encodeUtf8ByteString(state.configfile).length, 255);
});

test('fopen_config_file preserves source path state and records skipped I/O',
    () => {
        const state = resetGame();

        // cfgfiles.c returns before fopen() when a sysconf filename is empty.
        state.configfile = '/previous/config';
        assert.equal(fopen_config_file('', SET_IN_SYSCONF, state), null);
        assert.equal(state.configfile, '/previous/config');
        assert.deepEqual([...state.unported ?? []], []);

        // The JavaScript segment already carries configuration text, so the
        // requested path is observed for the failed attempt and the UNIX
        // default is selected for the source's fallback attempt.
        assert.equal(
            fopen_config_file('/home/player/custom.nethackrc', 1, state),
            null,
        );
        assert.equal(state.configfile, DEFAULT_CONFIGFILE);
        assert.deepEqual([...state.unported], ['cfgfiles.c fopen']);
    });

test('do_write_config_file reports a missing configuration name', async () => {
    const state = { configfile: '' };
    const messages = [];
    const result = await do_write_config_file(state, {
        message: async (text) => messages.push(text),
    });

    assert.equal(result, ECMD_OK);
    assert.deepEqual(messages, [
        'Strange, could not figure out config file name.',
    ]);
});

test('do_write_config_file keeps warning, wait, query, and gap order', async () => {
    const state = {
        configfile: '/home/player/.nethackrc',
        // FEATURE_NOTICE_VER(3,7,0): warnings remain enabled below this value.
        flags: { suppress_alert: 0 },
    };
    const messages = [];
    const waits = [];
    const queries = [];
    const result = await do_write_config_file(state, {
        message: async (text) => messages.push(text),
        wait: async () => waits.push(true),
        query: async (...args) => {
            queries.push(args);
            return false;
        },
    });

    assert.equal(result, ECMD_OK);
    assert.deepEqual(messages, [
        'Warning: saveoptions is highly experimental!',
        'Some settings are not saved!',
        'All manual customization and comments are removed from the file!',
    ]);
    assert.equal(waits.length, 3);
    assert.deepEqual(queries, [[
        true,
        'Overwrite config file /home/player/.nethackrc?',
        state,
    ]]);
    assert.equal(state.unported, undefined);
});

test('do_write_config_file records unavailable write after confirmation', async () => {
    const state = resetGame();
    Object.assign(state, {
        configfile: '/home/player/.nethackrc',
        // FEATURE_NOTICE_VER(3,7,0) is 0x03070000; suppress the warning path.
        flags: { suppress_alert: 0x03070000 },
    });
    const result = await do_write_config_file(state, {
        query: async () => true,
    });

    assert.equal(result, ECMD_OK);
    assert.deepEqual([...state.unported], ['cfgfiles.c fopen']);
});
