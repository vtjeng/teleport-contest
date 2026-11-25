#!/usr/bin/env node

// Generate js/decl.js: the start values of C's ga ... gz global groups
// (decl.h struct instance_globals_a ... instance_globals_z).
//
// decl.c holds one initializer per group, g_init_a ... g_init_z, and
// decl_globals_init() copies each into its group once per process. Most
// members start at zero, but not all: gp.polearm_range_min is -1,
// gc.cached_pickinv_win is WIN_ERR and gc.corpsenm_digested is NON_PM. None of
// the groups is saved, so a restored game starts from the same values.
//
// The port once built each group member by member (`state.gp ??= {}`), so a
// member read before it was first written was `undefined`, which is not
// `=== 0`, not `< 0` and not a number after `++`. zap.c do_osshock() tests
// `gp.poly_zapped < 0`, and the port read a member nobody had written as
// "not yet set".
//
// This generator pairs each decl.h member with its g_init_* initializer by
// position, as the C compiler does, and writes initial_instance_globals(),
// which js/gstate.js calls at process start. It covers the scalar members
// the port holds in the group: integers, booleans and enumerations. The
// INSTANCE_GLOBALS table lists every member with where the port keeps it:
//
//   'group'  in state.g<x>, started here
//   'state'  directly on the game state (state.multi for gm.multi), started
//            by initial_state_held_globals(); the list is HELD_ON_STATE below
//   'frame'  a state member that mirrors a value another object owns, or
//            that the port holds as another type (OWNED_ELSEWHERE below)
//   'owner'  a pointer, array, struct or char, which the function that owns
//            it creates in the port's own representation, and each group's
//            havestate, which only decl_globals_init() reads
//
// --check fails when decl.h, decl.c and js/decl.js disagree.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MACROS as STRUCT_MACROS, preprocessBody } from './generate-zero-structs.mjs';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');
const PINNED_REVISION = '16ff59115315917b93185d026aeefea06db9b0f4';
const OUTPUT = 'js/decl.js';

export const GROUP_LETTERS = [...'abcdefghijklmnopqrstuvwxyz'];

// The macros the group bodies test, as the recorder build defines them; see
// scripts/generate-zero-structs.mjs MACROS for that build.
export const MACROS = {
    ...STRUCT_MACROS,
    // Only amiconf.h:165 defines CHANGE_COLOR; windconf.h:29 leaves it
    // commented out, and global.h includes neither for UNIX.
    CHANGE_COLOR: false,
    // unixconf.h:96 leaves DEF_PAGER commented out.
    DEF_PAGER: false,
    // config.h:718.
    DUMPLOG_CORE: true,
    // Only windconf.h:261 defines MAX_LAN_USERNAME.
    MAX_LAN_USERNAME: false,
    // config.h:18.
    UNIX: true,
    // config1.h:154 defines VMS only for a compiler that predefines it.
    VMS: false,
};

// The constants the initializers of the generated members name, with their
// values. scripts/instance-globals.test.mjs compares each with the port's
// constant of the same name.
export const CONSTANTS = {
    FALSE: 0, // global.h:79
    TRUE: 1, // global.h:80
    UNDEFINED_VALUE: 0, // hack.h:1092
    COLNO: 80, // global.h:451
    ROWNO: 21, // global.h:452
    NON_PM: -1, // permonst.h, enum monnums
    STRANGE_OBJECT: 0, // objects.h, the first object
    WIN_ERR: -1, // wintype.h:38
    SELL_NORMAL: 0, // hack.h, enum sell_how values
    soundlib_nosound: 0, // sndprocs.h:9, the first soundlib_ids enumerator
    phase_not_set: 0, // global.h:593
};

// C types the port holds as a number.
const INTEGER_TYPES = new Set([
    'int', 'unsigned', 'unsigned int', 'long', 'long int', 'unsigned long',
    'short', 'schar', 'uchar', 'xint8', 'xint16', 'uint8', 'coordxy',
    'winid', 'cmdcount_nht', 'aligntyp',
]);

