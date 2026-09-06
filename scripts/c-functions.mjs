// Reads the C source tree for the goal log and the divergence queue: which
// functions each C file defines, where each one starts and ends, and which of
// them already have a same-named function under js/.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const UPSTREAM_ROOT = join(PROJECT_ROOT, 'nethack-c', 'upstream');

// The C directories a goal may port. AGENTS.md pairs each C file with one
// JavaScript file of the same name, so the basename identifies a file.
const C_DIRECTORIES = ['src', join('win', 'tty')];

// NetHack writes a function's name at column 0, on the line after its return
// type, so a definition is the only line in a C file that starts with an
// identifier immediately followed by an opening parenthesis.
const DEFINITION = /^([A-Za-z_][A-Za-z0-9_]*)\(/u;

const JS_DEFINITION = /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gu;

function missingCheckout(root) {
    return new Error(`no C source under ${root}; run `
        + 'git submodule update --init --checkout --no-fetch -- '
        + 'nethack-c/upstream');
}

/** Every C file a goal may port, as `{ name, path }` sorted by name. */
export function listCFiles(root = UPSTREAM_ROOT) {
    const files = [];
    for (const directory of C_DIRECTORIES) {
        const full = join(root, directory);
        let entries;
        try {
            entries = readdirSync(full);
        } catch {
            throw missingCheckout(root);
        }
        for (const name of entries) {
            if (name.endsWith('.c')) files.push({ name, path: join(full, name) });
        }
    }
    if (files.length === 0) throw missingCheckout(root);
    return files.sort((a, b) => a.name.localeCompare(b.name));
}

/** The path of one C file named by its basename, such as `options.c`. */
export function cFilePath(name, root = UPSTREAM_ROOT) {
    for (const directory of C_DIRECTORIES) {
        const path = join(root, directory, name);
        try {
            if (statSync(path).isFile()) return path;
        } catch {
            // Try the next directory.
        }
    }
    throw new Error(`no C file named ${name} under src/ or win/tty/`);
}

/**
 * The functions a C file defines, in definition order.
 *
 * Each entry's `line` is the 1-based line holding the name and `endLine` is
 * the line before the next definition, or the file's last line. The extent
 * therefore includes the return type above the next name and any comment
 * between functions; it is a size for planning spans, not an exact body.
 */
export function parseCFunctions(text) {
    const lines = text.split('\n');
    const functions = [];
    lines.forEach((content, index) => {
        const match = DEFINITION.exec(content);
        if (match) functions.push({ name: match[1], line: index + 1 });
    });
    functions.forEach((entry, index) => {
        const next = functions[index + 1];
        entry.endLine = next ? next.line - 1 : lines.length;
    });
    return functions;
}

export function cFunctions(name, root = UPSTREAM_ROOT) {
    return parseCFunctions(readFileSync(cFilePath(name, root), 'utf8'));
}

function walkJs(directory, out) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walkJs(path, out);
        else if (entry.name.endsWith('.js')) out.push(path);
    }
    return out;
}

/** Every function name defined with `function name(` under js/. */
export function jsFunctionNames(jsRoot = join(PROJECT_ROOT, 'js')) {
    const names = new Set();
    for (const path of walkJs(jsRoot, [])) {
        const text = readFileSync(path, 'utf8');
        for (const match of text.matchAll(JS_DEFINITION)) names.add(match[1]);
    }
    return names;
}

/** Copies of `functions` with `ported` set from the JavaScript names. */
export function markPorted(functions, names) {
    return functions.map((entry) => ({ ...entry, ported: names.has(entry.name) }));
}

/** A map from C function name to the first C file that defines it. */
export function functionOwners(root = UPSTREAM_ROOT) {
    const owners = new Map();
    for (const file of listCFiles(root)) {
        for (const entry of parseCFunctions(readFileSync(file.path, 'utf8'))) {
            if (!owners.has(entry.name)) owners.set(entry.name, file.name);
        }
    }
    return owners;
}
