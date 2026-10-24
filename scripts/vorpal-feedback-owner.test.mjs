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
import { PM_SAMURAI, PM_LICH, PM_GHOST, PM_FIRE_VORTEX, PM_JABBERWOCK } from '../js/monsters.js';
import { artifact_hit, artifact_exists, ART_VORPAL_BLADE } from '../js/artifacts.js';
import { LONG_SWORD } from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { HALLUC, BLINDED, DETECT_MONSTERS, SEE_INVIS, ROOM, NON_PM, OBJ_MINVENT, W_WEP, LS_MONSTER } from '../js/const.js';
import { light_globals_init, new_light_source } from '../js/light.js';
import { emits_light } from '../js/mondata.js';
import { init_vision_globals, vision_reset, vision_recalc } from '../js/vision.js';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hallu of [false, true]) for (const blind of [false, true]) {
    for (const mode of ['behead', 'non-trigger', 'ghost', 'headless', 'jabberwock']) {
        test(`Vorpal feedback Hallu=${hallu} Blind=${blind} ${mode}`, async () => {
            const outcomes = [];
            for (const planning of [true, false]) {
                await runSegment({ seed: 8432214, datetime: '20270116120000',
                    nethackrc: 'OPTIONS=name:VorpalOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
                game.level = new GameMap(); game.head_engr = null;
                for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                    game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
                }
                game.u.ux = 5; game.u.uy = 7; game.context.mon_moving = true;
                game.gn ??= {}; game.gn.notonhead = false;
                for (const [p, active] of [[HALLUC, hallu], [BLINDED, blind], [DETECT_MONSTERS, true], [SEE_INVIS, false]]) {
                    game.u.uprops[p].intrinsic = active ? 1000 : 0;
                    game.u.uprops[p].extrinsic = 0;
                }
                const type = mode === 'ghost' ? PM_GHOST : mode === 'headless' ? PM_FIRE_VORTEX
                    : mode === 'jabberwock' ? PM_JABBERWOCK : PM_LICH;
                const agr = newMonster({ data: game.mons[PM_SAMURAI], mnum: PM_SAMURAI,
                    cham: NON_PM, m_id: 9940, mhp: 80, mhpmax: 80, m_lev: 12, mcansee: true, mcanmove: true });
                const def = newMonster({ data: game.mons[type], mnum: type, cham: NON_PM,
                    m_id: 9941, mhp: 61, mhpmax: 61, m_lev: 11, minvis: true, mcansee: true, mcanmove: true });
                agr.nmon = def; game.level.monlist = agr;
                place_monster(agr, 7, 7, game); place_monster(def, 8, 7, game);
                const catalog = game.objects[LONG_SWORD];
                const weapon = newObject({ otyp: LONG_SWORD, oclass: catalog.oc_class,
                    material: catalog.oc_material, owt: catalog.oc_weight, quan: 1, spe: 0,
                    where: OBJ_MINVENT, ocarry: agr, owornmask: W_WEP, dknown: false });
                artifact_exists(weapon, 'Vorpal Blade', true, 0, game);
                assert.equal(weapon.oartifact, ART_VORPAL_BLADE);
                agr.minvent = weapon; agr.mw = weapon; agr.misc_worn_check = W_WEP;
                light_globals_init(game);
                for (const subject of [agr, def]) {
                    const radius = emits_light(subject.data);
                    if (radius) new_light_source(subject.mx, subject.my, radius, LS_MONSTER, subject, game);
                }
                init_vision_globals(); vision_reset(game); vision_recalc(0);
                const state = planning ? planningState(game) : game;
                const attacker = state.level.monlist, defender = attacker.nmon, blade = attacker.mw;
                const core = structuredClone(game.coreCtx), display = structuredClone(game.displayCtx);
                const ownDisplay = structuredClone(state.displayCtx), map = structuredClone(game.level.locations);
                const known = weapon.dknown, bonus = game.spec_dbon_applies;
                const lines = [], draws = [], cosmetic = [];
                let names = 0;
                const random = { rnd: n => { draws.push(['rnd', n]); return 1; },
                    rn2: n => { draws.push(['rn2', n]); return 1; } };
                const damage = { value: 5 };
                const roll = mode === 'non-trigger' || mode === 'jabberwock' ? 2 : 1;
                const result = await artifact_hit(attacker, defender, blade, damage, roll, state, {
                    state, planning, random, displayRandom: n => {
                        cosmetic.push(n); rn2_on_display_rng(n, state);
                        return n === 430 ? names++ : 0;
                    }, message: async line => lines.push(line) });
                const fatal = mode === 'behead' || mode === 'jabberwock';
                const feedback = mode !== 'non-trigger' && (mode !== 'headless' || !blind);
                assert.equal(result, mode === 'non-trigger' ? false : mode === 'headless' ? !blind : true);
                assert.equal(damage.value, fatal ? 322 : mode === 'headless' ? 0 : 6);
                assert.deepEqual(draws, fatal ? [['rnd', 1], ['rn2', 2]] : [['rnd', 1]]);
                assert.deepEqual(cosmetic, !hallu ? [] : feedback ? [430, 2, 430, 2] : [430, 2]);
                const expected = { displayCtx: ownDisplay };
                for (const n of cosmetic) rn2_on_display_rng(n, expected);
                assert.deepEqual(state.displayCtx, expected.displayCtx);
                assert.deepEqual(game.coreCtx, core); assert.deepEqual(game.level.locations, map);
                if (planning) {
                    assert.deepEqual(game.displayCtx, display);
                    assert.equal(weapon.dknown, known);
                    assert.equal(game.spec_dbon_applies, bonus);
                }
                const target = hallu ? 'the invisible killer bee'
                    : mode === 'jabberwock' ? 'the invisible jabberwock' : 'the invisible lich';
                assert.deepEqual(lines, fatal ? [`Vorpal Blade decapitates ${target}!`]
                    : mode === 'ghost' ? [`Vorpal Blade slices through ${hallu ? 'the invisible killer bee' : 'the invisible ghost'}'s neck.`]
                        : mode === 'headless' && !blind ? [`Somehow, the ${hallu ? 'killer bee' : 'joshu'} misses wildly.`] : []);
                assert.equal(attacker.mhp, 80); assert.equal(defender.mhp, 61);
                assert.equal(blade.ocarry, attacker); assert.equal(attacker.minvent, blade);
                assert.equal(state.level.monsters[8][7], defender);
                outcomes.push({ result, damage: damage.value, draws, cosmetic, lines });
            }
            assert.deepEqual(outcomes[0], outcomes[1]);
        });
    }
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test(`Vorpal feedback ${name} matches public C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(readFileSync(new URL(
                '../recordings/artifact.c/vorpal-feedback-' + name + '.session.json', import.meta.url)));
            if (name !== 'before-control') assert.ok(c.segments[0].steps.some(step =>
                /Vorpal Blade (beheads|decapitates)/u.test(step.screen)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
