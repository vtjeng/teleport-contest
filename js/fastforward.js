// fastforward.js — residual RNG replay for seed8000 starter session.
// Per-turn behavior remains while its source subsystems are ported. Level
// population and post-mklev startup now run through source-shaped modules.
//
// Generated from: seed8000-tourist-starter.session.json

import { rn2 } from './rng.js';

// Per-step leaf RNG calls. purgeAndAllocateMonsterMovement replaces the former
// block of four trace-derived rn2(12) calls at its source position.
// generateRandomMonster replaces the residual rn2(70) random-monster gate;
// calculateHeroMovement follows it.
// playInitialLevelSounds replaces the source-reachable dosounds() draws while
// a table entry still owns the surrounding turn work. wearHeroEngraving
// replaces moveloop_core()'s later fixed rn2(82) draw, after the residual
// rn2(20) call. Beyond the recording, execution stops after monster allocation
// because the preceding monster-action phase is not yet ported.
export async function fastforward_step(
    stepNum,
    purgeAndAllocateMonsterMovement,
    generateRandomMonster,
    calculateHeroMovement,
    playInitialLevelSounds,
    wearHeroEngraving,
) {
    const steps = [
        async () => { await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 1
        async () => { rn2(5); rn2(5); rn2(5); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 2
        async () => { rn2(5); rn2(32); rn2(5); rn2(5); rn2(32); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 3
        async () => { rn2(5); rn2(24); rn2(5); rn2(5); rn2(24); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 4
        async () => { rn2(5); rn2(16); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 5
        async () => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); rn2(31); }, // step 6
        async () => { rn2(5); rn2(16); rn2(5); rn2(5); rn2(16); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 7
        async () => { rn2(5); rn2(12); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 8
        async () => { rn2(5); rn2(20); rn2(5); rn2(5); rn2(8); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); rn2(19); await wearHeroEngraving(); }, // step 9
        async () => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(20); rn2(5); await purgeAndAllocateMonsterMovement(); await generateRandomMonster(); await calculateHeroMovement(); await playInitialLevelSounds(); rn2(20); await wearHeroEngraving(); }, // step 10
    ];
    if (stepNum <= 0) return;
    if (stepNum <= steps.length) await steps[stepNum - 1]();
    else {
        await purgeAndAllocateMonsterMovement();
    }
}
