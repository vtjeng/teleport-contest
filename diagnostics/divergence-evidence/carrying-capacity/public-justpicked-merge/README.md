# Just-picked merged stacks and category selection: scoped negatives

Measured JS c74690be3e731e5f2ede057e781d7ceb2d79039a (analysis branch, not a
claim of current-Main execution). C gitlink16ff59115315917b93185d026aeefea06db9b0f4.
All five fresh public C/JS runs exit0 and match screens, cursors, RNG and animation.

| Fixture | Public action after ordinary setup | Result | Screens / RNG |
| --- | --- | --- | --- |
| single-merged | Drop1 of861arrows, pick it back into the carried stack, D1P | P names full861stack; directly drops1, leaves860arrows49coins, unburdened | 51 / 2300 |
| multiple-merged | Pick dropped arrow and coin back into their stacks, D1P, select arrow row | P opens menu containing only861arrows and49coins; category count1 does not constrain per-item selection. Drops full861, leaves49coins | 67 / 2368 |
| auto-empty-intersection | After only arrow pickup, DAbP (auto+coins+picked) | Explicit coin-class override drops49coins despite pickup history;861arrows remain Burdened | 53 / 2299 |
| auto-food-intersection | After only arrow pickup, DAeP (auto+food+picked) | Empty intersection drops nothing;861arrows49coins remain Burdened | 53 / 2292 |
| auto-picked-control | After only arrow pickup, DAP (auto+picked) | Drops full861arrowstack, leaves49coins and unchanged kit, unburdened | 52 / 2299 |

The auto-empty-intersection filename preserves the initial hypothesis. That
hypothesis was wrong: C pickup.c allow_category explicitly returns on a coin
class filter before checking pickup history; JS matches. It is an explained
source exception, not a discrepancy or unresolved setup. The food-class case
provides the genuinely empty intersection, and auto-picked-control proves the
ordinary automatic path can act. No food is consumed or dropped in these runs.

Same supported seed642919 Valkyrie setup: St18/Co18/capacity950, unchanged
90-unit kit, debug wishes supply861arrows49coins, ordinary d/,/D commands.
Merged-stack labels and final inventory counts are publicly observed. Derived
weights are951before,950after single-count drop,90after full-arrow drop;
49coins contribute0. No internal-state instrumentation is claimed. The observer
also checks stable HP/no observed combat, unchanged kit, filtered two-item menu,
final quantities/status and strict C/JS parity.

Existing recipes/do.c/multiple-drop-justpicked-count.session.json covers one
unmerged starting food object. Earlier audit witnesses cover ordinary category
filters and split/merge separately. This package tests merged pickup-history
scope, single-versus-multiple P dispatch, and coin exception/empty intersection.
It does not duplicate queued query_classes or numeric parser causes4–8.

Source bindings: do.c menu_drop single-P/automatic/query_objlist branches;
pickup.c allow_category explicit coin-class early return and picked filter;
JS counterparts. Setup-only multiple-menu calibration is retained locally and
not counted. Five fixtures are one grouped matching scope, not five bug causes.

Run observe.mjs from repository root for saved semantic checks. case.json gives
fresh target/control commands and expected exits; use new output directories.
Receipts normalize completed raw recorder/worker/comparison outputs, copied
unchanged. Wall elapsed was not captured and is null. Recorder source/binary
provenance remains in public-stack-cycle; independent build attestation is
unavailable. PR111's separate build does not attest this inherited binary.

One role/seed and debug acquisition, not exhaustive categories or natural
acquisition. No consumption, rings, migration, timers, equipment-effect or combat
investigation; no gameplay edits, CI dispatch, merge or formal approval.
