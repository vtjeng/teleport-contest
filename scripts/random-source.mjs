#!/usr/bin/env node

// Lists every place in js/ that builds its own set of random functions.
//
// C has one random number generator: rnd.c's rn2(), rnd(), rnl(), d(), rne()
// and rnz() (and hack.h's rn1() macro over rn2()) all draw from the core
// ISAAC64 stream, so every C function can call any of them. The port passes
// that family to many functions as an injected `random` object. When a
// caller built its own object of just the functions it needed, such as
// `{ rn2 }` or `{ d, rn2, rnd }`, a callee further down that needed another
// one crashed: unstuck() needs rnd() and mintrap() needs rnl(). js/rng.js
// therefore holds the only definitions of a random set: `coreRandom`, the
// live game's complete set, and createCoreRandom(), the same complete set
// over a copy of the core stream, such as the one js/do.js
// place_random_arrival() clones for its preflight. The display RNG
// (rnd.c rn2_on_display_rng()) is a separate stream that the port passes as
// a single function, not as part of a random set.
//
// A finding is an object literal outside js/rng.js whose own keys are all
// names of rnd.c functions (rn2, rnd, rn1, rnl, rne, rnz, d, and the display
// rn2_on_display_rng and rnd_on_display_rng), with at least one core name:
// `{ rn2 }`, `{ rn2: random.rn2 }`, `{ d, rn2, ...env.random }` and
// `{ ...random, rn1: random.rn1 ?? rn1 }` all count, as does an object that
// only copies a set by spreading a name ending in `random` (`{ ...coreRandom,
// ...raw }`, `{ ...(env.random ?? {}) }`), and an empty object standing in
// for a set (`random = {}`, `env.random ?? {}`). Pass the set the caller
// received, or `coreRandom`, instead.
//
// scripts/random-source.test.mjs runs the scan over js/ and requires an
// empty list. The scan is syntactic: it does not see a set assembled with
// Object.fromEntries() or by assigning properties one at a time.
//
// Usage: node scripts/random-source.mjs   (prints the findings, one a line)

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as acorn from 'acorn';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

// rnd.c's core-stream functions and hack.h's rn1(); js/rng.js exports each.
export const CORE_NAMES = Object.freeze(['rn2', 'rnd', 'rn1', 'rnl', 'rne', 'rnz', 'd']);
// rnd.c's display-stream functions.
export const DISPLAY_NAMES = Object.freeze(['rn2_on_display_rng', 'rnd_on_display_rng']);

const CORE = new Set(CORE_NAMES);
const RANDOM_KEYS = new Set([...CORE_NAMES, ...DISPLAY_NAMES]);

// The one file allowed to define a random set.
const OWNER = 'rng.js';

function isNode(value) {
    return value && typeof value.type === 'string';
}

function walk(node, visit) {
    visit(node);
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const value = node[key];
        if (Array.isArray(value)) {
            for (const child of value) if (isNode(child)) walk(child, visit);
        } else if (isNode(value)) {
            walk(value, visit);
        }
    }
}

function keyName(property) {
    if (property.computed) return null;
    if (property.key.type === 'Identifier') return property.key.name;
    if (property.key.type === 'Literal') return String(property.key.value);
    return null;
}

// The name a spread copies from: `random` in `...random`,
// `...env.random` and `...(env.random ?? {})`.
function spreadName(argument) {
    let node = argument;
    if (node.type === 'LogicalExpression' && node.operator === '??') node = node.left;
    if (node.type === 'ChainExpression') node = node.expression;
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression' && !node.computed) return node.property.name;
    return null;
}

const RANDOM_NAME = /random$/iu;

// True when the object literal is a hand-built random set: its own keys are
// all rnd.c names with at least one core name, or it copies a random set
// with a spread (`{ ...coreRandom, ...raw }`).
function isRandomSet(node) {
    let core = 0;
    let copies = false;
    for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
            if (RANDOM_NAME.test(spreadName(property.argument) ?? '')) copies = true;
            continue;
        }
        const name = keyName(property);
        if (!RANDOM_KEYS.has(name)) return false;
        if (CORE.has(name)) core++;
    }
    return core > 0 || copies;
}

function isEmptyObject(node) {
    return node.type === 'ObjectExpression' && node.properties.length === 0;
}

// True for an empty object standing in for a random set: a parameter
// default `random = {}` or a fallback `env.random ?? {}`.
function isEmptyRandomDefault(node) {
    if (node.type === 'AssignmentPattern')
        return RANDOM_NAME.test(spreadName(node.left) ?? '') && isEmptyObject(node.right);
    if (node.type === 'LogicalExpression' && (node.operator === '??' || node.operator === '||'))
        return RANDOM_NAME.test(spreadName(node.left) ?? '') && isEmptyObject(node.right);
    return false;
}

// Returns one { line, text } for each hand-built random set in `source`.
export function randomSourceFindings(source) {
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
    });
    const findings = [];
    walk(ast, (node) => {
        if (isEmptyRandomDefault(node)) {
            findings.push({
                line: node.loc.start.line,
                text: source.slice(node.start, node.end).replace(/\s+/gu, ' '),
            });
        }
        if (node.type === 'ObjectExpression' && isRandomSet(node)) {
            findings.push({
                line: node.loc.start.line,
                text: source.slice(node.start, node.end).replace(/\s+/gu, ' '),
            });
        }
    });
    return findings;
}

// Returns "js/file:line: text" for every finding in js/.
export function scanRepository(root = PROJECT_ROOT) {
    const dir = join(root, 'js');
    const findings = [];
    for (const name of readdirSync(dir).filter((file) => file.endsWith('.js')).sort()) {
        if (name === OWNER) continue;
        const source = readFileSync(join(dir, name), 'utf8');
        for (const { line, text } of randomSourceFindings(source))
            findings.push(`js/${name}:${line}: ${text}`);
    }
    return findings;
}

if (process.argv[1] === SCRIPT_PATH) {
    const findings = scanRepository();
    for (const finding of findings) console.log(finding);
    process.exitCode = findings.length ? 1 : 0;
}
