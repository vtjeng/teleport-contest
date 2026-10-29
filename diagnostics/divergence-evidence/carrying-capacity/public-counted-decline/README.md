# Counted burden prompt outcomes: scoped negative

JS0fe5207e91a3d4ff68f62b8f56d72e24ccaca602; C16ff59115315917b93185d026aeefea06db9b0f4.
Public seed642919/capacity950/kit90, pickup_burden:u. Ordinary supported setup
accepts pickup of900 wished arrows, stashes them in a plain sack, drops sack,
then stashes49coins. Select861arrows and coins from the floor sack. At the
burden prompt, all3 responses match C across120 screens/cursors and2395 RNG,
exit0, no animation mismatch:

- n: split is restored to900arrows; selection continues and takes49coins.
- q: split is restored to900arrows; selection stops,49coins remain in sack.
- y: takes861arrows and49coins; total951/Burdened,39arrows remain.

Public look-inside observes the remaining stack(s), not manually constructed
state. lift_object maps n to0 and q to-1; menu_loot restores the counted split
on either nonpositive result but only breaks on a negative one. Acceptance
commits the split. Earlier public prompt controls did not combine counted
splitting with this container path. No new cause is asserted.

observe.mjs checks exact full comparisons, prompt, counts/remainders, burden,
stable HP/no observed combat. case.json contains source/commands/expected exits,
actual normalized receipts and raw-output hashes. Fresh output paths required.
Same recorder binary/source limits as public-stack-cycle; no independent build
attestation. Elapsed time unmeasured. No equipment effects, consumption, rings,
migration, timers, combat, denied investigations, gameplay edits or CI.
