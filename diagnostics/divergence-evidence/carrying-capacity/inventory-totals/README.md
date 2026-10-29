# Ordinary stack weights and inventory totals

Follow-on to [PR #105](https://github.com/vtjeng/teleport-contest/pull/105).
That earlier arithmetic negative remains unchanged. This package adds one
scoped explained negative for real catalog stack weights feeding multi-object
inventory totals and burden transitions. Zero confirmed divergence causes;
zero unresolved attempted comparisons; no scanner keys or filter changes.

JS base: `f3e2e6d638383a5f77f153057d0af6684ca64cfb` (freshly fetched Main).
C gitlink: `16ff59115315917b93185d026aeefea06db9b0f4`.
Version 1 packaging tools are from that JS base.

## Supported oracle and preconditions

The runner compiles the unchanged C objects.c catalog using the same include
setup as scripts/generate-objects.mjs. It extracts verbatim upstream weight,
acurrstr, weight_cap, inv_weight, calc_capacity and near_capacity bodies.
C uses the actual struct obj and catalog definitions. The restricted adapter
supplies ordinary final attributes and disables unrelated hero-state branches.
Only ARROW, DART, ROCK and GOLD_PIECE can enter the C executable, with positive
quantities at most 10000. No containers, consumed objects, timed objects,
properties, combat, migration or other excluded mechanics are exercised.

JS constructs objects through production newObject, initializes the real
catalog with objects_globals_init, computes owt with production weight, links
the chain, then calls production weight_cap, inv_weight and near_capacity.
C independently computes each owt from its catalog with weight before linking
and summing. Unlike #105, no arbitrary owt values are supplied. Per-object
weights, excess, capacity, burden and the cached capacity must all match.
The compiled oracle aborts on invalid row sizes/types/quantities and on an
excluded property-restoration call. Standard C function branches are retained
without source edits but only the declared ordinary paths are executed.

## Finite results

1,108 target rows, zero differences:

- 208 single-stack cases;
- 156 stacks plus coins;
- 144 two-stack chains;
- 300 mixed-chain threshold cases and the same 300 with chain order reversed.

Strength/constitution pairs are (3,3), (18,10), (50,10), (125,25).
Single-stack quantities are 1,2,3,49,50,51,99,100,149,150,151,999,1000.
Mixed chains use rocks, darts, arrows and optional coins, with exact total
weights immediately below/at/above 1, 1.5, 2, 2.5 and 3 times capacity.
Coin quantities are 0,49,50,149,150. Half thresholds are rounded up to the next
integer before checking neighbors. Different spe values distinguish chain
entries; these values do not change the selected weight paths.

Five explicit controls passed: empty inventory, exact capacity, mixed first
burden, 49 coins and 50 coins. In both C and JS, 1..49 coins have object owt=1
but contribute zero to inv_weight, because inv_weight recomputes coin weight
without weight's minimum of 1. This is matching source behavior, not a bug.

Receipts contain actual exits, source and runner hashes, tool versions and
elapsed seconds, not active compute. All commands below expect exit 0:

```
node diagnostics/divergence-evidence/carrying-capacity/inventory-totals/probe.mjs target
node diagnostics/divergence-evidence/carrying-capacity/inventory-totals/probe.mjs control
node scripts/evidence-package.mjs validate diagnostics/divergence-evidence/carrying-capacity/inventory-totals/case.json --commit HEAD
node scripts/checkpoint-preflight.mjs --commit HEAD
node --test --test-name-pattern='addinv assigns stable|coins always merge' scripts/inventory-substrate.test.mjs
node --test --test-name-pattern='weight_cap|inv_weight' scripts/hack.test.mjs
```

Both focused test commands passed 2/2. They are supporting JS regressions, not
additional C oracle evidence.

## Overlap and remaining gaps

Prior levitation-order and overexertion repairs were reconciled in #105 and
are not counted again. The relevant js/obj.js and js/hack.js files have no
changes between #105's measured base and this base. Existing inventory tests
cover addinv ordering/merging and coin merging. Existing run-pickup-burden.mjs
records option mappings and heavy-ball retention, not this matrix. GitHub PR
title search for inventory weight returned no matches; this does not exclude
differently named work.

This closes the finite API comparison gap for deriving selected stack weights
and totaling mixed chains. It does not establish C/JS parity of mksobj,
splitobj, merged, addinv, pickup/drop commands, serialized state or UI messages.
The harness links chains directly; it does not execute inventory insertion or
quantity-mutation callers. Two-stack cases are distinct constructed objects,
not claims that a particular command produced them. No gameplay recording was
attempted, and public-input reachability remains unestablished. Those are
precise remaining wiring/oracle gaps, not negative findings or a suspicion
backlog. Zero-weight catalog types, containers and overflow are not covered.
No repair is proposed and Main remains the gameplay writer and integrator.