// Scalar members the port reads directly off the game state instead of
// through their group, such as state.multi for gm.multi. A second copy in
// the group would be a value that is never read, so
// initial_state_held_globals() starts them on the state instead.
// scripts/instance-globals.test.mjs fails if js/ names one through its group
// or stops naming it on the state.
export const HELD_ON_STATE = new Set([
    'gd.done_seq', 'gd.decor_fumble_override', 'gf.force_save_hs',
    'gg.gmst_stored', 'gg.gmst_moves', 'gh.hero_seq', 'gi.in_doagain',
    'gi.in_mklev', 'gi.in_steed_dismounting', 'gi.initial_don',
    'gi.item_action_in_progress', 'gi.in_mk_themerooms', 'gl.lastinvnr',
    'gl.loot_reset_justpicked', 'gm.mkot_trap_warn_count', 'gm.multi',
    'gm.made_branch', 'gm.mesg_given', 'gm.m_using', 'gn.nsubroom',
    'gr.ransacked', 'gs.spec_dbon_applies', 'gs.somebody_can_move',
    'gt.themeroom_failed', 'gt.toptenwin', 'gt.twohits', 'gu.unweapon',
    'gv.vault_x', 'gv.vault_y', 'gv.vision_full_recalc', 'gw.warn_obj_cnt',
    'gw.wailmsg', 'gx.x_maze_max', 'gx.xstart', 'gx.xsize', 'gy.y_maze_max',
    'gy.ystart', 'gy.ysize',
]);

// HELD_ON_STATE members that initial_state_held_globals() leaves out.
// js/topten.js holds gt.toptenwin as the window's list of lines, or null,
// where C holds a winid that starts at WIN_ERR. gx.xstart, gy.ystart,
// gx.xsize and gy.ysize belong to js/sp_lev.js sp_lev_frame(); state.xstart
// and the rest mirror it, and js/themerooms.js selection_origin() reads a
// missing mirror as "no map frame yet".
export const OWNED_ELSEWHERE = new Set([
    'gt.toptenwin', 'gx.xstart', 'gy.ystart', 'gx.xsize', 'gy.ysize',
]);

function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/.*$/gmu, '');
}

// The members of one group, in declaration order: { name, ctype, kind },
// where kind is 'value', 'pointer' or 'array'.
export function parseMembers(header, letter, macros = MACROS) {
    const block = new RegExp(
        `^struct instance_globals_${letter} \\{\\n([\\s\\S]*?)^\\};`, 'mu',
    ).exec(header);
    if (!block) throw new Error(`decl.h: no struct instance_globals_${letter}`);
    const body = preprocessBody(stripComments(block[1]), macros, `g${letter}`);
    const members = [];
    for (const raw of body.split(';')) {
        const decl = raw.replace(/\s+/gu, ' ').trim();
        if (!decl) continue;
        // `int (*afternmv)(void)`, `void (*fn)(...)`.
        const callback = /\(\s*\*\s*(\w+)\s*\)\s*\(/u.exec(decl);
        if (callback) {
            members.push({ name: callback[1], ctype: 'function', kind: 'pointer' });
            continue;
        }
        const declarator = String.raw`\**\s*\w+(?:\s*\[[^\]]*\])*`;
        const match = new RegExp(
            `^(.*?)([*\\s])(${declarator}(?:\\s*,\\s*${declarator})*)$`, 'u',
        ).exec(decl);
        if (!match) throw new Error(`g${letter}: cannot read "${decl}"`);
        const pointerType = match[2] === '*';
        const ctype = match[1].replace(/^(?:const |volatile )+/u, '').trim();
        for (const part of match[3].split(',')) {
            const [, stars, name, dims] = /^\s*(\**)\s*(\w+)((?:\s*\[[^\]]*\])*)\s*$/u
                .exec(part);
            members.push({
                name,
                ctype,
                kind: stars || pointerType ? 'pointer' : dims ? 'array' : 'value',
            });
        }
    }
    return members;
}

