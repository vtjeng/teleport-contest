# objects-canwear-armor-partition

**Explained negative; objects shard.** The discovery warning `source-audit:edge-c-only:src/do_wear.c:canwearobj:silly_thing` does not establish a reachable missing message. C's final fallback calls `silly_thing("wear", otmp)`; JS throws at that fallback. The two implementations differ for fabricated non-armor arguments, but both production callers exclude those arguments.

C `do_wear.c:2220-2225` sets `armor = obj->oclass == ARMOR_CLASS` and calls only under `if (armor)`. Its other call at `3431-3432` has the same class guard. JS counterparts are `do_wear.js:3559-3569` and `3089-3090`. A repository-wide call-site search found no other production callers in either source tree. All 85 ARMOR_CLASS catalog entries match exactly one of the seven categories handled by the if/else chain before the fallback: helmet 12, shield 9, gloves 4, boots 10, shirt 2, cloak 12, suit 36. The JS predicates (`obj.js:1331-1368`) directly implement C's `obj.h` category macros. The fallback is unreachable for valid, catalog-consistent armor passed through these callers, regardless of earlier fit refusals.

Commands from repository root:

```
source /workspace/.setup/activate.sh
node scripts/generate-objects.mjs --check
node --test diagnostics/divergence-evidence/objects/objects-canwear-armor-partition/check.test.mjs
rg -n 'canwearobj\(' js nethack-c/upstream/src
```

The generated-data check verifies the catalog against compiled C objects.c. The focused test pins both callers' guards, exhaustively checks the category partition, and calls the silent predicate for each valid armor type in an initialized human hero state. All checks pass. Expected C and observed JS are selection of a handled category or an earlier fit refusal, never the final fallback. Adjacent-category/non-armor tests would exercise an unsupported direct call, not a valid public setup, so none is presented as a divergence or runtime negative witness.

Scope: this is a caller-and-catalog reachability proof for the final fallback only. It does not certify every fit refusal, wear effect, state transition, or future caller. A new category, changed caller guard, or inconsistent type/class invariant invalidates the proof. No general rule should suppress arbitrary unsupported branches. The initial generated-data check could not find clang; sourcing the existing setup activation resolved it without installation or environment/security changes.
