import assert from 'node:assert/strict';

export const step = (kind, args, result) => ({ kind, args, result });

export function scriptedRandom(steps) {
    let offset = 0;
    function draw(kind, args) {
        const expected = steps[offset++];
        assert.ok(expected, `unexpected ${kind}(${args.join(',')})`);
        assert.equal(kind, expected.kind);
        assert.deepEqual(args, expected.args);
        return expected.result;
    }
    return {
        random: {
            d: (number, sides) => draw('d', [number, sides]),
            rn1: (range, base) => draw('rn1', [range, base]),
            rn2: (bound) => draw('rn2', [bound]),
            rnd: (bound) => draw('rnd', [bound]),
            rne: (bound) => draw('rne', [bound]),
            rnz: (value) => draw('rnz', [value]),
        },
        assertExhausted() {
            assert.equal(offset, steps.length);
        },
    };
}
