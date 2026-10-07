// polyself.c:1642-1774 dogaze and :1894-1938 domindblast. Constructed
// branches pin C conditions and draw order; admitted v24 recordings establish
// #monster dispatch and live message/death ordering independently.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import * as M from '../js/monsters.js';
import {
    BLINDED, BOLT_LIM, CONFUSION, COULD_SEE, ECMD_OK, ECMD_TIME,
    FREE_ACTION, HALLUC, IN_SIGHT, INVIS, M_AP_OBJECT, ROOM,
} from '../js/const.js';
import { dogaze, domindblast } from '../js/polyself.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';

const source = readFileSync(new URL('../nethack-c/upstream/src/polyself.c', import.meta.url), 'utf8');
const gazeSource = source.slice(source.indexOf('dogaze(void)'), source.indexOf('dohide(void)'));
const blastSource = source.slice(source.indexOf('domindblast(void)'), source.indexOf('uunstick(void)'));

async function fixture(form = M.PM_UMBER_HULK) {
    // Independent startup seed/date; the branch fixtures replace the level
    // and actors, so none relies on a generated target or challenge input.
    await runSegment({ seed: 124070101, datetime: '20480809121723', moves: '',
        nethackrc: 'OPTIONS=name:GazeBranches,role:Wizard,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    game.level = new GameMap();
    for (const column of game.level.locations)
        for (const location of column) location.typ = ROOM;
    // Interior coordinates allow distance tests on both sides of BOLT_LIM.
    Object.assign(game.u, { ux: 40, uy: 10, uen: 30, ulevel: 7, umonnum: form });
    game.youmonst.data = game.mons[form];
    game.viz_array = Array.from({ length: 21 }, () => Array(80).fill(IN_SIGHT | COULD_SEE));
    for (const property of game.u.uprops)
        if (property) Object.assign(property, { intrinsic: 0, extrinsic: 0, blocked: 0 });
    game.flags.confirm = false;
    game.flags.safe_dog = true;
    game._pending_message = '';
    game._ttyToplines = '';
    // A real display still records messages; automatic spaces acknowledge
    // More without changing the source function's awaited output path.
    game.nhDisplay.readKey = async () => ' '.charCodeAt(0);
    game.fmon = null; // The obsolete head must never hide a live level actor.
    initRng(1); // Fixed stream isolates the C wrapper bounds and short circuits.
    enableRngLog();
    return game;
}

function actor(state, species, extra = {}) {
    const mon = newMonster({ data: state.mons[species], mnum: species,
        // Adjacent actor, 100 HP above d(2,6) and rnd(15), no death-tail draws.
        mx: 41, my: 10, mhp: 100, mhpmax: 100, m_id: 1234,
        mcansee: true, mcanmove: true, mpeaceful: false, ...extra });
    if (mon.mhp > 0) place_monster(mon, mon.mx, mon.my, state);
    mon.nmon = state.level.monlist;
    state.level.monlist = mon;
    return mon;
}
const draws = () => getRngLog().filter(line => /^(?:rn2|rnd|d)\(/u.test(line));

test('source gates and the canonical list correspond to both whole C functions', () => {
    assert.match(gazeSource, /u\.uen < 15/u);
    assert.match(gazeSource, /for \(mtmp = fmon; mtmp; mtmp = mtmp->nmon\)/u);
    assert.match(blastSource, /nmon = mtmp->nmon;/u);
    assert.match(blastSource, /u_sen \|\| \(telepathic\(mtmp->data\) && rn2\(2\)\) \|\| !rn2\(10\)/u);
    assert.match(blastSource, /wakeup\(mtmp, \(dmg > mtmp->mhp\) \? TRUE : FALSE\);/u);
});

test('dogaze rejects invalid attack, blindness, hallucination and insufficient energy without time or draws', async () => {
    // C checks invalid AD_STON before any property or energy gate.
    const invalid = await fixture(M.PM_MEDUSA);
    assert.equal(await dogaze(invalid), ECMD_OK);
    assert.equal(invalid.u.uen, 30);
    assert.ok(invalid.unported.has('pline.c impossible'));
    for (const property of [BLINDED, HALLUC, null]) {
        const state = await fixture();
        if (property) state.u.uprops[property].intrinsic = 1;
        else state.u.uen = 14; // Immediately below C's gaze energy threshold.
        const before = state.u.uen;
        assert.equal(await dogaze(state), ECMD_OK);
        assert.equal(state.u.uen, before);
        assert.deepEqual(draws(), []);
    }
});

test('confusion gaze reaches the level actor, preserves repeated confusion and spends 15 energy', async () => {
    const state = await fixture();
    const mon = actor(state, M.PM_NEWT);
    assert.equal(await dogaze(state), ECMD_TIME);
    assert.equal(state.u.uen, 15);
    // ttyPline flushes the status flag set before the first gaze message.
    assert.equal(mon.mconf, 1);
    assert.equal(state._ttyPreviousMessage, 'Your gaze confuses the newt!');
    await dogaze(state);
    assert.equal(state.u.uen, 0);
    assert.equal(state._ttyPreviousMessage, 'The newt is getting more and more confused.');
    assert.deepEqual(draws(), []);
});

test('gaze filters dead, disguised, tame, helpless, stunned, blind and eyeless actors', async () => {
    // Each source gate must leave confusion unset; looked is decremented only
    // by disguise and inability to meet the gaze, not by the safe-dog arm.
    for (const [species, extra] of [
        [M.PM_NEWT, { mhp: 0 }], [M.PM_NEWT, { m_ap_type: M_AP_OBJECT }],
        [M.PM_NEWT, { mtame: 1 }], [M.PM_NEWT, { mcanmove: false }],
        [M.PM_NEWT, { mstun: true }], [M.PM_NEWT, { mcansee: false }],
        [M.PM_GELATINOUS_CUBE, {}],
    ]) {
        const state = await fixture();
        const mon = actor(state, species, extra);
        assert.equal(await dogaze(state), ECMD_TIME);
        assert.equal(Boolean(mon.mconf), false);
        assert.deepEqual(draws(), []);
    }
});

test('hero invisibility suppresses gaze; confusion overrides safe_dog', async () => {
    const state = await fixture();
    const mon = actor(state, M.PM_NEWT, { mtame: 1 });
    state.u.uprops[INVIS].intrinsic = 1;
    await dogaze(state);
    assert.equal(state._ttyPreviousMessage, 'The newt seems not to notice your gaze.');
    assert.equal(Boolean(mon.mconf), false);
    state.u.uprops[INVIS].intrinsic = 0;
    state.u.uprops[CONFUSION].intrinsic = 1;
    await dogaze(state);
    assert.equal(mon.mconf, 1);
});

test('fire gaze draws damage before inventory threshold even for resistant targets', async () => {
    for (const species of [M.PM_NEWT, M.PM_RED_DRAGON]) {
        const state = await fixture(M.PM_PYROLISK);
        // C lev > rn2(20) is false at level zero, keeping object owners out.
        state.u.ulevel = 0;
        const mon = actor(state, species);
        await dogaze(state);
        const log = draws();
        assert.equal(log.length, 2);
        assert.match(log[0], /^d\(2,6\)=\d+$/u);
        assert.match(log[1], /^rn2\(20\)=\d+$/u);
        assert.equal(mon.mhp, species === M.PM_RED_DRAGON ? 100 : 100 - Number(log[0].split('=')[1]));
    }
});

test('floating eye reads only extrinsic free action and short-circuits high-level rn2(4)', async () => {
    for (const extrinsic of [0, 1]) {
        const state = await fixture();
        actor(state, M.PM_FLOATING_EYE);
        state.u.uprops[FREE_ACTION].intrinsic = 1; // C ignores this field.
        state.u.uprops[FREE_ACTION].extrinsic = extrinsic;
        await dogaze(state);
        if (extrinsic) {
            assert.deepEqual(draws(), []);
            assert.equal(state._ttyPreviousMessage, "You stiffen momentarily under the floating eye's gaze.");
        } else {
            assert.equal(draws().length, 1);
            assert.match(draws()[0], /^d\(1,70\)=\d+$/u); // New actor m_lev=0; monsters.h eye damd=70.
            assert.equal(state.multi, -Number(draws()[0].split('=')[1]));
            assert.equal(state.multi_reason, "frozen by a monster's gaze");
            assert.equal(state.nomovemsg, null);
        }
    }
});

test('domindblast energy and all four candidate filters consume no selection draws', async () => {
    const lacking = await fixture(M.PM_MIND_FLAYER);
    lacking.u.uen = 9; // Immediately below C's 10-energy threshold.
    assert.equal(await domindblast(lacking), ECMD_OK);
    assert.equal(lacking.u.uen, 9);
    assert.deepEqual(draws(), []);
    for (const [species, extra] of [
        [M.PM_NEWT, { mhp: 0 }],
        [M.PM_NEWT, { mx: 40 + BOLT_LIM + 1 }], // Just outside squared bolt range.
        [M.PM_NEWT, { mpeaceful: true }], [M.PM_GELATINOUS_CUBE, {}],
    ]) {
        const state = await fixture(M.PM_MIND_FLAYER);
        const mon = actor(state, species, extra);
        assert.equal(await domindblast(state), ECMD_TIME);
        assert.equal(state.u.uen, 20);
        assert.equal(mon.mhp, extra.mhp ?? 100);
        assert.deepEqual(draws(), []);
    }
});

test('blind telepathic target skips both selection draws and wakes before damage', async () => {
    const state = await fixture(M.PM_MIND_FLAYER);
    const mon = actor(state, M.PM_MIND_FLAYER, { mcansee: false, msleeping: true });
    await domindblast(state);
    assert.equal(draws().length, 1);
    assert.match(draws()[0], /^rnd\(15\)=\d+$/u);
    assert.equal(mon.mhp, 100 - Number(draws()[0].split('=')[1]));
    assert.equal(mon.msleeping, 0);
    // Unseen blindness here belongs to the target; the hero sees its name.
    assert.equal(state._ttyPreviousMessage, "You lock in on the mind flayer's telepathy.");
});

test('latent telepathy and ordinary mind preserve short-circuit selection bounds', async () => {
    for (const species of [M.PM_MIND_FLAYER, M.PM_NEWT]) {
        const state = await fixture(M.PM_MIND_FLAYER);
        actor(state, species);
        await domindblast(state);
        const log = draws();
        let index = 0;
        if (species === M.PM_MIND_FLAYER) {
            assert.match(log[index++], /^rn2\(2\)=[01]$/u);
            if (log[0].endsWith('=1')) {
                assert.match(log[index++], /^rnd\(15\)=\d+$/u);
                assert.equal(log.length, index);
                continue;
            }
        }
        assert.match(log[index++], /^rn2\(10\)=\d+$/u);
        if (log[index - 1].endsWith('=0')) assert.match(log[index++], /^rnd\(15\)=\d+$/u);
        assert.equal(log.length, index);
    }
});

test('declining a peaceful gaze keeps the target peaceful and still spends time', async () => {
    const state = await fixture();
    const mon = actor(state, M.PM_NEWT, { mpeaceful: true });
    state.flags.confirm = true;
    // The only input is C's y_n confirmation, declined with n.
    state.nhDisplay.readKey = async () => 'n'.charCodeAt(0);
    assert.equal(await dogaze(state), ECMD_TIME);
    assert.equal(mon.mpeaceful, true);
    assert.equal(Boolean(mon.mconf), false);
    assert.equal(state.u.uen, 15);
    assert.deepEqual(draws(), []);
});

test('blind psychic actors at the exact range boundary are visited in list order', async () => {
    const state = await fixture(M.PM_MIND_FLAYER);
    // Both telepathic actors are blind, so C uses only one rnd(15) per
    // actor. The first inserted actor is visited second in the nmon chain.
    const tail = actor(state, M.PM_MIND_FLAYER, { mx: 40 + BOLT_LIM, mcansee: false });
    const head = actor(state, M.PM_MIND_FLAYER, { mx: 39, mcansee: false });
    await domindblast(state);
    const log = draws();
    assert.equal(log.length, 2);
    for (const line of log) assert.match(line, /^rnd\(15\)=\d+$/u);
    assert.equal(head.mhp, 100 - Number(log[0].split('=')[1]));
    assert.equal(tail.mhp, 100 - Number(log[1].split('=')[1]));
});
