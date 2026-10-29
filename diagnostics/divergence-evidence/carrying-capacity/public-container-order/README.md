# Mixed floor-container menu order: scoped negative

JSd2f924a207d7033fcd28eb819fe712ed65a355b9; C16ff59115315917b93185d026aeefea06db9b0f4.
Public seed642919 Valkyrie/capacity950/kit90. Supported staged wishes/stashes
put2759 ordinary arrows and49gold in a floor sack while carrying1gold. Startup
packorder:$) displays coins first; packorder:)$ displays weapons first. Same
selected stacks, different source-ordered capacity decisions:

| Case | Carried gold | Carried arrows | Screens/cursors | RNG |
| --- | ---: | ---: | ---: | ---: |
| coins-first | 50 | 2758 | 164 | 2498 |
| arrows-first | 49 | 2759 | 164 | 2498 |
| auto-all (weapons-first display) | 50 | 2758 | 162 | 2498 |
| explicit-count (48 coins selected) | 49 | 2759 | 166 | 2498 |
| rejected-split | 49 | 2759 | 182 | 2510 |
| accepted-split | 50 | 2758 | 182 | 2510 |
| auto-coins | 50 | 0 | 162 | 2432 |
| auto-weapons | 1 | 2759 | 162 | 2487 |

All8 cases exit0 with exact screens/attributes/cursors/RNG, no animation
mismatch. Ordinary capacity total2849/Overtaxed in every row except auto-coins
(91/unburdened). Gold object weight1 differs intentionally from loose1..49
capacity contribution0. No engine divergence is asserted between different
recipes: the different valid outcomes are the point of this control matrix.

Split pair starts carrying49gold instead of1 and explicitly selects one coin
after arrows.2759arrows leave no room for that coin: out_container rejects it,
menu_loot unsplits, and all49 remain.2758-arrow control accepts it, leaving48.
After dropping2000arrows, public #loot verifies each remainder. No manual state
construction, equipment changes, consumption, rings, migration, timers or combat.

C menu_loot:3314-3341 processes auto-selection in internal list order, regardless
of packorder. Manual query_objlist returns menu order; selected counts split
before out_container, with unsplit on rejected removal (3367-3391). JS menu_loot
has corresponding branches. Category-filtered auto-selection exercises
allow_category rather than all_categories. C/JS carry_count calculates the live
arrow/coin count using accumulated inventory, reached via out_container.

This is not the existing floor-pickup preflight failure: that public comma path
has a guard before carry_count; #loot/out_container reaches the working coin
calculation. No new cause is counted. Existing packorder valid/ordinary-control
public replay tests both pass; they cover option editing, not these carrying
boundaries. Earlier multi-pickup controls cover floor selection, not this
container selection/rollback sequence. Known naming/status failures are avoided.

observe.mjs verifies carried quantities, totals, burden and remainders alongside
strict whole-output comparisons and stable HP/no observed combat. case.json has
exact argv/expected exits, normalized completed receipts and source hashes.
Fresh output directories required. Binary/source provenance and missing independent
recorder build attestation remain as documented in public-stack-cycle. Elapsed
time unmeasured. Single seed/role, debug wishes, no exhaustive permutation claim.
