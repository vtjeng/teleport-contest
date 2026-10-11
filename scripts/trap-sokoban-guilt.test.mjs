import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { sokoban_guilt } from '../js/trap.js';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);
const JS_TRAP = readFileSync(new URL('../js/trap.js', import.meta.url), 'utf8');

function functionBody(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, 'source function markers exist');
    return source.slice(start, end);
}

test('sokoban_guilt matches C current-level conduct and Luck updates', () => {
    const cFunction = functionBody(
        C_TRAP,
        'sokoban_guilt(void)',
        '\n/* called when a trap has been deleted',
    );
    const jsFunction = functionBody(
        JS_TRAP,
        'export function sokoban_guilt(',
        '\n// C ref: trap.c instapetrify()',
    );

    assert.match(cFunction,
        /if \(Sokoban\) \{\s*u\.uconduct\.sokocheat\+\+;\s*change_luck\(-1\);/u);
    assert.match(jsFunction,
        /if \(!state\.level\?\.flags\?\.sokoban_rules\) return;\s*state\.u\.uconduct\.sokocheat\+\+;\s*change_luck\(-1, state\);/u);

    const sokoban = {
        level: { flags: { sokoban_rules: true } },
        u: { uconduct: { sokocheat: 2 }, uluck: -2 },
    };
    sokoban_guilt(sokoban);
    assert.equal(sokoban.u.uconduct.sokocheat, 3);
    assert.equal(sokoban.u.uluck, -3);

    const ordinaryLevel = {
        level: { flags: { sokoban_rules: false } },
        u: { uconduct: { sokocheat: 2 }, uluck: -2 },
    };
    sokoban_guilt(ordinaryLevel);
    assert.equal(ordinaryLevel.u.uconduct.sokocheat, 2);
    assert.equal(ordinaryLevel.u.uluck, -2);
});
