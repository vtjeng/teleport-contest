# objects-burning-oil-tag

**Explained negative, objects shard.** The compiler finds `BURNING_OIL = MAXOCLASSES + 1 = 19` in C `include/objclass.h`; JS `const.js:2034` uses -2. In the current object-effect path this is a consistently remapped symbolic tag, not an arithmetic quantity or catalog index.

The only producer is `splatter_burning_oil` (`explode.c:968`, `explode.js:1274`), which passes the symbolic constant. All direct consumers in JS `explode.js` distinguish object classes through equality tests; burning oil selects the `POT_OIL` floor-effect type and the "burning oil" description. The tag is distinct from all ordinary object classes and other special explosion tags on both sides. Helper propagation through explosionmask and engulfer_explosion_msg only tests WAND_CLASS. The remaining escape is `resist` (`explode.c:534`, `explode.js:631`): C `zap.c:6100-6135` and JS `zap.js:1577-1594` switch on six ordinary classes and use hero level for all other values. Both 19 and -2 take that default. There is no arithmetic, ordering, serialization or object-table indexing on this tag in the traced path.

Expected C and observed JS: burning-oil labeling and POT_OIL dispatch, default resistance attack level. The focused resistance test records bounds `[104,104,103]` for JS oil tag, C oil number, and POTION_CLASS control at hero level 7/monster level 3, with no damage. This does not pass C's raw tag to JS explode; callers must use their own runtime symbolic value.

An independent public-input illustration wishes for lit oil and throws it downward. The actual C prompts required two spaces: stairs impact, then shattering/explosion. The completed recording reaches `d(4,4)=8 @ splatter_burning_oil`, the "You are caught in the burning oil!" message, HP 8/16, and the following input boundary. It matches all 44 screens/cursors, 2295 RNG calls and two animation frames. Intermediate prompt-only captures were retained locally and are not represented as completed evidence. This one matching seed is not the equivalence proof; the closed value-use trace above supplies the narrow tag-representation proof.

```
node --test diagnostics/divergence-evidence/objects/objects-burning-oil-tag/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-burning-oil-tag/capture-c.json
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-burning-oil-tag/recipe.json /tmp/objects-oil-new.json
```

Use a private recorder installation for fresh capture. The focused test passes. Scope excludes general explosion equivalence, other special source tags and every other numeric mismatch. A new numeric use or tag collision invalidates the negative. This is tooling evidence, not a gameplay implementation candidate.

The exact hub binding and the decision for this case are included once in the sibling `objects-scatter-unused-flags` directory in this same PR. Its `binding.json`, `bound-run.json`, and `decisions.json` retain the immutable full-run hash, selected raw lead, unchanged fingerprint inputs, and hub-generated reviewFingerprint. See that directory's reproduction command for importing the scoped decision. No canonical ID was inferred from a nearby source helper.
