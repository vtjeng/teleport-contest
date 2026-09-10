import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { checkOverReads } from './check-overread.mjs';

describe('checkOverReads', () => {
    test('flags a session with unported gaps and input exhaustion', () => {
        const rows = [
            { file: 'a.session.json', segmentEndStates: [
                // Segment zero both skipped a callee and exhausted its input.
                { segment: 0, unported: ['sit.c dosit'], inputExhausted: true },
            ] },
        ];
        const flagged = checkOverReads(rows);
        assert.equal(flagged.length, 1);
        assert.equal(flagged[0].session, 'a.session.json');
        assert.equal(flagged[0].segment, 0);
        assert.deepEqual(flagged[0].unported, ['sit.c dosit']);
    });

    test('does not flag a session with gaps but no input exhaustion', () => {
        // The session hit a boundary before consuming all input.
        const rows = [
            { file: 'b.session.json', segmentEndStates: [
                { segment: 0, unported: ['sit.c dosit'], inputExhausted: false },
            ] },
        ];
        assert.equal(checkOverReads(rows).length, 0);
    });

    test('does not flag a session with input exhaustion but no gaps', () => {
        // Normal end-of-input, no unported functions.
        const rows = [
            { file: 'c.session.json', segmentEndStates: [
                { segment: 0, unported: [], inputExhausted: true },
            ] },
        ];
        assert.equal(checkOverReads(rows).length, 0);
    });

    test('does not flag a clean session', () => {
        const rows = [
            { file: 'd.session.json', segmentEndStates: [] },
        ];
        assert.equal(checkOverReads(rows).length, 0);
    });

    test('does not combine a gap with another segment\'s input exhaustion', () => {
        // The old session-wide union flagged this combination. Only the first
        // segment skipped a callee; only the second exhausted its input.
        const rows = [{
            file: 'separate-segments.session.json',
            unported: ['worn.c mon_adjust_speed'],
            inputExhausted: true,
            segmentEndStates: [
                { segment: 0, unported: ['worn.c mon_adjust_speed'],
                    inputExhausted: false },
                { segment: 1, unported: [], inputExhausted: true },
            ],
        }];
        assert.deepEqual(checkOverReads(rows), []);
    });

    test('keeps each flagged segment and its own gaps in the report', () => {
        // A session may contain multiple independent games; each suspect end
        // needs its own segment index and callee list for investigation.
        const rows = [{ file: 'two-gaps.session.json', segmentEndStates: [
            { segment: 0, unported: ['sit.c dosit'], inputExhausted: true },
            { segment: 1, unported: ['worn.c mon_adjust_speed'],
                inputExhausted: true },
        ] }];
        assert.deepEqual(checkOverReads(rows).map(({ segment, unported }) =>
            ({ segment, unported })), [
            { segment: 0, unported: ['sit.c dosit'] },
            { segment: 1, unported: ['worn.c mon_adjust_speed'] },
        ]);
    });

    test('rejects a cache without segment attribution', () => {
        // A legacy aggregate cannot establish which game exhausted its input.
        assert.throws(() => checkOverReads([{
            file: 'legacy.session.json', unported: [], inputExhausted: false,
        }]), /scan cache lacks segment end states/);
    });
});
