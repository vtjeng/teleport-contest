import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DATA_BASE_ENTRIES } from '../js/data_base_data.js';
import { SLIME_MOLD } from '../js/objects.js';
import {
    dataBaseEntry,
    normalizeDataBaseLookup,
} from '../js/pager.js';
import {
    parseDataBase,
    renderDataBaseData,
} from './generate-data-base.mjs';

const SOURCE_URL = new URL(
    '../nethack-c/upstream/dat/data.base', import.meta.url,
);

test('generated data.base entries match the pinned source projection', () => {
    const source = readFileSync(SOURCE_URL, 'utf8');
    const parsed = parseDataBase(source);

    // Independent source-pinned totals catch class-wide parser loss even
    // when somebody regenerates the output with the same faulty parser.
    assert.equal(parsed.length, 515);
    assert.equal(parsed.reduce((sum, entry) => sum + entry.keys.length, 0), 951);
    assert.equal(parsed.reduce((sum, entry) => sum + entry.lines.length, 0), 5409);
    assert.equal(parsed.reduce(
        (sum, entry) => sum + entry.lines.filter((line) => line === '').length,
        0,
    ), 133);

    assert.deepEqual(DATA_BASE_ENTRIES, parsed);
    assert.equal(
        readFileSync(
            new URL('../js/data_base_data.js', import.meta.url), 'utf8',
        ),
        renderDataBaseData(parsed),
    );

    const fountain = parsed.find((entry) => entry.keys.includes('fountain'));
    assert.deepEqual(fountain.keys, ['fountain']);
    // The source entry has fourteen poem lines and one attribution line.
    assert.equal(fountain.lines.length, 15);
    assert.equal(fountain.lines[0], 'Rest! This little Fountain runs');
    // pager.c removes one leading tab, then tabexpand() expands the second.
    assert.equal(
        fountain.lines.at(-1),
        '        [ For a Fountain, by Bryan Waller Procter ]',
    );

    const finalEntry = parsed.at(-1);
    assert.deepEqual(
        finalEntry.keys,
        ['novel', 'paperback book', 'discworld novel*'],
    );
    // The last source description precedes a comment and the final newline;
    // neither is a blank encyclopedia line.
    assert.equal(finalEntry.lines.at(-1), "  The Shepherd's Crown");
});

test('data.base parser retains key groups, comments, blanks, tabs, and EOF', () => {
    assert.deepEqual(parseDataBase([
        'alpha*',
        '~alpha excluded',
        '# comment between keys and text',
        '\tfirst line',
        '',
        '\t\tsecond tabbed line',
        '# trailing comment',
        'final',
        '        final text without newline',
    ].join('\n')), [
        {
            keys: ['alpha*', '~alpha excluded'],
            lines: ['first line', '', '        second tabbed line'],
        },
        { keys: ['final'], lines: ['final text without newline'] },
    ]);
});

test('data.base wildcard matching honors exclusions before later entries', () => {
    const quarterstaff = dataBaseEntry('quarterstaff');
    assert.deepEqual(quarterstaff.keys, ['~*aesculapius', '*staff']);
    assert.equal(
        quarterstaff.lines.at(-1),
        '        [ The Merry Adventures of Robin Hood, by Howard Pyle ]',
    );

    // The leading '~*aesculapius' key excludes this name from the broad
    // '*staff' entry, so the later artifact-specific entry must win.
    const artifact = dataBaseEntry('staff of aesculapius');
    assert.deepEqual(artifact.keys, ['*staff of aesculapius']);
    // The artifact-specific source entry has five description lines.
    assert.equal(artifact.lines.length, 5);

    // The source's '~orc ??m*' key excludes "orc zombie" before its broad
    // 'orc*' key, so the later '*zombi*' entry supplies the description.
    const orcZombie = dataBaseEntry('orc zombie');
    assert.equal(orcZombie.keys.includes('orc*'), false);
    assert.equal(orcZombie.keys.includes('*zombi*'), true);
});

test('checkfile lookup normalization preserves pager.c prefix ordering', () => {
    const cases = [
        // Each input chooses a distinct pager.c prefix or suffix branch.
        [
            '2 blessed partly used +3 quarterstaves (lit)',
            { base: 'quarterstaves', alt: 'quarterstaff' },
        ],
        ['interior of a fountain', { base: 'fountain', alt: 'fountain' }],
        ['moist towel', { base: 'wet towel', alt: 'wet towel' }],
        [
            'a pair of lenses named The Eyes of the Overworld',
            { base: 'lenses', alt: 'eyes of the overworld' },
        ],
        ['statue of a newt', { base: 'statue', alt: 'statue' }],
        ['figurine of a newt', { base: 'figurine', alt: 'figurine' }],
    ];
    for (const [input, expected] of cases)
        assert.deepEqual(normalizeDataBaseLookup(input), expected, input);
});

test('checkfile lookup of the fruit name reads newstr after strcpy()', () => {
    // initoptions_finish() has renamed SLIME_MOLD "fruit", and the default
    // fruit option adds "slime mold" as fid 1.
    const obj_descr = [];
    obj_descr[SLIME_MOLD] = { oc_name: 'fruit' };
    const state = {
        gf: { ffruit: { fname: 'slime mold', fid: 1, nextf: null } },
        obj_descr,
    };
    const cases = [
        // No prefix: dbase_str is newstr itself, so it reads "fruit" too and
        // C runs a single pass instead of also showing the slime mold entry.
        ['slime mold', { base: 'fruit', alt: 'fruit' }],
        // "a " leaves dbase_str two bytes into the copied "fruit".
        ['a slime mold', { base: 'uit', alt: 'fruit' }],
        // "some " lands on the terminator strcpy() wrote after "fruit".
        ['some slime mold', { base: '', alt: 'fruit' }],
        // "uncursed " (9 bytes) starts past the 6 bytes strcpy() wrote.
        ['uncursed slime mold', { base: 'slime mold', alt: 'fruit' }],
    ];
    for (const [input, expected] of cases) {
        assert.deepEqual(
            normalizeDataBaseLookup(input, state), expected, input,
        );
    }
    // The entry shown for the typed fruit name is the generic fruit entry.
    assert.deepEqual(dataBaseEntry('fruit').keys, ['fruit', 'fruitname']);
    // An empty name is not looked up at all.
    assert.equal(normalizeDataBaseLookup('the ', state), null);
});
