# Quantum mechanic lethal-hit gate: scoped explained negative

A quantum mechanic's monster-target teleport is conditional on the hit being
nonlethal. C checks `magr->mcan || damage >= mdef->mhp || tele_restrict(mdef)`
before magical negation and relocation. A lethally wounded target staying in
place with no teleport RNG is expected behavior, not a missing port effect.

```
node --test diagnostics/divergence-evidence/monsters/quantum-lethal-teleport-negative/probe.test.mjs diagnostics/divergence-evidence/monsters/quantum-lethal-teleport-negative/replay.test.mjs
```

Four tests pass. The focused native quantum-mechanic/large-dog setup uses a
legal 1-point attack: target HP4 relocates through production `rloc`, while
HP1 stays at its old square and consumes no RNG in this effect handler. The
negation/relocation functions are not replaced; the test wraps the actual
seeded random functions to observe calls. This helper does not apply physical
damage itself. The lethal control is source-backed; it is not a separate full
C low-HP recording.

The public-input C witness creates a tame quantum mechanic and hostile large
dog, then waits. The large dog disappears at step 79 after the hit at step 78.
All 3064 RNG entries and 172 screens/cursors match JS. A pre-existing lichen
also teleports earlier; neither encounter is confused with the lethal control.
The complete recording and input recipe are included without trimming.

Scope is the exact nonlethal gate and the witnessed ordinary relocation, not
all teleport locations, trapping effects, hero teleportation or damage caps.
The initial malformed test script did not execute and supplied no gameplay
evidence. The corrected focused tests and public recording are the evidence.
This manually investigated case is unbound to scanner identities and requests
no automatic suppression. Regenerate with local `record.mjs` and a new private
output-directory argument using the configured repository recorder.
