# objects-helm-inline-predicate

**Explained negative, objects shard.** Scanner lead `source-audit:edge-c-only:src/objnam.c:helm_simple_name:hard_helmet` misses the inline implementation in `js/objnam.js:348-358`. C `objnam.c:5513-5528` delegates to `do_wear.c:568-574` hard_helmet, which first checks nonnull and is_helmet, then is_metallic or is_crackable. The obj.h/objclass.h predicates test armor class, helm category, the inclusive IRON..MITHRIL material range, or glass armor. JS performs those same checks, delegating only the glass predicate to isCrackable.

The focused test extracts both actual C function bodies, the three macro definitions, and the class/category/material enums from the pinned upstream source. A minimal compiled C harness evaluates all 18 classes x 7 armor categories x 22 material values, plus null; production JS matches all 2773 outputs. This is a superset of the supported object domain, not a claim that every constructed combination can occur. Real initialized object controls cover fedora/leather hat, iron helm, ordinary helmet and glass helm of brilliance. The comparison proves this pure naming predicate; it does not certify falling-rock damage, all armor messages or equipment command behavior.

```
source /workspace/.setup/activate.sh # when available
node --test diagnostics/divergence-evidence/objects/objects-helm-inline-predicate/check.test.mjs
```

Requires Clang (`CC` may choose a compatible compiler). Temporary harness files are deleted. No new gameplay recording is claimed or needed for the finite-domain helper proof; supported objects are ordinary headgear and null, and all their predicate inputs are covered.

Shared binding files here preserve the two original scanner keys, evidence keys, run ID, and hub review fingerprints. The retained run's cfb72d469 source relevant to these cases is unchanged at reviewed main acec7a757. The full run remains available privately. Reopen on predicate, material-enum or object-category changes; do not suppress arbitrary missing helper edges.
