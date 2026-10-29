# Counted middle-row refusal: scoped negative

JS0fe5207e91a3d4ff68f62b8f56d72e24ccaca602; C16ff59115315917b93185d026aeefea06db9b0f4.
Public ordinary floor-sack setup extends the mixed-menu sequence:2759 arrows,
2 darts,49gold in the sack; kit90 and1gold carried. Select all arrows, one dart,
and coins. Both engines take arrows, reject the dart, undo its split and STOP
before coins. After dropping2000arrows, inspect2darts+49coins still in the sack.
Control has2758arrows: one dart fits, then48coins fit (49 carried), leaving one
dart and one coin. Both217 screens/cursors exact; target2531 RNG, control2532;
exit0 and no animation mismatch. Stable HP/no observed combat checked.

Source distinction matters: lift_object returns-1 when carry_count yields0,
so menu_loot unsplits the counted dart and breaks. A declined burden prompt
returns0, which permits continuation instead; sibling public-counted-decline
qualifies that separate branch. An initial two-arrow-stack calibration sorted
the small stack first and did not reach this intended sequence; it is setup-only.
Ordinary darts establish the correct observed menu order. No effect/combat use.

Prior split-rollback pair had the rejected row last; this adds evidence that
later otherwise-admissible gold is deliberately left untouched. Not a new bug
or a duplicate cause. observe.mjs verifies whole C/JS outputs, inventory and
remaining contents. Commands/expected exits/normalized actual receipts/hashes
are in case.json. Recorder binary/source provenance and missing independent
build attestation remain in public-stack-cycle. Elapsed time unmeasured.
All prior exclusions apply; no gameplay edits/CI or exhaustive claim.
