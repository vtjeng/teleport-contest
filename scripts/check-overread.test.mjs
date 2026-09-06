import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { checkOverReads } from './check-overread.mjs';

describe('checkOverReads', () => {
    test('flags a session with unported gaps and input exhaustion', () => {
        const rows = [
            { file: 'a.session.json', unported: ['dosit'], inputExhausted: true,
                screensEmitted: 10, recordedSteps: 8 },
        ];
        const flagged = checkOverReads(rows);
        assert.equal(flagged.length, 1);
        assert.equal(flagged[0].session, 'a.session.json');
    });

    test('does not flag a session with gaps but no input exhaustion', () => {
        // The session hit a boundary before consuming all input.
        const rows = [
            { file: 'b.session.json', unported: ['dosit'], inputExhausted: false,
                screensEmitted: 5, recordedSteps: 10 },
        ];
        assert.equal(checkOverReads(rows).length, 0);
    });

    test('does not flag a session with input exhaustion but no gaps', () => {
        // Normal end-of-input, no unported functions.
        const rows = [
            { file: 'c.session.json', unported: [], inputExhausted: true,
                screensEmitted: 10, recordedSteps: 10 },
        ];
        assert.equal(checkOverReads(rows).length, 0);
    });

    test('does not flag a clean session', () => {
        const rows = [
            { file: 'd.session.json', screensEmitted: 10, recordedSteps: 10 },
        ];
        assert.equal(checkOverReads(rows).length, 0);
    });
});
