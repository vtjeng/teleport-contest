// Enforces the default-at-source rule for the hero-hit callees of mthrowu.c.
// C's m_throw() and thrwmu() call thitu(), attrib.c poisoned(),
// mhitu.c mswings_verb() and allmain.c stop_occupation() directly; thitu()
// calls hack.c losehp() and attrib.c exercise(); poisoned() calls losehp(),
// end.c done() and pickup.c encumber_msg(). The port once reached each of
// them through an operation the caller injected (js/unported_monster_actions.js
// monsterMissileEnv()'s hitHero, poisoned, swingVerb and stopOccupation, and
// every caller's losehp, exercise, done and encumberMessage), with a
// note_unported() arm for a caller that forgot one. js/mthrowu.js and
// js/attrib.js now call them directly. This check fails when game code
// supplies or reads one of those operations again, when thitu() or poisoned()
// reads one of their callees from the environment, or when a caller passes
// one to them.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse as parseModule } from 'acorn';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// Operations whose C callee js/mthrowu.js and js/uhitm.js now call.
// stopOccupation is not here: other files use the name for their own
// callers' interruption, so js/mthrowu.js alone is checked for it below.
const REMOVED_OPERATIONS = ['hitHero', 'poisoned', 'swingVerb'];

// The callees thitu() and poisoned() call directly, which no caller passes.
const DIRECT_CALLEES = {
    thitu: ['losehp', 'exercise', 'encumberMessage', 'done'],
    poisoned: ['losehp', 'exercise', 'encumberMessage', 'done'],
};

// thitu() and poisoned() calls whose environment argument the caller scan
// cannot read key by key, pinned both ways: it is a variable, or an object
// literal that spreads a variable in. Neither callee reads the keys the scan
// looks for, so these are harmless; the pin keeps new ones visible. 8 on
// stand-in-i2 (9 November 2026): thitu() from explode.js scatter() and twice
// from mthrowu.js (m_throw(), thrwmu()), each spreading its environment, and
// poisoned() from mthrowu.js m_throw(), trap_effects.js (spikes), uhitm.js
// twice (the mhitu poison arms) and zap.js (poison gas).
const UNREAD_CALLS = 8;

// note_unported() reasons that ran only when a caller omitted an operation.
const REMOVED_NOTES = [
    'attrib.c poisoned',
    'pline.c pline',
    'mhitu.c mswings_verb/pline_mon',
    'mthrowu.c thitu',
    'allmain.c stop_occupation',
];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

function jsSources() {
    return readdirSync(JS_DIR)
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => [file, readFileSync(join(JS_DIR, file), 'utf8')]);
}

// Each place `source` supplies or reads one of `names` as an operation: an
// object key (`name:`), a method shorthand, a member read or assignment
// (`.name`), or a require...Operation(env, 'name') refusal. js/explode.js
// scatter()'s `ops.hitHero` is exempt: scatter() calls thitu() itself, and
// `scatterOps` is the replacement seam tests use, which
// scripts/scatter-operations.test.mjs keeps out of game code.
export function operationFindings(source, names) {
    const code = stripComments(source);
    const findings = [];
    for (const name of names) {
        const patterns = [
            new RegExp(`(?<![\\w.$'"])${name}\\s*:`, 'gu'),
            new RegExp(`(?<!function\\s+)(?<![\\w.$])${name}\\s*\\([^()]*\\)\\s*\\{`, 'gu'),
            new RegExp(`(?<!(?:^|[^\\w$])ops)\\.${name}(?![\\w$])`, 'gu'),
            new RegExp(`Operation\\(\\s*[^,()]+,\\s*'${name}'`, 'gu'),
        ];
        for (const pattern of patterns) {
            for (const match of code.matchAll(pattern))
                findings.push({ name, line: lineOf(code, match.index) });
        }
    }
    return findings.sort((a, b) => a.line - b.line);
}

function walk(node, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const child of value) walk(child, visit);
        } else if (value && typeof value.type === 'string') {
            walk(value, visit);
        }
    }
}

function parse(source) {
    return parseModule(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
    });
}

// The keys of an object literal, including those of object literals spread
// into it, and whether it spreads in anything else.
function literalKeys(node) {
    const keys = [];
    let opaque = node?.type !== 'ObjectExpression';
    if (opaque) return { keys, opaque };
    for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
            const inner = literalKeys(property.argument);
            keys.push(...inner.keys);
            opaque ||= inner.opaque;
        } else {
            const key = property.key?.name ?? property.key?.value;
            keys.push({ key, line: property.loc.start.line });
        }
    }
    return { keys, opaque };
}

