// Enforces the default-at-source rule for wizard.c tactics() and resurrect().
// C's strategy(), target_on() and tactics() call rloc(), rloc_to(),
// mnearto(), mnexto(), healmon(), mpickobj(), obj_extract_self(), m_at(),
// monnear(), noteleport_level(), inhishop() and inhistemple() directly, and
// resurrect() calls dog.c mon_arrive() and mon_catchup_elapsed_time(). The
// port once took each from an operation its one caller injected
// (js/monmove.js dochug(), js/allmain.js and js/do.js), with a note_unported()
// arm or a silent skip when a caller left one out. js/wizard.js now calls
// them itself; a test may replace one only through `tacticsOps`. This check
// fails when game code supplies `tacticsOps` or reads one of the old operation
// names again.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { TACTICS_CALLEE_NAMES } from '../js/wizard.js';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// The operation names js/wizard.js read before it called the C functions.
const OLD_OPERATIONS = [
    'healmon', 'inhishop', 'inhistemple', 'm_at', 'mnearto', 'mnexto',
    'monArrive', 'monCatchupElapsedTime', 'monnear', 'mpickobj',
    'noteleportLevel', 'objExtractSelf', 'rloc', 'rlocTo',
];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

// Reads of `<env>.name` or `<env>?.name` for any identifier ending in Env or
// env, in `source`.
export function envReadFindings(source, names) {
    const code = stripComments(source);
    const findings = [];
    for (const name of names) {
        const pattern = new RegExp(`\\b\\w*[eE]nv\\??\\.${name}(?![\\w$])`, 'gu');
        for (const match of code.matchAll(pattern))
            findings.push({ name, line: lineOf(code, match.index) });
    }
    return findings.sort((a, b) => a.line - b.line);
}

// Each `tacticsOps` key or member in `source`.
export function tacticsOpsFindings(source) {
    const code = stripComments(source);
    return [...code.matchAll(/(?<![\w$])tacticsOps\s*:/gu)]
        .map((match) => lineOf(code, match.index));
}

function jsSources() {
    return readdirSync(JS_DIR)
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => [file, readFileSync(join(JS_DIR, file), 'utf8')]);
}

test('js/wizard.js reads none of the old operation names from its environment', () => {
    const source = readFileSync(join(JS_DIR, 'wizard.js'), 'utf8');
    const findings = envReadFindings(source, OLD_OPERATIONS)
        .map(({ name, line }) => `wizard.js:${line} ${name}`);
    assert.deepEqual(findings, []);
});

test('no game code supplies tacticsOps or the resurrect() arrival operations', () => {
    const findings = [];
    for (const [file, source] of jsSources()) {
        for (const line of tacticsOpsFindings(source))
            findings.push(`${file}:${line} tacticsOps`);
        const code = stripComments(source);
        for (const name of ['monArrive', 'monCatchupElapsedTime', 'noteleportLevel',
            'objExtractSelf', 'rlocTo']) {
            for (const match of code.matchAll(new RegExp(`(?<![\\w$.])${name}\\s*:`, 'gu')))
                findings.push(`${file}:${lineOf(code, match.index)} ${name}`);
        }
    }
    assert.deepEqual(findings, []);
});

test('every tactics() callee has its C default', () => {
    // A renamed or dropped entry would otherwise fall back to undefined.
    assert.deepEqual([...TACTICS_CALLEE_NAMES].sort(), [
        'healmon', 'inhishop', 'inhistemple', 'm_at', 'mnearto', 'mnexto',
        'monnear', 'mpickobj', 'noteleport_level', 'obj_extract_self', 'rloc',
        'rloc_to',
    ]);
});

test('the scans find environment reads and tacticsOps keys', () => {
    const source = [
        'const f = rawEnv.rlocTo;', // 1
        'const g = env?.monArrive;', // 2
        'const h = obj.rloc; // rawEnv.rloc in a comment',
        'await tactics(m, { ...env, tacticsOps: { rloc } });', // 4
    ].join('\n');
    assert.deepEqual(
        envReadFindings(source, OLD_OPERATIONS).map(({ line, name }) => `${line} ${name}`),
        ['1 rlocTo', '2 monArrive'],
    );
    assert.deepEqual(tacticsOpsFindings(source), [4]);
});
