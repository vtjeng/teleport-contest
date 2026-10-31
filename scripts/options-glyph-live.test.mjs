// C refs: options.c doset(), parseoptions(), optfn_glyph(); glyphs.c
// glyphrep_to_custom_map_entries(), to_custom_symset_entry_callback(); and
// cfgfiles.c config_erradd(). These are live public-input editor replays.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// The message glyphs.c to_custom_symset_entry_callback() reports through
// config_error_add() when no symset is named, with config_erradd()'s period.
const NAG = 'Unimplemented customization feature, ignoring for now.';

for (const [name, expectedNags] of [
    // symset:DECgraphics names the primary set, so the color detail is stored
    // silently.
    ['valid-color', 0],
    // parse_id() rejects an identifier that is neither G_ nor S_; optn_err is
    // silent.
    ['invalid', 0],
    // Escape at the prompt skips parseoptions() altogether.
    ['cancel', 0],
    // No symset: one nag each for the Unicode and the color detail of the
    // first value; the static counters silence the second value.
    ['nag-repeat', 2],
    // string_for_opt() answers empty_optstr; optn_err is silent.
    ['empty', 0],
]) {
    test(`live glyph C replay: ${name}`, async () => {
        const recording = JSON.parse(readFileSync(new URL(
            `../recordings/options.c/glyph-live-${name}.session.json`,
            import.meta.url), 'utf8'));
        const steps = recording.segments[0].steps;
        // Count the steps whose top line newly shows a nag, so the recording
        // itself pins the C behavior each variation exercises.  The first
        // nag's wait_synch() raises --More--, so the second nag's row differs
        // from the first's even though both start with the same text.
        const nagSteps = steps.filter(({ screen }, index) => {
            const row = (screen ?? '').split('\n')[0];
            const previous = (steps[index - 1]?.screen ?? '').split('\n')[0];
            return row.startsWith(NAG) && row !== previous;
        });
        assert.equal(nagSteps.length, expectedNags);
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally {
            removeScoringWorkspace(root);
        }
    });
}
