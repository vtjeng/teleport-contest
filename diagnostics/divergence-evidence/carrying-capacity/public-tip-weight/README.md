# Ordinary tip weight routes: scoped negative

JS6ea005a52da700e1cf84ba2ba3873ecec0d0ae9e; C16ff59115315917b93185d026aeefea06db9b0f4.
Extends the documented nested-sack target after extraction: kit90, empty sack15,
sack containing830 arrows845, one loose arrow1 =951/Burdened. Supported #tip
chooses the loaded sack and then either floor or the empty ordinary sack.

Floor target spills830 arrows -> carried121/unburdened. Pickup merges them
with the one loose arrow ->831 arrows, total951/Burdened.132 screens/cursors,
2372 RNG, no animation frames: all exact, exit0. Sack control transfers830
arrows between sacks: destination845, source15, loose arrow1+kit90, total951.
127 screens/cursors,2372 RNG and1 animation frame all match, exit0.

This tests ordinary tip-to-floor and tip-to-container weight behavior. Prior
public tip entry recipes and runtime-writer repair exist; those are not new
findings. Special object/effect variants are excluded and were not replayed.
No consumption, timers, rings, migration, equipment effects or combat.

observe.mjs checks saved public weights/burden plus complete comparison.
case.json gives executable commands, expected exits, actual normalized receipts
and source bindings. Fresh output directories are required. Raw recorder/worker
outputs retained unchanged; receipt conversion is not a rerun. Independent
recorder build attestation unavailable; binary/source provenance in sibling
public-stack-cycle. Elapsed time unmeasured. No exhaustive coverage claim.
