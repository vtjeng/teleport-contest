// files.c read_sym_file() reads dat/symbols with cfgfiles.c parse_conf_file(),
// which calls free_config_sections() before and after its loop
// (cfgfiles.c:1849, 1858). js/files.js read_sym_file() therefore imports
// js/cfgfiles.js, and js/symbols.js imports js/files.js. If cfgfiles.js
// imported a module that reaches symbols.js, such as js/version.js (through
// tty_message.js and display.js), loading js/glyphs.js or js/symbols.js first
// would fail with "Cannot access 'S_upstair' before initialization", and
// read_sym_file() once wrote the two assignments out to avoid that. These
// tests keep one definition and keep the modules loadable in any order.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { free_config_sections } from '../js/cfgfiles.js';
import { FEATURE_NOTICE_VER } from '../js/const.js';
import { read_sym_file } from '../js/files.js';

const JS_DIR = new URL('../js/', import.meta.url);

test('each module on the cycle\'s former path loads as the entry module', () => {
    // The module a process imports first decides the evaluation order, so
    // each is loaded in a process of its own.
    for (const name of ['glyphs.js', 'symbols.js', 'files.js', 'cfgfiles.js', 'version.js']) {
        const url = new URL(name, JS_DIR).href;
        const output = execFileSync(process.execPath, [
            '--input-type=module', '-e',
            `await import(${JSON.stringify(url)}); console.log('loaded');`,
        ], { encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) });
        assert.equal(output.trim(), 'loaded', name);
    }
});

test('read_sym_file() calls the one free_config_sections()', () => {
    const files = readFileSync(new URL('files.js', JS_DIR), 'utf8');
    const body = files.match(/\nexport function read_sym_file\(name, state = game\) \{([\s\S]*?)\n\}/u)?.[1];
    assert.ok(body, 'js/files.js read_sym_file() exists');
    assert.match(body, /\bfree_config_sections\(state\);/u);
    // Only js/cfgfiles.js assigns the two fields free_config_sections() owns.
    assert.doesNotMatch(files, /config_section_(?:chosen|current)\s*=[^=]/u);
    // The import that closed the cycle.
    const cfgfiles = readFileSync(new URL('cfgfiles.js', JS_DIR), 'utf8');
    assert.doesNotMatch(cfgfiles, /from '\.\/version\.js'/u);
});

test('read_sym_file() leaves no chosen or current section', () => {
    // Any non-null values: cfgfiles.c:507-517 clears both whatever they held.
    const state = { gc: { config_section_chosen: 'tty', config_section_current: 'x11' } };
    // "default" is one of the names files.c read_sym_file() accepts without
    // a matching block.
    assert.equal(read_sym_file('default', state), true);
    assert.deepEqual(state.gc, { config_section_chosen: null, config_section_current: null });
    const again = { gc: { config_section_chosen: 'a', config_section_current: null } };
    free_config_sections(again);
    assert.deepEqual(again.gc, { config_section_chosen: null, config_section_current: null });
});

test('FEATURE_NOTICE_VER() packs major, minor and patch as hack.h does', () => {
    // hack.h:1504-1506: major << 24 | minor << 16 | patch << 8.
    // cfgfiles.c:178 and wizcmds.c compare with FEATURE_NOTICE_VER(3,7,0).
    assert.equal(FEATURE_NOTICE_VER(3, 7, 0), 0x03070000n);
    // Each field in its own byte; 1, 2 and 3 are distinguishable values.
    assert.equal(FEATURE_NOTICE_VER(1, 2, 3), 0x01020300n);
    // The casts to unsigned long wrap a negative patch to 64 bits before
    // the shift: (unsigned long) -1 << 8.
    assert.equal(FEATURE_NOTICE_VER(0, 0, -1), 0xffffffffffffff00n);
});
