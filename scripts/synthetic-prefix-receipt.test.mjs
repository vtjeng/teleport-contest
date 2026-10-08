import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyWithPrefixReceipt } from './synthetic-prefix-receipt.mjs';

test('prefix receipts reuse only successful unchanged inputs and the exact boundary', async t => {
    const root = mkdtempSync(join(tmpdir(), 'prefix-receipt-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });
    git('init', '--quiet');
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    mkdirSync(join(root, 'js'));
    writeFileSync(join(root, 'js/engine.js'), 'original');
    git('add', '.gitignore', 'js/engine.js');
    git('commit', '--quiet', '-m', 'Replay inputs');
    // The later boundary must not reuse evidence covering only the initial step.
    const boundary = { case: 'v1/sample', segment: 0, throughStep: 0 };
    let replays = 0;
    const replay = async () => { replays++; };
    await verifyWithPrefixReceipt(root, boundary, replay);
    await verifyWithPrefixReceipt(root, boundary, replay);
    assert.equal(replays, 1);
    writeFileSync(join(root, 'GOALS.json'), '{}'); // Closure writes leave execution unchanged.
    await verifyWithPrefixReceipt(root, boundary, replay);
    assert.equal(replays, 1);
    await verifyWithPrefixReceipt(root, { ...boundary, throughStep: 1 }, replay);
    assert.equal(replays, 2);
    writeFileSync(join(root, 'js/engine.js'), 'dirty');
    await verifyWithPrefixReceipt(root, boundary, replay);
    await verifyWithPrefixReceipt(root, boundary, replay);
    assert.equal(replays, 4); // Dirty code neither reads nor writes receipts.
    git('add', 'js/engine.js'); git('commit', '--quiet', '-m', 'Changed inputs');
    await verifyWithPrefixReceipt(root, boundary, replay);
    assert.equal(replays, 5);
    const directory = join(root, '.cache/synthetic-prefix-receipts');
    for (const name of readdirSync(directory)) writeFileSync(join(directory, name), '{');
    await verifyWithPrefixReceipt(root, boundary, replay);
    assert.equal(replays, 6); // Corrupt storage cannot establish a match.
    const failed = { ...boundary, segment: 1 };
    for (const _attempt of ['first', 'retry'])
        await assert.rejects(verifyWithPrefixReceipt(root, failed, async () => {
            throw new Error('mismatch');
        }), /mismatch/);
    await verifyWithPrefixReceipt(root, failed, replay);
    assert.equal(replays, 7); // A failed replay never supplies the retry's receipt.
    const previous = process.env.TELEPORT_PREFIX_RECEIPT_TEST;
    try {
        process.env.TELEPORT_PREFIX_RECEIPT_TEST = 'changed runtime environment';
        await verifyWithPrefixReceipt(root, failed, replay);
        assert.equal(replays, 8);
    } finally {
        if (previous === undefined) delete process.env.TELEPORT_PREFIX_RECEIPT_TEST;
        else process.env.TELEPORT_PREFIX_RECEIPT_TEST = previous;
    }
    await verifyWithPrefixReceipt(root, failed, replay);
    assert.equal(replays, 8); // Restoring the runtime may reuse its original receipt.
});
