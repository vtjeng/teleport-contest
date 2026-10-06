import assert from 'node:assert/strict';
import test from 'node:test';
import { FORCETRAP, HURTLING, PIT, Trap_Caught_Mon, Trap_Effect_Finished } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GIANT_RAT } from '../js/monsters.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { mintrap, trapeffect_selector } from '../js/trap_effects.js';

// trap.c:3739-3740 clears a stale held bit without touching any operation.
test('mintrap no-trap return accepts the state-only production contract', async () => {
    const monster = { mx: 4, my: 5, mtrapped: true };
    const state = { level: { traps: [] } };
    assert.equal(await mintrap(monster, 0, { state }), Trap_Effect_Finished);
    assert.equal(monster.mtrapped, false);
});

async function initialize() {
    await runSegment({ seed: 8807113, datetime: '20331108091011', moves: '',
        nethackrc: 'OPTIONS=name:TrapReturn,role:Valkyrie,race:human,gender:female,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n' });
    const monster = { mx: game.u.ux, my: game.u.uy,
        data: game.mons[PM_GIANT_RAT], mhp: 20, mtrapped: false };
    return monster;
}

// trap.c:2990-2993 discards impossible() and returns Finished.
test('selector default preserves the C status after its discarded diagnostic', async () => {
    await initialize();
    assert.equal(await trapeffect_selector({}, { ttyp: -1 }, 0, { state: game }),
        Trap_Effect_Finished);
    assert.equal(game.unported.has('pline.c impossible'), true);
});

// trap.c:3805-3807 returns before learning an airborne floor trap. This also
// exercises mintrap's live operation defaults for state-only muse/trap callers.
test('state-only mintrap resolves live owners for the airborne early return', async () => {
    const monster = await initialize();
    game.level.traps.push({ tx: monster.mx, ty: monster.my, ttyp: PIT });
    assert.equal(await mintrap(monster, HURTLING, { state: game }),
        Trap_Effect_Finished);
    assert.equal(monster.mtrapseen, undefined);
});

test('injected RNG remains complete and never borrows missing live draws', async () => {
    const monster = await initialize();
    game.level.traps.push({ tx: monster.mx, ty: monster.my, ttyp: PIT });
    await assert.rejects(mintrap(monster, FORCETRAP,
        { state: game, random: { rn2: () => assert.fail('before validation') } }),
    /mintrap requires/);
    assert.equal(monster.mtrapseen, undefined);
});

// trap.c:3751 spends rn2(40), and :3788 returns Caught while still held.
// muse.c/trap.c supply only state; the default environment must run the live
// RNG owner rather than require an injected operation set from those callers.
test('state-only mintrap preserves the caught result and live escape draw', async () => {
    const monster = await initialize();
    monster.mtrapped = true;
    game.level.traps.push({ tx: monster.mx, ty: monster.my, ttyp: PIT,
        tseen: true });
    initRng(8811123);
    enableRngLog();
    assert.equal(await mintrap(monster, 0, { state: game }), Trap_Caught_Mon);
    assert.equal(monster.mtrapped, true);
    assert.deepEqual(getRngLog(), ['rn2(40)=27']);
});
