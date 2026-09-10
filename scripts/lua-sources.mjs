// Inventory every upstream Lua program, including libraries and data scripts.
// A registered level loader says nothing about complete source translation;
// completion evidence is tracked separately from this source inventory.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UPSTREAM_ROOT } from './c-functions.mjs';

function missingCheckout(root) {
    return new Error(`no Lua source under ${join(root, 'dat')}; run `
        + 'git submodule update --init --checkout --no-fetch -- '
        + 'nethack-c/upstream');
}

/** Every regular dat/*.lua source file, as `{ name, path }` sorted by name. */
export function listLuaFiles(root = UPSTREAM_ROOT) {
    const directory = join(root, 'dat');
    let entries;
    try {
        entries = readdirSync(directory, { withFileTypes: true });
    } catch {
        throw missingCheckout(root);
    }
    const files = entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.lua'))
        .map((entry) => ({ name: entry.name, path: join(directory, entry.name) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    if (files.length === 0) throw missingCheckout(root);
    return files;
}

/** Look up one regular source file by its basename, such as `quest.lua`. */
export function luaFilePath(name, root = UPSTREAM_ROOT) {
    if (typeof name !== 'string' || name.length <= '.lua'.length
        || !name.endsWith('.lua') || /[\\/\0]/u.test(name)) {
        throw new Error('expected a Lua source basename ending in .lua');
    }
    const path = join(root, 'dat', name);
    try {
        if (lstatSync(path).isFile()) return path;
    } catch {
        // A missing file gets the same diagnostic as a non-regular file.
    }
    throw new Error(`no Lua source file named ${name} under dat/`);
}

/**
 * One whole-program planning unit. Top-level statements are part of the unit;
 * Lua helper definitions must not cause the planner to omit their callers.
 * Bounds are 1-based physical lines, with one line retained for an empty file.
 */
export function luaProgram(name, root = UPSTREAM_ROOT) {
    const text = readFileSync(luaFilePath(name, root), 'utf8');
    const lineCount = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    return { name, line: 1, endLine: Math.max(1, lineCount) };
}
