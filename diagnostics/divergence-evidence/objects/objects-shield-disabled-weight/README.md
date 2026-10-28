# objects-shield-disabled-weight

**Explained negative, objects shard.** Scanner lead `source-audit:edge-c-only:src/objnam.c:shield_simple_name:weight` sees a call in unconditional `#if 0` at C `objnam.c:5590-5595`. The live C function returns silver/smooth shield for reflection according to dknown, and shield otherwise. JS `objnam.js:386-393` does exactly that. No reachable runtime setup in this build executes the disabled heavy/light-shield proposal.

This is the already-observed inactive-C-call family, independently pinned to this exact function and source fingerprint. The small test preprocesses the extracted actual function; weight and heavy/light strings vanish, while the live reflection/dknown conditional remains. Controls check null, small/large shields and both reflection discovery states. No full replay was performed, and this is not a claim about shield weight computation elsewhere.

```
source /workspace/.setup/activate.sh # when available
node --test diagnostics/divergence-evidence/objects/objects-shield-disabled-weight/check.test.mjs
```

Requires Clang or compatible `CC`. Binding and both decisions are in sibling `../objects-helm-inline-predicate/`. Reopen if the unconditional guard changes; current header flags cannot enable literal #if 0.
