import assert from 'node:assert/strict';
import test from 'node:test';
import { COLNO, ROWNO, ROOM, IN_SIGHT, COULD_SEE, HALLUC, DETECT_MONSTERS, TELEPAT, NON_PM } from '../js/const.js';
import { newsym, canseemon } from '../js/display.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { newMonster, place_monster } from '../js/monst.js';
import { monst_globals_init, PM_LONG_WORM, NUMMONS } from '../js/monsters.js';
import { initRng, rn2_on_display_rng } from '../js/rng.js';
import { initialize_symbols_from_options } from '../js/symbols.js';

for (const hallucinating of [false, true]) {
    for (const sensing of ['none', 'detection', 'telepathy', 'visible-tail']) {
        test(`newsym hidden worm tail: hallucination=${hallucinating}, ${sensing}`, () => {
            const state = resetGame();
            state.level = new GameMap();
            state.u = { ux: 2, uy: 2, uprops: [], unblind_telepat_range: 100 };
            state.flags = {};
            state.context = { warntype: {} };
            state.program_state = {};
            state.viz_array = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
            monst_globals_init(state);
            initialize_symbols_from_options({ flags: {} }, state);
            const head = { x: 4, y: 2 }, tail = { x: 5, y: 2 };
            const worm = newMonster({ m_id: 1, data: state.mons[PM_LONG_WORM],
                mnum: PM_LONG_WORM, cham: NON_PM, mhp: 30, mhpmax: 30, wormno: 1 });
            place_monster(worm, head.x, head.y, state);
            state.level.monlist = worm;
            state.level.monsters[tail.x][tail.y] = worm;
            state.level.worms = [];
            state.level.worms[1] = { segments: [tail, head] };
            for (const { x, y } of [head, tail]) state.level.at(x, y).typ = ROOM;
            state.viz_array[head.y][head.x] = IN_SIGHT | COULD_SEE;
            if (sensing === 'visible-tail') state.viz_array[tail.y][tail.x] = IN_SIGHT | COULD_SEE;
            if (sensing === 'detection') state.u.uprops[DETECT_MONSTERS] = { intrinsic: 100 };
            if (sensing === 'telepathy') state.u.uprops[TELEPAT] = { extrinsic: 1 };
            if (hallucinating) state.u.uprops[HALLUC] = { intrinsic: 100 };
            assert.equal(canseemon(worm, state), true, 'head makes the worm globally known');
            initRng(8432052);
            const core = structuredClone(state.coreCtx);
            const expected = { displayCtx: structuredClone(state.displayCtx) };
            const shown = sensing === 'telepathy' || sensing === 'visible-tail';
            if (shown && hallucinating) rn2_on_display_rng(NUMMONS, expected);
            const hp = worm.mhp, segments = structuredClone(state.level.worms);
            newsym(tail.x, tail.y);
            assert.deepEqual(state.displayCtx, expected.displayCtx,
                'detection alone must not paint an unseen worm tail, even when another segment is visible');
            assert.deepEqual(state.coreCtx, core);
            assert.equal(Boolean(worm.meverseen), shown);
            assert.equal(worm.mhp, hp);
            assert.deepEqual(state.level.worms, segments);
            assert.equal(state.level.monsters[tail.x][tail.y], worm);
        });
    }
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test(`hidden worm tail ${name} matches public C recording`, async () => {
        const { readFileSync } = await import('node:fs');
        const { createScoringWorkspace, removeScoringWorkspace } = await import('./scoring-workspace.mjs');
        const { runJsSession, compareSessionOutputs, formatReport } = await import('./diff-fresh.mjs');
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const recording = JSON.parse(readFileSync(new URL(
                `../recordings/display.c/worm-hidden-tail-${name}.session.json`, import.meta.url)));
            const result = compareSessionOutputs(recording, await runJsSession(recording, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
