// dungeon.c u_on_newpos() ends with earth_sense(), which can pline(), so
// js/dungeon.js u_on_newpos() is async. A caller that does not wait for it
// prints the dwarf's notice out of C's order, or after the caller's own
// output. Every call in js/ must therefore be awaited, apart from the one
// listed exception.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// Each u_on_newpos() call in `source` that is not awaited, as its line.
export function unawaitedCalls(source) {
    const code = source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/\/\/[^\n]*/gu, '');
    const lines = [];
    for (const match of code.matchAll(/(?<![\w.$])u_on_newpos\(/gu)) {
        const before = code.slice(Math.max(0, match.index - 40), match.index);
        if (/\bawait\s+$/u.test(before)) continue;
        if (/\bfunction\s+$/u.test(before)) continue;
        lines.push(code.slice(0, match.index).split('\n').length);
    }
    return lines;
}

test('every u_on_newpos() call in js/ is awaited', () => {
    const found = [];
    for (const file of readdirSync(JS_DIR).filter((name) => name.endsWith('.js')).sort()) {
        const source = readFileSync(join(JS_DIR, file), 'utf8');
        for (const line of unawaitedCalls(source)) {
            const text = source.split('\n')[line - 1].trim();
            found.push(`${file}: ${text}`);
        }
    }
    // teleport.js rloc_to_core() is synchronous until a call returns a
    // promise; it chains u_on_newpos() with thenResult() instead.
    assert.deepEqual(found, [
        'teleport.js: const placed = u_on_newpos(monster.mx, monster.my, state);',
    ]);
});

test('the scan finds an unawaited call and accepts awaited ones', () => {
    assert.deepEqual(unawaitedCalls([
        'export async function u_on_newpos(x, y) {}',
        'await u_on_newpos(1, 2, state);',
        'u_on_newpos(1, 2, state);', // 3
        '// u_on_newpos(1, 2) in a comment',
        'const p = u_on_newpos(1, 2, state);', // 5
    ].join('\n')), [3, 5]);
});
