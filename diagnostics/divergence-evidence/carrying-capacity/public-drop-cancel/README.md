# Counted multi-drop cancellation and filtered control

Measured JS 7f0a9bc844d1a55245a63058c09bf98aea57dd5d; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Fresh executed comparisons both
exit 0: cancellation has 46 screens/cursors and 2274 RNG calls; weapons-only
filtered control has 46 screens/cursors and 2279 RNG calls. All strict outputs
match. No new divergence or repair cause.

Seed 642919 Valkyrie, strength/constitution 18, capacity 950, unchanged kit
weight 90. Supported debug wishes create 861 arrows and 49 coins. At D's full
menu, choose all categories, select one arrow, enter another count then Escape.
Final public inventory at zero-based step44 remains 861 arrows/49 coins and
Burdened: no partial drop commits. Control selects weapons category only and
drops one arrow, ending 860 arrows/49 coins without Burdened. Public quantities
plus pinned catalog imply total951 unchanged versus951→950; no internal C
weight capture is claimed. No equipment is selected or changed.

Existing public-count-edit tested pickup-menu cancellation; this witness tests
D/menu_drop's caller behavior. Existing ordinary combination dispatch is not
claimed novel. Observer checks saved strict parity, final quantities/status and
unchanged HP/no observed combat. Run observe.mjs from repository root. Fresh
commands in case.json require new output directories. Cancellation originally
used /tmp/capacity-drop-cancel.session.json; committed input is byte-identical,
and actual argv is retained separately in its normalized receipt. Raw recorder,
worker and comparison outputs are preserved. Elapsed was not measured.

Only one role/seed, ordinary stacks and debug acquisition are qualified.
No consumption, rings, migration, timers, equipment effects or combat were
investigated. wizweight is off to avoid an already-fixed naming defect.
Recorder identity/source correspondence remains inherited from sibling
public-stack-cycle/provenance.json with no independent build attestation;
Advancement PR111's separate build cannot retroactively attest this binary.
