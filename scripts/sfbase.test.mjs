// sfbase.test.mjs -- source-pinned tests for sfbase.c's pure helpers and
// focused tests for its save-format dispatch state.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SFCTOOL_BIT, CONVERTING, WRITING } from '../js/const.js';
import { parseCFunctions } from './c-functions.mjs';
import {
    bitfield_dump,
    complex_dump,
    norm_ptrs_any,
    norm_ptrs_rm,
    norm_ptrs_s_level,
    norm_ptrs_skills,
    norm_ptrs_spell,
    norm_ptrs_stairway,
    norm_ptrs_trap,
    norm_ptrs_u_conduct,
    norm_ptrs_u_event,
    norm_ptrs_u_have,
    norm_ptrs_u_realtime,
    norm_ptrs_u_roleplay,
    norm_ptrs_version_info,
    norm_ptrs_vlaunchinfo,
    norm_ptrs_vptrs,
    norm_ptrs_you,
    sf_init,
    sf_log,
    sf_setprocs,
    sfi_version_info,
    sfiprocs,
    sfo_char,
    sfoprocs,
    sfvalue_any,
    sfvalue_bitfield,
    sfvalue_genericptr,
} from '../js/sfbase.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/sfbase.c', 'utf8');

test('sfbase source contains the planned source-order functions', () => {
    // These are the explicit definitions in source order. SF_X above them is
    // a macro invocation generating serializers, not a function named SF_X.
    const names = [
        'sfo_char', 'sfi_char', 'sfo_genericptr',
        'sfi_genericptr', 'sfo_version_info', 'sfi_version_info', 'sf_log',
        'sfvalue_any', 'sfvalue_genericptr', 'sfvalue_bitfield',
        'bitfield_dump', 'complex_dump', 'sf_init', 'sf_setprocs',
        'sf_setflprocs', 'norm_ptrs_any', 'norm_ptrs_align',
        'norm_ptrs_arti_info', 'norm_ptrs_attribs', 'norm_ptrs_bill_x',
        'norm_ptrs_branch', 'norm_ptrs_bubble', 'norm_ptrs_cemetery',
        'norm_ptrs_context_info', 'norm_ptrs_achievement_tracking',
        'norm_ptrs_book_info', 'norm_ptrs_dig_info', 'norm_ptrs_engrave_info',
        'norm_ptrs_obj_split', 'norm_ptrs_polearm_info',
        'norm_ptrs_takeoff_info', 'norm_ptrs_tin_info',
        'norm_ptrs_tribute_info', 'norm_ptrs_victual_info',
        'norm_ptrs_warntype_info', 'norm_ptrs_d_flags', 'norm_ptrs_d_level',
        'norm_ptrs_damage', 'norm_ptrs_dest_area', 'norm_ptrs_dgn_topology',
        'norm_ptrs_dungeon', 'norm_ptrs_ebones', 'norm_ptrs_edog',
        'norm_ptrs_egd', 'norm_ptrs_emin', 'norm_ptrs_engr', 'norm_ptrs_epri',
        'norm_ptrs_eshk', 'norm_ptrs_fakecorridor', 'norm_ptrs_fe',
        'norm_ptrs_flag', 'norm_ptrs_fruit', 'norm_ptrs_gamelog_line',
        'norm_ptrs_kinfo', 'norm_ptrs_levelflags', 'norm_ptrs_linfo',
        'norm_ptrs_ls_t', 'norm_ptrs_mapseen_feat', 'norm_ptrs_mapseen_flags',
        'norm_ptrs_mapseen_rooms', 'norm_ptrs_mapseen', 'norm_ptrs_mextra',
        'norm_ptrs_mkroom', 'norm_ptrs_monst', 'norm_ptrs_mvitals',
        'norm_ptrs_nhcoord', 'norm_ptrs_nhrect', 'norm_ptrs_novel_tracking',
        'norm_ptrs_obj', 'norm_ptrs_objclass', 'norm_ptrs_oextra',
        'norm_ptrs_prop', 'norm_ptrs_q_score', 'norm_ptrs_rm',
        'norm_ptrs_s_level', 'norm_ptrs_skills', 'norm_ptrs_spell',
        'norm_ptrs_stairway', 'norm_ptrs_trap', 'norm_ptrs_u_conduct',
        'norm_ptrs_u_event', 'norm_ptrs_u_have', 'norm_ptrs_u_realtime',
        'norm_ptrs_u_roleplay', 'norm_ptrs_version_info',
        'norm_ptrs_vlaunchinfo', 'norm_ptrs_vptrs', 'norm_ptrs_you',
    ];
    assert.deepEqual(
        parseCFunctions(C_SOURCE).slice(0, names.length).map(({ name }) => name),
        names,
    );
});

