import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hunksThatMoveLines } from './recorder-patch-lines.mjs';

import { RECORDER_HOME } from '../js/cfgfiles.js';

const SHOWN_HOME = 'nethack-c/patches/008-shown-config-home.patch';
const SHOWN_WIZKIT_HOME = 'nethack-c/patches/010-shown-wizkit-home.patch';

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

test('the shown-HOME patches apply to a clean upstream checkout', () => {
    assertApplies(SHOWN_HOME);
    assertApplies(SHOWN_WIZKIT_HOME);
});

test('the shown-HOME patch renames the opened config file only', () => {
    const added = addedLines(SHOWN_HOME).join('\n');
    assert.match(added, /nh_getenv\("NETHACK_SHOWN_HOME"\)/u);
    // The rename runs on the stream that fopen() of HOME/.nethackrc returned,
    // so the file the game reads is unchanged.
    assert.match(added, /^ {8}return shown_configfile\(fp\);$/mu);
});

test('the wizkit shown-HOME patch renames the printed default wizkit file only', () => {
    const patch = readFileSync(SHOWN_WIZKIT_HOME, 'utf8');
    const added = addedLines(SHOWN_WIZKIT_HOME).join('\n');
    assert.match(added, /nh_getenv\("NETHACK_SHOWN_HOME"\)/u);
    // files.c fopen_wizkit_file() has already tried $HOME/<WIZKIT>; only the
    // name raw_printf() prints changes, and errno is read after the call.
    assert.match(added, /^ {19}shown_wizkit\(tmp_wizkit\), errno\);$/mu);
    assert.match(patch, /^- {19}tmp_wizkit, errno\);$/mu);
    assert.match(added, /errno = saved_errno;/u);
});

test('record-session.mjs shows the port\'s recorder HOME', () => {
    // js/cfgfiles.js RECORDER_HOME is the judge's HOME that the port prints;
    // the recorder must receive that same value, not a copy of it.
    const source = readFileSync('scripts/record-session.mjs', 'utf8');
    assert.match(source, /^import \{RECORDER_HOME\} from '\.\.\/js\/cfgfiles\.js';$/mu);
    assert.match(source, /^ +NETHACK_SHOWN_HOME: RECORDER_HOME,$/mu);
    assert.ok(RECORDER_HOME.startsWith('/Users/'));
});

test('the patches keep every upstream line number', () => {
    // The RNG log names the C line of each call, so a moved line would change
    // committed recordings (scripts/recorder-patch-lines.mjs).
    for (const patch of [SHOWN_HOME, SHOWN_WIZKIT_HOME]) {
        assert.deepEqual(
            hunksThatMoveLines(readFileSync(patch, 'utf8'), 'nethack-c/upstream'), [], patch);
    }
});
