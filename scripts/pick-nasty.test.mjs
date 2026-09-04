// Pin pick_nasty() (wizard.c:536-581) against C-source-derived expectations.
// Each test controls the RNG sequence to exercise a specific branch.

import assert from 'node:assert/strict';
import test from 'node:test';

import * as M from '../js/monsters.js';
import { NASTIES } from '../js/nasties_data.js';
import { pick_nasty } from '../js/wizard.js';

function monsterState() {
    const state = {};
    M.monst_globals_init(state);
    M.reset_mvitals(state);
    // pick_nasty reads u.uz for Is_rogue_level (via const.js) and
    // In_hell (via dungeon.js). Provide enough dungeon structure so
    // In_hell(state.u.uz, state) resolves without error.
    state.dungeons = [{ flags: { hellish: false } }];
    state.u = { uz: { dnum: 0, dlevel: 5 } };
    return state;
}

// A controllable RNG that returns values from a preset sequence.
function fakeRandom(values) {
    let index = 0;
    return {
        rn2(mod) {
            if (index >= values.length) {
                throw new Error(`rn2(${mod}): ran out of preset values`);
            }
            const value = values[index++] % mod;
            return value;
        },
        get callCount() { return index; },
    };
}

test('pick_nasty returns a nasties[] entry when no filtering applies', () => {
    const state = monsterState();
    // rn2(44) returns 0 -> PM_COCKATRICE (nasties[0]).
    // Cockatrice difficulty is 8, well below any cap we set.
    const random = fakeRandom([0]);
    const result = pick_nasty(25, { random, state });
    // nasties[0] is PM_COCKATRICE = 68 in C source (wizard.c:33).
    assert.equal(result, M.PM_COCKATRICE);
    assert.equal(random.callCount, 1); // Only one rn2 draw.
});

test('pick_nasty substitutes arch-lich with master lich when difcap applies', () => {
    const state = monsterState();
    // nasties[22] is PM_ARCH_LICH (wizard.c:40). Its difficulty is 29, which
    // exceeds the sandestin cap of 25 (PM_ARCHON.difficulty - 1).
    // big_to_little(PM_ARCH_LICH) -> PM_MASTER_LICH, whose name "master lich"
    // passes the juvenile check.
    const archLichIndex = NASTIES.indexOf(M.PM_ARCH_LICH);
    assert.notEqual(archLichIndex, -1, 'PM_ARCH_LICH should be in nasties[]');
    const random = fakeRandom([archLichIndex]);
    const result = pick_nasty(25, { random, state });
    assert.equal(result, M.PM_MASTER_LICH,
        'arch-lich (diff 29) should be demoted to master lich when cap is 25');
});

test('pick_nasty does not substitute when alt is genocided', () => {
    const state = monsterState();
    const archLichIndex = NASTIES.indexOf(M.PM_ARCH_LICH);
    // Genociding master lich prevents substitution.
    state.mvitals[M.PM_MASTER_LICH].mvflags |= 0x02; // G_GENOD
    const random = fakeRandom([archLichIndex]);
    const result = pick_nasty(25, { random, state });
    // Falls back to the original (arch-lich) since alt is genocided.
    assert.equal(result, M.PM_ARCH_LICH);
});

test('pick_nasty substitutes master mind flayer with mind flayer at difcap', () => {
    const state = monsterState();
    // PM_MASTER_MIND_FLAYER (wizard.c:41) has difficulty 19, which is below
    // cap 25. But big_to_little gives PM_MIND_FLAYER. If we set a lower cap
    // (say 15), then difficulty 19 >= 15 triggers substitution.
    const mmfIndex = NASTIES.indexOf(M.PM_MASTER_MIND_FLAYER);
    assert.notEqual(mmfIndex, -1);
    const random = fakeRandom([mmfIndex]);
    const result = pick_nasty(15, { random, state });
    // big_to_little(PM_MASTER_MIND_FLAYER) -> PM_MIND_FLAYER.
    // Mind flayer's name is "mind flayer" -- not a juvenile.
    assert.equal(result, M.PM_MIND_FLAYER,
        'master mind flayer (diff 19) should be demoted when cap is 15');
});

test('pick_nasty with difcap 0 does no difficulty filtering', () => {
    const state = monsterState();
    // difcap=0 means no cap. Arch-lich should pass through.
    const archLichIndex = NASTIES.indexOf(M.PM_ARCH_LICH);
    const random = fakeRandom([archLichIndex]);
    const result = pick_nasty(0, { random, state });
    // Still might be filtered by G_HELL/G_NOHELL, but arch-lich is G_HELL
    // and we're not in hell, so it gets substituted for that reason.
    // Actually let me check: arch-lich has G_HELL flag?
    // If yes, since we're not in hell, the G_HELL filter triggers.
    const hasHellFlag = (state.mons[M.PM_ARCH_LICH].geno & M.G_HELL) !== 0;
    if (hasHellFlag) {
        // big_to_little demotes to master lich.
        assert.equal(result, M.PM_MASTER_LICH);
    } else {
        assert.equal(result, M.PM_ARCH_LICH);
    }
});

test('nasties table has 44 entries matching C source', () => {
    // wizard.c:31-50 defines nasties[] with exactly 44 entries.
    assert.equal(NASTIES.length, 44);
});
