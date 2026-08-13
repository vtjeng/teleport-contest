// Cover scripts/check-relative-imports.mjs. The fixtures under
// scripts/fixtures/relative-imports/ carry the rejected cases, so the check can
// be proved to fail without putting a broken specifier in js/.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { sourceFilesIn } from './check-namespace-members.mjs';
import {
    checkFiles,
    findSpecifiers,
    isRelativeSpecifier,
    resolveRoots,
} from './check-relative-imports.mjs';

const CHECK_PATH = fileURLToPath(
    new URL('./check-relative-imports.mjs', import.meta.url));

function fixtureDir(name) {
    return fileURLToPath(
        new URL(`./fixtures/relative-imports/${name}`, import.meta.url));
}

test('the three importing forms are all found, with their lines', () => {
    const source = [
        "import { a } from './one.js';", // line 1: named import
        "export * from './two.js';", //     line 2: star re-export
        "import './three.js';", //          line 3: bare side-effect import
        "await import('./four.js');", //    line 4: dynamic import
        'import {', //                      lines 5-7: one multi-line statement
        '    b,',
        "} from './five.js';",
    ].join('\n');

    const found = findSpecifiers(source);

    assert.deepEqual(found, [
        { specifier: './one.js', line: 1, computed: false },
        { specifier: './two.js', line: 2, computed: false },
        { specifier: './three.js', line: 3, computed: false },
        { specifier: './four.js', line: 4, computed: false },
        // The specifier of a multi-line import is reported at the line the
        // specifier itself sits on, which is where a reader has to edit.
        { specifier: './five.js', line: 7, computed: false },
    ]);
});

test('an import written in a comment or a string does not register', () => {
    const source = [
        "// import { x } from 'node:fs';", //  a comment
        'const doc = "import y from \'lodash\';";', // a string
        'const t = `import z from "node:os";`;', //    template text
        "import { real } from './real.js';", //        the only real import
    ].join('\n');

    const found = findSpecifiers(source);

    // Blanking is what keeps the first three lines out. Without it the check
    // would fail on its own documentation.
    assert.deepEqual(found, [
        { specifier: './real.js', line: 4, computed: false },
    ]);
});

test('import() with a computed specifier is reported rather than passed', () => {
    const source = 'const load = (name) => import(name);';

    const found = findSpecifiers(source);

    // A computed argument can reach any module, and no textual scan can say
    // which, so the check refuses it instead of assuming it is relative.
    assert.deepEqual(found, [
        { specifier: null, line: 1, computed: true },
    ]);
});

test('only ./ and ../ count as relative', () => {
    assert.equal(isRelativeSpecifier('./gstate.js'), true);
    assert.equal(isRelativeSpecifier('../js/gstate.js'), true);
    // A Node builtin: resolves in Node, not in Chrome.
    assert.equal(isRelativeSpecifier('node:fs'), false);
    // A bare specifier: needs node_modules or an import map, and a scored run
    // has neither.
    assert.equal(isRelativeSpecifier('lodash'), false);
    // An absolute path and a URL both name something outside the submission.
    assert.equal(isRelativeSpecifier('/opt/thing.js'), false);
    assert.equal(isRelativeSpecifier('https://cdn.example/x.js'), false);
    // `.` alone is a directory specifier, which needs a resolver that reads
    // package.json, so it is not one of the two accepted forms.
    assert.equal(isRelativeSpecifier('.'), false);
});

test('the fixtures separate an accepted directory from a rejected one',
    async () => {
        const clean = await checkFiles(sourceFilesIn(fixtureDir('clean')));

        assert.deepEqual(clean.problems, []);
        // consumer.js has four specifiers -- named, bare, re-export, dynamic --
        // and helper.js has none.
        assert.equal(clean.specifiers, 4);

        const rejected = await checkFiles(
            sourceFilesIn(fixtureDir('non-relative')));

        // builtin.js line 5 imports 'node:fs/promises' and line 6 'lodash'.
        assert.deepEqual(rejected.problems, [
            'scripts/fixtures/relative-imports/non-relative/builtin.js:5: '
                + "'node:fs/promises' is not a relative specifier; js/ must "
                + "import only './' paths",
            'scripts/fixtures/relative-imports/non-relative/builtin.js:6: '
                + "'lodash' is not a relative specifier; js/ must import only "
                + "'./' paths",
        ]);
    });

test('the command exits nonzero and names the offending specifier', () => {
    const failing = spawnSync(process.execPath,
        [CHECK_PATH, fixtureDir('non-relative')], { encoding: 'utf8' });

    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /'node:fs\/promises' is not a relative/u);
    assert.match(failing.stdout, /non-relative specifiers: 2/u);

    const passing = spawnSync(process.execPath,
        [CHECK_PATH, fixtureDir('clean')], { encoding: 'utf8' });

    assert.equal(passing.status, 0);
    assert.match(passing.stdout, /non-relative specifiers: 0/u);
});

test('the default root is js/, not scripts/', () => {
    // scripts/ imports node: builtins everywhere and never ships to the judge,
    // so scanning it would report the tooling as broken.
    const roots = resolveRoots([]);

    assert.equal(roots.length, 1);
    assert.equal(roots[0].endsWith('/js'), true);
});

test('js/ imports nothing that is not a relative path', async () => {
    // This is the gate `npm run check:relative-imports` runs, and the reason
    // the check exists: the judge imports js/ in Node with no node_modules and
    // in Chrome with no import map, so one bare specifier fails the whole
    // submission at load time.
    const files = resolveRoots([]).flatMap(sourceFilesIn);
    const { problems, specifiers } = await checkFiles(files);

    assert.deepEqual(problems, []);
    // A regex that matched nothing would also report no problem. js/ held
    // 1,623 specifiers across 149 files on 12 August 2026; the floor is half
    // that, so ordinary growth and deletion do not touch it but a scan gone
    // blind does.
    assert.ok(specifiers > 800,
        `expected the scan to see js/ specifiers, saw ${specifiers}`);
});
