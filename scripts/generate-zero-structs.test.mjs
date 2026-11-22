// scripts/generate-zero-structs.mjs reads struct members from the C headers,
// resolving the preprocessor conditionals among them against the recorder
// build's configuration. These tests pin that reader on small samples and on
// the members the recorder's configuration decides.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    MACROS,
    collectStructs,
    preprocessBody,
} from './generate-zero-structs.mjs';
import { FLAG_STRUCTS, zero_flag, zero_instance_flags } from '../js/flag.js';
import { MAXOCLASSES } from '../js/objects.js';
import { zero_sinfo } from '../js/program_state.js';

const names = (sources, root, macros) => collectStructs(sources, root, macros)
    .structs.get(root).map(({ name }) => name);

test('a struct body keeps only the members its conditionals select', () => {
    // A and B are defined, C is not; each directive form the headers use
    // appears once, and the #define among the members is dropped as flag.h's
    // TER_* constants are.
    const macros = { A: true, B: true, C: false };
    const source = `struct s {
    int always;
#ifdef A
    int a;
#endif
#ifndef C
    int not_c;
#endif
#if 0
    int never;
#else
    int instead;
#endif
#if defined(C) || defined(B)
    int c_or_b;
#endif
#if defined(A) && !defined(B)
    int a_not_b;
#endif
#define CONSTANT 0x01U
#ifdef C
    int c;
#ifdef A
    int c_and_a;
#endif
#endif
};`;
    assert.deepEqual(names([source], 's', macros),
        ['always', 'a', 'not_c', 'instead', 'c_or_b']);
});

test('a conditional on an unconfigured macro stops the generator', () => {
    // D is in no configuration, so the reader cannot know whether the
    // member exists in the recorder build.
    const source = 'struct s {\n#ifdef D\n    int d;\n#endif\n};';
    assert.throws(() => preprocessBody(source, { A: true }, 's'),
        /no configuration for macro D/u);
    assert.throws(() => collectStructs([source], 's', MACROS),
        /no configuration for macro D/u);
});

test('an array of structs sized by an enumerator holds zeroed structs', () => {
    // flag.h sizes iflags.wcolors by WC_COUNT, the fifth enumerator of
    // enum windowcolors_windows, so it holds four structs.
    const wcolors = zero_instance_flags().wcolors;
    assert.equal(wcolors.length, 4);
    assert.deepEqual(wcolors[3], { fg: null, bg: null });
    assert.notEqual(wcolors[0], wcolors[1]);
});

test('the recorder configuration decides the conditional members', () => {
    const iflags = zero_instance_flags();
    // ALTMETA (unixconf.h), STATUS_HILITES (config.h) and TTY_GRAPHICS
    // (config.h, for debug_flags.ttystatus) are defined.
    assert.equal(iflags.altmeta, false);
    assert.equal(iflags.hilite_delta, 0);
    assert.equal(iflags.unhilite_deadline, 0);
    assert.deepEqual(iflags.debug, { test: false, ttystatus: false });
    // MICRO, WIN32, MSDOS, LAN_FEATURES and the TTY_*_ESCCODES members are
    // not, and `#if 0` keeps wcolors[] instead of the per-window pointers.
    for (const absent of ['BIOS', 'rawio', 'tile_view', 'hasvga',
        'lan_mail', 'vt_tiledata', 'vt_sounddata', 'altkeyhandling',
        'key_handling', 'wc_video_width', 'wc_foregrnd_menu'])
        assert.equal(Object.hasOwn(iflags, absent), false, absent);
    // char prevmsg_window is held as the option letter, so its zero is ''.
    assert.equal(iflags.prevmsg_window, '');
    // genericptr_t is a pointer typedef.
    assert.equal(iflags.returning_missile, null);

    const program_state = zero_sinfo();
    // HANGUPHANDLING (global.h, for UNIX), PANICLOG (config.h) and
    // TTY_GRAPHICS are defined.
    for (const present of ['done_hup', 'preserve_locks', 'in_paniclog',
        'resize_pending', 'getting_char'])
        assert.equal(program_state[present], 0, present);
    // struct sinfo has 30 members in this build (hack.h:776-819).
    assert.equal(Object.keys(program_state).length, 30);
});

test('struct flag holds its char arrays as the port does', () => {
    // struct flag has no preprocessor conditional, so its 85 members
    // (flag.h:18-168; `clang -E` of hack.h gives 84 declarations, one of
    // them `int end_top, end_around`) need no macro from the recorder
    // configuration.
    const flags = zero_flag();
    assert.equal(Object.keys(flags).length, 85);
    assert.deepEqual(Object.keys(flags), FLAG_STRUCTS.flag.map(([name]) => name));
    // The class lists are held without C's terminating NUL, so the zero, an
    // empty C string, is an empty list; their C size is MAXOCLASSES, which
    // js/objects.js also holds.
    assert.deepEqual(flags.inv_order, []);
    assert.deepEqual(flags.pickup_types, []);
    assert.deepEqual(FLAG_STRUCTS.flag.find(([name]) => name === 'inv_order'),
        ['inv_order', `char[${MAXOCLASSES}]`]);
    // end_disclose[NUM_DISCLOSURE_OPTIONS + 1] holds one option letter per
    // category before its NUL; flag.h:109 defines NUM_DISCLOSURE_OPTIONS.
    const header = readFileSync(new URL('../nethack-c/upstream/include/flag.h',
        import.meta.url), 'utf8');
    assert.match(header, /^#define NUM_DISCLOSURE_OPTIONS 6\b/mu);
    assert.deepEqual(flags.end_disclose, ['', '', '', '', '', '']);
    // The scalar chars the port holds as option letters zero to ''; the
    // menu style, a MENU_* number, to 0.
    assert.equal(flags.sortloot, '');
    assert.equal(flags.discosort, '');
    assert.equal(flags.menu_style, 0);
    // Each call builds new arrays.
    assert.notEqual(zero_flag().inv_order, flags.inv_order);
});
