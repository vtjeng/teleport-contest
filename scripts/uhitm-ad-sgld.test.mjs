// uhitm.c:2790–2855: shared gold-theft direction and ownership branches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { mhitm_adtyping } from '../js/uhitm.js';
import { findgold } from '../js/steal.js';
import { newMonster, place_monster } from '../js/monst.js';
import { mksobj } from '../js/obj.js';
import { add_to_minv, addinv_runtime, INVLET_BASIC, obj_extract_self } from '../js/invent.js';
import { inv_cnt } from '../js/hack.js';
import { GOLD_PIECE, DAGGER } from '../js/objects.js';
import { AD_SGLD, AT_CLAW, PM_LEPRECHAUN, PM_DWARF, NON_PM } from '../js/monsters.js';
import { COLNO, M_ATTK_AGR_DONE, OBJ_FLOOR, OBJ_MINVENT, ROOM, ROWNO, STRAT_WAITFORU } from '../js/const.js';
// A synthetic one-claw attack selects AD_SGLD without relying on damage dice;
// the nine-point mhm fixture distinguishes preservation from the zeroing arms.
const mattk = { aatyp: AT_CLAW, adtyp: AD_SGLD, damn: 1, damd: 2 };
async function fixture() {
    // Directly chosen Healer startup supplies existing gold for merge coverage.
    await runSegment({ seed: 16381001, datetime: '20560614151619',
        nethackrc: 'OPTIONS=name:Ada,role:Healer,race:human,gender:female,align:neutral,playmode:debug,!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen,!acoustics\n', moves: '' });
    // Setup feedback has already been observed; the drop fixture starts with
    // an empty message window so its canonical burden output has room.
    clearTtyMessageWindow(game);
    const monster = pm => newMonster({ data: game.mons[pm], mnum: pm,
        cham: NON_PM, mx: game.u.ux + 1, my: game.u.uy, mhp: 10, mhpmax: 10,
        mcanmove: 1, mcansee: 1, mstrategy: STRAT_WAITFORU });
    const lines = [];
    const env = { message: async text => { lines.push(text); },
        unsupported: reason => { throw new Error(reason); },
        random: { rn2: () => { throw new Error('unexpected handler RNG'); },
            rnd: () => { throw new Error('unexpected handler RNG'); },
            d: () => { throw new Error('unexpected handler RNG'); } } };
    return { monster, lines, env };
}
function leprechaunHero() {
    game.u.umonnum = PM_LEPRECHAUN;
    game.youmonst.data = game.mons[PM_LEPRECHAUN];
}
function mhm() { return { damage: 9, hitflags: 1, done: false }; }
async function gold(mon, quan = 7) {
    // Seven distinguishes the incoming stack from the starting purse.
    const obj = mksobj(GOLD_PIECE, false, false, { state: game });
    obj.quan = quan;
    add_to_minv(mon, obj, { state: game });
    return obj;
}

test('hero no-gold arm clears damage without inventing feedback or RNG', async () => {
    const { monster, lines, env } = await fixture(); leprechaunHero();
    const hit = mhm();
    await mhitm_adtyping(game.youmonst, mattk, monster(PM_DWARF), hit, game, env);
    assert.equal(hit.damage, 0);
    assert.equal(hit.hitflags, 1);
    assert.deepEqual(lines, []);
});

test('hero gold acquisition extracts before merging into the existing purse', async () => {
    const { monster, lines, env } = await fixture(); leprechaunHero();
    const target = monster(PM_DWARF);
    const incoming = await gold(target);
    const purse = findgold(game.invent);
    const before = purse.quan;
    const hit = mhm();
    await mhitm_adtyping(game.youmonst, mattk, target, hit, game, env);
    assert.equal(target.minvent, null);
    assert.equal(findgold(game.invent), purse);
    assert.equal(purse.quan, before + 7);
    assert.notEqual(incoming.where, OBJ_MINVENT);
    assert.deepEqual(lines, ['Your purse feels heavier.']);
    assert.equal(hit.damage, 0);
});

test('gold still merges when all fifty-two non-gold inventory slots are occupied', async () => {
    const { monster, lines, env } = await fixture(); leprechaunHero();
    // Unique spe values prevent the padding daggers from merging with each other.
    for (let spe = 100; inv_cnt(false, game) < INVLET_BASIC; ++spe) {
        const obj = mksobj(DAGGER, false, false, { state: game }); obj.spe = spe;
        await addinv_runtime(obj, { state: game });
    }
    assert.equal(inv_cnt(false, game), 52, 'source invlet_basic boundary');
    const target = monster(PM_DWARF); await gold(target);
    await mhitm_adtyping(game.youmonst, mattk, target, mhm(), game, env);
    assert.equal(inv_cnt(false, game), 52);
    assert.equal(target.minvent, null);
    assert.deepEqual(lines, ['Your purse feels heavier.']);
});

