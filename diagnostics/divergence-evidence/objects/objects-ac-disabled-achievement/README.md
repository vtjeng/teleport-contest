# objects-ac-disabled-achievement

**Explained negative, objects shard.** Scanner lead `source-audit:edge-c-only:src/do_wear.c:find_ac:record_achievement` treats calls in disabled C source as live edges. C `do_wear.c:2515-2529` places all three AC achievement calls inside unconditional `#if 0`; the preprocessed function cannot execute them. JS `u_init_inventory_attrs.js:441-474` correctly has no corresponding calls. This does not assert parity for other achievement entry points or all armor-class computation.

The focused test extracts the actual C function, confirms the raw body contains the reported call, then passes that body through Clang's preprocessor. All record_achievement/ACH_AC_ tokens disappear while live `u.uac = uac` and `disp.botl = TRUE` assignments remain. Header definitions cannot enable an unconditional literal `#if 0`. JS controls on either side of thresholds 0, -10 and -20 confirm AC is updated and the status flag changes only when AC changes. These helper controls are not claimed as new public gameplay captures; no public setup can enable the disabled C branch in this build.

```
source /workspace/.setup/activate.sh # if supplied by the cloud environment
node --test diagnostics/divergence-evidence/objects/objects-ac-disabled-achievement/check.test.mjs
```

Requires Clang (`CC` can select a compatible preprocessor). Exact run binding and both decisions are included in sibling `../objects-armor-rng-alias/`. Relevant source and hub files are unchanged between the retained discovery base cfb72d469 and reviewed base acec7a757. Reopen if the preprocessor guard changes; never suppress arbitrary missing achievement calls from this proof.
