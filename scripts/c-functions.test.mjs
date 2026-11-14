// Pins which JavaScript definition forms jsDefinitionNames() recognizes; the
// roadmap's Declared column and the stale note_unported() check use it.

import assert from 'node:assert/strict';
import test from 'node:test';

import { jsDefinitionNames } from './c-functions.mjs';

test('jsDefinitionNames finds every definition form', () => {
    const source = [
        'function plain(a) {}',
        'export async function awaited() {}',
        'function* generated() {}',
        'export async function *asyncGenerated() {}',
        '    const arrow = (a, b) => a + b;',
        'const oneParam = x => x;',
        'let expr = function (x) { return x; };',
        'const lazy = async (x) => x;',
        // A value that is not a function is not a definition.
        'const notAFunction = compute(3);',
        // A name inside a comment or string is not a definition.
        '// function commented() {}',
        "const text = 'function quoted() {}';",
    ].join('\n');
    assert.deepEqual([...jsDefinitionNames(source)].sort(), [
        'arrow', 'asyncGenerated', 'awaited', 'expr', 'generated', 'lazy',
        'oneParam', 'plain',
    ]);
});

test('a C ref: comment ties a _steps or camelCase port to its C name', () => {
    const source = [
        // _steps suffix, named by the comment directly above.
        '// C ref: makemon.c m_initinv().',
        'function* m_initinv_steps(mon) {}',
        // camelCase, inside a multi-line block comment.
        '/* C ref: monmove.c worm_cross()',
        ' * (the hero-move version). */',
        'export function wormCross(x) {}',
        // camelCase with a Steps suffix.
        '// C ref: mon.c mm_2way_aggression().',
        'function* mm2wayAggressionSteps() {}',
        // No C ref: comment: no tie.
        '// worm_move() helper.',
        'function wormMove() {}',
        // A blank line ends the comment block.
        '// C ref: dog.c dog_eat().',
        '',
        'function dogEat() {}',
    ].join('\n');
    const names = jsDefinitionNames(source);
    for (const name of ['m_initinv', 'worm_cross', 'mm_2way_aggression'])
        assert.ok(names.has(name), name);
    for (const name of ['worm_move', 'dog_eat'])
        assert.ok(!names.has(name), name);
});