test('sfvalue_any preserves the source union field as decimal text', () => {
    // C's PRId64 conversion prints this exact 64-bit value without rounding.
    assert.equal(sfvalue_any({ a_int64: 9007199254740993n }), '9007199254740993');
    assert.match(C_SOURCE, /a->a_int64/u);
});

test('pointer and bitfield diagnostics match C literals', () => {
    // C uses a null pointer check and prints a non-null pointer as glorkum.
    assert.equal(sfvalue_genericptr(null), '0');
    assert.equal(sfvalue_genericptr({}), 'glorkum');

    // C promotes uint8 to unsigned before printing, so 0xa5 is decimal 165.
    assert.equal(sfvalue_bitfield(0xa5), '165');
    assert.equal(bitfield_dump(new Uint8Array([0xa5])), '165');
    assert.match(C_SOURCE, /\(a == 0\) \? "0" : "glorkum"/u);
    assert.match(C_SOURCE, /Snprintf\(buf, sizeof buf, "%u", \(uint\) \*a\)/u);
});

test('complex_dump prints the ten source bytes in lowercase hexadecimal', () => {
    // These ten bytes cover zero, one-digit, two-digit, and three-digit %03x
    // cases from complex_dump()'s fixed ten-byte diagnostic.
    const bytes = [0, 1, 15, 16, 127, 128, 200, 239, 254, 255];
    assert.equal(
        complex_dump(bytes),
        '000 001 00f 010 07f 080 0c8 0ef 0fe 0ff',
    );
    assert.match(C_SOURCE, /x\[i\] = \*uc\+\+;/u);
    assert.match(C_SOURCE, /%03x %03x %03x %03x %03x %03x %03x %03x %03x %03x/u);
});

test('norm_ptrs_any and norm_ptrs_rm preserve their source no-op behavior', () => {
    // Both C functions have empty bodies; this object stands for any saved
    // structure and must remain identical after normalization.
    const value = { pointer: { id: 7 }, nested: [1, 2, 3] };
    const before = structuredClone(value);
    assert.equal(norm_ptrs_any(value), undefined);
    assert.equal(norm_ptrs_rm(value), undefined);
    assert.deepEqual(value, before);
    assert.match(C_SOURCE, /norm_ptrs_any[\s\S]*?\{\s*\}/u);
    assert.match(C_SOURCE, /norm_ptrs_rm[\s\S]*?\{\s*\}/u);
});

