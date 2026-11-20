# Elf Ranger ability loss and re-entry

Two supported public C/JS recordings match: a level-three control (85 screens,
3,062 RNG calls) and 3→4→7→3→7 target (421 screens, 3,086 calls). Screen cells,
attributes, cursor and RNG all match. Zero new semantic causes; one scoped
explained negative. No unresolved mismatch in these recordings.

The attribute display shows racial sleep resistance at 4, experience-granted
stealth at 7, their reversal at 3, and their reappearance at 7. Reached XP is
40→80→640→79→640. The lower-level XP result preserves the earlier fixed loss
semantics; this is not submitted as a new repair. Starting equipment remains
unchanged and is not the subject of investigation. No combat, object effect,
ring, death, polymorph, status expiry or denied setup is invoked.

This is a wizard-transition witness, not natural XP acquisition. wiz_level_change
calls pluslvl(false)/losexp and resets ulevelmax to the resulting level. It cannot
establish natural historical-level recovery, or place XP at the actual level-30
threshold. No XP grinding or unchanged setup retry was attempted. The restricted
PR #109 oracle remains the only qualified at/above-level-30-threshold evidence.

JS execution base: fff7d038a5ffc028e44390c504960ae90a02077a.
C gitlink: 16ff59115315917b93185d026aeefea06db9b0f4.
Fetched Main: de3380e285e5f4abf40375459f9490f92569e7dc. Relevant advancement
sources and repository instructions were unchanged against the execution base.
The preinstalled recorder's prior binary hash/adjacent source checks are retained
as a hashed dependency; no build attestation or stronger provenance is claimed.

Reproduce from repository root using the existing recorder prerequisites:

```
node diagnostics/divergence-evidence/hero-advancement/elf-ranger-reentry-20261029/run.mjs control /tmp/hero-elf-ranger-control-new
node diagnostics/divergence-evidence/hero-advancement/elf-ranger-reentry-20261029/run.mjs target /tmp/hero-elf-ranger-target-new
node diagnostics/divergence-evidence/hero-advancement/elf-ranger-reentry-20261029/verify.mjs
```

Each expects exit 0. Output directories must be fresh. The verifier reads the
committed recordings, checks full parity and asserts the five attribute/XP
states. Actual command receipts preserve the executed output paths and hashes.
Result files retain elapsed timings; active compute is not measured.

Scope decision: this closes the selected reachable pairing/re-entry prerequisite.
Remaining natural depleted/practice/shared-turn histories are still unqualified;
arbitrary modifiers and enabled-tip terminal behavior are outside this witness.
More role/race permutations alone would broaden fixture coverage without settling
those prerequisites. No claim of exhaustive correctness. Main owns gameplay;
no CI dispatch, merge or formal approval. No action here was denied or pending.
