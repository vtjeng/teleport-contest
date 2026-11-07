#!/usr/bin/env node
// Finds hero property tests in js/ that bypass js/youprop.js.
//
// C's include/youprop.h defines each hero property test once, as a macro
// over u.uprops[]. js/youprop.js ports those macros. Before it existed the
// port spelled the tests out in dozens of private copies, and the copies
// drifted: pray.c's Blind read blindness resistance instead of the lenses
// that block blindness, vault.c's left the lenses out, and read.c's and
// priest.c's Hallucination forgot hallucination resistance.
//
// The port reaches js/youprop.js one property family at a time.
// ROUTED_PROPERTIES lists the u.uprops[] slots whose every read already goes
// through it, and ROUTED_PSEUDO_MACROS the youprop.h macros with no slot of
// their own that have been routed too. For those, this scan reports, in
// every js/ file but youprop.js:
//
// - a read of a listed slot by name, such as `state.u.uprops[BLINDED]`
//   followed by anything other than an assignment to one of its fields;
// - a call that hands a listed slot's index to a local function that reads
//   u.uprops[] by a computed index, such as `propertyActive(state, INVIS)`;
// - a listed slot read through a local copy of the u.uprops array, such as
//   `properties[DEAF]` after `const properties = state.u.uprops`;
// - a function, or a constant, named after a youprop.js export of a routed
//   family. A function is a private copy of the macro; a constant shadows the
//   import and throws while it is uninitialized.
//
// A write stays where C writes it: an assignment to one field
// (`u.uprops[DEAF].intrinsic |= ...`), a whole slot, or the slot handed to
// incr_itimeout() or set_itimeout(), which C writes as `&HXxx`.
// ALLOWED_READS lists the other reads that are not property tests, each
// with its reason.
//
// To route another family, add its slots here and run the scan: it lists
// every site left to convert.
//
// Usage: node scripts/youprop-reads.mjs
// Prints each unlisted finding as file:line and exits 1 when there is one,
// or when an allow-list entry no longer matches anything.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blankCommentsAndStrings } from './check-namespace-members.mjs';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// youprop.h's vision and invisibility, hallucination, deafness and
// half-physical-damage slots.
export const ROUTED_PROPERTIES = Object.freeze([
    'BLINDED', 'BLND_RES', 'SEE_INVIS', 'TELEPAT', 'WARNING', 'WARN_OF_MON',
    'WARN_UNDEAD', 'SEARCHING', 'CLAIRVOYANT', 'INFRAVISION',
    'DETECT_MONSTERS', 'INVIS', 'HALLUC', 'HALLUC_RES', 'DEAF', 'HALF_PHDAM',
]);

// youprop.h macros that read no u.uprops[] slot.
export const ROUTED_PSEUDO_MACROS = Object.freeze(['Unaware', 'Maybe_Half_Phys']);

// Each entry allows the findings in `file` whose source line contains
// `text`. `reason` says why the line is not a property test.
export const ALLOWED_READS = [
    { file: 'js/pray.js', text: "grant(TELEPAT, 'Telepathy')",
        reason: 'pray.c pleased() (1132-1146) tests `HTelepat & INTRINSIC` only to '
            + 'decide whether to set HTelepat |= FROMOUTSIDE; grant() reads and sets '
            + 'the intrinsic field of the slot it is given, as C does for each gift' },
];

