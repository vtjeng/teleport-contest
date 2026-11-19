// Bounded cmd.c:doextcmd493-520 -> options.c:doset8758-8975 caller checks.
// Independent C-first recipes pin both typed menu entries; canonical options
// helpers own menu_requested inversion and the no-time return.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';

const CASES = [
    { path: 'options-full-typed-independent', title: 'Set what options?' },
    { path: 'options-full-menu-prefix-variation', title: 'Options' },
];
for (const entry of CASES) {
    test(`typed full-options command: ${entry.path}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/cmd.c/${entry.path}.session.json`, import.meta.url)));
        const segment = recipe.segments[0];
        // The source initial wait is identical to the recording setup; menu
        // input ends at Escape so an extra gameplay action cannot hide time.
        await runSegment({ ...segment, moves: '.' });
        const movesBefore = game.moves;
        let boundary;
        const replay = await runSegment({ ...segment, moves: segment.moves.slice(0, -1) }, {
            onBoundary: error => { boundary = error; },
        });
        assert.equal(boundary, undefined);
        assert.ok(replay.getScreens().some(screen => screen.includes(entry.title)));
        assert.equal(game.moves, movesBefore);
        assert.equal(Boolean(game.iflags.menu_requested), false);
    });
}

// options.c initoptions_finish() ends with `go.opt_initial = FALSE` (7382).
// parseoptions() rewrites the flag on every call, but doset() runs a compound
// option's handler without one, so a handler that tests the flag, such as
// handler_petattr() (6160), reads what startup left. When startup left it
// set, picking 'petattr' before any boolean toggle skipped the redraw and
// the pet kept its old attribute (recordings/options.c/
// petattr-first-pick-redraws-pet.session.json).
test('startup leaves go.opt_initial clear for doset() handlers', async () => {
    const recipe = JSON.parse(readFileSync(new URL(
        '../recipes/cmd.c/options-full-typed-independent.session.json',
        import.meta.url)));
    // One key reaches the first command prompt; no option has been touched.
    await runSegment({ ...recipe.segments[0], moves: '.' });
    assert.equal(game.go.opt_initial, false);
});
