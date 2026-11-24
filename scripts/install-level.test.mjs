import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';

// js/display.js installLevel() is the one place a level object becomes the
// current level, so that work every level change needs has one home. This
// check fails when other code installs a level object by assigning
// state.level, game.level or g.level directly.
const ASSIGNMENT = /\b(?:state|game|g)\.level\s*=(?!=)/u;

function installLevelRange(source) {
    const start = source.indexOf('export function installLevel(');
    assert.ok(start >= 0, 'js/display.js defines installLevel()');
    return [start, source.indexOf('\n}\n', start)];
}

test('every level object is installed through installLevel()', () => {
    const offenders = [];
    for (const name of readdirSync(new URL('../js/', import.meta.url))) {
        if (!name.endsWith('.js')) continue;
        const source = readFileSync(
            new URL(`../js/${name}`, import.meta.url), 'utf8',
        );
        const [start, end] = name === 'display.js'
            ? installLevelRange(source) : [-1, -1];
        let offset = 0;
        for (const [index, line] of source.split('\n').entries()) {
            const inside = offset >= start && offset <= end;
            if (!/^\s*\/\//u.test(line) && ASSIGNMENT.test(line) && !inside)
                offenders.push(`js/${name}:${index + 1}`);
            offset += line.length + 1;
        }
    }
    assert.deepEqual(offenders, []);
});
