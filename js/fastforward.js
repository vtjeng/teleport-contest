// fastforward.js — residual RNG replay for seed8000 starter session.
// Per-turn behavior remains while its source subsystems are ported. Level
// population and post-mklev startup now run through source-shaped modules.
//
// Generated from: seed8000-tourist-starter.session.json

import { rn2 } from './rng.js';

// Residual per-step leaf RNG calls begin at source turn 2.  Turn 1 now runs
// through allmain.c-shaped gameplay code and deliberately has no replay row.
// purgeAndAllocateMonsterMovement replaces the former block of four
// trace-derived rn2(12) calls at its source position.
// generateRandomMonster replaces the residual rn2(70) random-monster gate;
// calculateHeroMovement follows it.
// playInitialLevelSounds replaces the source-reachable dosounds() draws while
// a table entry still owns the surrounding turn work. updateHunger replaces
// the residual rn2(20) call. wearHeroEngraving replaces moveloop_core()'s later
// fixed rn2(82) draw. finishHeroTimeEffects owns the later per-action sequence
// and clairvoyance cadence, including the former step-six rn2(31) draw. Beyond
// the recording, execution stops after monster allocation because the
// preceding monster-action phase is not yet ported.
export async function fastforward_step(
    stepNum,
    purgeAndAllocateMonsterMovement,
    generateRandomMonster,
    calculateHeroMovement,
    playInitialLevelSounds,
    updateHunger,
    wearHeroEngraving,
    finishHeroTimeEffects,
) {
    const finishTurn = async (beforeEngraving = null) => {
        await purgeAndAllocateMonsterMovement();
        await generateRandomMonster();
        await calculateHeroMovement();
        await playInitialLevelSounds();
        await updateHunger();
        if (beforeEngraving) beforeEngraving();
        await wearHeroEngraving();
        await finishHeroTimeEffects();
    };
    const steps = {
        2: async () => { rn2(5); rn2(5); rn2(5); rn2(5); await finishTurn(); },
        3: async () => { rn2(5); rn2(32); rn2(5); rn2(5); rn2(32); rn2(5); await finishTurn(); },
        4: async () => { rn2(5); rn2(24); rn2(5); rn2(5); rn2(24); rn2(5); await finishTurn(); },
        5: async () => { rn2(5); rn2(16); rn2(5); await finishTurn(); },
        6: async () => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(5); await finishTurn(); },
        7: async () => { rn2(5); rn2(16); rn2(5); rn2(5); rn2(16); rn2(5); await finishTurn(); },
        8: async () => { rn2(5); rn2(12); rn2(5); await finishTurn(); },
        9: async () => { rn2(5); rn2(20); rn2(5); rn2(5); rn2(8); rn2(5); await finishTurn(() => rn2(19)); },
        10: async () => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(20); rn2(5); await finishTurn(); },
    };
    if (stepNum <= 0) return true;
    if (stepNum === 1) return false;
    if (Object.hasOwn(steps, stepNum)) {
        await steps[stepNum]();
        return true;
    }
    await purgeAndAllocateMonsterMovement();
    return false;
}
