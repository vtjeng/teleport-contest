// Cover scripts/check-namespace-members.mjs against fixtures under
// scripts/fixtures/namespace-members/. The fixtures, not js/, carry the broken
// cases, so the check can be proved to fail without breaking the game.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    blankCommentsAndStrings,
    checkFiles,
    resolveRoots,
    sourceFilesIn,
} from './check-namespace-members.mjs';

const CHECK_PATH = fileURLToPath(
    new URL('./check-namespace-members.mjs', import.meta.url));

function fixtureDir(name) {
    return fileURLToPath(
        new URL(`./fixtures/namespace-members/${name}`, import.meta.url));
}

async function checkFixture(name) {
    return checkFiles(sourceFilesIn(fixtureDir(name)));
}

test('a fully resolved namespace import reports no problem', async () => {
    const { problems, notes, imports, accesses } = await checkFixture('clean');

    assert.deepEqual(problems, []);
    assert.deepEqual(notes, []);
    // clean/consumer.js has the single namespace import in the directory.
    assert.equal(imports, 1);
    // NS.ALPHA inside the template substitution, then NS.ALPHA, NS.beta,
    // NS.delta, and NS.EPSILON in useEverything(). The commented, quoted,
    // template-text, regular-expression, and `wrapper.NS.` spellings must not
    // be counted.
    assert.equal(accesses, 5);
});

test('an access to a name the module does not export fails the check',
    async () => {
        const { problems } = await checkFixture('missing');

        // OMEGA and PSI are absent from exports/exporter.js; ALPHA is present.
        // OMEGA is read twice and must still be reported once, at its first
        // line. missing/consumer.js line 9 is `value === NS.OMEGA` and line 10
        // is `value === NS.PSI`.
        assert.deepEqual(problems, [
            'scripts/fixtures/namespace-members/missing/consumer.js:9: '
                + "NS.OMEGA is not exported by '../exports/exporter.js'",
            'scripts/fixtures/namespace-members/missing/consumer.js:10: '
                + "NS.PSI is not exported by '../exports/exporter.js'",
        ]);
    });

test('star re-exports and renamed exports count as exported', async () => {
    // clean/consumer.js reads NS.EPSILON, which exporter.js only provides
    // through `export * from './nested.js'`, and NS.delta, which it provides
    // through `export { gamma as delta }`. A scan that read export
    // declarations textually would report both as missing.
    const { problems } = await checkFixture('clean');

    assert.deepEqual(problems, []);
});

test('shadowing, computed access, and an absent module are separated',
    async () => {
        const { problems, notes, computed } =
            await checkFixture('unverifiable');

        // Only absent-module.js fails: its specifier resolves to no file, so
        // the check cannot verify anything about it and says so.
        assert.equal(problems.length, 1);
        assert.match(
            problems[0],
            /unverifiable\/absent-module\.js: cannot load '\.\/no-such-module\.js' for namespace NS/u,
        );

        // shadowed.js redeclares NS inside inner(), so the whole file is
        // skipped with a note rather than reported.
        assert.equal(notes.length, 1);
        assert.match(notes[0], /shadowed\.js: skipped NS .* also declared/u);

        // computed.js has two `NS[...]` reads, neither of which names a member
        // in the source text.
        assert.equal(computed, 2);
    });

test('comments, strings, and regular expressions are blanked in place', () => {
    const source = [
        '// M.GONE',
        'const s = "M.GONE";',
        'const r = /M.GONE/u;',
        'const t = `M.GONE`;',
        '/* M.GONE */',
        'const kept = M.REAL;',
        'const sub = `text ${M.ALSO_REAL} more`;',
    ].join('\n');

    const blanked = blankCommentsAndStrings(source);

    // Every M.GONE spelling sits in a comment, a string, a regular expression,
    // or template text, so none of them reaches the member scan.
    assert.equal(blanked.includes('M.GONE'), false);
    // Code inside `${...}` is still code and stays visible, as does plain code.
    assert.equal(blanked.includes('M.REAL'), true);
    assert.equal(blanked.includes('M.ALSO_REAL'), true);
    // Blanking replaces characters rather than removing them, so reported line
    // numbers still match the original file.
    assert.equal(blanked.length, source.length);
    assert.equal(blanked.split('\n').length, source.split('\n').length);
});

test('an import spelled out inside a string is not treated as an import',
    async () => {
        // This very test file contains the literal below, so the scan of
        // scripts/ would otherwise resolve './monsters.js' relative to
        // scripts/ and fail on a module that does not exist there.
        const decoy = "import * as M from './monsters.js';";

        assert.equal(blankCommentsAndStrings(decoy).includes('monsters'),
            false);
        const { problems } = await checkFiles(
            [fileURLToPath(import.meta.url)]);
        assert.deepEqual(problems, []);
    });

test('the default roots are js/ and scripts/ inside the repository', () => {
    const [js, scripts] = resolveRoots([]);

    assert.equal(js.endsWith('/js'), true);
    assert.equal(scripts.endsWith('/scripts'), true);
    // Fixtures live in a subdirectory, so the default scan never reads the
    // deliberately broken files above.
    assert.equal(
        sourceFilesIn(scripts).some((file) => file.includes('/fixtures/')),
        false,
    );
});

test('the command exits nonzero and names the offending access', () => {
    const failing = spawnSync(process.execPath, [CHECK_PATH,
        fixtureDir('missing')], { encoding: 'utf8' });

    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /NS\.OMEGA is not exported/u);
    assert.match(failing.stdout, /missing namespace members: 2/u);

    const passing = spawnSync(process.execPath, [CHECK_PATH,
        fixtureDir('clean')], { encoding: 'utf8' });

    assert.equal(passing.status, 0);
    assert.match(passing.stdout, /missing namespace members: 0/u);
});

test('the repository itself has no missing namespace member', async () => {
    // This is the gate `npm run check:namespace-members` runs. Keeping it in
    // the suite means a stray `M.AD_FOO` fails `npm test` too.
    const files = resolveRoots([]).flatMap(sourceFilesIn);
    const { problems } = await checkFiles(files);

    assert.deepEqual(problems, []);
});
