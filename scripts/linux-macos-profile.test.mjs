import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hunksThatMoveLines } from './recorder-patch-lines.mjs';

const PROFILE = 'nethack-c/host-profiles/linux-macos-output.patch';

function addedLines(file) {
    return readFileSync(file, 'utf8').split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.slice(1));
}

// --check leaves the submodule untouched while using build-recorder.sh's
// exact git-apply mode against the pinned upstream source.
function assertApplies(file) {
    execFileSync('git', ['apply', '--check', '--recount', `../../${file}`],
        { cwd: 'nethack-c/upstream', stdio: 'pipe' });
}

test('the Linux macOS-output profile applies to a clean upstream checkout', () => {
    assertApplies(PROFILE);
});

test('the profile prints the three measured macOS strings on Linux', () => {
    const added = addedLines(PROFILE).join('\n');
    // global.h PORT_ID, unixconf.h DEV_RANDOM and eat.c fprefx()'s apple arm:
    // the three compile-time kinds the macOS host-parity run measured.
    // The PORT_ID "MacOS" define under this condition is a context line.
    assert.match(added, /^#if defined\(__APPLE__\) \|\| defined\(__linux__\) \/\*/mu);
    assert.match(added, /^# define DEV_RANDOM "\/dev\/random" \/\*/mu);
    assert.match(added, /^#if defined\(MACOS9\) \|\| defined\(MACOS\) \|\| defined\(__linux__\) \/\*/mu);
});

test('the profile does not define MACOS', () => {
    // MACOS selects macOS-only code (unixconf.h, global.h), which a Linux
    // build cannot compile or should not run.
    assert.doesNotMatch(addedLines(PROFILE).join('\n'), /#\s*define\s+MACOS\b/u);
});

test('the patch keeps every upstream line number', () => {
    // The RNG log names the C line of each call, so a moved line would change
    // committed recordings (scripts/recorder-patch-lines.mjs).
    assert.deepEqual(
        hunksThatMoveLines(readFileSync(PROFILE, 'utf8'), 'nethack-c/upstream'), []);
});