const ASSIGNMENT = /^\s*(?:=(?!=)|\|=|&=|\^=|\+=|-=|\*=|\?\?=|\+\+|--)/u;
const FIELD = /^\s*(?:\?\.|\.)\s*(?:intrinsic|extrinsic|blocked)/u;
const INDEX = /^\s*(?:\?\.)?\s*\[/u;
const IDENT = /^[A-Za-z_$][\w$]*$/u;

// Offset of the bracket that closes the one at `open`, in blanked code.
function closing(code, open) {
    const pairs = { '[': ']', '(': ')', '{': '}' };
    const want = pairs[code[open]];
    let depth = 0;
    for (let i = open; i < code.length; i++) {
        if (code[i] === code[open]) depth++;
        else if (code[i] === want && --depth === 0) return i;
    }
    return code.length;
}

// For the `uprops` token at `offset`: the index expression, or null when it
// is not indexed, and whether the access is a write.
function access(code, offset) {
    const after = offset + 'uprops'.length;
    const index = INDEX.exec(code.slice(after));
    if (!index) return { index: null, write: false };
    const open = after + index[0].length - 1;
    const close = closing(code, open);
    const expression = code.slice(open + 1, close).trim();
    const rest = code.slice(close + 1);
    const field = FIELD.exec(rest);
    if (field) return { index: expression, write: ASSIGNMENT.test(rest.slice(field[0].length)) };
    if (/^\s*=(?!=)/u.test(rest)) return { index: expression, write: true };
    const before = code.slice(Math.max(0, offset - 80), offset);
    const timeout = /\b(?:incr_itimeout|set_itimeout)\(\s*[\w$.?\s]*$/u.test(before)
        && /^\s*,/u.test(rest);
    return { index: expression, write: timeout };
}

// The routed names youprop.js exports: the functions whose bodies read only
// routed slots, through other routed functions or directly, plus the routed
// pseudo-macros.
export function routedNames(root = PROJECT_ROOT, routed = ROUTED_PROPERTIES,
    pseudo = ROUTED_PSEUDO_MACROS) {
    const source = readFileSync(join(root, 'js', 'youprop.js'), 'utf8');
    const bodies = new Map();
    for (const match of source.matchAll(/^export function (\w+)\([^)]*\) \{\n([\s\S]*?)\n\}/gmu))
        bodies.set(match[1], match[2]);
    const slots = new Set(routed);
    const names = new Set(pseudo);
    let grew = true;
    while (grew) {
        grew = false;
        for (const [name, body] of bodies) {
            if (names.has(name)) continue;
            const constants = [...body.matchAll(/\b(?:intrinsic|extrinsic|blocked)\(u, (\w+)\)/gu)]
                .map((m) => m[1]);
            const calls = [...body.matchAll(/\b([A-Z]\w*)\(/gu)].map((m) => m[1])
                .filter((callee) => bodies.has(callee));
            const direct = constants.length > 0 && constants.every((c) => slots.has(c));
            const viaCalls = constants.length === 0 && calls.length > 0
                && calls.every((callee) => names.has(callee));
            if (direct || viaCalls) {
                names.add(name);
                grew = true;
            }
        }
    }
    return names;
}

// Functions in `code` (declarations and arrow functions, at any depth) whose
// bodies index u.uprops[] by something other than a named slot.
function computedReaders(code) {
    const readers = new Set();
    const definition = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>)/gu;
    for (const match of code.matchAll(definition)) {
        const name = match[1] ?? match[2];
        let start = match.index + match[0].length;
        if (match[1]) start = closing(code, code.indexOf('(', match.index)) + 1;
        const brace = /^\s*\{/u.exec(code.slice(start));
        const end = brace ? closing(code, start + brace[0].length - 1)
            : code.indexOf('\n', start);
        const body = code.slice(start, end);
        for (const use of body.matchAll(/(?<![\w$])uprops(?![\w$])/gu)) {
            const { index, write } = access(body, use.index);
            if (index !== null && !write && !/^[A-Z_][A-Z0-9_]*$/u.test(index)) readers.add(name);
        }
    }
    return readers;
}

// Findings in one file's source, as { file, line, text, kind }.
export function findings(source, file, names, routed = ROUTED_PROPERTIES) {
    const slots = new Set(routed);
    const code = blankCommentsAndStrings(source);
    const lines = source.split('\n');
    const found = [];
    const add = (offset, kind) => {
        const line = code.slice(0, offset).split('\n').length;
        found.push({ file, line, text: lines[line - 1].trim(), kind });
    };

    const aliases = new Set();
    for (const match of code.matchAll(/(?<![\w$])uprops(?![\w$])/gu)) {
        if (/^\s*:/u.test(code.slice(match.index + 'uprops'.length))) continue; // object key
        const { index, write } = access(code, match.index);
        if (index === null) {
            const alias = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[\w$.?\s]*$/u
                .exec(code.slice(Math.max(0, match.index - 80), match.index));
            if (alias) aliases.add(alias[1]);
            continue;
        }
        if (!write && slots.has(index)) add(match.index, `reads ${index}`);
    }
    for (const alias of aliases) {
        const use = new RegExp(`(?<![\\w$.])${alias.replace(/\$/gu, '\\$')}\\s*(?:\\?\\.)?\\s*\\[\\s*(\\w+)\\s*\\]`, 'gu');
        for (const match of code.matchAll(use))
            if (slots.has(match[1])) add(match.index, `reads ${match[1]} through ${alias}`);
    }
    for (const reader of computedReaders(code)) {
        const call = new RegExp(`(?<![\\w$.])${reader.replace(/\$/gu, '\\$')}\\(`, 'gu');
        for (const match of code.matchAll(call)) {
            const open = match.index + match[0].length - 1;
            const args = code.slice(open + 1, closing(code, open)).split(',').map((a) => a.trim());
            const slot = args.find((arg) => IDENT.test(arg) && slots.has(arg));
            if (slot) add(match.index, `reads ${slot} through ${reader}()`);
        }
    }
    const definition = /(?<![\w$.])(?:function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/gu;
    for (const match of code.matchAll(definition)) {
        const name = match[1] ?? match[2];
        if (names.has(name)) add(match.index, match[1] ? `copy of ${name}` : `shadows ${name}`);
    }
    return found;
}

function allowedEntry(finding) {
    return ALLOWED_READS.find((entry) => entry.file === finding.file
        && finding.text.includes(entry.text));
}

// Every finding under js/, each marked with its allow-list entry.
export function scanFiles(root = PROJECT_ROOT) {
    const names = routedNames(root);
    const results = [];
    for (const name of readdirSync(join(root, 'js')).sort()) {
        if (!name.endsWith('.js') || name === 'youprop.js') continue;
        const file = `js/${name}`;
        const source = readFileSync(join(root, file), 'utf8');
        for (const finding of findings(source, file, names))
            results.push({ ...finding, allowed: allowedEntry(finding) ?? null });
    }
    return results;
}

export function unlistedFindings(root = PROJECT_ROOT) {
    return scanFiles(root).filter((finding) => !finding.allowed);
}

// Allow-list entries that no finding matches any longer.
export function staleEntries(root = PROJECT_ROOT) {
    const used = new Set(scanFiles(root).map((finding) => finding.allowed).filter(Boolean));
    return ALLOWED_READS.filter((entry) => !used.has(entry));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const unlisted = unlistedFindings();
    for (const { file, line, text, kind } of unlisted)
        console.log(`${file}:${line}: ${kind}: ${text}`);
    const stale = staleEntries();
    for (const entry of stale)
        console.log(`stale allow-list entry: ${entry.file} ${entry.text}`);
    process.exitCode = unlisted.length || stale.length ? 1 : 0;
}
