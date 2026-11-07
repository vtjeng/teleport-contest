// js/youprop.js Half_physical_damage() is the port's one reading of C's
// youprop.h:339-341 macro, and Maybe_Half_Phys() is its one reading of
// hack.h:1236. Before they existed, each file spelled the property test out
// for itself or kept a private copy of the helper: 38 copies in 28 files.
// This test fails when code in js/ tests the HALF_PHDAM slot itself, defines
// its own copy of either function, or writes Maybe_Half_Phys() out by hand.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { HALF_PHDAM } from '../js/const.js';
import { Half_physical_damage, Maybe_Half_Phys } from '../js/youprop.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');

// Uses of HALF_PHDAM that name the property without testing whether the hero
// has it. Each entry is the file and the exact text allowed there.
const ALLOWED_USES = {
    'const.js': [
        'export const HALF_PHDAM = 56;',
    ],
    'youprop.js': [
        // The bodies of HHalf_physical_damage() and EHalf_physical_damage().
        'intrinsic(u, HALF_PHDAM)',
        'extrinsic(u, HALF_PHDAM)',
    ],
    'artifacts.js': [
        // artifact.c:2360 spfx table and its inverse, which map an artifact
        // power to the property it grants.
        '[SPFX_HPHDAM, HALF_PHDAM]',
        'case HALF_PHDAM:',
    ],
    'insight.js': [
        // insight.c enlght_halfdmg() and the enlightenment line's arguments.
        'category === HALF_PHDAM',
        'enlght_halfdmg(HALF_PHDAM)',
        'from_what(HALF_PHDAM, state)',
    ],
    'timeout_property_data.js': [
        // timeout.c:102 propertynames[].
        'prop_num: HALF_PHDAM',
    ],
};

const blank = (text) => text.replace(/[^\n]/gu, ' ');

// Copy code from `start` until an unmatched `}` (inside a template hole) or
// the end, blanking comments and string text. Returns [text, stop offset].
function scanCode(source, start, inHole) {
    let out = '';
    let depth = 0;
    let i = start;
    for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === '/' && source[i + 1] === '/') {
            const end = source.indexOf('\n', i);
            const stop = end < 0 ? source.length : end;
            out += blank(source.slice(i, stop));
            i = stop - 1;
        } else if (ch === '/' && source[i + 1] === '*') {
            const end = source.indexOf('*/', i + 2);
            const stop = end < 0 ? source.length : end + 2;
            out += blank(source.slice(i, stop));
            i = stop - 1;
        } else if (ch === '\'' || ch === '"') {
            let j = i + 1;
            while (j < source.length && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
            out += ch + blank(source.slice(i + 1, j)) + (source[j] ?? '');
            i = j;
        } else if (ch === '`') {
            // Template text is blanked; each `${...}` hole is code.
            out += ch;
            let j = i + 1;
            while (j < source.length && source[j] !== '`') {
                if (source[j] === '\\') { out += '  '; j += 2; continue; }
                if (source[j] === '$' && source[j + 1] === '{') {
                    const [hole, stop] = scanCode(source, j + 2, true);
                    out += '${' + hole + '}';
                    j = stop + 1;
                    continue;
                }
                out += blank(source[j]);
                j++;
            }
            out += source[j] ?? '';
            i = j;
        } else if (inHole && ch === '{') {
            depth++;
            out += ch;
        } else if (inHole && ch === '}') {
            if (depth === 0) break;
            depth--;
            out += ch;
        } else {
            out += ch;
        }
    }
    return [out, i];
}

// Replace comments, string text and import declarations with spaces, keeping
// every newline so that offsets still give the right line numbers. Template
// holes keep their code, since a property test can sit inside one.
export function codeOnly(source) {
    return scanCode(source, 0, false)[0].replace(
        /^import\s*\{[^}]*\}\s*from\s*'[^']*';/gmu, blank);
}

