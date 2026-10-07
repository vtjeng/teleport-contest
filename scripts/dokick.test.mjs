import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as kicks from '../js/dokick.js';

const DOKICK_C = readFileSync(
    new URL('../nethack-c/upstream/src/dokick.c', import.meta.url), 'utf8',
);
const DOKICK_JS = readFileSync(new URL('../js/dokick.js', import.meta.url), 'utf8');

test('all seven kick passive calls await the source AD_ENCH message path', () => {
    // C has one post-damage call in kickdmg and six early-return/attack calls
    // in kick_monster; all seven discard the C result but preserve call order.
    const kickDamageStart = DOKICK_C.indexOf('kickdmg(struct monst *mon, boolean clumsy)');
    const kickMonsterStart = DOKICK_C.indexOf(
        '\nkick_monster(struct monst *mon, coordxy x, coordxy y)\n{',
    );
    const kickDamageEnd = DOKICK_C.indexOf('\n}\n', kickDamageStart);
    const kickMonsterEnd = DOKICK_C.indexOf('\n}\n', kickMonsterStart);
    const cKickDamage = DOKICK_C.slice(kickDamageStart, kickDamageEnd);
    const cKickMonster = DOKICK_C.slice(kickMonsterStart, kickMonsterEnd);
    const jsKickDamageStart = DOKICK_JS.indexOf('export async function kickdmg(');
    const jsKickMonsterStart = DOKICK_JS.indexOf('export async function kick_monster(');
    const jsKickDamageEnd = DOKICK_JS.indexOf('\n}\n', jsKickDamageStart);
    const jsKickMonsterEnd = DOKICK_JS.indexOf('\n}\n', jsKickMonsterStart);
    const jsKickDamage = DOKICK_JS.slice(jsKickDamageStart, jsKickDamageEnd);
    const jsKickMonster = DOKICK_JS.slice(jsKickMonsterStart, jsKickMonsterEnd);
    assert.ok(kickDamageStart >= 0 && kickDamageEnd > kickDamageStart);
    assert.ok(kickMonsterStart >= 0 && kickMonsterEnd > kickMonsterStart);
    assert.ok(jsKickDamageStart >= 0 && jsKickDamageEnd > jsKickDamageStart);
    assert.ok(jsKickMonsterStart >= 0 && jsKickMonsterEnd > jsKickMonsterStart);
    assert.equal((cKickDamage.match(/\bpassive\(/gu) ?? []).length, 1);
    assert.equal((cKickMonster.match(/\bpassive\(/gu) ?? []).length, 6);
    assert.equal((jsKickDamage.match(/await passive\(/gu) ?? []).length, 1);
    assert.equal((jsKickMonster.match(/await passive\(/gu) ?? []).length, 6);
    assert.equal((jsKickDamage.match(/(?<!await )passive\(/gu) ?? []).length, 0);
    assert.equal((jsKickMonster.match(/(?<!await )passive\(/gu) ?? []).length, 0);
});

test('dokick.c floor-object kick and gold-catch source owners are exported', () => {
    for (const name of ['ghitm', 'kick_object', 'really_kick_object']) {
        // These are the whole C owners; dokick consumes kick_object's result.
        assert.ok(DOKICK_C.includes(name + '('));
        assert.equal(typeof kicks[name], 'function', name);
    }
});

import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { GOLD_PIECE, COIN_CLASS } from '../js/objects.js';
import { PM_LEPRECHAUN, PM_SOLDIER, PM_SERGEANT, PM_LIEUTENANT,
    PM_CAPTAIN, PM_WATCHMAN } from '../js/monsters.js';
import { OBJ_MINVENT, A_CHA } from '../js/const.js';

async function goldState() {
    // An independently chosen ordinary startup initializes canonical object
    // and monster tables. Archeologists carry no gold, isolating C's bribe.
    await runSegment({ seed: 92681003, datetime: '20800304121000',
        nethackrc: 'OPTIONS=name:GoldUnit,role:Archeologist,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n',
        moves: '' });
    return game;
}
function goldFor(state, quantity) {
    return newObject({ otyp: GOLD_PIECE, oclass: COIN_CLASS,
        quan: quantity, owt: 1 });
}
function goldTarget(state, species) {
    return newMonster({ data: state.mons[species], mx: state.u.ux,
        my: state.u.uy, mcanmove: 1, msleeping: 1, mpeaceful: 0,
        mstrategy: 0 });
}

test('ghitm wakes a greedy sleeper and transfers the caller object', async () => {
    assert.match(DOKICK_C, /if \(!mtmp->isgd && !rn2\(4\)\)/u);
    const state = await goldState();
    const mon = goldTarget(state, PM_LEPRECHAUN);
    const gold = goldFor(state, 1); // One source-valued coin; no inventory merge.
    const draws = [], messages = [];
    assert.equal(await kicks.ghitm(mon, gold, state, {
        random: { rn2: n => { draws.push(n); return 1; } },
        message: async text => messages.push(text),
    }), true);
    assert.deepEqual(draws, [4]); // C's sole ordinary greedy anger gate.
    assert.equal(mon.msleeping, 0);
    assert.equal(gold.where, OBJ_MINVENT);
    assert.equal(gold.ocarry, mon);
    assert.equal(mon.minvent, gold);
    assert.ok(messages.some(text => /awakens and catches the gold/u.test(text)));
});

test('ghitm applies each source mercenary threshold with a strict comparison', async () => {
    assert.match(DOKICK_C, /if \(value > goldreqd\)/u);
    // These four amounts are the literal C rank thresholds, not test tuning.
    for (const [species, required] of [[PM_SOLDIER, 100], [PM_SERGEANT, 250],
        [PM_LIEUTENANT, 500], [PM_CAPTAIN, 750]]) {
        for (const surplus of [0, 1]) {
            const state = await goldState();
            state.u.ulevel = 1;
            state.u.acurr.a[A_CHA] = 10;
            const mon = goldTarget(state, species);
            const draws = [], messages = [];
            await kicks.ghitm(mon, goldFor(state, required + surplus), state, {
                random: { rn2: n => { draws.push(n); return n === 5 ? 0 : 1; } },
                message: async text => messages.push(text),
            });
            assert.deepEqual(draws, [4, 3, 5]); // Anger, bribe gate, level term.
            assert.equal(Boolean(mon.mpeaceful), Boolean(surplus));
            assert.ok(messages.some(text => surplus
                ? /That should do/u.test(text) : /not enough/u.test(text)));
        }
    }
});

test('an unbribable watchman catches gold without rolling a bribe gate', async () => {
    const state = await goldState();
    const mon = goldTarget(state, PM_WATCHMAN);
    const draws = [], messages = [];
    await kicks.ghitm(mon, goldFor(state, 751), state, {
        // 751 exceeds all C rank thresholds; watchmen nevertheless have zero.
        random: { rn2: n => { draws.push(n); return 1; } },
        message: async text => messages.push(text),
    });
    assert.deepEqual(draws, [4]);
    assert.equal(Boolean(mon.mpeaceful), false);
    assert.ok(messages.some(text => /don't take bribes/u.test(text)));
});
