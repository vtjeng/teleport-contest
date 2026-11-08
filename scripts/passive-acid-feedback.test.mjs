import fs from 'node:fs';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    G_NOGEN,
    LOW_PM,
    M2_PNAME,
    PM_ACID_BLOB,
    PM_HUMAN,
    SPECIAL_PM,
} from '../js/monsters.js';
import { mattackm } from '../js/mhitm.js';
import { wieldMonsterItemAgainstMonster } from '../js/unported_monster_actions.js';
import { ROOM, HALLUC, DETECT_MONSTERS, BLINDED, SEE_INVIS, NEUTRAL } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';
import { canseemon } from '../js/display.js';
import { rn2_on_display_rng } from '../js/rng.js';

// do_name.c hliquids[] (1479-1489), read from the C source with its
// commented-out entry removed.
const HLIQUIDS = [...fs.readFileSync(
    new URL('../nethack-c/upstream/src/do_name.c', import.meta.url), 'utf8',
).match(/hliquids\[\] = \{([\s\S]*?)\};/)[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/"([^"]*)"/g)].map((match) => match[1]);

// do_name.c rndmonnam():1399-1408, replayed on holder.displayCtx. It returns
// the name the C draws settle on. A bogus name (index >= SPECIAL_PM) reads
// the bogusmon file, which this replay does not, so it fails instead.
function replayRndmonnam(holder) {
    let index;
    do {
        index = rn2_on_display_rng(SPECIAL_PM + 100 - LOW_PM, holder) + LOW_PM;
    } while (index < SPECIAL_PM
        && ((game.mons[index].mflags2 & M2_PNAME)
            || (game.mons[index].geno & G_NOGEN)));
    assert.ok(index < SPECIAL_PM, 'the replay covers real species names');
    // pmname(): an absent gendered name falls back to the neutral one.
    const names = game.mons[index].pmnames;
    return names[rn2_on_display_rng(2, holder)] ?? names[NEUTRAL];
}

// hacklib.c s_suffix():345-359 for a monster name.
function possessive(name) {
    return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

// do_name.c hliquid():1495-1508 with liquidpref "acid": the default joins
// the choices as the last index.
function replayHliquid(holder) {
    const index = rn2_on_display_rng(HLIQUIDS.length + 1, holder);
    return index < HLIQUIDS.length ? HLIQUIDS[index] : 'acid';
}

for (const hallu of [false, true]) for (const detected of [false, true]) {
    test(`passive acid feedback Hallu=${hallu} Detect=${detected}`, async () => {
        await runSegment({ seed: 8432205, datetime: '20261220120000',
            nethackrc: 'OPTIONS=name:AcidFeedback,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n', moves: ' ' });
        game.level = new GameMap(); game.head_engr = null;
        for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y) {
            game.level.at(x, y).typ = ROOM; game.level.at(x, y).lit = true;
        }
        game.u.ux = 5; game.u.uy = 7;
        for (const [property, active] of [[HALLUC, hallu], [DETECT_MONSTERS, detected], [BLINDED, false], [SEE_INVIS, false]]) {
            game.u.uprops[property].intrinsic = active ? 1000 : 0;
            game.u.uprops[property].extrinsic = 0;
        }
        const attacker = newMonster({ data: game.mons[PM_HUMAN], mnum: PM_HUMAN,
            m_id: 9913, m_lev: 1, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true });
        const defender = newMonster({ data: game.mons[PM_ACID_BLOB], mnum: PM_ACID_BLOB,
            m_id: 9914, mhp: 20, mhpmax: 20, mcansee: true, mcanmove: true, minvis: true });
        attacker.nmon = defender; game.level.monlist = attacker;
        place_monster(attacker, 6, 7, game); place_monster(defender, 7, 7, game);
        game.gb.bhitpos = { x: 7, y: 7 };
        light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
        const state = game;
        const agr = state.level.monlist, def = agr.nmon;
        const draws = [], lines = [];
        const core = structuredClone(game.coreCtx), live = structuredClone(game.displayCtx);
        const context = structuredClone(game.context);
        const result = await mattackm(agr, def, {
            state,
            random: {
                rnd: n => { draws.push(['rnd', n]); return 1; },
                d: (n, sides) => { draws.push(['d', n, sides]); return n; },
                rn2: n => { draws.push(['rn2', n]); return n === 2 ? 0 : 1; },
            },
            canSeeMonster: monster => canseemon(monster, state),
            message: async line => lines.push(line),
            wieldMonsterItemAgainstMonster,
            unsupported: reason => { throw new Error(reason); },
        });
        assert.equal(result, 1);
        assert.deepEqual(draws, [['rnd', 20], ['d', 1, 6], ['rn2', 3], ['rn2', 6],
            ['d', 1, 8], ['rn2', 2], ['rn2', 30], ['rn2', 6]]);
        assert.equal(agr.mhp, 19); assert.equal(def.mhp, 19);
        assert.deepEqual(game.coreCtx, core); assert.deepEqual(game.context, context);
        if (!hallu) assert.equal(lines[1], detected
            ? "The human is splashed by the invisible acid blob's acid!"
            : 'The human is splashed by its acid!');
        assert.match(lines[1], /is splashed by /);
        // The hallucinated names come from the display stream. Each Monnam()
        // or mon_nam() of a monster the hero can spot is one rndmonnam();
        // mon_nam() of an unspotted one is "it" and draws nothing. In order:
        // mhitm.c hitmm()'s "<agr> hits <def>.", then mhitm.c:1334-1337's
        // Monnam(magr), s_suffix(mon_nam(mdef)) and hliquid("acid").
        const expected = { displayCtx: structuredClone(live) };
        if (hallu) {
            const hitter = replayRndmonnam(expected);
            const hit = detected ? replayRndmonnam(expected) : null;
            const splashed = replayRndmonnam(expected);
            const splasher = detected ? replayRndmonnam(expected) : null;
            const liquid = replayHliquid(expected);
            assert.equal(lines[0], detected
                ? `The ${hitter} hits the invisible ${hit}.`
                : `The ${hitter} hits it.`);
            assert.equal(lines[1], detected
                ? `The ${splashed} is splashed by the invisible ${possessive(splasher)} ${liquid}!`
                : `The ${splashed} is splashed by its ${liquid}!`);
        }
        assert.deepEqual(state.displayCtx, expected.displayCtx);
    });
}

for (const name of ['normal', 'monochrome', 'before-control']) {
    test('passive acid feedback ' + name + ' matches independent C', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(fs.readFileSync(new URL('../recordings/mhitm.c/passive-acid-feedback-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
