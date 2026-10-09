import assert from 'node:assert/strict';
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
