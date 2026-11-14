// Source-pinned tests for cfgfiles.c's configuration-path helpers.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
    DEFAULT_CONFIGFILE,
    do_write_config_file,
    get_configfile,
    get_default_configfile,
        set_configfile_name,
} from '../js/cfgfiles.js';
import { ECMD_OK } from '../js/const.js';
import { resetGame } from '../js/gstate.js';
import { textBytes, utf8Text } from '../js/hacklib.js';

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
    const utf8Name = utf8Text('é'.repeat(200));
    set_configfile_name(utf8Name, state);
    assert.equal(textBytes(state.configfile).length, 255);
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

test('do_write_config_file returns after confirmation without a gap', async () => {
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
    // No later read sees the written file (see js/cfgfiles.js).
    assert.equal(state.unported?.size ?? 0, 0);
});

// cfgfiles.c do_write_config_file() calls pline(), wait_synch() and cmd.c
// paranoid_query() itself, so js/cfgfiles.js makes them its defaults. Game code
// must not refuse without the query or hand the function its own copies.
test('do_write_config_file runs C\'s callees without injected copies', () => {
    const jsDir = new URL('../js/', import.meta.url);
    const read = (file) => readFileSync(new URL(file, jsDir), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
    const cfgfiles = read('cfgfiles.js');
    assert.doesNotMatch(cfgfiles, /paranoid_query'\)|typeof query/u);
    assert.match(cfgfiles,
        /env\.query \?\? \(await import\('\.\/cmd\.js'\)\)\.paranoid_query/u);
    const calls = [];
    for (const file of readdirSync(jsDir).filter((f) => f.endsWith('.js'))) {
        if (file === 'cfgfiles.js') continue;
        for (const match of read(file).matchAll(/do_write_config_file\(([^)]*)\)/gu))
            calls.push(`${file}: ${match[1]}`);
    }
    assert.deepEqual(calls, ['cmd.js: state']);
});
