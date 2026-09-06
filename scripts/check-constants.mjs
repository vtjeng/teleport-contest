#!/usr/bin/env node

// Compare numeric constants defined in js/ against their C #define origins.
// Catches a hand-copied constant whose value drifted from its header.
//
// Limitations: parses only simple integer #define lines. Constants defined as
// expressions, referencing other defines, or guarded by #ifdef are out of
// scope. The check skips frozen files (terminal.js, isaac64.js, storage.js)
// whose constants the scorer defines and that the port does not control.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const C_INCLUDE_DIR = join(PROJECT_ROOT, 'nethack-c', 'upstream', 'include');
const JS_DIR = join(PROJECT_ROOT, 'js');

const FROZEN_FILES = new Set(['isaac64.js', 'terminal.js', 'storage.js']);

// Known-acceptable differences that the simple regex parser cannot resolve.
// Each entry documents why the JS value differs from the C #define.
const ALLOWLIST = new Map([
    // const.js ATR_ULINE and ATR_BLINK are unused dead exports whose values
    // do not match the C wintype.h ATR_ numbering.
    ['ATR_ULINE', 'unused export; C value comes from wintype.h (4)'],
    ['ATR_BLINK', 'unused export; C value comes from wintype.h (5)'],
    // The JS port uses its own bones-compatibility version number.
    ['EDITLEVEL', 'port-specific bones version, not the C patchlevel'],
    // C defines PERS_IS_UID as 0 or 1 via #ifdef UNIX. The regex parser
    // picks up the #else branch (0), but the port targets UNIX behavior (1).
    ['PERS_IS_UID', '#ifdef UNIX selects 1; regex picks up the #else 0'],
]);

const DEFINE_RE = /^#define\s+([A-Z_][A-Z0-9_]*)\s+(-?\d+)\s*(?:\/\*.*)?$/u;
const JS_CONST_RE = /^export\s+const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(-?\d+)\s*;/u;

export function parseCDefines(headerText) {
    const defines = new Map();
    for (const line of headerText.split('\n')) {
        const match = DEFINE_RE.exec(line.trim());
        if (match) defines.set(match[1], Number(match[2]));
    }
    return defines;
}

export function parseJsConstants(jsText) {
    const consts = new Map();
    for (const line of jsText.split('\n')) {
        const match = JS_CONST_RE.exec(line.trim());
        if (match) consts.set(match[1], Number(match[2]));
    }
    return consts;
}

export function findMismatches(cDefines, jsConsts, allowlist = ALLOWLIST) {
    const mismatches = [];
    for (const [name, jsValue] of jsConsts) {
        if (allowlist.has(name)) continue;
        if (cDefines.has(name) && cDefines.get(name) !== jsValue) {
            mismatches.push({ name, c: cDefines.get(name), js: jsValue });
        }
    }
    return mismatches.sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
    if (!existsSync(C_INCLUDE_DIR)) {
        console.log('constants: C headers not found, skipping');
        return;
    }
    const cDefines = new Map();
    for (const file of readdirSync(C_INCLUDE_DIR)) {
        if (!file.endsWith('.h')) continue;
        const text = readFileSync(join(C_INCLUDE_DIR, file), 'utf8');
        for (const [name, value] of parseCDefines(text)) {
            cDefines.set(name, value);
        }
    }

    const jsConsts = new Map();
    for (const file of readdirSync(JS_DIR)) {
        if (!file.endsWith('.js')) continue;
        if (FROZEN_FILES.has(file)) continue;
        const text = readFileSync(join(JS_DIR, file), 'utf8');
        for (const [name, value] of parseJsConstants(text)) {
            jsConsts.set(name, value);
        }
    }

    const mismatches = findMismatches(cDefines, jsConsts);
    if (mismatches.length === 0) {
        console.log(`constants: ${jsConsts.size} JS constants checked against `
            + `${cDefines.size} C defines (${ALLOWLIST.size} allowlisted), `
            + `all matching`);
    } else {
        for (const m of mismatches) {
            console.log(`  MISMATCH: ${m.name} is ${m.js} in JS but ${m.c} in C`);
        }
        console.log(`constants: ${mismatches.length} mismatch(es) of `
            + `${jsConsts.size} JS constants against ${cDefines.size} C defines`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
