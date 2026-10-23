import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BLINDED, DEAF, OBJ_MINVENT, MON_DETACH } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { use_misc } from '../js/muse.js';
import { PM_DJINNI, PM_GOBLIN } from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { POT_GAIN_LEVEL } from '../js/objects.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const freed of [false, true]) {
    for (const deaf of [false, true]) {
        for (const acoustics of [false, true]) {
            test(`monster djinni uses quoted speech: freed=${freed}, deaf=${deaf}, acoustics=${acoustics}`, async () => {
                await runSegment({ seed: 7710044, datetime: '20260214031500',
                    nethackrc: 'OPTIONS=name:DjinniSpeech,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: '' });
                const state = game;
                for (let i = 0; i < 12; ++i) state.nhDisplay.pushKey(32);
                state.flags.acoustics = acoustics;
                state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0 };
                state.u.uprops[DEAF] = { intrinsic: deaf ? 1 : 0, extrinsic: 0 };
                state.mvitals[PM_DJINNI].born = 0;
                state.obj_descr[state.objects[POT_GAIN_LEVEL].oc_descr_idx].oc_descr = 'smoky';
                const potion = newObject({ otyp: POT_GAIN_LEVEL,
                    oclass: state.objects[POT_GAIN_LEVEL].oc_class,
                    owt: state.objects[POT_GAIN_LEVEL].oc_weight,
                    quan: 1, spe: 1, where: OBJ_MINVENT });
                const monster = newMonster({ data: state.mons[PM_GOBLIN], mnum: PM_GOBLIN,
                    mx: 1, my: 1, mhp: 8, mhpmax: 8, mcanmove: true,
                    mcansee: true, minvent: potion });
                potion.ocarry = monster;
                const draws = [];
                assert.equal(await use_misc(monster, { kind: 'gain level', object: potion }, state, {
                    message: async () => {}, random: { rn2: bound => {
                        draws.push(bound); return bound === 2 && freed ? 1 : 0;
                    } },
                }), 2);
                const expected = freed ? '"You freed me!"' : '"It is about time."';
                assert.ok(state.nhDisplay.toplines.includes(expected), state.nhDisplay.toplines);
                assert.ok(!state.nhDisplay.toplines.includes('You hear "'), state.nhDisplay.toplines);
                assert.equal(draws[0], 13);
                assert.equal(state.mvitals[PM_DJINNI].born, 1);
                assert.equal(monster.minvent, null);
                let djinni;
                for (let m = state.level.monlist; m; m = m.nmon) if (m.mnum === PM_DJINNI) djinni = m;
                assert.ok(djinni);
                if (freed) assert.equal(djinni.mpeaceful, 1);
                else assert.ok(djinni.mstate & MON_DETACH);
            });
        }
    }
}
for (const name of ['quoted', 'monochrome', 'before-control']) {
    test('monster djinni speech ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/muse.c/monster-djinni-verbalize-' + name + '.session.json', import.meta.url)));
            const r = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(r.passed, true, formatReport(r));
        } finally { removeScoringWorkspace(root); }
    });
}
