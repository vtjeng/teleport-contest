// Enforces the default-at-source rule for steal.c mpickobj(). C calls
// shk.c find_objowner() and subfrombill() for a billed object and reports a
// missing or attached object through pline.c impossible(). js/steal.js once
// took the first two from hooks its own pickupEnv() always filled in, refused
// with UnsupportedMonsterPickupOperationError when either or the visibility
// predicate (which pickupEnv() also always supplies) was absent, and printed
// the impossible() lines only through an `impossible` hook no caller gave.
// It now calls the shk.c functions itself and records impossible() as a gap.
// This check fails when those hooks or refusals return.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// The UnsupportedMonsterPickupOperationError refusals js/steal.js keeps, by
// operation, pinned both ways. reportObjectGoesOut: steal.c mpickobj()'s
// "%s out." line for an engulfer that picks up a lit object while the hero,
// who can see, is inside it. Only mpickobjRuntime() supplies the printer; no
// one has shown that no synchronous caller can reach that state.
const REMAINING_REFUSALS = { reportObjectGoesOut: 1 };

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

// Each mention of a removed hook or refusal in `source`. Other files have
// their own `impossible` hooks, so that read is looked for in js/steal.js
// alone (`withImpossible`).
export function removedHookFindings(source, withImpossible = true) {
    const code = stripComments(source);
    const findings = [];
    for (const pattern of [
        /(?<![\w$])findObjectOwner(?![\w$])/gu,
        /(?<![\w$])subFromBill(?![\w$])/gu,
        ...(withImpossible ? [/hooks\??\.impossible(?![\w$])/gu] : []),
        /UnsupportedMonsterPickupOperationError\(\s*'canSeeMonster'/gu,
    ]) {
        for (const match of code.matchAll(pattern))
            findings.push(`${lineOf(code, match.index)} ${match[0]}`);
    }
    return findings;
}

test('no game code names the removed mpickobj() hooks or refusals', () => {
    const findings = [];
    for (const file of readdirSync(JS_DIR).filter((name) => name.endsWith('.js')).sort()) {
        const source = readFileSync(join(JS_DIR, file), 'utf8');
        for (const finding of removedHookFindings(source, file === 'steal.js'))
            findings.push(`${file}:${finding}`);
    }
    assert.deepEqual(findings, []);
});

test('js/steal.js calls find_objowner() and subfrombill() for a billed pickup', () => {
    const code = stripComments(readFileSync(join(JS_DIR, 'steal.js'), 'utf8'));
    const body = code.slice(code.indexOf('export function mpickobj('));
    assert.match(body, /find_objowner\(obj, obj\.ox, obj\.oy, env\.state\)/u);
    assert.match(body, /subfrombill\(obj, owner, env\.state, env\)/u);
});

test('the remaining pickup refusals are pinned', () => {
    const code = stripComments(readFileSync(join(JS_DIR, 'steal.js'), 'utf8'));
    const counts = {};
    for (const match of code.matchAll(/requiredPickupOperation\(\s*env,\s*'(\w+)'/gu))
        counts[match[1]] = (counts[match[1]] ?? 0) + 1;
    assert.deepEqual(counts, REMAINING_REFUSALS);
    const throws = [...code.matchAll(/new UnsupportedMonsterPickupOperationError\(/gu)].length;
    assertExceptionCount(throws, 1, {
        what: 'UnsupportedMonsterPickupOperationError throw sites in js/steal.js',
        pin: 'the 1 in scripts/monster-pickup-callees.test.mjs',
    });
});

test('the scan finds the removed hooks', () => {
    const source = [
        "const hooks = { findObjectOwner: f };", // 1
        'plan.subFromBill(obj, owner, env);', // 2
        "env.hooks?.impossible('x');", // 3
        "throw new UnsupportedMonsterPickupOperationError('canSeeMonster', obj);", // 4
        '// findObjectOwner in a comment',
    ].join('\n');
    assert.deepEqual(removedHookFindings(source).map((line) => Number(line.split(' ')[0])),
        [1, 2, 3, 4]);
});
