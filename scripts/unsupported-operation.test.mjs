// Pins every place game code supplies or reads an `unsupported` operation.
//
// Callers used to hand an `unsupported` refusal to callees that never invoked
// it: the kill path (xkilled(), killed(), monkilled()), flooreffects(),
// unstuck(), m_detach(), mintrap(), dotrap(), thitmonst(), damageum() and
// more. Such a key is a copy of a refusal that no input can reach, and a
// requirement for it refuses a caller that omits a value nobody uses. Both
// are deleted.
//
// mcastu.js castmu() refused its AD_FIRE arm through one, which mattacku()
// and the dochug() operation bundle supplied; the arm is now ported, so no
// `unsupported` operation remains in js/.
//
// quest.js expulsion(seal) refused its sealing arm through one, which its
// quest_chat() and quest_talk() callers had to supply; no C caller passes
// seal = TRUE, and the arm is now ported, so quest.c needs none.
//
// The pin counts, per file, the object keys (`unsupported:`), values passed
// on (`{ unsupported }`, `f(x, unsupported)`), property reads
// (`env.unsupported`) and requirements (`require*(env, 'unsupported')`).
// Lower a count when a site goes; adding one needs a reader that invokes it.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

const REMAINING_UNSUPPORTED = {};

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

const PATTERNS = [
    ['key', /(?<![\w.$?])unsupported\s*:/gu],
    ['value', /(?<![\w.$'"`])unsupported\s*(?=[,})\]])/gu],
    ['read', /\.unsupported\b/gu],
    ['requirement', /['"]unsupported['"]/gu],
];

// Each place `source` supplies or reads an `unsupported` operation.
export function unsupportedFindings(source) {
    const code = stripComments(source);
    const findings = [];
    for (const [kind, pattern] of PATTERNS) {
        for (const match of code.matchAll(pattern))
            findings.push({ kind, line: lineOf(code, match.index) });
    }
    return findings.sort((a, b) => a.line - b.line);
}

function jsSources() {
    return readdirSync(JS_DIR)
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => [file, readFileSync(join(JS_DIR, file), 'utf8')]);
}

test('the remaining unsupported suppliers and readers are pinned', () => {
    const found = {};
    for (const [file, source] of jsSources()) {
        const findings = unsupportedFindings(source);
        if (findings.length) found[file] = findings;
    }
    const files = new Set([...Object.keys(found), ...Object.keys(REMAINING_UNSUPPORTED)]);
    for (const file of [...files].sort()) {
        const findings = found[file] ?? [];
        const lines = findings.map(({ kind, line }) => `${line} ${kind}`).join(', ');
        assertExceptionCount(findings.length, REMAINING_UNSUPPORTED[file] ?? 0, {
            what: `unsupported suppliers and readers in js/${file} (${lines || 'none'})`,
            pin: `REMAINING_UNSUPPORTED['${file}'] in scripts/unsupported-operation.test.mjs`,
        });
    }
});

test('the scan finds keys, values, reads and requirements', () => {
    const source = [
        'const env = { unsupported: (r) => fail(r) };', // 1 key
        'const next = { ...env, unsupported };', // 2 value
        'killed(mon, state, { random, unsupported, message });', // 3 value
        'f(x, unsupported)', // 4 value
        'if (typeof env.unsupported !== "function") return;', // 5 read
        'ops?.unsupported(reason);', // 6 read
        "const refuse = requireOperation(env, 'unsupported');", // 7 requirement
        '    unsupported: env.unsupported', // 8 key and read
    ].join('\n');
    assert.deepEqual(
        unsupportedFindings(source).map(({ kind, line }) => `${line} ${kind}`),
        ['1 key', '2 value', '3 value', '4 value', '5 read', '6 read',
            '7 requirement', '8 key', '8 read'],
    );
});

test('the scan ignores comments, text, local calls and definitions', () => {
    const source = [
        'function unsupported(reason) {',
        '    throw new UnsupportedSimpleMonsterActionError(reason);',
        '}',
        "if (frozen) unsupported('inconsistent frozen monster state');",
        '// unsupported: an old key in a comment',
        '/* { unsupported } */',
        'super(`unsupported level change: ${reason}`);',
        "pline('Your cloak falls, unsupported!');",
        'const x = cond ? unsupportedValue : other;',
    ].join('\n');
    assert.deepEqual(unsupportedFindings(source), []);
});
