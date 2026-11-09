// Refusal classes deleted once their last throw site was shown unreachable
// must not return. Each class below stood in for a state that no production
// caller creates (a light source type C never uses, an armor slot holding the
// wrong kind of item, a spell or wand with no case); the C behaviour at those
// sites is now ported, or is C's own impossible(). A path that really is
// unported records the gap with note_unported() (AGENTS.md, "Keep each source
// file's port in one place"), so none of these names has a use in js/.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

export const DELETED_REFUSAL_CLASSES = [
    'UnsupportedLightOperationError', // light.c new_light_source() type check
];

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

// Each line of `source` that names one of `names` outside a comment.
export function classNameFindings(source, names = DELETED_REFUSAL_CLASSES) {
    const findings = [];
    const lines = stripComments(source).split('\n');
    for (const name of names) {
        const pattern = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, 'u');
        lines.forEach((line, index) => {
            if (pattern.test(line)) findings.push({ name, line: index + 1 });
        });
    }
    return findings.sort((a, b) => a.line - b.line);
}

test('no deleted refusal class returns to js/', () => {
    const findings = [];
    for (const file of readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort()) {
        const source = readFileSync(join(JS_DIR, file), 'utf8');
        for (const { name, line } of classNameFindings(source))
            findings.push(`${file}:${line} ${name}`);
    }
    assert.deepEqual(findings, []);
});

test('the scan finds definitions, throws, imports and instanceof tests', () => {
    const name = DELETED_REFUSAL_CLASSES[0];
    const source = [
        `export class ${name} extends Error {}`, // 1
        `throw new ${name}('x');`, // 2
        `import { ${name} } from './light.js';`, // 3
        `if (error instanceof ${name}) return;`, // 4
        `// ${name} in a comment`,
        `/* ${name} */`,
        `const other = ${name}Extra;`,
    ].join('\n');
    assert.deepEqual(classNameFindings(source).map(({ line }) => line), [1, 2, 3, 4]);
});
