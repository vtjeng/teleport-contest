# Ordinary sack weight propagation: scoped negative

JS9fa63e58d98425fcb946b4bb8c510dbf362452b2; C16ff59115315917b93185d026aeefea06db9b0f4.
Public debug wishes, seed642919 Valkyrie, capacity950 and kit90. Ordinary empty
uncursed sack15; no magical bags, effects, combat or excluded object paths.

`remove-cycle`:86 screens/cursors,2426 RNG, exit0. Stash846 arrows makes sack861
and total951 Burdened. Drop sack leaves90; pickup restores951. Take out one
arrow leaves sack860 plus arrow1, total951. Drop arrow reaches950/unburdened;
pickup restores951. Remove remaining845 arrows merges with the one outside:
846 arrows, empty sack15, total951. All public screens/attributes/cursors/RNG match.

`gold-roundtrip-49` and `gold-roundtrip-50`:74 screens/cursors,2295 RNG each,
exit0.845 arrows+kit+sack=950. Loose49gold contributes0 although object weight
shows1. Stashing49 makes sack16 and total951/Burdened; taking coins out returns
total950/unburdened.50gold contributes1 both loose and contained, so951/Burdened
throughout. These are distinct source rounding branches, not discrepancies.

observe.mjs verifies counts, weights and burden from retained public screens,
plus strict full comparisons and stable HP/no observed combat. Cases bind
C/JS weight and in/out-container callers. Existing partly-eaten stash repair
2df03d803 is excluded, not re-counted; menu naming differs in sibling package
public-sack-menu and is not treated as a weight failure.

Initial category selection and coin selector calibration did not perform the
intended removal; locally retained, not negative evidence. Correct observed
selectors qualified these final recipes. Two extra recipe aliases here preserve
the exact executed argv for sibling public-sack-menu; they are not extra cases.

See case.json for commands, actual expected exits, hashes and receipts. Use fresh
output paths for replays. Normalized receipts describe completed saved outputs,
not reruns. Elapsed time unmeasured. Existing recorder binary/source provenance
is in public-stack-cycle; independent build attestation unavailable. Single
seed and debug setup do not establish exhaustive or natural acquisition coverage.
