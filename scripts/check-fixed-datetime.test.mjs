// Cover scripts/check-fixed-datetime.mjs. The fixtures under
// scripts/fixtures/fixed-datetime/ carry the rejected cases, so the check can
// be proved to fail without putting a malformed datetime in a real test.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    checkFiles,
    datetimeSourcesIn,
    findDatetimeSites,
    findRecipeDatetimes,
    resolveRoots,
    stringConstants,
} from './check-fixed-datetime.mjs';

const CHECK_PATH = fileURLToPath(
    new URL('./check-fixed-datetime.mjs', import.meta.url));

function fixtureDir(name) {
    return fileURLToPath(
        new URL(`./fixtures/fixed-datetime/${name}`, import.meta.url));
}

test('every shape that carries a datetime into the game is found', () => {
    const source = [
        "const DT = '20260304100000';", //          line 1: the constant
        "const datetime = '20240229060000';", //    line 2: the shorthand's
        'const segments = [', //                    lines 3-7: one array
        "    { datetime: '20401231235958' },", //    line 4: a direct literal
        '    { datetime: DT },', //                 line 5: through a constant
        '    { datetime },', //                     line 6: the shorthand
        "    { fixedDatetime: '20240729235958' },", // line 7: the state field
        '];',
        'game.fixedDatetime = DT;', //              line 9: the assignment form
    ].join('\n');

    assert.deepEqual(findDatetimeSites(source), [
        // The shorthand on line 6 reads this variable, so checking the
        // declaration covers the shorthand as well; that is why the scan needs
        // no pattern of its own for `{ datetime }`.
        {
            key: 'datetime',
            line: 2,
            via: null,
            values: ['20240229060000'],
        },
        { key: 'datetime', line: 4, via: null, values: ['20401231235958'] },
        { key: 'datetime', line: 5, via: 'DT', values: ['20260304100000'] },
        {
            key: 'fixedDatetime',
            line: 7,
            via: null,
            values: ['20240729235958'],
        },
        { key: 'fixedDatetime', line: 9, via: 'DT', values: ['20260304100000'] },
    ]);
});

test('a datetime in a comment or a string does not register', () => {
    const source = [
        "// datetime: '2026-03-04 10:00:00'", //           a comment
        'const doc = "datetime: \'2026-03-04\'";', //      a string
        'const tpl = `fixedDatetime: \'2026-03\'`;', //    template text
        "const real = { datetime: '20260304100000' };", // the only real site
    ].join('\n');

    // Blanking is what keeps the first three lines out. Without it the check
    // would fail on prose that merely quotes the shape it rejects, including
    // its own header comment.
    assert.deepEqual(findDatetimeSites(source), [
        { key: 'datetime', line: 4, via: null, values: ['20260304100000'] },
    ]);
});

test('a value the scan cannot read is reported rather than guessed', () => {
    const source = [
        'function run(datetime) {', //     line 1: a parameter, declared here
        '    return [', //
        '        { datetime },', //        line 3: the parameter, by shorthand
        '        { datetime: datetime },', //   line 4: the parameter, keyed
        '        { datetime: segment.datetime },', // line 5: a member read
        '        { datetime: `${prefix}0000` },', //  line 6: a template
        '    ];', //
        '}',
    ].join('\n');

    // No site carries a readable value, so none may be checked and none may
    // fail. `segment.datetime` on line 5 is the shape that matters: read as a
    // bare identifier it would look like a constant named `segment`. Lines 1
    // and 3 name the parameter without assigning to it, so neither is a site.
    assert.deepEqual(
        findDatetimeSites(source).map(({ line, via, values }) =>
            ({ line, via, values })),
        [
            { line: 4, via: 'datetime', values: [] },
            { line: 5, via: null, values: [] },
            { line: 6, via: null, values: [] },
        ],
    );
});

test('a constant declared twice contributes both of its values', () => {
    // A second declaration must not be able to hide a malformed first one, so
    // resolution keeps every value the name is declared with.
    const source = [
        "const DT = '20260304100000';",
        "const DT = '2026-03-04';",
    ].join('\n');

    assert.deepEqual(
        stringConstants(source).get('DT'),
        new Set(['20260304100000', '2026-03-04']),
    );
});

test('a recipe datetime is found at any depth, with its key path', () => {
    const recipe = {
        version: 5,
        segments: [
            { datetime: '20260304100000' },
            { datetime: '20401231235958', nested: { datetime: '20240229060000' } },
        ],
    };

    assert.deepEqual(findRecipeDatetimes(recipe), [
        { path: 'segments/0/datetime', value: '20260304100000' },
        { path: 'segments/1/datetime', value: '20401231235958' },
        { path: 'segments/1/nested/datetime', value: '20240229060000' },
    ]);
});

test('the malformed fixtures are all refused, and the clean ones are not',
    async () => {
        const malformed = await checkFiles(
            datetimeSourcesIn(fixtureDir('malformed')));

        // Four in the source and two in the recipe. Each is a distinct way to
        // reach calendar.c getnow()'s wall-clock fall-through.
        assert.equal(malformed.problems.length, 6);
        assert.equal(malformed.unresolved, 0);
        assert.match(malformed.problems[0], /rejected\.mjs:10: datetime '2026-03-04 10:00:00'/u);
        // Fourteen digits are necessary but not sufficient: February 30 is no
        // instant, and js/calendar.js rejects it rather than normalizing.
        assert.match(malformed.problems[1], /rejected\.mjs:13: datetime '20240230010203'/u);
        // A site reached through a constant names that constant, because the
        // line the check reports is not where the value has to be edited.
        assert.match(malformed.problems[2], /rejected\.mjs:15: datetime, from DATETIME,/u);
        // The assignment form, and a width other than fourteen.
        assert.match(malformed.problems[3], /rejected\.mjs:21: fixedDatetime '20260304'/u);
        assert.match(malformed.problems[4], /rejected\.session\.json: segments\/1\/datetime/u);
        // A JSON number would satisfy the digit pattern after coercion, so it
        // is refused on its type instead.
        assert.match(malformed.problems[5], /segments\/2\/datetime is a number/u);

        const clean = await checkFiles(datetimeSourcesIn(fixtureDir('clean')));
        assert.deepEqual(clean.problems, []);
        // Four in the source and two in the recipe, so the clean fixture is
        // proved to have been read rather than skipped.
        assert.equal(clean.checked, 6);
        assert.equal(clean.unresolved, 0);
    });

test('every datetime in this repository reaches the fixed clock', async () => {
    const files = resolveRoots([]).flatMap(datetimeSourcesIn);
    const { problems, checked } = await checkFiles(files);

    assert.deepEqual(problems, []);
    // A floor, not the exact count, so adding a test does not fail this. It
    // fails if the scan stops matching: the tree held 663 readable datetimes
    // when this check was written.
    assert.ok(checked > 600, `only ${checked} datetimes were read`);
});

test('the check exits nonzero on a malformed datetime', () => {
    const result = spawnSync(
        process.execPath, [CHECK_PATH, fixtureDir('malformed')],
        { encoding: 'utf8' },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /unparseable: 6/u);
    assert.match(result.stderr, /getnow\(\) falls back to the wall clock/u);

    // The same command over the corrected form succeeds, which is the whole
    // difference between the two fixture directories.
    const clean = spawnSync(
        process.execPath, [CHECK_PATH, fixtureDir('clean')],
        { encoding: 'utf8' },
    );
    assert.equal(clean.status, 0);
    assert.match(clean.stdout, /unparseable: 0/u);
});
