import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { planningState, wieldMonsterItemAgainstMonster } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_HUMAN, NON_PM } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, SEE_INVIS, ROOM, STONE, M_ATTK_MISS, OBJ_MINVENT, W_WEP } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { canspotmon, canseemon } from '../js/display.js';
import { mattackm } from '../js/mhitm.js';
import { CLUB } from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import { rn2_on_display_rng } from '../js/rng.js';

for (const hidden of [true,false]) for (const armed of [true]) for (const hallucinating of [true, false]) for (const detected of [true, false]) {
    test(`weapon-swing attacker feedback armed=${armed} Hallu=${hallucinating} Detect=${detected} hidden=${hidden}`, async () => {
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432199, datetime: '20261214120000',
                nethackrc: 'OPTIONS=name:CombatNameOwner,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
            game.level = new GameMap(); game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
            }
            game.u.ux = 5; game.u.uy = 7;
            for (const [property, active] of [[BLINDED, false], [HALLUC, hallucinating], [DETECT_MONSTERS, detected], [SEE_INVIS, false]]) {
                game.u.uprops[property].intrinsic = active ? 1000 : 0;
                game.u.uprops[property].extrinsic = 0;
            }
            const make = (id, invisible) => newMonster({ data: game.mons[PM_HUMAN], mnum: PM_HUMAN,
                cham: NON_PM, m_id: id, m_lev: 1, mhp: 20, mhpmax: 20, mcanmove: true, mcansee: true, minvis: invisible });
            const attacker = make(9900, false), defender = make(9901, false);
            if(hidden) game.level.at(6, 7).typ = STONE;
            if (armed) {
                const club = newObject({ otyp: CLUB, oclass: game.objects[CLUB].oc_class,
                    material: game.objects[CLUB].oc_material, quan: 1, spe: 0,
                    where: OBJ_MINVENT, ocarry: attacker, owornmask: W_WEP, dknown: true });
                attacker.minvent = club; attacker.mw = club;
                attacker.misc_worn_check = W_WEP;
            }
            attacker.nmon = defender; game.level.monlist = attacker;
            place_monster(attacker, 7, 7, game); place_monster(defender, 7, 6, game);
            // C fightm:141 sets the target square before calling mattackm.
            game.gb.bhitpos = { x: 7, y: 6 };
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            const state = planning ? planningState(game) : game;
            const agr = state.level.monlist, def = agr.nmon;
            assert.equal(canseemon(agr, state), !hidden);
            const known=detected||!hidden;
            assert.equal(canspotmon(agr, state), known);
            assert.equal(canseemon(def, state), true);
            const ownDisplay = structuredClone(state.displayCtx), liveDisplay = structuredClone(game.displayCtx);
            const core = structuredClone(game.coreCtx), gv = structuredClone(game.gv);
            const draws = [], cosmetic = [], messages = [];
            const result = await mattackm(agr, def, {
                state, planning,
                random: {
                    rnd: bound => { draws.push(['rnd', bound]); return bound; },
                    rn2: bound => { draws.push(['rn2', bound]); return bound === 4 ? 0 : bound - 1; },
                    d: (n, size) => { draws.push(['d', n, size]); return n; },
                },
                canSeeMonster: subject => canseemon(subject, state),
                displayRandom: bound => { cosmetic.push(bound); rn2_on_display_rng(bound, state); return 0; },
                message: async line => messages.push(line),
                wieldMonsterItemAgainstMonster,
            });
            assert.deepEqual(draws,[...(hallucinating ? [['rn2',4]] : []),['rnd',20],['rn2',3]]);
            assert.deepEqual(cosmetic,hallucinating ? (known ? [430,2,430,2,430,2,430,2] : [430,2,430,2]) : []);
            assert.equal(result, M_ATTK_MISS);
            const actor = known ? (hallucinating ? 'The giant ant' : 'The human') : 'It';
            assert.equal(messages[0], actor+' swings '+(hallucinating || known ? 'his' : 'its')+' club at the '+(hallucinating ? 'giant ant' : 'human')+'.');
            assert.deepEqual(game.coreCtx, core);
            assert.equal(def.mhp, 20);
            if (hallucinating) assert.notDeepEqual(state.displayCtx, ownDisplay);
            else assert.deepEqual(state.displayCtx, ownDisplay);
            if (planning) {
                assert.deepEqual(game.displayCtx, liveDisplay);
                assert.deepEqual(game.gv, gv);
                assert.equal(defender.mhp, 20);
            }
        }
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('weapon-swing sensed prefix ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mhitm.c/swing-attacker-name-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
