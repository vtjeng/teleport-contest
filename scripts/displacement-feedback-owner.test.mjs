import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { planningState } from '../js/unported_monster_actions.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_HUMAN, PM_COCKATRICE } from '../js/monsters.js';
import { BLINDED, HALLUC, DETECT_MONSTERS, SEE_INVIS, ROOM } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { mdisplacem } from '../js/mhitm.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
for(const planning of [false,true])for(const hallucinating of [false,true])for(const detected of [false,true])for(const invisible of [false,true]){test(`displacement petrification names planning=${planning} Hallu=${hallucinating} Detect=${detected} invisible=${invisible}`,async()=>{

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
                m_id: id, m_lev: 1, mhp: 20, mhpmax: 20, mcanmove: true, mcansee: true, minvis: invisible });
            const attacker = make(9900, false), defender = make(9901, invisible); defender.data=game.mons[PM_COCKATRICE]; defender.mnum=PM_COCKATRICE;
            attacker.nmon = defender; game.level.monlist = attacker;
            place_monster(attacker, 6, 7, game); place_monster(defender, 7, 7, game);
light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
const state=planning?planningState(game):game,agr=state.level.monlist,def=agr.nmon,cosmetic=[],messages=[];
const before=structuredClone(game.displayCtx), coreBefore=structuredClone(game.coreCtx);
const result=await mdisplacem(agr,def,false,{state,planning,unsupported:reason=>{throw Error('unexpected '+reason);},random:{rn2:n=>1,rnd:n=>n,rn1:(n,b)=>b,rne:()=>1,rnz:n=>n,d:(n,s)=>n},displayRandom:n=>{cosmetic.push(n);rn2_on_display_rng(n,state);return 0;},message:async s=>messages.push(s)});
assert.equal(result,4);
assert.equal(state.gv.vis,!invisible||detected);
assert.equal(messages.length,planning?0:(!invisible||detected?2:1));
assert.equal(cosmetic.length,hallucinating?(!invisible||detected?6:2):0);
if(hallucinating&&!planning) assert.match(messages.at(-1),/^The giant ant turns to stone!$/u);
if(planning)assert.deepEqual(game.displayCtx,before,'planning must not consume live cosmetic RNG');
assert.ok(agr.mhp<1);
assert.deepEqual(game.coreCtx,coreBefore,'injected operations must not consume live core RNG');
if(planning)assert.equal(attacker.mhp,20,'planning must preserve the live monster');
});}

// C mhitm.c:232-237 formats feedback before monstone, including planning calls.
for (const name of ['normal', 'monochrome', 'before-control', 'ordinary-control']) {
    test(`displacement feedback ${name} matches independent C`, async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL(
                `../recordings/mhitm.c/displacement-feedback-owner-${name}.session.json`, import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
