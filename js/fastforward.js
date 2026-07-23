// fastforward.js — residual RNG replay for seed8000 starter session.
// Per-turn behavior remains while its source subsystems are ported. Level
// population and post-mklev startup now run through source-shaped modules.
//
// Generated from: seed8000-tourist-starter.session.json

import { rn2 } from './rng.js';

// Per-step leaf RNG calls. allocateMonsterMovement replaces the former block
// of four trace-derived rn2(12) calls at its source position. Invoke it once
// for every elapsed step, including steps beyond this residual recording.
export function fastforward_step(stepNum, allocateMonsterMovement) {
    const steps = [
        () => { allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 1
        () => { rn2(5); rn2(5); rn2(5); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 2
        () => { rn2(5); rn2(32); rn2(5); rn2(5); rn2(32); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 3
        () => { rn2(5); rn2(24); rn2(5); rn2(5); rn2(24); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 4
        () => { rn2(5); rn2(16); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 5
        () => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); rn2(31); }, // step 6
        () => { rn2(5); rn2(16); rn2(5); rn2(5); rn2(16); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 7
        () => { rn2(5); rn2(12); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 8
        () => { rn2(5); rn2(20); rn2(5); rn2(5); rn2(8); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(19); rn2(82); }, // step 9
        () => { rn2(5); rn2(12); rn2(5); rn2(5); rn2(20); rn2(5); allocateMonsterMovement(); rn2(70); rn2(300); rn2(20); rn2(82); }, // step 10
    ];
    if (stepNum <= 0) return;
    if (stepNum <= steps.length) steps[stepNum - 1]();
    else allocateMonsterMovement();
}