// Every call of a function named in DIRECT_CALLEES whose environment literal
// names one of that function's direct callees, and the number of calls whose
// environment (the last argument) the scan cannot read key by key.
export function injectedCalleeFindings(source) {
    const findings = [];
    let unread = 0;
    walk(parse(source), (node) => {
        if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier')
            return;
        const forbidden = DIRECT_CALLEES[node.callee.name];
        if (!forbidden) return;
        const env = literalKeys(node.arguments.at(-1));
        if (env.opaque) unread++;
        for (const { key, line } of env.keys) {
            if (forbidden.includes(key))
                findings.push({ name: `${node.callee.name}(${key})`, line });
        }
    });
    return { findings, unread };
}

// The body of the named top-level function declaration in `source`.
function functionBody(source, name) {
    let found = null;
    walk(parse(source), (node) => {
        if (node.type === 'FunctionDeclaration' && node.id?.name === name)
            found = node;
    });
    assert.ok(found, `${name}() is declared`);
    return source.slice(found.body.start, found.body.end);
}

test('no game code supplies or reads a missile hero-hit operation', () => {
    const findings = [];
    for (const [file, source] of jsSources()) {
        for (const finding of operationFindings(source, REMOVED_OPERATIONS))
            findings.push(`${file}:${finding.line} ${finding.name}`);
    }
    assert.deepEqual(findings, []);
});

test('js/mthrowu.js calls stop_occupation() and keeps no gap arm for an omitted operation', () => {
    const source = readFileSync(join(JS_DIR, 'mthrowu.js'), 'utf8');
    const findings = operationFindings(source, ['stopOccupation'])
        .map(({ line }) => `mthrowu.js:${line} stopOccupation`);
    const code = stripComments(source);
    for (const note of REMOVED_NOTES) {
        if (code.includes(`note_unported('${note}')`))
            findings.push(`mthrowu.js note_unported('${note}')`);
    }
    assert.deepEqual(findings, []);
});

test('thitu() and poisoned() read none of their callees from the environment', () => {
    const findings = [];
    for (const [file, name] of [['mthrowu.js', 'thitu'], ['attrib.js', 'poisoned']]) {
        const body = stripComments(
            functionBody(readFileSync(join(JS_DIR, file), 'utf8'), name),
        );
        for (const callee of DIRECT_CALLEES[name]) {
            if (new RegExp(`[eE]nv\\??\\.${callee}(?![\\w$])`, 'u').test(body))
                findings.push(`${file} ${name}() reads env.${callee}`);
        }
    }
    assert.deepEqual(findings, []);
});

test('no caller passes thitu() or poisoned() a callee it calls itself', () => {
    const findings = [];
    let unread = 0;
    for (const [file, source] of jsSources()) {
        const result = injectedCalleeFindings(source);
        unread += result.unread;
        for (const finding of result.findings)
            findings.push(`${file}:${finding.line} ${finding.name}`);
    }
    assert.deepEqual(findings, []);
    assertExceptionCount(unread, UNREAD_CALLS, {
        what: 'thitu() or poisoned() calls whose environment the scan cannot read',
        pin: 'UNREAD_CALLS in scripts/missile-callee-defaults.test.mjs',
    });
});

test('the scans find keys, reads, refusals and injected callees', () => {
    const source = [
        'const env = { hitHero: (a) => a };', // 1
        'const ops = {',
        '    swingVerb(obj) { return obj; },', // 3
        '};',
        'await env.poisoned(1, 2);', // 5
        "requireRangedOperation(env, 'hitHero');", // 6
        'const a = obj.opoisoned; // hitHero: in a comment',
        "const text = 'poisoned: no';",
        'const hit = ops.hitHero ?? thitu;',
    ].join('\n');
    assert.deepEqual(
        operationFindings(source, REMOVED_OPERATIONS).map(({ line }) => line),
        [1, 3, 5, 6],
    );
    const calls = [
        'await thitu(1, 2, obj, null, state, {', // 1
        '    message,',
        '    losehp: (n) => n,', // 3
        '});',
        'await poisoned(r, t, k, 10, true, state, { ...env, done });', // 5
        'await thitu(1, 2, obj, null, state, { message, random });',
        'await poisoned(r, t, k, 10, true, state, env);', // unread
    ].join('\n');
    const result = injectedCalleeFindings(calls);
    assert.deepEqual(
        result.findings.map(({ name, line }) => `${line} ${name}`),
        ['3 thitu(losehp)', '5 poisoned(done)'],
    );
    // The spread `...env` on line 5 and the bare `env` on line 7.
    assert.equal(result.unread, 2);
});
