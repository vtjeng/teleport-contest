# objects-tip-container-macro

**Explained negative, objects shard.** The source auditor emits `source-audit:edge-js-helper:src/pickup.c:tip_ok:isContainer`: JS calls a helper without a same-name C function. This edge is a direct expansion of C's `Is_container` macro, not added behavior.

C `include/obj.h:337` defines `Is_container(o)` as `o->otyp >= LARGE_BOX && o->otyp <= BAG_OF_TRICKS`. JS `obj.js:1225-1226` uses exactly those inclusive bounds. C `pickup.c:3481-3496` and JS `pickup.js:4302-4308` both reject null and coins first, suggest containers, suggest a horn of plenty only with both `dknown` and `oc_name_known`, and downplay everything else. All operands are the corresponding object/catalog fields; there is no RNG, message, mutation, or extra eligibility check in this helper.

`node --test diagnostics/divergence-evidence/objects/objects-tip-container-macro/check.test.mjs` passes. It pins the C macro text and tests all seven container type IDs, the two adjacent non-container IDs, null/coin/dagger controls, and all four horn knowledge combinations. A sack, coin, dagger and horn are ordinary reachable inventory objects; the helper result depends only on their type, class and knowledge fields. The finite field partition and source correspondence supply the proof; no matching-seed recording is being used to claim equivalence.

Expected C and observed JS: null/coin => EXCLUDE (-3); containers => SUGGEST (2); horn => SUGGEST only when both knowledge flags are true; other permitted objects => DOWNPLAY (1). The scanner observation is retained in `record.json` with exact provenance.

Safe generalization: this specific macro/helper pair can be recognized when its source and field mapping remain unchanged. Do not suppress arbitrary extra JS helpers, or infer that the full tip command, container effects, knowledge transitions, or all inventory behavior are equivalent. No missing-coverage or invalid-setup result is classified as negative.
