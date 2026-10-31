// C refs: options.c doset(), parseoptions(), optfn_hilite_status(),
// optfn_statushilites(); botl.c parse_status_hl1(), parse_status_hl2(),
// reset_status_hilites(); and cfgfiles.c config_erradd(). These are live
// public-input editor replays.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [name, expected] of [
    // 'time/always/inverse' is accepted silently; the T: field changes on
    // each step east, so the final status line carries the inverse attribute
    // around T:3 (two moves after the turn-1 start).
    ['hilite-status-live-valid-time', { finalRow: /\x1b\[7mT:3\x1b\[0m/u }],
    // parse_status_hl2() reports the unknown field through config_error_add(),
    // which config_erradd() prints with pline() and its own period.
    ['hilite-status-live-invalid-field', { message: "Unknown status field 'bogus'." }],
    // string_for_opt() answers empty_optstr, and the handler reports this.
    ['hilite-status-live-empty', { message: 'Value is mandatory for hilite_status.' }],
    // atol("5") is stored silently; the second visit searches for the option
    // again, which rebuilds its value column through get_val, and cancels.
    ['statushilites-live-valid-five', {}],
    // An empty answer is the default duration of 3, silently.
    ['statushilites-live-empty', {}],
]) {
    test(`live status hilite C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/${name}.session.json`,
            import.meta.url), 'utf8'));
        const screens = recording.segments[0].steps.map(({ screen }) => screen ?? '');
        if (expected.message)
            assert.ok(screens.some((screen) => screen.startsWith(expected.message)));
        if (expected.finalRow) assert.match(screens.at(-1), expected.finalRow);
        if (expected.anyRow) assert.ok(screens.some((screen) => expected.anyRow.test(screen)));
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
