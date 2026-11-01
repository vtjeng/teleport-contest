import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { hunksThatMoveLines } from './recorder-patch-lines.mjs';

import { JUDGE_RECORDER_IS_DST } from '../js/calendar.js';

const RUNTIME = 'nethack-c/patches/001-deterministic-runtime.patch';
const FIXED_ISDST = 'nethack-c/patches/009-fixed-isdst.patch';

function addedLines(file) {
    return readFileSync(file, 'utf8').split('\n')
        .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.slice(1));
}

// Patch 009 edits lines that patch 001 added to calendar.c, so it applies
// to calendar.c as patch 001 leaves it.  Build that file in a temporary
// directory with build-recorder.sh's git-apply mode; the submodule stays
// untouched.
function calendarAfterRuntimePatch(t) {
    const root = mkdtempSync(path.join(tmpdir(), 'fixed-isdst-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(path.join(root, 'src'));
    copyFileSync('nethack-c/upstream/src/calendar.c', path.join(root, 'src/calendar.c'));
    execFileSync('git', ['apply', '--recount', '--include=src/calendar.c',
        path.resolve(RUNTIME)], { cwd: root, stdio: 'pipe' });
    return root;
}

test('the fixed-isdst patch applies after patch 001', (t) => {
    const root = calendarAfterRuntimePatch(t);
    execFileSync('git', ['apply', '--check', '--recount', path.resolve(FIXED_ISDST)],
        { cwd: root, stdio: 'pipe' });
});

test('the patch keeps every line number of calendar.c', (t) => {
    // The RNG log names the C line of each call, so a moved line would change
    // committed recordings (scripts/recorder-patch-lines.mjs).  Line numbers
    // are those of calendar.c after patch 001, which the hunks address.
    const root = calendarAfterRuntimePatch(t);
    assert.deepEqual(hunksThatMoveLines(readFileSync(FIXED_ISDST, 'utf8'), root), []);
});

test('the patch replaces only the inherited tm_isdst, before mktime()', () => {
    const added = addedLines(FIXED_ISDST).join('\n');
    assert.match(added, /nh_getenv\("NETHACK_FIXED_ISDST"\)/u);
    // The call follows patch 001's copy of the current local time and
    // precedes the six date and time assignments and mktime().
    assert.match(added, /^ {12}t = \*lt; fixed_isdst\(&t\); \/\* patch 009 \*\/$/mu);
    // Only "0" and "1" are accepted, so an unset or malformed variable leaves
    // patch 001's behavior unchanged.
    assert.match(added, /!strcmp\(isdst, "0"\) \|\| !strcmp\(isdst, "1"\)/u);
    assert.match(added, /^ {8}t->tm_isdst = \*isdst - '0';$/mu);
});

test('record-session.mjs records with the judge\'s daylight-time bit', () => {
    // The judge's reference recordings were all made on New York daylight
    // time, and frozen/ps_test_runner.mjs replays without recorderIsDst, so
    // the port's default applies.  The recorder must receive that same
    // value and record it, not a value computed from today's date.
    assert.equal(JUDGE_RECORDER_IS_DST, true);
    const source = readFileSync('scripts/record-session.mjs', 'utf8');
    assert.match(source, /^import \{JUDGE_RECORDER_IS_DST\} from '\.\.\/js\/calendar\.js';$/mu);
    assert.match(source, /^ +NETHACK_FIXED_ISDST: JUDGE_RECORDER_IS_DST \? '1' : '0',$/mu);
    assert.match(source, /^ +recorderIsDst: JUDGE_RECORDER_IS_DST,$/mu);
    const jsmain = readFileSync('js/jsmain.js', 'utf8');
    assert.match(jsmain, /opts\.recorderIsDst \?\? JUDGE_RECORDER_IS_DST;/u);
});

test('the judge\'s scorer passes no recorderIsDst', () => {
    // If the frozen scorer ever starts passing a recording's own bit, the
    // reasoning behind JUDGE_RECORDER_IS_DST no longer holds.
    const runner = readFileSync('frozen/ps_test_runner.mjs', 'utf8');
    const replayInput = /function replayInputFor\(segment\) \{[\s\S]*?\n\}/u.exec(runner)[0];
    assert.doesNotMatch(replayInput, /recorderIsDst/u);
    assert.doesNotMatch(runner, /recorderIsDst/u);
});
