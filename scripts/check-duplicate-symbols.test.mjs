// Cover scripts/check-duplicate-symbols.mjs against fixtures under
// scripts/fixtures/duplicate-symbols/. The fixtures, not js/, carry the
// duplicates, so the check can be proved to find them without the repository's
// own 282 keys having to stay at 282.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    definitionsIn,
    formatDuplicate,
    indexDefinitions,
    resolveRoots,
    symbolKey,
} from './check-duplicate-symbols.mjs';
import { sourceFilesIn } from './check-namespace-members.mjs';

const CHECK_PATH = fileURLToPath(
    new URL('./check-duplicate-symbols.mjs', import.meta.url));

const FIXTURE_DIR = fileURLToPath(
    new URL('./fixtures/duplicate-symbols', import.meta.url));

const FIXTURE = 'scripts/fixtures/duplicate-symbols';

test('one C name under two spellings folds to one key', () => {
    // obj.h is_weptool() was ported twice, once snake_case and once camelCase,
    // and neither copy knew about the other. Case and underscores therefore
    // cannot separate two definitions of one C function.
    assert.equal(symbolKey('is_weptool'), symbolKey('isWeptool'));
    assert.equal(symbolKey('IS_WEPTOOL'), symbolKey('isWeptool'));
    // Different letters stay different keys: only case and underscores fold.
    assert.notEqual(symbolKey('is_weptool'), symbolKey('is_weapon'));
});

test('every declaration form at column zero is a definition site', () => {
    const source = [
        'export const ALPHA = 1;',          // line 1
        'const beta = 2;',                  // line 2
        'export let gamma = 3;',            // line 3
        'export function delta() {}',       // line 4
        'async function epsilon() {}',      // line 5
        'export async function zeta() {}',  // line 6
        'export class Eta {}',              // line 7
        'class Theta {}',                   // line 8
    ].join('\n');

    assert.deepEqual(definitionsIn(source), [
        { name: 'ALPHA', kind: 'const', line: 1 },
        { name: 'beta', kind: 'const', line: 2 },
        { name: 'gamma', kind: 'const', line: 3 },
        { name: 'delta', kind: 'function', line: 4 },
        { name: 'epsilon', kind: 'function', line: 5 },
        { name: 'zeta', kind: 'function', line: 6 },
        { name: 'Eta', kind: 'class', line: 7 },
        { name: 'Theta', kind: 'class', line: 8 },
    ]);
});

test('indentation and keyword prefixes are not definition sites', () => {
    const source = [
        'function outer() {',
        '    const local = 1;',        // indented: local to outer()
        '    function inner() {}',     // indented: local to outer()
        '    class Inner {}',          // indented: local to outer()
        '}',
        'classify(x);',                // `class` is only a prefix here
        'constant(y);',                // so is `const`
        'const used = later;',         // a declaration with no initializer
        'let bare;',                   // is a binding, not a definition site
    ].join('\n');

    assert.deepEqual(definitionsIn(source), [
        { name: 'outer', kind: 'function', line: 1 },
        { name: 'used', kind: 'const', line: 8 },
    ]);
});

test('the fixture directory indexes three duplicated keys', async () => {
    const { duplicates, callable, definitions } =
        await indexDefinitions(sourceFilesIn(FIXTURE_DIR));

    // alpha.js: LEVITATION, is_weptool, SharedError, definedOnceOnly.
    // beta.js: quoted, isWeptool, Shared_Error, Levitation.
    assert.equal(definitions, 8);
    assert.deepEqual(duplicates, [
        {
            key: 'isweptool',
            sites: [
                { file: `${FIXTURE}/alpha.js`, line: 10,
                    name: 'is_weptool', kind: 'function' },
                { file: `${FIXTURE}/beta.js`, line: 17,
                    name: 'isWeptool', kind: 'function' },
            ],
        },
        {
            key: 'levitation',
            sites: [
                { file: `${FIXTURE}/alpha.js`, line: 8,
                    name: 'LEVITATION', kind: 'const' },
                { file: `${FIXTURE}/beta.js`, line: 23,
                    name: 'Levitation', kind: 'function' },
            ],
        },
        {
            key: 'sharederror',
            sites: [
                { file: `${FIXTURE}/alpha.js`, line: 14,
                    name: 'SharedError', kind: 'class' },
                { file: `${FIXTURE}/beta.js`, line: 21,
                    name: 'Shared_Error', kind: 'class' },
            ],
        },
    ]);
    // `levitation` pairs a constant with a function, which C usually keeps
    // apart -- LEVITATION indexes u.uprops and Levitation() tests it -- so it
    // is excluded from the count the checkpoint reports.
    assert.equal(callable, 2);
});

test('a definition quoted in a comment or a template is not a site',
    async () => {
        // beta.js quotes `function is_weptool`, `class SharedError`, and
        // `const LEVITATION` at column zero inside a block comment and a
        // template literal. A refusal comment quoting the C body it stands in
        // for is exactly that shape, and it is why this check reads the blanked
        // source rather than the raw text.
        const { duplicates } =
            await indexDefinitions(sourceFilesIn(FIXTURE_DIR));

        for (const { key, sites } of duplicates) {
            assert.equal(sites.length, 2,
                `${key} picked up a quoted definition`);
        }
    });

test('a duplicate line names every site, its spelling, and its kind', () => {
    assert.equal(
        formatDuplicate({
            key: 'isweptool',
            sites: [
                { file: 'js/mondata.js', line: 219,
                    name: 'is_weptool', kind: 'function' },
                { file: 'js/obj.js', line: 44,
                    name: 'isWeptool', kind: 'function' },
            ],
        }),
        'isweptool: js/mondata.js:219 is_weptool (function), '
            + 'js/obj.js:44 isWeptool (function)',
    );
});

test('the default root is js/ inside the repository', () => {
    const [root] = resolveRoots([]);

    // scripts/ is deliberately out of scope: its helpers repeat names across
    // scripts on purpose, and no C function is ported there.
    assert.equal(resolveRoots([]).length, 1);
    assert.equal(root.endsWith('/js'), true);
    // The fixtures live in a subdirectory, so the default scan never reads the
    // deliberately duplicated files above.
    assert.equal(
        sourceFilesIn(root).some((file) => file.includes('/fixtures/')),
        false,
    );
});

test('the command reports its findings and still exits zero', () => {
    // Informational by construction: a second definition is sometimes a
    // module-private helper that genuinely differs, so this check prints and
    // never blocks a commit.
    const run = spawnSync(process.execPath, [CHECK_PATH, FIXTURE],
        { encoding: 'utf8' });

    assert.equal(run.status, 0);
    assert.match(run.stdout, /^isweptool: .*alpha\.js:10 is_weptool/mu);
    assert.match(
        run.stdout,
        /^indexed 8 top-level definition\(s\) in 2 file\(s\); duplicate symbols: 3 \(2 defined only as functions or classes\)$/mu,
    );
});