// The top-level elements of one group's initializer, in order, each as its
// source text with white space collapsed.
export function parseInitializers(source, letter, macros = MACROS) {
    const block = new RegExp(
        `^static const struct instance_globals_${letter} g_init_${letter} = \\{\\n`
        + '([\\s\\S]*?)^\\};', 'mu',
    ).exec(source);
    if (!block) throw new Error(`decl.c: no g_init_${letter}`);
    const text = stripComments(preprocessBody(block[1], macros, `g_init_${letter}`));
    const elements = [];
    let depth = 0;
    let current = '';
    for (let at = 0; at < text.length; at++) {
        const ch = text[at];
        if (ch === "'" || ch === '"') {
            // A character or string literal may hold a comma or a brace.
            let end = at + 1;
            while (text[end] !== ch) end += text[end] === '\\' ? 2 : 1;
            current += text.slice(at, end + 1);
            at = end;
            continue;
        }
        if (ch === '{' || ch === '(') depth++;
        if (ch === '}' || ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            elements.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) elements.push(current);
    return elements.map((element) => element.replace(/\s+/gu, ' ').trim());
}

// The number a scalar initializer evaluates to. It may hold integer
// literals with C suffixes, the names in CONSTANTS, parentheses and the
// operators - ~ & << .
export function evaluateInitializer(expression, where) {
    const reduced = expression
        .replace(/\b(\d+)[UL]+\b/gu, '$1')
        .replace(/\b[A-Za-z_]\w*\b/gu, (name) => {
            if (!(name in CONSTANTS))
                throw new Error(`${where}: no value for ${name} in "${expression}"`);
            return `(${CONSTANTS[name]})`;
        });
    if (!/^[\d\s()&~<\-]+$/u.test(reduced))
        throw new Error(`${where}: cannot evaluate "${expression}"`);
    // Only digits, parentheses and the four operators reach this point.
    const value = Function(`"use strict"; return (${reduced});`)();
    if (!Number.isInteger(value))
        throw new Error(`${where}: "${expression}" is not an integer`);
    return value;
}

// Where the port keeps a member: see the header comment.
function holder(group, member) {
    if (member.name === 'havestate') return 'owner';
    if (member.kind !== 'value') return 'owner';
    const scalar = member.ctype === 'boolean' || member.ctype.startsWith('enum ')
        || INTEGER_TYPES.has(member.ctype);
    if (!scalar) return 'owner';
    const qualified = `${group}.${member.name}`;
    if (OWNED_ELSEWHERE.has(qualified)) return 'frame';
    return HELD_ON_STATE.has(qualified) ? 'state' : 'group';
}

// Every group's members: { name, ctype, kind, initializer, held, value },
// where value is the start value of a member held in the group.
export function collectGroups(header, source) {
    const groups = {};
    const seen = new Set();
    for (const letter of GROUP_LETTERS) {
        const group = `g${letter}`;
        const members = parseMembers(header, letter);
        const initializers = parseInitializers(source, letter);
        // C pairs them by position; a count that differs would leave the
        // last members zero in C and mispair every one after the gap here.
        if (members.length !== initializers.length) {
            throw new Error(`${group}: ${members.length} members in decl.h, `
                + `${initializers.length} initializers in decl.c`);
        }
        groups[group] = members.map((member, index) => {
            const held = holder(group, member);
            const row = {
                ...member, initializer: initializers[index], held,
            };
            if (held === 'group' || held === 'state') {
                const value = evaluateInitializer(
                    row.initializer, `${group}.${member.name}`,
                );
                row.value = member.ctype === 'boolean' ? value !== 0 : value;
            }
            seen.add(`${group}.${member.name}`);
            return row;
        });
        if (groups[group].at(-1).name !== 'havestate'
            || groups[group].at(-1).initializer !== 'TRUE')
            throw new Error(`${group}: the last member is not havestate = TRUE`);
    }
    for (const name of HELD_ON_STATE)
        if (!seen.has(name)) throw new Error(`HELD_ON_STATE: decl.h has no ${name}`);
    for (const name of OWNED_ELSEWHERE)
        if (!HELD_ON_STATE.has(name)) throw new Error(`OWNED_ELSEWHERE: ${name} is not in HELD_ON_STATE`);
    return groups;
}

function cType(member) {
    return `${member.ctype}${member.kind === 'pointer' ? ' *' : ''}`
        + `${member.kind === 'array' ? '[]' : ''}`;
}

export function render(groups) {
    const functions = [];
    const tables = [];
    const stateRows = [];
    const note = (member) => (/^(?:-?\d+|true|false)$/u.test(member.initializer)
        || /^(?:0[UL]*|FALSE|TRUE)$/u.test(member.initializer)
        ? '' : ` = ${member.initializer}`);
    for (const [group, members] of Object.entries(groups)) {
        const rows = members.filter(({ held }) => held === 'group').map((member) => (
            `            ${member.name}: ${member.value}, // ${member.ctype}${note(member)}`
        ));
        for (const member of members.filter(({ held }) => held === 'state')) {
            stateRows.push(`        ${member.name}: ${member.value}, `
                + `// ${group}, ${member.ctype}${note(member)}`);
        }
        functions.push(rows.length
            ? `        ${group}: {\n${rows.join('\n')}\n        },`
            : `        ${group}: {},`);
        const entries = members.map((member) => (
            `        [${JSON.stringify(member.name)}, ${JSON.stringify(cType(member))}, `
            + `${JSON.stringify(member.initializer)}, ${JSON.stringify(member.held)}],`
        ));
        tables.push(`    ${group}: [\n${entries.join('\n')}\n    ],`);
    }
    return '// Generated by scripts/generate-instance-globals.mjs; do not edit.\n'
        + '// Source: NetHack 5.0 include/decl.h and src/decl.c at\n'
        + `// ${PINNED_REVISION}.\n`
        + '//\n'
        + '// C ref: decl.c g_init_a ... g_init_z and decl_globals_init(), which\n'
        + '// copies each into ga ... gz once per process. initial_instance_globals()\n'
        + '// returns new groups holding every integer, boolean and enumeration\n'
        + '// member the port keeps in its group, at the value decl.c starts it\n'
        + '// from; js/gstate.js creates state.ga ... state.gz from it at process\n'
        + '// start. A pointer, array, struct or char member is created by the\n'
        + '// function that owns it, in the port\'s own representation.\n'
        + '\n'
        + 'export function initial_instance_globals() {\n'
        + '    return {\n'
        + `${functions.join('\n')}\n`
        + '    };\n'
        + '}\n'
        + '\n'
        + '// The members the port reads directly off the game state, such as\n'
        + '// state.multi for gm.multi, at decl.c\'s values; js/gstate.js spreads\n'
        + '// them into the state at process start.\n'
        + 'export function initial_state_held_globals() {\n'
        + '    return {\n'
        + `${stateRows.join('\n')}\n`
        + '    };\n'
        + '}\n'
        + '\n'
        + '// Each group\'s members in declaration order: [name, C type, decl.c\n'
        + '// initializer, where the port keeps it]. \'group\' is state.g<x>, started\n'
        + '// above; \'state\' is the game state itself (state.multi for gm.multi);\n'
        + '// \'frame\' is a state member another object owns; \'owner\' is a member\n'
        + '// its owning function creates.\n'
        + 'export const INSTANCE_GLOBALS = {\n'
        + `${tables.join('\n')}\n`
        + '};\n';
}

export function readSources() {
    return [
        readFileSync(join(UPSTREAM_ROOT, 'include', 'decl.h'), 'utf8'),
        readFileSync(join(UPSTREAM_ROOT, 'src', 'decl.c'), 'utf8'),
    ];
}

function assertPinnedSource() {
    const actualRevision = execFileSync(
        'git', ['-C', UPSTREAM_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
    ).trim();
    if (actualRevision !== PINNED_REVISION) {
        throw new Error(
            `expected NetHack source ${PINNED_REVISION}; found ${actualRevision}`,
        );
    }
}

function main() {
    const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
    if (process.argv.length > (checkOnly ? 3 : 2))
        throw new Error('Usage: node scripts/generate-instance-globals.mjs [--check]');
    assertPinnedSource();
    const path = join(PROJECT_ROOT, OUTPUT);
    const output = render(collectGroups(...readSources()));
    if (checkOnly) {
        let existing = '';
        try {
            existing = readFileSync(path, 'utf8');
        } catch {
            // The comparison below reports a missing generated file.
        }
        if (existing !== output) {
            console.error(`${OUTPUT} is stale; run node scripts/generate-instance-globals.mjs`);
            process.exitCode = 1;
        }
    } else {
        writeFileSync(path, output);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
