import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_DEATH, NON_PM, AD_DETH } from '../js/monsters.js';
import { mhitm_ad_deth } from '../js/uhitm.js';
import { planningState } from '../js/unported_monster_actions.js';
import { ROOM, ANTIMAGIC, FAINTED, NOT_HUNGRY } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';

for (const awareness of ['awake', 'paralyzed', 'sleeping', 'fainted']) for (const drain of [false, true]) {
    test(`Death sensation awareness=${awareness} drain=${drain}`, async () => {
        for (const planning of [true, false]) {
            await runSegment({ seed: 8432210, datetime: '20261231120000',
                nethackrc: 'OPTIONS=name:DeathFeel,role:Priest,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
            game.level = new GameMap(); game.head_engr = null;
            for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
                game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
            }
            game.u.ux = 5; game.u.uy = 7; game.context.mon_moving = true;
            assert.equal(game.u.uprops[ANTIMAGIC].intrinsic || game.u.uprops[ANTIMAGIC].extrinsic, 0);
            game.multi = awareness === 'awake' ? 0 : -4;
            game.u.usleep = awareness === 'sleeping' ? 1 : 0;
            game.u.uhs = awareness === 'fainted' ? FAINTED : NOT_HUNGRY;
            game.nomovemsg = awareness === 'sleeping' ? 'You wake up.' : 'You can move again.';
            const death = newMonster({ data: game.mons[PM_DEATH], mnum: PM_DEATH,
                m_id: 9920, cham: NON_PM, m_lev: game.mons[PM_DEATH].mlevel,
                mhp: 100, mhpmax: 100, mcansee: true, mcanmove: true });
            game.level.monlist = death; place_monster(death, 6, 7, game);
            light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
            const state = planning ? planningState(game) : game;
            const attacker = state.level.monlist;
            const attack = attacker.data.mattk.find(a => a.adtyp === AD_DETH);
            assert.ok(attack);
            const lines = [], events = [], mhm = { damage: 32, hitflags: 0, permdmg: 0, specialdmg: 0, done: false };
            const core = structuredClone(game.coreCtx), display = structuredClone(game.displayCtx);
            const hp = game.u.uhp, multi = game.multi, sleeping = game.u.usleep;
            await mhitm_ad_deth(attacker, attack, state.youmonst, mhm, state, {
                planning,
                random: { rn2: n => { events.push(['rn2', n]); assert.equal(n, 20); return drain ? 8 : 2; } },
                message: async line => { assert.equal(mhm.permdmg, 0); events.push(['message', line]); lines.push(line); },
                unsupported: reason => { throw new Error(reason); },
            });
            const dreaming = awareness === 'sleeping' || awareness === 'fainted';
            const outcome = drain ? `You ${dreaming ? 'dream that you feel' : 'feel'} your life force draining away...`
                : "Lucky for you, it didn't work!";
            assert.deepEqual(lines, ['Death reaches out with its deadly touch.', outcome]);
            assert.deepEqual(events, [['message', lines[0]], ['rn2', 20], ['message', outcome]]);
            assert.equal(mhm.damage, drain ? 32 : 0); assert.equal(mhm.permdmg, drain ? 1 : 0);
            assert.equal(mhm.done, false); assert.equal(mhm.hitflags, 0);
            assert.equal(state.u.uhp, hp);
            assert.deepEqual(game.coreCtx, core); assert.deepEqual(game.displayCtx, display);
            assert.equal(game.multi, multi); assert.equal(game.u.usleep, sleeping);
        }
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('Death sensation ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/uhitm.c/death-touch-feel-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