// A function declaration, or a variable holding a function, named for the
// property. A variable holding a value, such as `const halfPhysical =
// Half_physical_damage(state.u)`, is a use of the definition, not a copy.
const LOCAL_COPY = /(?:function\s+(\w*half_?phys\w*)|(?:const|let|var)\s+(\w*half_?phys\w*)\s*=\s*(?:async\s+)?(?:function\b|\([^()]*\)\s*=>|\w+\s*=>))/giu;
const SPELLED_OUT = /Half_physical_damage\([^()]*\)\s*\?\s*Math\.(?:trunc|floor)\(\(\s*([\w.]+)\s*\+\s*1\s*\)\s*\/\s*2\s*\)\s*:\s*([\w.]+)/gu;
const SLOT_BY_NUMBER = /uprops\s*(?:\?\.)?\s*\[\s*56\s*\]/gu;

// Findings for one js/ file, as `file:line: reason`.
export function halfPhysicalFindings(source, file) {
    const code = codeOnly(source);
    const lineOf = (offset) => code.slice(0, offset).split('\n').length;
    const findings = [];
    const add = (offset, reason) => findings.push(`${file}:${lineOf(offset)}: ${reason}`);

    let masked = code;
    for (const allowed of ALLOWED_USES[file] ?? []) {
        masked = masked.split(allowed).join(allowed.replace(/HALF_PHDAM/gu, '__________'));
    }
    for (const match of masked.matchAll(/\bHALF_PHDAM\b/gu))
        add(match.index, 'reads HALF_PHDAM; call Half_physical_damage(hero)');

    for (const match of code.matchAll(LOCAL_COPY)) {
        const definesShared = file === 'youprop.js'
            && /^function\s+(?:[HE]?Half_physical_damage|Maybe_Half_Phys)$/u.test(match[0]);
        if (!definesShared)
            add(match.index, `defines ${match[1] ?? match[2]}; import it from youprop.js`);
    }
    if (file !== 'youprop.js') {
        for (const match of code.matchAll(SPELLED_OUT)) {
            if (match[1] === match[2])
                add(match.index, 'spells out Maybe_Half_Phys(); call it instead');
        }
    }
    for (const match of code.matchAll(SLOT_BY_NUMBER))
        add(match.index, 'reads property slot 56; call Half_physical_damage(hero)');
    return findings;
}

test('js/ tests Half_physical_damage only through youprop.js', () => {
    const findings = [];
    for (const name of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort())
        findings.push(...halfPhysicalFindings(readFileSync(join(JS_DIR, name), 'utf8'), name));
    assert.deepEqual(findings, []);
});

test('every allowed use is still present', () => {
    // An allowed use that no longer occurs is a stale exemption that a later
    // property test written in the same words would slip through.
    for (const [file, uses] of Object.entries(ALLOWED_USES)) {
        const code = codeOnly(readFileSync(join(JS_DIR, file), 'utf8'));
        for (const use of uses) assert.ok(code.includes(use), `${file}: ${use}`);
    }
});

test('the scan finds each form a site has used to bypass the definition', () => {
    // Lines 2-9 are forms the port used before the shared definition
    // existed; lines 10-12 and 19 are other ways to bypass it. Line 1 and
    // lines 13-18 are allowed and must not be reported.
    const source = [
        "import { HALF_PHDAM, Maybe_Half_Phys } from './const.js';", // 1: import only
        'const prop = state.u?.uprops?.[HALF_PHDAM];', // 2: direct slot read
        'if (propertyPresent(state, HALF_PHDAM)) dmg = 1;', // 3: generic helper
        'const halfPhysicalDamage = Boolean(prop(HALF_PHDAM).intrinsic);', // 4: mhitu.js gulpmu()'s closure
        'function maybeHalfPhysical(damage, state) {}', // 5: private helper
        'function Maybe_Half_Phys(dmg, state) {}', // 6: private copy of the macro
        'const d = Half_physical_damage(state.u)', // 7: Maybe_Half_Phys written out
        '    ? Math.trunc((damage + 1) / 2) : damage;', // 8
        'if (active(HALF_PHDAM)) x();', // 9: insight-style closure
        'const p = hero.uprops[56];', // 10: slot by number
        'function zapDigMaybeHalfPhys(d) {}', // 11: another private helper
        'const halfPhys = (d) => d;', // 12: a private helper held in a variable
        '// state.u.uprops[HALF_PHDAM] in a comment', // 13
        'const msg = "HALF_PHDAM";', // 14: inside a string
        'losehp(Maybe_Half_Phys(rnd(10), state.u), killer);', // 15: the shared macro
        'if (Half_physical_damage(state.u)) tmp = Math.trunc((tmp + 1) / 2);', // 16: C's own if-form
        'const e = Half_physical_damage(u) ? Math.trunc((d - 1) / 2) : d;', // 17: uhitm.c:2904's expression
        'const halfPhysical = Half_physical_damage(state.u);', // 18: a value, not a copy
        'msg(`take ${f(state.u.uprops[HALF_PHDAM])} damage`);', // 19: inside a template hole
    ].join('\n');
    assert.deepEqual(halfPhysicalFindings(source, 'example.js').map((f) => f.split(':')[1]),
        ['2', '3', '4', '9', '19', '5', '6', '11', '12', '7', '10']);
});

