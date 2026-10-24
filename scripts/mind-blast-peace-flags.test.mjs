import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GIANT_RAT, PM_MIND_FLAYER } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { MMOVE_DONE } from '../js/const.js';
import { dochug } from '../js/monmove.js';
import { planningState } from '../js/unported_monster_actions.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

// C stores mpeaceful as a one-bit flag; both JS representations map to that bit.
const flags = [{ value: false, bit: 0 }, { value: 0, bit: 0 },
    { value: true, bit: 1 }, { value: 1, bit: 1 }];
for (const { value: actorPeace, bit: actorBit } of flags) {
    for (const { value: targetPeace, bit: targetBit } of flags) {
        for (const planning of [false, true]) {
            test(`psychic peace flags actor=${actorPeace}:${typeof actorPeace} target=${targetPeace}:${typeof targetPeace} planning=${planning}`, async () => {
                await runSegment({ seed: 8432191, datetime: '20261121120000',
                    nethackrc: 'OPTIONS=name:PeaceFlags,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
                for (const column of game.level.monsters) column.fill(null);
                game.u.uinvulnerable = true; // Isolate the monster-target branch.
                const actor = newMonster({ data: game.mons[PM_MIND_FLAYER], mnum: PM_MIND_FLAYER,
                    m_id: 9100, mx: game.u.ux + 1, my: game.u.uy, mcansee: true,
                    mcanmove: true, mhp: 30, mhpmax: 30, mspec_used: 1 });
                const target = newMonster({ data: game.mons[PM_GIANT_RAT], mnum: PM_GIANT_RAT,
                    m_id: 9101, mx: game.u.ux + 2, my: game.u.uy, mhp: 20,
                    mhpmax: 20, msleeping: true, meating: 4, mcansee: true });
                // Both representations occur in real constructors/anger paths.
                actor.mpeaceful = actorPeace; target.mpeaceful = targetPeace;
                actor.nmon = target; target.nmon = null;
                game.level.monlist = actor;
                place_monster(actor, actor.mx, actor.my, game);
                place_monster(target, target.mx, target.my, game);
                const state = planning ? planningState(game) : game;
                const acting = state.level.monlist, victim = acting.nmon;
                const core = structuredClone(game.coreCtx), draws = [];
                await dochug(acting, {
                    state, planning,
                    random: { rn2: bound => { draws.push(['rn2', bound]); return 0; },
                        rnd: bound => { draws.push(['rnd', bound]); return 3; } },
                    message: async () => {}, preflight: () => {},
                    usePreMoveItems: () => false, moveMonster: () => MMOVE_DONE,
                    attackHero: () => false, wakeMessage: () => {}, monFlee: () => {},
                    monsterCanSeeHero: () => true, unsupported: reason => assert.fail(reason),
                    castUndirectedSpell: () => false,
                    distanceAndFear: () => ({ nearby: true, inrange: true, scared: false }),
                    setApparentHero: () => {}, wipeEngraving: () => {},
                    wieldPreMoveWeapon: () => false, redraw: () => {},
                    questStatCheck: () => {}, questTalk: () => {},
                });
                const opposite = actorBit !== targetBit;
                assert.equal(victim.mhp, opposite ? 17 : 20);
                assert.deepEqual(draws, opposite
                    ? [['rn2', 20], ['rn2', 10], ['rnd', 15]] : [['rn2', 20]]);
                if (opposite) {
                    assert.equal(victim.msleeping, 0); assert.equal(victim.meating, 0);
                }
                if (planning) {
                    assert.equal(target.mhp, 20); assert.equal(target.msleeping, true);
                    assert.equal(target.mpeaceful, targetPeace);
                }
                assert.deepEqual(game.coreCtx, core);
            });
        }
    }
}
for (const name of ['peace', 'monochrome', 'before-control']) {
    test('psychic peace flag ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/monmove.c/mind-blast-peace-flags-' + name + '.session.json', import.meta.url)));
            const r = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(r.passed, true, formatReport(r));
        } finally { removeScoringWorkspace(root); }
    });
}
