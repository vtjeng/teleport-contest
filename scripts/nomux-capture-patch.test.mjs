import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const patch = readFileSync('nethack-c/patches/006-nomux-capture.patch', 'utf8');
const addedSource = patch.split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');

test('the nomux screen buffer covers every serializer transition', () => {
    const cellBytes = Number(addedSource.match(
        /^#define NOMUX_MAX_CELL_BYTES \(3 \* (\d+) \+ (\d+) \+ (\d+) \+ (\d+)\)$/mu,
    )?.slice(1).reduce((total, value, index) =>
        total + Number(value) * (index === 0 ? 3 : 1), 0));
    const rowEndBytes = Number(addedSource.match(
        /^#define NOMUX_MAX_ROW_END_BYTES (\d+)$/mu,
    )?.[1]);

    // The longest cell transition closes three 5-byte attributes, writes a
    // 6-byte foreground SGR, switches DEC mode, and writes one glyph.
    assert.equal(cellBytes, 23);
    // A row ends with the longest 5-byte reset and a newline or terminating NUL.
    assert.equal(rowEndBytes, 6);

    const rows = 24; // nomux_buf has one entry for each terminal row.
    const columns = 80; // nomux_buf has one entry for each terminal column.
    const required = rows * (columns * cellBytes + rowEndBytes);
    assert.match(addedSource, new RegExp(
        `^static char nomux_out\\[${rows} \\* \\(\\s*${columns} \\* NOMUX_MAX_CELL_BYTES\\s*`
        + '\\+ NOMUX_MAX_ROW_END_BYTES\\)\\];$',
        'mu',
    ));
    assert.equal(required, 44304);
});
