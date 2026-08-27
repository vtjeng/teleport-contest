import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DATA_BASE_ENTRIES } from '../js/data_base_data.js';
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
