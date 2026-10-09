import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const patch = readFileSync('nethack-c/patches/007-stable-pointer-format.patch', 'utf8');
const addedSource = patch.split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');

test('the recorder formats diagnostic pointers without native addresses', () => {
    assert.match(addedSource,
        /Sprintf\(buf, "%s", ptr \? "<ptr>" : "<null>"\);/u);
    assert.doesNotMatch(addedSource, /PTR_FMT|PTR_TYP|%p/u);
});

test('the pointer patch applies to a clean upstream checkout', () => {
    // --check preserves the source tree while exercising build-recorder.sh's
    // exact git-apply mode against the pinned upstream alloc.c.
    execFileSync('git', [
        'apply', '--check', '--recount', '../patches/007-stable-pointer-format.patch',
    ], { cwd: 'nethack-c/upstream', stdio: 'pipe' });
});
