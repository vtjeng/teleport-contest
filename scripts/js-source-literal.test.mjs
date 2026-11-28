import assert from 'node:assert/strict';
import test from 'node:test';

import { stringLiteral, valueLiteral } from './js-source-literal.mjs';

// Evaluate a generated expression the way the generated module does.
const evaluate = (source) => new Function(`return ${source};`)();

test('a string without newlines stays one JSON literal', () => {
    // A quote and a tab: JSON.stringify escapes both on the one line.
    assert.equal(stringLiteral('a "b"\tc'), '"a \\"b\\"\\tc"');
});

test('a multi-line string becomes one element per line', () => {
    // A trailing newline, as every dat/ file has, yields a final empty element;
    // the empty middle line checks that blank lines survive.
    const text = 'first\n\nthird\n';
    const source = stringLiteral(text);
    assert.equal(source, '[\n    "first",\n    "",\n    "third",\n    "",\n].join(\'\\n\')');
    assert.equal(evaluate(source), text);
});

test('valueLiteral round-trips nested data and indents nested strings', () => {
    // Covers every JSON kind the generators pass: objects, arrays, strings
    // with and without newlines, numbers, booleans, null, and empty
    // containers, nested two levels so that indentation compounds.
    const value = {
        text: 'one\ntwo',
        list: [1, 'x\ny', [], {}],
        flag: true,
        none: null,
    };
    const source = valueLiteral(value);
    assert.deepStrictEqual(evaluate(source), value);
    assert.match(source, /^ {8}\[\n {12}"x",\n {12}"y",\n {8}\]\.join/mu);
});

test('valueLiteral matches JSON.stringify layout when no string has a newline', () => {
    // The generators replaced JSON.stringify(value, null, 4); without
    // multi-line strings the output must be byte-for-byte the same.
    const value = { a: [1, 2, { b: 'c' }], d: {}, e: [] };
    assert.equal(valueLiteral(value), JSON.stringify(value, null, 4));
});
