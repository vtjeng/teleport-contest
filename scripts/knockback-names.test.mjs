import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_FIRE_GIANT, PM_GOBLIN, AD_PHYS, AT_WEAP } from '../js/monsters.js';
import { mhitm_knockback } from '../js/uhitm.js';
import { planningState } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, DETECT_MONSTERS, BLINDED, SEE_INVIS, M_ATTK_HIT, OBJ_MINVENT } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { canseemon } from '../js/display.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { newObject } from '../js/obj.js';
import { LOADSTONE } from '../js/objects.js';

for (const hallu of [false, true]) for (const mode of ['rejected', 'steadfast', 'moved']) {
    test(`knockback naming Hallu=${hallu} mode=${mode}`, async () => {
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432208, datetime: '20261226120000',
                nethackrc: 'OPTIONS=name:KnockName,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
            game.level = new GameMap(); game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
            }
            game.u.ux = 5; game.u.uy = 7;
            for (const [property, active] of [[HALLUC, hallu], [DETECT_MONSTERS, true], [BLINDED, false], [SEE_INVIS, false]]) {
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
                game.u.uprops[property].extrinsic = 0;
            }
            const attacker = newMonster({ data: game.mons[PM_FIRE_GIANT], mnum: PM_FIRE_GIANT,
                m_id: 9917, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true });
            const defender = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
                m_id: 9918, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true, movement: 12 });
            if (mode === 'steadfast') defender.minvent = newObject({ otyp: LOADSTONE,
                oclass: game.objects[LOADSTONE].oc_class, material: game.objects[LOADSTONE].oc_material,
                quan: 1, owt: game.objects[LOADSTONE].oc_weight, where: OBJ_MINVENT, ocarry: defender });
            attacker.nmon = defender; game.level.monlist = attacker;
            place_monster(attacker, 6, 7, game); place_monster(defender, 7, 7, game);
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            let frames = 0; game._animationFrameHook = async () => { frames++; };
            const state = planning ? planningState(game) : game;
            const agr = state.level.monlist, def = agr.nmon, draws = [], lines = [], cosmetic = [];
            const core = structuredClone(game.coreCtx), live = structuredClone(game.displayCtx);
            const random = { rn2: n => { draws.push(n); return n === 3 || n === 4 ? 1 : n === 6 && mode === 'rejected' ? 1 : 0; } };
            const flags = { value: M_ATTK_HIT };
            const attack = agr.data.mattk.find(a => a.aatyp === AT_WEAP && a.adtyp === AD_PHYS);
            assert.ok(attack);
            const result = await mhitm_knockback(agr, def, attack, flags, false, state, {
                state, planning, random,
                displayRandom: n => { cosmetic.push(n); rn2_on_display_rng(n, state); return 0; },
                canSeeMonster: monster => canseemon(monster, state),
                message: async line => lines.push(line),
                unsupported: reason => { throw new Error(reason); },
            }, random);
            assert.equal(result, mode === 'moved');
            assert.deepEqual(draws, mode === 'moved' ? [3, 6, 2, 2, 4] : [3, 6]);
            assert.deepEqual(lines, mode === 'rejected' ? [] : mode === 'steadfast'
                ? [`The ${hallu ? 'giant ant' : 'goblin'} doesn't budge.`]
                : [`The ${hallu ? 'giant ant' : 'fire giant'} knocks the ${hallu ? 'giant ant' : 'goblin'} backward with a powerful strike!`]);
            assert.deepEqual(cosmetic, !hallu || mode === 'rejected' ? [] : mode === 'steadfast' ? [430, 2] : [430, 2, 430, 2]);
            assert.equal(def.mx, mode === 'moved' ? 8 : 7);
            assert.equal(frames, !planning && mode === 'moved' ? 1 : 0);
            assert.equal(def.mhp, 20); assert.equal(agr.mhp, 20);
            assert.deepEqual(game.coreCtx, core);
            if (mode === 'moved') { assert.equal(def.movement, 0); assert.equal(def.mstun, 1); }
            if (planning) { assert.deepEqual(game.displayCtx, live); assert.equal(defender.mx, 7); assert.equal(defender.movement, 12); }
        }
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('knockback naming ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/uhitm.c/knockback-names-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
