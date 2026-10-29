# Public count editing: scoped negative

JS0fe5207e91a3d4ff68f62b8f56d72e24ccaca602; C16ff59115315917b93185d026aeefea06db9b0f4.
Same public floor sack with900arrows+49coins, kit90/cap950/pickup_burden:u.
Select861arrows, deselect, then select860 and coins. Both engines use the new
860 count, leaving40arrows; cancelling after entering861 commits nothing and
leaves900. Selecting9999 clamps to900; accepting its burden prompt takes all
arrows and coins, leaving the sack empty (990/Burdened).

The860 case reveals an intentional C/JS distinction between lift prediction
and final loose-gold weight: both prompt before taking49coins, but accepted
coins add0 to final inv_weight. reselect uses Escape at that prompt:860arrows,
0gold,40arrows+49coins remain. reselect-accept answers y:860arrows+49gold,
40arrows remain, total950/unburdened. This is explained parity, not a new cause.

All exact comparisons exit0: reselect124 screens/cursors2395 RNG;
reselect-accept126/2395; cancel117/2382; clamp121/2394. No animation mismatch.
observe.mjs checks actual committed count, remaining contents, gold, final
burden, stable HP/no observed combat, and complete C/JS outputs. Counts are
edited at the menu before mutation; after acceptance query_objlist clamps
selection to quantity and menu_loot performs the counted split.

Source TTY menu count toggling, query_objlist, menu_loot and carry_count are bound
in case.json with exact command/expected-exit/actual receipt and output hashes.
Fresh output paths required. Existing recorder provenance/build limit remains
in public-stack-cycle; elapsed time unmeasured. No special object effects,
consumption, rings, migration, timers, combat, denied paths, gameplay edits or CI.
No exhaustive menu-input claim; existing broader count/menu tests aren't new bugs.
