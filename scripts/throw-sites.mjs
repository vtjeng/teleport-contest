#!/usr/bin/env node

// Lists every `throw new Error(...)`, `throw new TypeError(...)` and
// `throw new RangeError(...)` in js/.
//
// A throw ends the game. Where the C source calls pline.c impossible() it
// prints a report and carries on, so a throw there is a defect: steed.c
// place_monster() was one (batch 16 game F4). scripts/throw-sites.test.mjs
// compares this list with scripts/throw-site-list.json, where each entry
// records why the throw stays:
//
// - panic: C calls end.c panic() at that point, and the enclosing function
//   is synchronous, so it cannot wait on js/end.js panic(). The game ends
//   either way.
// - lua-error: the throw is the port of a C Lua error raise (nhl_error(),
//   luaL_error() or a luaL_check*() failure), which unwinds as the throw
//   does.
// - guard: a state check with no C counterpart. C reads on regardless; no
//   C caller is known to create the state, but that has not been shown for
//   every caller, so the check stays.
// - invariant: a JavaScript-only condition, such as an argument of the
//   wrong type, an injected operation that is missing, or a function called
//   before the initialization that every game performs first.
// - unported: a refusal of a C branch the port has not ported, which
//   AGENTS.md wants replaced by the port (or note_unported()) when that
//   branch is reached.
//
// A throw that stands in for C's impossible() is not listed: port the call
// (`await impossible()` from js/pline.js where the caller can wait, or
// `note_unported('pline.c impossible')` where it cannot) and what C does
// after it.
//
// Unsupported*Error refusals (AGENTS.md, "Keep each source file's port in
// one place") and js/nhlua.js LuaError are outside this list, as are
// rethrows of a caught value.
//
// Usage: node scripts/throw-sites.mjs   (prints the current list as JSON
// keyed like scripts/throw-site-list.json)

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

import { listJsFiles } from './discarded-promises.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

export const LISTED_CLASSES = new Set(['Error', 'TypeError', 'RangeError']);

// The leading text of a throw's message that its key keeps: enough to tell
// the throws of one function apart, short enough to survive small rewording
// of interpolated values.
const MESSAGE_HEAD_LENGTH = 60;

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function isNode(value) {
    return value && typeof value.type === 'string';
}

function walk(node, visit, ancestors = []) {
    visit(node, ancestors);
    ancestors.push(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, visit, ancestors);
        } else if (isNode(value)) {
            walk(value, visit, ancestors);
        }
    }
    ancestors.pop();
}

// The nearest named function around a statement, or <module>.
function enclosingName(ancestors) {
    for (let i = ancestors.length - 1; i >= 0; i--) {
        const node = ancestors[i];
        if (!FUNCTION_TYPES.has(node.type)) continue;
        if (node.id) return node.id.name;
        const parent = ancestors[i - 1];
        if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier')
            return parent.id.name;
        if ((parent?.type === 'MethodDefinition' || parent?.type === 'Property')
            && parent.key.type === 'Identifier')
            return parent.key.name;
    }
    return '<module>';
}

// Each listed throw in one file: { key, line, errorClass }.
export function throwSitesInSource(file, source) {
    const ast = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        allowHashBang: true,
    });
    const sites = [];
    walk(ast, (node, ancestors) => {
        if (node.type !== 'ThrowStatement') return;
        const arg = node.argument;
        if (arg?.type !== 'NewExpression' || arg.callee.type !== 'Identifier') return;
        const errorClass = arg.callee.name;
        if (!LISTED_CLASSES.has(errorClass)) return;
        const first = arg.arguments[0];
        const message = first
            ? source.slice(first.start, first.end).replace(/\s+/gu, ' ')
            : '';
        const head = message.slice(0, MESSAGE_HEAD_LENGTH);
        sites.push({
            key: `${file} | ${enclosingName(ancestors)} | ${head}`,
            line: node.loc.start.line,
            errorClass,
        });
    });
    return sites;
}

// The current list: { "<file> | <enclosing function> | <message head>":
// count }. `sources` maps each js/ path to its text.
export function scanThrowSites(sources) {
    const counts = {};
    for (const [file, source] of Object.entries(sources)) {
        for (const site of throwSitesInSource(file, source))
            counts[site.key] = (counts[site.key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function readJsSources(root = PROJECT_ROOT) {
    return Object.fromEntries(listJsFiles(root)
        .map((file) => [file, readFileSync(join(root, file), 'utf8')]));
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH)
    console.log(JSON.stringify(scanThrowSites(readJsSources()), null, 2));