test('Half_physical_damage and Maybe_Half_Phys follow youprop.h and hack.h', () => {
    // Pin the C text this port reads, then the values it gives.
    const hack = readFileSync(join(ROOT, 'nethack-c/upstream/include/hack.h'), 'utf8');
    const properties = readFileSync(join(ROOT, 'nethack-c/upstream/include/youprop.h'), 'utf8');
    const macro = hack.match(/#define Maybe_Half_Phys\(dmg\)[^\n]*\n[^\n]*/u)?.[0];
    assert.ok(macro?.includes('((Half_physical_damage) ? (((dmg) + 1) / 2) : (dmg))'));
    assert.match(properties, /#define Half_physical_damage \(HHalf_physical_damage \|\| EHalf_physical_damage\)/u);
    assert.match(properties, /#define HHalf_physical_damage u\.uprops\[HALF_PHDAM\]\.intrinsic\s*#define EHalf_physical_damage u\.uprops\[HALF_PHDAM\]\.extrinsic/u);

    const hero = { uprops: [] };
    assert.equal(Half_physical_damage(hero), false); // An absent slot is no source.
    assert.equal(Maybe_Half_Phys(5, hero), 5); // Neither C property source is present.
    hero.uprops[HALF_PHDAM] = { intrinsic: 0, extrinsic: 0 };
    assert.equal(Half_physical_damage(hero), false);
    assert.equal(Maybe_Half_Phys(4, hero), 4);
    hero.uprops[HALF_PHDAM] = { intrinsic: 1, extrinsic: 0 };
    assert.equal(Half_physical_damage(hero), true); // The intrinsic alone counts.
    assert.equal(Maybe_Half_Phys(5, hero), 3); // C uses (5 + 1) / 2.
    assert.equal(Maybe_Half_Phys(4, hero), 2); // (4 + 1) / 2 truncates to 2.
    // 1 is the least damage losehp() is given; (1 + 1) / 2 keeps it at 1.
    assert.equal(Maybe_Half_Phys(1, hero), 1);
    // 0 + 1 halves to 0 in C's int division, so no damage stays none.
    assert.equal(Maybe_Half_Phys(0, hero), 0);
    hero.uprops[HALF_PHDAM] = { intrinsic: 0, extrinsic: 0x800 /* W_ART */ };
    assert.equal(Half_physical_damage(hero), true); // The extrinsic alone counts.
    assert.equal(Maybe_Half_Phys(5, hero), 3);
    // -2 + 1 is -1, which C's division truncates toward zero, to 0. Math.trunc
    // gives -0, which == compares equal to 0 and losehp() subtracts alike.
    assert.ok(Maybe_Half_Phys(-2, hero) == 0);
});

test('Half_physical_damage reads the hero, not the game state', () => {
    // Given the game state in place of the hero, the call must throw rather
    // than answer FALSE, which would leave the damage unhalved. With no hero
    // at all it reads as a hero with no properties, as every youprop.js
    // accessor does (js/youprop.js slot()).
    assert.throws(() => Half_physical_damage({ u: { uprops: [] } }), TypeError);
    assert.throws(() => Maybe_Half_Phys(5, { u: { uprops: [] } }), TypeError);
    assert.equal(Half_physical_damage(undefined), false);
    assert.equal(Maybe_Half_Phys(5, undefined), 5);
});
