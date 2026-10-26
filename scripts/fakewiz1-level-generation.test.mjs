import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { FAKEWIZ1_LEVEL_LOADERS, fakewiz1 } from '../js/fakewiz1_levels.js';

const LUA_SOURCE = readFileSync('nethack-c/upstream/dat/fakewiz1.lua', 'utf8');
const RECORDING = JSON.parse(readFileSync(
    'recordings/mklev.c/trial-fakewiz1-levelport.session.json', 'utf8'));
const CONTROL = JSON.parse(readFileSync(
    'recordings/mklev.c/trial-fakewiz-minetn-control.session.json', 'utf8'));

test('fakewiz1 loader implements the source-backed tower level and is registered', () => {
    assert.equal(FAKEWIZ1_LEVEL_LOADERS.fakewiz1, fakewiz1);
    assert.match(readFileSync('js/mklev.js', 'utf8'), /\.\.\.FAKEWIZ1_LEVEL_LOADERS/u);
    const sourceMap = LUA_SOURCE.match(/map\s*=\s*\[\[([\s\S]*?)\]\]/u)?.[1]
        .split('\n').slice(1, -1).join('\n');
    assert.ok(sourceMap);
    assert.deepEqual(sourceMap.split('\n'), [
        '.........', '.}}}}}}}.', '.}}---}}.', '.}--.--}.', '.}|...|}.',
        '.}--.--}.', '.}}---}}.', '.}}}}}}}.', '.........',
    ]);
    assert.match(LUA_SOURCE, /des\.levregion\([\s\S]*?name\s*=\s*"wizard3"/u);
});

test('Wizard fakewiz1 special-level generation strictly matches its C witness', async () => {
    const actual = await runJsSession(RECORDING, process.cwd());
    const report = compareSessionOutputs(RECORDING, actual);
    assert.equal(report.passed, true, report.message ?? JSON.stringify(report));
});

test('Wizard minetn menu selection remains strictly matched as a control', async () => {
    const actual = await runJsSession(CONTROL, process.cwd());
    const report = compareSessionOutputs(CONTROL, actual);
    assert.equal(report.passed, true, report.message ?? JSON.stringify(report));
});