test('final norm_ptrs functions preserve their source no-op behavior', () => {
    // This object stands for each saved structure; C ignores every argument
    // and returns without changing it in all 14 final normalizers.
    const value = { pointer: { id: 7 }, nested: [1, 2, 3] };
    const before = structuredClone(value);
    const normalizers = [
        ['norm_ptrs_s_level', norm_ptrs_s_level],
        ['norm_ptrs_skills', norm_ptrs_skills],
        ['norm_ptrs_spell', norm_ptrs_spell],
        ['norm_ptrs_stairway', norm_ptrs_stairway],
        ['norm_ptrs_trap', norm_ptrs_trap],
        ['norm_ptrs_u_conduct', norm_ptrs_u_conduct],
        ['norm_ptrs_u_event', norm_ptrs_u_event],
        ['norm_ptrs_u_have', norm_ptrs_u_have],
        ['norm_ptrs_u_realtime', norm_ptrs_u_realtime],
        ['norm_ptrs_u_roleplay', norm_ptrs_u_roleplay],
        ['norm_ptrs_version_info', norm_ptrs_version_info],
        ['norm_ptrs_vlaunchinfo', norm_ptrs_vlaunchinfo],
        ['norm_ptrs_vptrs', norm_ptrs_vptrs],
        ['norm_ptrs_you', norm_ptrs_you],
    ];

    for (const [name, normalizer] of normalizers) {
        assert.equal(normalizer(value), undefined, `${name} return value`);
        assert.deepEqual(value, before, `${name} leaves its argument unchanged`);
        assert.match(
            C_SOURCE,
            new RegExp(`void\\s+${name}\\([^)]*\\)\\s*\\{\\s*\\}`),
        );
    }
});

test('sf_init and sf_setprocs preserve C procedure-table copy order', () => {
    // C's invalid, historical, and exportascii indexes are 0, 1, and 2.
    sf_init();
    const output = () => {};
    const input = () => {};
    const sfo = { ext: 'out', fn: { sf_char: output } };
    const sfi = { ext: 'in', fn: { sf_char: input } };
    sf_setprocs(1, sfi, sfo);
    sfo.fn.sf_char = () => {};
    sfi.fn.sf_char = () => {};
    assert.equal(sfoprocs[1].ext, 'out');
    assert.equal(sfiprocs[1].ext, 'in');
    assert.equal(sfoprocs[1].fn.sf_char, output);
    assert.equal(sfiprocs[1].fn.sf_char, input);
});

test('sfo_char and sfi_version_info keep wrapper logging and conversion order', () => {
    // The log captures C's eight-digit count, one-byte char size, and field
    // count for one byte written in WRITING mode.
    const lines = [];
    const writer = { ext: 'out', fn: { sf_char: () => {} } };
    sf_setprocs(1, { ext: 'in', fn: {} }, writer);
    const nhfp = {
        fplog: lines,
        mode: WRITING,
        wcount: 4,
        rcount: 3,
        structlevel: true,
        fnidx: 1,
        eof: false,
    };
    sfo_char(nhfp, 'A', 'letter', 1);
    assert.deepEqual(lines, ['00000004 letter sz=1 cnt=1 |A|\n']);

    // C sets SFCTOOL_BIT before forwarding version_info to a conversion file.
    const converted = [];
    const convert = {
        fplog: converted,
        mode: 0,
        wcount: 0,
        rcount: 0,
        structlevel: true,
        fnidx: 0,
        eof: false,
    };
    const seen = [];
    sf_setprocs(0, {
        ext: 'in',
        fn: {},
    }, {
        ext: 'out',
        fn: { sf_version_info: (_nhfp, info) => seen.push(info.feature_set) },
    });
    const info = { feature_set: 0 };
    sfi_version_info({
        mode: CONVERTING,
        structlevel: true,
        fnidx: 0,
        eof: false,
        fplog: null,
        nhfpconvert: convert,
    }, info, 'version');
    assert.equal(info.feature_set, SFCTOOL_BIT);
    assert.deepEqual(seen, [SFCTOOL_BIT]);
});

test('sf_log suppresses output while TURN_OFF_LOGGING is set', () => {
    // C's field-level input wrapper temporarily sets the 0x20 diagnostic bit.
    const lines = [];
    sf_log({ fplog: lines, mode: 0x20, rcount: 1, wcount: 1 }, 'x', 1, 1, '0');
    assert.deepEqual(lines, []);
    assert.match(C_SOURCE, /TURN_OFF_LOGGING \(UNCONVERTING << 1\)/u);
});
