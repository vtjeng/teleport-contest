import assert from 'node:assert/strict';
import { statfsSync } from 'node:fs';
import test from 'node:test';

import { localTmpdir } from './local-tmpdir.mjs';

// 0x01021997 is V9FS_MAGIC, the Plan 9 (9P) filesystem type that WSL2 uses
// for DrvFS mounts of Windows drives.
const V9FS_MAGIC = 0x01021997;

test('returns a string that is a valid directory path', () => {
    const dir = localTmpdir();
    assert.equal(typeof dir, 'string');
    assert.ok(dir.length > 0);
});

test('returns a local path on this host', () => {
    // On this WSL2 host, /tmp is ext4 (0xEF53), not DrvFS.
    const dir = localTmpdir();
    const type = statfsSync(dir).type;
    assert.notEqual(type, V9FS_MAGIC,
        `localTmpdir() returned ${dir} which is on a DrvFS mount`);
});

test('does not return a /mnt/ path on a DrvFS mount', () => {
    // Verify the invariant that localTmpdir() either returns a non-/mnt/ path
    // or returns a /mnt/ path on a non-DrvFS filesystem.
    const dir = localTmpdir();
    if (dir.startsWith('/mnt/')) {
        const type = statfsSync(dir).type;
        assert.notEqual(type, V9FS_MAGIC,
            `localTmpdir() returned ${dir} on DrvFS — the fallback failed`);
    }
});
