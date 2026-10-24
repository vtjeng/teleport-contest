import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster, m_at } from '../js/monst.js';
import { PM_FLAMING_SPHERE, AT_EXPL, AD_FIRE, NON_PM } from '../js/monsters.js';
import { mon_explodes } from '../js/explode.js';
import { planningState } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, DEAF, BLINDED, FIRE_RES, LS_MONSTER } from '../js/const.js';
import { emits_light } from '../js/mondata.js';
import { light_globals_init, new_light_source } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hallu of [false, true]) for (const liveDefault of [false, true]) {
    test(`explosion description Hallu=${hallu} liveDefault=${liveDefault}`, async () => {
        await runSegment({ seed: 8432209, datetime: '20261229120000',
            nethackrc: 'OPTIONS=name:ExplosionOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips,!acoustics\n', moves: ' ' });
        game.level = new GameMap(); game.head_engr = null; game.invent = null;
        for (const slot of ['uwep', 'uswapwep', 'uquiver', 'uarm', 'uarmc', 'uarmh', 'uarmg', 'uarmf', 'uarms', 'uarmu', 'uamul', 'uleft', 'uright', 'ublindf']) game[slot] = null;
        for (const property of game.u.uprops) if (property) property.extrinsic = 0;
        game.u.uhp = game.u.uhpmax = 100;
        for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
            game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
        }
        game.u.ux = 5; game.u.uy = 7; game.context.mon_moving = true;
        for (const [property, active] of [[HALLUC, hallu], [DEAF, true], [BLINDED, false], [FIRE_RES, false]]) {
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
            game.u.uprops[property].extrinsic = 0;
        }
        const sphere = newMonster({ data: game.mons[PM_FLAMING_SPHERE], mnum: PM_FLAMING_SPHERE,
            m_id: 9919, cham: NON_PM, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true });
        game.level.monlist = sphere; place_monster(sphere, 6, 7, game);
        light_globals_init(game);
        new_light_source(sphere.mx, sphere.my, emits_light(sphere.data), LS_MONSTER, sphere, game);
        init_vision_globals(); vision_reset(game); vision_recalc(0);
        const observations = [];
        for (const planning of [true, false]) {
            const state = planning ? planningState(game) : game;
            const monster = state.level.monlist, lines = [], draws = [], cosmetic = [];
            const core = structuredClone(game.coreCtx), live = structuredClone(game.displayCtx);
            const context = structuredClone(game.context);
            const attack = monster.data.mattk.find(a => a.aatyp === AT_EXPL && a.adtyp === AD_FIRE);
            assert.ok(attack);
            await mon_explodes(monster, attack, state, {
                state, planning,
                random: {
                    d: (n, sides) => { draws.push(['d', n, sides]); return n; },
                    // Torso choice terminates C burnarmor() even without armor;
                    // repeatedly choosing an empty helmet would retry forever.
                    rn2: n => { draws.push(['rn2', n]); assert.ok(draws.length < 30); return n === 5 ? 1 : 0; },
                    rnd: n => { draws.push(['rnd', n]); return 1; },
                    rn1: (n, base) => { draws.push(['rn1', n, base]); return base; },
                    rne: n => { draws.push(['rne', n]); return 1; },
                },
                ...(planning || !liveDefault ? { displayRandom: n => { cosmetic.push(n); return rn2_on_display_rng(n, state); } } : {}),
                message: async line => lines.push(line),
                unsupported: reason => { throw new Error(reason); },
            });
            assert.deepEqual(draws, [['d', 4, 6], ['rn2', 5], ['rn2', 5], ['rn2', 2]]);
            assert.deepEqual(lines, [`You are caught in the ${hallu ? 'owlpug' : 'flaming sphere'}'s explosion!`]);
            assert.deepEqual(cosmetic, hallu && (planning || !liveDefault) ? [430, 7640] : []);
            assert.equal(state.u.uhp, 96); assert.equal(monster.mhp, 0);
            assert.equal(monster.data, state.mons[PM_FLAMING_SPHERE]);
            assert.equal(m_at(6, 7, state), null); assert.equal(state.gl.light_base, null);
            assert.equal(state.killer.name, '');
            assert.deepEqual(game.coreCtx, core); assert.deepEqual(game.context, context);
            if (planning) {
                assert.deepEqual(game.displayCtx, live); assert.equal(game.u.uhp, 100);
                assert.equal(sphere.mhp, 20); assert.equal(game.gl.light_base.id, sphere);
            }
            observations.push({ lines, display: structuredClone(state.displayCtx) });
        }
        assert.deepEqual(observations[0], observations[1]);
    });
}

for (const name of ['normal', 'monochrome', 'nonhallucinating-control']) {
    test('explosion description ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/explode.c/hallucinatory-description-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
