import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    HELP_TEXT_FILE_HASHES,
    HELP_TEXT_FILES,
} from '../js/help_data.js';
import {
    buildHelpTextFiles,
    parseHelpTextFile,
    renderHelpTextData,
} from './generate-help-data.mjs';

const SOURCE_HASHES = Object.freeze({
    // These hashes pin all seven tty_display_file() inputs at revision
    // 16ff591. A changed source file must be inspected before regeneration.
    help: '3d4fb64efc31a3ad05c5ea850d74ee59094028dcab6ce234027c6d38c57bc836',
    hh: '17fdf371fdeba0eeadec3c97c860518b43c40b4f56aa91b3fc67e2ce4b297b9c',
    history: 'f1dbd5d61b8782c15250794fc9a0571f544d86d6f45f2206e3ed9de8716b34f9',
    opthelp: '7a3b869c0c4880a5ed67be470da21e431c043d614e29f91d4e16e35290d20bd9',
    optmenu: '5304773c5c9ccd827160a7d4bcf34420c280be2a19b3353785c2362290730e13',
    usagehlp: '8228338c4817f6b0661b2cc98e84e660a365ce24170a02a381fca04ebb1ad5b3',
    license: '93a3ae2cb8dee482daddfaebe53bcffe5b114b603def19b4dca21621cbc5a747',
});

const SOURCE_LINE_COUNTS = Object.freeze({
    // wc -l over the pinned inputs gives these counts. Each file ends in a
    // newline, which tty_display_file() removes before displaying the line.
    help: 214,
    hh: 160,
    history: 401,
    opthelp: 393,
    optmenu: 43,
    usagehlp: 139,
    license: 95,
});

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

test('generated help text exactly projects the seven pinned data files', () => {
    for (const [filename, expectedHash] of Object.entries(SOURCE_HASHES)) {
        const source = readFileSync(
            new URL(`../nethack-c/upstream/dat/${filename}`, import.meta.url),
        );
        assert.equal(sha256(source), expectedHash, filename);
    }

    const generated = buildHelpTextFiles();
    assert.deepEqual(generated, HELP_TEXT_FILES);
    assert.deepEqual(HELP_TEXT_FILE_HASHES, SOURCE_HASHES);
    assert.deepEqual(
        Object.fromEntries(Object.entries(generated).map(
            ([filename, lines]) => [filename, lines.length],
        )),
        SOURCE_LINE_COUNTS,
    );
    assert.equal(
        readFileSync(new URL('../js/help_data.js', import.meta.url), 'utf8'),
        renderHelpTextData(generated),
    );
});

test('help text parsing preserves blank lines and follows C tab expansion', () => {
    // The first tab starts at column 0 and the second starts at column 9, so
    // hacklib.c tabexpand() advances them to columns 8 and 16 respectively.
    assert.deepEqual(
        parseHelpTextFile('\tA\tB\n\nlast line\n', 'synthetic'),
        ['        A       B', '', 'last line'],
    );
});
