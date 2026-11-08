import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HALLUC, HALLUC_RES, NO_TRAP, TRAPNUM, WEB } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { cloneIsaacContext, coreRandom } from '../js/rng.js';
import { trapname } from '../js/trap.js';
import { halu_trapnames } from '../js/trap_names_data.js';
import { generateTrapNames } from './generate-trap-names.mjs';

test('trap hallucination table matches a fresh extraction from trap.c', () => {
    assert.equal(readFileSync(new URL('../js/trap_names_data.js', import.meta.url), 'utf8'),
        generateTrapNames());
});

test('trapname preserves display/core RNG order and override/resistance gates', async () => {
    // Independently chosen valid startup gives the female Valkyrie role and
    // its level-one rank from role.c; no recorded output is reused.
    await runSegment({ seed: 8974123, datetime: '20370609112743', moves: '',
        nethackrc: 'OPTIONS=name:Silk,role:Valkyrie,race:human,gender:female,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n' });
    game.u.uprops[HALLUC].intrinsic = 20; // A nonzero hallucination timeout.
    const total = TRAPNUM + halu_trapnames.length;
    let displayResult = NO_TRAP; // Source retains the original type at zero.
    let coreResult = 1; // Nonzero chooses the role; zero below chooses rank.
    const calls = [];
    const random = {
        ...coreRandom,
        rn2: (n) => { calls.push(['core', n]); return coreResult; },
    };
    const display = (n) => { calls.push(['display', n]); return displayResult; };
    assert.equal(trapname(WEB, false, game, random, display), 'web');
    assert.deepEqual(calls, [['display', total + 1]]);
    displayResult = TRAPNUM; // The first invented trap.c name.
    calls.length = 0;
    assert.equal(trapname(WEB, false, game, random, display), 'bottomless pit');
    assert.deepEqual(calls, [['display', total + 1]]);
    displayResult = total; // Extra entry after both actual and invented names.
    calls.length = 0;
    assert.equal(trapname(WEB, false, game, random, display), 'valkyrie trap');
    assert.deepEqual(calls, [['display', total + 1], ['core', 3]]);
    coreResult = 0;
    calls.length = 0;
    assert.equal(trapname(WEB, false, game, random, display), 'stripling trap');
    assert.deepEqual(calls, [['display', total + 1], ['core', 3]]);
    calls.length = 0;
    assert.equal(trapname(WEB, true, game, random, display), 'web');
    assert.deepEqual(calls, []);
    game.u.uprops[HALLUC_RES].extrinsic = 1; // Either resistance source suppresses it.
    assert.equal(trapname(WEB, false, game, random, display), 'web');
    assert.deepEqual(calls, []);
});

test('trapname draws a hallucinated name from the display stream by default',
    async () => {
        // trap.c trapname() picks the hallucinated index with
        // rn2_on_display_rng(), so the default draw advances rnd.c's display
        // stream, leaves the core stream alone, and repeats from the same
        // display state.
        await runSegment({ seed: 6614907, datetime: '20381102170500', moves: '',
            nethackrc: 'OPTIONS=name:Moss,role:Priest,race:human,gender:male,align:lawful\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n' });
        game.u.uprops[HALLUC].intrinsic = 30; // A nonzero hallucination timeout.
        game.u.uprops[HALLUC_RES].intrinsic = 0;
        game.u.uprops[HALLUC_RES].extrinsic = 0;
        const displayBefore = cloneIsaacContext(game.displayCtx);
        const coreBefore = cloneIsaacContext(game.coreCtx);
        const name = trapname(WEB, false, game);
        assert.notDeepEqual(game.displayCtx, displayBefore);
        assert.deepEqual(game.coreCtx, coreBefore);
        // The same display state reproduces the draw.
        game.displayCtx = cloneIsaacContext(displayBefore);
        assert.equal(trapname(WEB, false, game), name);
    });
