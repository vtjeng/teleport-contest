import { readFileSync } from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_GOBLIN } from '../js/monsters.js';
import { ROBE, PLATE_MAIL } from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { ERODE_BURN, ER_DAMAGED, ER_NOTHING, EF_NONE, EF_GREASE,
    OBJ_MINVENT, W_ARMC, W_ARM, NON_PM, HALLUC, BLINDED, DETECT_MONSTERS,
    SEE_INVIS, ROOM } from '../js/const.js';
import { erode_obj } from '../js/trap_erode_obj.js';
import { canseemon, canspotmon } from '../js/display.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals, vision_reset, vision_recalc } from '../js/vision.js';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hallu of [false, true]) {
    for (const mode of ['damage', 'quiet-metal', 'proof-message', 'known-proof-quiet', 'unseen-detected']) {
        test(`erosion feedback Hallu=${hallu} ${mode}`, async () => {
            const outcomes = [];
            for (const planning of [true, false]) {
                await runSegment({ seed: 8432213, datetime: '20270111120000',
                    nethackrc: 'OPTIONS=name:ErodeNames,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
                game.level = new GameMap(); game.head_engr = null;
                for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                    game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
                }
                game.u.ux = 5; game.u.uy = 7; game.context.mon_moving = true;
                for (const [p, active] of [[HALLUC, hallu], [BLINDED, false], [DETECT_MONSTERS, true], [SEE_INVIS, false]]) {
                    game.u.uprops[p].intrinsic = active ? 1000 : 0;
                    game.u.uprops[p].extrinsic = 0;
                }
                const mon = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
                    cham: NON_PM, m_id: 9930, mhp: 20, mhpmax: 20, mcansee: true,
                    mcanmove: true, minvis: mode === 'unseen-detected' });
                game.level.monlist = mon; place_monster(mon, 7, 7, game);
                const otyp = mode === 'quiet-metal' ? PLATE_MAIL : ROBE;
                const catalog = game.objects[otyp], mask = otyp === ROBE ? W_ARMC : W_ARM;
                const obj = newObject({ otyp, oclass: catalog.oc_class, material: catalog.oc_material,
                    owt: catalog.oc_weight, quan: 1, where: OBJ_MINVENT, ocarry: mon,
                    owornmask: mask, blessed: false, oerodeproof: mode.includes('proof'),
                    rknown: mode === 'known-proof-quiet', dknown: true, known: true });
                mon.minvent = obj; mon.misc_worn_check = mask;
                light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
                assert.equal(canspotmon(mon, game), true);
                assert.equal(canseemon(mon, game), mode !== 'unseen-detected');
                const state = planning ? planningState(game) : game;
                const subject = state.level.monlist.minvent;
                const core = structuredClone(game.coreCtx), liveDisplay = structuredClone(game.displayCtx);
                const ownDisplay = structuredClone(state.displayCtx), liveMap = structuredClone(game.level.locations);
                const draws = [], cosmetic = [], lines = [];
                const random = { rnl: n => { draws.push(n); return n - 1; }, rn2: n => { draws.push(n); return n - 1; } };
                const result = await erode_obj(subject, otyp === ROBE ? 'robe' : 'plate mail',
                    ERODE_BURN, mode === 'damage' || mode === 'unseen-detected' ? EF_GREASE : EF_NONE,
                    { state, planning, random, displayRandom: n => {
                        cosmetic.push(n); rn2_on_display_rng(n, state); return 0;
                    }, message: async line => lines.push(line) });
                const feedback = mode === 'damage' || mode === 'proof-message';
                assert.deepEqual(cosmetic, hallu && feedback ? [430, 2] : []);
                const expected = { displayCtx: ownDisplay };
                for (const n of cosmetic) rn2_on_display_rng(n, expected);
                assert.deepEqual(state.displayCtx, expected.displayCtx);
                assert.deepEqual(game.coreCtx, core); assert.deepEqual(draws, []);
                if (planning) {
                    assert.deepEqual(game.displayCtx, liveDisplay);
                    assert.equal(obj.oeroded, 0);
                    assert.equal(obj.rknown, mode === 'known-proof-quiet');
                }
                assert.deepEqual(game.level.locations, liveMap);
                const damaged = mode === 'damage' || mode === 'unseen-detected';
                assert.equal(result, damaged ? ER_DAMAGED : ER_NOTHING);
                assert.equal(subject.oeroded, damaged ? 1 : 0);
                assert.equal(subject.rknown, mode.includes('proof'));
                const species = hallu ? 'giant ant' : 'goblin';
                assert.deepEqual(lines, mode === 'damage' ? [`The ${species}'s robe smoulders!`]
                    : mode === 'proof-message' ? [`Somehow, the ${species}'s robe is not affected by the heat.`] : []);
                assert.equal(subject.ocarry, state.level.monlist);
                assert.equal(subject.where, OBJ_MINVENT); assert.equal(subject.owornmask, mask);
                assert.equal(state.level.monlist.mhp, 20);
                outcomes.push({ result, cosmetic, lines, erosion: subject.oeroded, known: subject.rknown });
            }
            assert.deepEqual(outcomes[0], outcomes[1]);
        });
    }
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test(`erosion feedback ${name} matches public C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(readFileSync(new URL(
                '../recordings/trap.c/erosion-feedback-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