test('full inventory with no matching purse drops gold before clearing damage', async () => {
    const { monster, lines, env } = await fixture(); leprechaunHero();
    obj_extract_self(findgold(game.invent), { state: game });
    for (let spe = 100; inv_cnt(false, game) < INVLET_BASIC; ++spe) {
        const obj = mksobj(DAGGER, false, false, { state: game }); obj.spe = spe;
        await addinv_runtime(obj, { state: game });
    }
    const target = monster(PM_DWARF); const incoming = await gold(target);
    const hit = mhm();
    await mhitm_adtyping(game.youmonst, mattk, target, hit, game, env);
    assert.equal(target.minvent, null);
    assert.equal(findgold(game.invent), null);
    assert.equal(incoming.where, OBJ_FLOOR);
    assert.equal(incoming.ox, game.u.ux);
    assert.equal(incoming.oy, game.u.uy);
    assert.match(lines[0], /You grab the dwarf's gold, but find no room in your knapsack\./u);
    assert.equal(hit.damage, 0);
});

test('monster-pair transfer clears ownership and strategy before restricted teleport feedback', async () => {
    const { monster, lines, env } = await fixture();
    // A source no-teleport level pins the transfer without relocation RNG.
    game.level.flags.noteleport = true;
    game.gv.vis = true;
    const attacker = monster(PM_LEPRECHAUN);
    const target = monster(PM_DWARF); const incoming = await gold(target);
    const hit = mhm();
    await mhitm_adtyping(attacker, mattk, target, hit, game, env);
    assert.equal(target.minvent, null);
    assert.equal(attacker.minvent, incoming);
    assert.equal(incoming.where, OBJ_MINVENT);
    assert.equal(incoming.ocarry, attacker);
    assert.equal(target.mstrategy, 0);
    assert.equal(hit.damage, 0);
    assert.equal(hit.hitflags, 1, 'AGR_DONE is written only after tele_restrict returns false');
    assert.match(lines[0], /steals some gold from the dwarf\./u);
    assert.match(lines[1], /A mysterious force prevents the leprechaun from teleporting!/u);
});

test('incoming same-species attack prints hit but preserves initialized damage', async () => {
    const { monster, lines, env } = await fixture(); leprechaunHero();
    const hit = mhm();
    await mhitm_adtyping(monster(PM_LEPRECHAUN), mattk, game.youmonst, hit, game, env);
    assert.equal(hit.damage, 9);
    assert.match(lines.join('\n'), /leprechaun hits/u);
    assert.equal(game.unported?.has('steal.c stealgold') ?? false, false);
});

test('canceled incoming attacker skips the precisely named discarded stealgold call', async () => {
    const { monster, env } = await fixture();
    const attacker = monster(PM_LEPRECHAUN); attacker.mcan = 1;
    const hit = mhm();
    await mhitm_adtyping(attacker, mattk, game.youmonst, hit, game, env);
    assert.equal(hit.damage, 9);
    assert.equal(game.unported?.has('steal.c stealgold') ?? false, false);
    attacker.mcan = 0;
    await mhitm_adtyping(attacker, mattk, game.youmonst, hit, game, env);
    assert.equal(game.unported.has('steal.c stealgold'), true);
});

test('monster-pair cancellation clears damage before leaving gold and strategy alone', async () => {
    const { monster, lines, env } = await fixture();
    const attacker = monster(PM_LEPRECHAUN); attacker.mcan = 1;
    const target = monster(PM_DWARF); const incoming = await gold(target);
    const hit = mhm();
    await mhitm_adtyping(attacker, mattk, target, hit, game, env);
    assert.equal(hit.damage, 0);
    assert.equal(target.minvent, incoming);
    assert.equal(incoming.ocarry, target);
    assert.equal(target.mstrategy, STRAT_WAITFORU);
    assert.deepEqual(lines, []);
});

test('monster-pair no-gold return does not clear wait strategy or change hitflags', async () => {
    const { monster, lines, env } = await fixture();
    const target = monster(PM_DWARF); const hit = mhm();
    await mhitm_adtyping(monster(PM_LEPRECHAUN), mattk, target, hit, game, env);
    assert.equal(hit.damage, 0);
    assert.equal(hit.hitflags, 1);
    assert.equal(target.mstrategy, STRAT_WAITFORU);
    assert.deepEqual(lines, []);
});

test('hero ownership changes before pending feedback, but damage clears after it', async () => {
    const { monster, env } = await fixture(); leprechaunHero();
    const target = monster(PM_DWARF); await gold(target);
    const purse = findgold(game.invent); const before = purse.quan;
    const hit = mhm();
    let resolveFeedback;
    let reachedFeedback;
    const reached = new Promise(resolve => { reachedFeedback = resolve; });
    const pending = new Promise(resolve => { resolveFeedback = resolve; });
    let settled = false;
    const action = mhitm_adtyping(game.youmonst, mattk, target, hit, game,
        { ...env, message: () => { reachedFeedback(); return pending; } })
        .then(() => { settled = true; });
    await reached;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(target.minvent, null);
    assert.equal(purse.quan, before + 7, 'source addinv precedes Your feedback');
    assert.equal(hit.damage, 9, 'source damage reset follows awaited feedback');
    resolveFeedback(); await action;
    assert.equal(hit.damage, 0);
});

test('monster transfer precedes pending theft feedback and teleport follows it', async () => {
    const { monster, env } = await fixture();
    game.level.flags.noteleport = true; game.gv.vis = true;
    const attacker = monster(PM_LEPRECHAUN); const target = monster(PM_DWARF);
    const incoming = await gold(target); const hit = mhm();
    const lines = [];
    let resolveFeedback;
    let reachedFeedback;
    const reached = new Promise(resolve => { reachedFeedback = resolve; });
    const pending = new Promise(resolve => { resolveFeedback = resolve; });
    let settled = false;
    const action = mhitm_adtyping(attacker, mattk, target, hit, game,
        { ...env, message: text => {
            lines.push(text);
            if (lines.length === 1) { reachedFeedback(); return pending; }
        } }).then(() => { settled = true; });
    await reached;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(target.minvent, null);
    assert.equal(attacker.minvent, incoming);
    assert.equal(target.mstrategy, 0);
    assert.equal(hit.damage, 0);
    assert.equal(lines.length, 1, 'tele_restrict feedback waits for theft feedback');
    resolveFeedback(); await action;
    assert.equal(lines.length, 2);
    assert.equal(hit.done, false, 'C does not set the independent done flag');
});

for (const planning of [false, true]) {
    test(`monster theft relocates in source RNG order (${planning ? 'planning' : 'live'})`, async () => {
        const { monster, env } = await fixture();
        const attacker = monster(PM_LEPRECHAUN); const target = monster(PM_DWARF);
        // Separate live coordinate-index entries, with an independently chosen
        // free ordinary-room destination (8,8). C rloc draws x then y.
        target.mx += 1;
        const destination = [8, 8];
        for (const [x, y] of [[attacker.mx, attacker.my], [target.mx, target.my], destination])
            game.level.at(x, y).typ = ROOM;
        game.level.monlist = attacker; attacker.nmon = target;
        place_monster(attacker, attacker.mx, attacker.my, game);
        place_monster(target, target.mx, target.my, game);
        game.level.flags.noteleport = false;
        game.gv.vis = false; // Suppress branch feedback; isolate relocation output.
        const incoming = await gold(target); const hit = mhm();
        const draws = []; const redraws = [];
        await mhitm_adtyping(attacker, mattk, target, hit, game, {
            ...env, planning, redraw: (...args) => { redraws.push(args); },
            random: { ...env.random,
                rnd: bound => { draws.push(['rnd', bound]); return destination[0]; },
                rn2: bound => { draws.push(['rn2', bound]); return destination[1]; } },
        });
        assert.deepEqual(draws, [['rnd', COLNO - 1], ['rn2', ROWNO]]);
        assert.deepEqual([attacker.mx, attacker.my], destination);
        assert.equal(incoming.ocarry, attacker);
        assert.equal(hit.hitflags, M_ATTK_AGR_DONE);
        assert.equal(hit.done, false);
        assert.equal(redraws.length, planning ? 0 : 2, 'departure and arrival redraws are live only');
    });
}

test('source pins all direction branches and the inventory/relocation order', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/uhitm.c', import.meta.url), 'utf8');
    const body = c.slice(c.indexOf('\nmhitm_ad_sgld('), c.indexOf('\nmhitm_ad_tlpt('));
    assert.match(body, /obj_extract_self\(mongold\);\s+if \(merge_choice\(gi.invent, mongold\)\s+\|\| inv_cnt\(FALSE\) < invlet_basic\)/u);
    assert.match(body, /exercise\(A_DEX, TRUE\);\s+mhm->damage = 0;/u);
    assert.match(body, /hitmsg\(magr, mattk\);\s+if \(pd->mlet == pa->mlet\)\s+return;\s+if \(!magr->mcan\)\s+stealgold\(magr\);/u);
    assert.match(body, /obj_extract_self\(gold\);\s+add_to_minv\(magr, gold\);[\s\S]*?mdef->mstrategy &= ~STRAT_WAITFORU[\s\S]*?mhm->hitflags = M_ATTK_AGR_DONE;\s+\(void\) rloc\(magr, RLOC_NOMSG\);/u);
});
