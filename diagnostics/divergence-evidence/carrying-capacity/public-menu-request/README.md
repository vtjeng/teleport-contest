# Traditional menu request loses category filter: candidate

JS2a287e2d22996790ed0800998622e9c6f3c14854; C16ff59115315917b93185d026aeefea06db9b0f4.
Public seed642919 Valkyrie/capacity950/kit90, traditional menustyle. Staged
ordinary wishes/stashes put900arrows+49coins in a plain floor sack. #loot take-out
asks for object classes. `m)` requests a weapons-only menu; `m$` coins-only;
`m` requests all types. These are documented source-supported input paths.

Both filtered targets exit1: C shows only the requested class; JS shows both.
First mismatch zero-based segment0 step132 (newline ending class query).
Weapons-only: C row4,col41 is '(' from(end), JS 'C' from Coins heading;
C cursor[47,4,1], JS[47,6,1]. Coins-only differs at row2,col41 C 'C'/JS 'W'.
Weapons151 screens/cursors2360 RNG; coins148/2359. RNG exactly matches each.
Unfiltered all-types control150 screens/cursors2360 RNG, exit0 exact.

Select860arrows or49coins as appropriate, inspect inventory, then request a
fresh unfiltered menu. These chosen item transfers and final menus match; no
out-of-filter transfer is claimed. The demonstrated exposure is incorrect
available choices in the requested filtered menu, not arithmetic failure.
After860arrows total950/unburdened; after49coins total90/unburdened.

Root cause: C pickup.c query_classes:249-252 computes menu_on_demand=-2 for
unfiltered/all types and -3 for an explicit class/filter. JS query_classes
returns-2 unconditionally whenever m_seen. Both menu_loot implementations treat
-2 as all_categories, so JS discards the accumulated valid class filter. Fix
belongs at this source decision, not fixture-specific menu filtering. This is
one cause across2 class variants, separate from numeric echo and earlier causes.

Reconciled existing traditional put-in/loot tests and PR title searches for
traditional/menu filters; those do not qualify this filtered retry handoff.
The unfiltered control prevents calling every menu request unsupported.
observe.mjs checks exact mismatch, both menus, RNG, committed counts, final-screen
equality and stable HP/no observed combat. Command/expected-exit/normalized actual
receipts and source hashes are in case.json. Planned post-fix checks not executed.

Ordinary input route; debug wishes/wizweight provide setup and observations.
Non-debug variant not separately recorded. Recorder binary/source provenance
and missing build attestation remain in public-stack-cycle; elapsed unmeasured.
No gameplay changes, CI, equipment effects, consumption, rings, migration,
timers, combat or denied investigations. Main owns implementation/overlap review.
