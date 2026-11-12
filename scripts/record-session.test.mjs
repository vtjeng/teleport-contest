import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    clearLockFiles,
    completeLogBytes,
    copyInstall,
    installDirTooLong,
    isPerGameFile,
    NETHACKDIR_MAX_LENGTH,
    successfulTerminalExit,
    terminalInputKey,
} from './record-session.mjs';

test('the NETHACKDIR limit is BUFSZ / 2 from the C source', () => {
    // options.c nh_getenv() keeps a value only while strlen(value) <= BUFSZ / 2,
    // so the limit the recorder script stages around must track global.h.
    const globalHeader = readFileSync('nethack-c/upstream/include/global.h', 'utf8');
    const bufsz = Number(globalHeader.match(/^#define BUFSZ (\d+)/mu)[1]);
    assert.equal(NETHACKDIR_MAX_LENGTH, bufsz / 2);
    const optionsSource = readFileSync('nethack-c/upstream/src/options.c', 'utf8');
    assert.match(optionsSource, /strlen\(getev\) <= \(BUFSZ \/ 2\)/u);
});

test('installDirTooLong flags only paths nh_getenv() would discard', () => {
    // 128 characters is the last length nh_getenv() accepts; 129 is the first
    // it discards.
    assert.equal(installDirTooLong('/'.padEnd(128, 'a')), false);
    assert.equal(installDirTooLong('/'.padEnd(129, 'a')), true);
    // The private copy main() records from: mkdtemp() under Linux /tmp, and
    // under a macOS per-user TMPDIR (the shape GitHub's macOS runners use).
    assert.equal(installDirTooLong('/tmp/nh-rec-AbC123/install'), false);
    assert.equal(installDirTooLong(
        '/var/folders/6x/abcdefghijklmnopqrstuvwxyz0000/T/nh-rec-AbC123/install',
    ), false);
    // A .claude/worktrees/<name>/ install path is about 130 characters, so a
    // TMPDIR that deep would be refused.
    assert.equal(installDirTooLong(
        '/home/vtjeng/development/vtjeng/teleport-contest/.claude/worktrees/recorder-wizards/nethack-c/recorder/install/games/lib/nethackdir',
    ), true);
});

test('the private install copy leaves out every per-game file', () => {
    // Lock and level files: files.c set_levelfile_name() appends .<level>
    // to <uid><player name>, and level 0 doubles as the game's lock file.
    // 1000 is a typical Linux user id; 12 checks a two-digit level.
    assert.equal(isPerGameFile('1000agent.0'), true);
    assert.equal(isPerGameFile('1000Contestant.12'), true);
    // The score files clearStaleState() recreates empty, and the
    // <file>_lock names files.c make_lockname() gives their locks.
    for (const name of ['record', 'xlogfile', 'logfile', 'paniclog',
        'record_lock', 'perm_lock']) {
        assert.equal(isPerGameFile(name), true, name);
    }
    // Bones names from the comment in files.c set_bonesfile_name(): a main
    // dungeon level and Minetown, whose name does not end in a digit.
    assert.equal(isPerGameFile('bonD0.4'), true);
    assert.equal(isPerGameFile('bonM0.T'), true);
    // A save in save/ is per-game; the save directory itself is copied, so
    // a later segment's save has somewhere to go.
    assert.equal(isPerGameFile(path.join('save', '1000agent.gz')), true);
    assert.equal(isPerGameFile('save'), false);
    // Installed data: the binary, sysconf, the empty perm file, help text
    // and Lua level files, including wizard1.lua, whose name contains a
    // player-name pattern that clearStaleState() matches.
    for (const name of ['nethack', 'sysconf', 'perm', 'opthelp',
        'data', 'wizard1.lua', 'minetn-1.lua']) {
        assert.equal(isPerGameFile(name), false, name);
    }
});

test('clearLockFiles removes the previous segment lock files and keeps saves', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'record-session-test-'));
    try {
        await mkdir(path.join(root, 'save'));
        // Left by a segment killed at a live prompt: the lock (level 0) and
        // a level-1 file for player "wizard", a numbered alock.1 lock, and a
        // record_lock from a score update.
        const locks = ['1000wizard.0', '1000wizard.1', 'alock.1', 'record_lock'];
        // Kept: a save for a restore segment, the score file, a bones file
        // (its name ends in a level number like a level file's), installed
        // data, and a Lua level file.
        const kept = ['record', 'bonD0.4', 'sysconf', 'perm', 'wizard1.lua'];
        for (const name of [...locks, ...kept]) await writeFile(path.join(root, name), '');
        await writeFile(path.join(root, 'save', '1000wizard.gz'), 'save');
        await clearLockFiles(root);
        assert.deepEqual((await readdir(root)).sort(), [...kept, 'save'].sort());
        assert.deepEqual(await readdir(path.join(root, 'save')), ['1000wizard.gz']);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('copyInstall copies installed data and leaves out per-game files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'record-session-test-'));
    try {
        const install = path.join(root, 'install');
        await mkdir(path.join(install, 'save'), { recursive: true });
        // One installed file, one level file, one save and one score file
        // stand for the four groups isPerGameFile() separates.
        await writeFile(path.join(install, 'sysconf'), 'WIZARDS=*\n');
        await writeFile(path.join(install, '1000agent.0'), 'lock');
        await writeFile(path.join(install, 'save', '1000agent.gz'), 'save');
        await writeFile(path.join(install, 'record'), 'score');
        const copy = path.join(root, 'copy');
        await copyInstall(install, copy);
        assert.deepEqual((await readdir(copy)).sort(), ['save', 'sysconf']);
        assert.deepEqual(await readdir(path.join(copy, 'save')), []);
        assert.equal(await readFile(path.join(copy, 'sysconf'), 'utf8'), 'WIZARDS=*\n');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('terminal-input intent names exactly the recipe final key', () => {
    assert.equal(terminalInputKey({ moves: '#save\ny', terminalInputKey: 'y' }), 'y');
    assert.equal(terminalInputKey({ moves: '#save\ny' }), null);
    assert.throws(
        () => terminalInputKey({ moves: '#save\ny', terminalInputKey: 'n' }),
        /must match the segment final input key/u,
    );
    assert.throws(
        () => terminalInputKey({ moves: '#save\ny', terminalInputKey: 'yes' }),
        /must match the segment final input key/u,
    );
});

test('explicit terminal input accepts only successful natural process closure with real boundaries', () => {
    const expected = {
        exitCode: 0,
        signal: null,
        terminalKey: 'y',
        moves: '#save\ny',
        nextKeyIndex: 7,
        stepCount: 8,
        expectedSteps: 8,
    };
    assert.equal(successfulTerminalExit(expected), true);
    assert.equal(successfulTerminalExit({
        ...expected,
        stepCount: 7,
    }), true);

    for (const invalid of [
        { terminalKey: null },
        { exitCode: 1 },
        { exitCode: null, signal: 'SIGTERM' },
        { nextKeyIndex: 6 },
        { moves: '#save\nn' },
        { stepCount: 0 },
        { stepCount: 6 },
    ]) {
        assert.equal(successfulTerminalExit({ ...expected, ...invalid }), false);
    }
});

test('completeLogBytes stops a boundary read at the last complete log line', () => {
    // The C recorder can still be writing the PRNG log when a boundary marker
    // arrives (p2-00078 of the batch 14 pilot split "8401 rn2(12) = 7 @ ..."
    // after "8401 rn"). A read that ends inside a line must leave that line for
    // the next boundary, or the recording keeps two fragments of one call.
    const whole = '8400 rn2(5) = 4 @ distfleeck(monmove.c:538)\n';
    const partial = '8401 rn';
    assert.equal(completeLogBytes(Buffer.from(whole + partial)),
        Buffer.byteLength(whole));
    // A read that ends exactly at a newline consumes everything.
    assert.equal(completeLogBytes(Buffer.from(whole)), Buffer.byteLength(whole));
    // A read holding no newline consumes nothing.
    assert.equal(completeLogBytes(Buffer.from(partial)), 0);
    assert.equal(completeLogBytes(Buffer.alloc(0)), 0);
});
