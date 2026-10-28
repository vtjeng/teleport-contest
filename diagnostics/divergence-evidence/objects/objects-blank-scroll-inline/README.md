# objects-blank-scroll-inline

**Explained negative; objects shard.** The source audit reports the missing call `seffects -> seffect_blank_paper`. C `read.c:2222-2224` calls a helper; JS `read.js:3276-3286` inlines that helper's entire body. The absence of a same-name call does not remove the effect.

C `read.c:2005-2012` tests `Blind`, emits one of two messages, and sets `gk.known = TRUE`. The unused pointer parameter has no effects. JS emits the same strings (`You(...)` is expanded to the `You ` prefix), sets `state.gk.known = true`, and breaks from the switch. C `youprop.h:103` defines Blind as `(HBlinded || EBlinded) && !BBlinded`; JS `read.js:886-888` tests the corresponding intrinsic/extrinsic/blocked fields. There are no RNG calls or additional state mutations in the C helper or JS inline body. The caller's surrounding RNG and scroll-retention behavior is separate from this local equivalence proof.

Two independent public-input witnesses use seed 19870625 and the clock in the recipes. The hero wishes for a blank scroll and reads it sighted. The blind variant then wishes for and puts on a blindfold and rereads the already known scroll. Captures verify the target messages and actual blindfold transition. Sighted: all 45 screens/cursors and 2818 RNG calls match. Blind: all 77 screens/cursors and 2844 RNG calls match. These recordings illustrate the two branches; the source correspondence, not two matching seeds, establishes the narrowly scoped equivalence.

```
node --test diagnostics/divergence-evidence/objects/objects-blank-scroll-inline/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-blank-scroll-inline/capture-c.json
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-blank-scroll-inline/blind-c.json
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-blank-scroll-inline/recipe.json /tmp/objects-blank-new.json
```

Use a private recorder install for fresh capture; substitute `blind-recipe.json` for the blind variant. The focused check pins the exact C helper and property predicate, checks each public witness's final message, and verifies that the scroll remains carried and known. All tests pass. An initial test assertion expected JavaScript boolean `true` for `oc_name_known`; this catalog field is numeric `1`. The assertion now checks truthiness, matching C semantics. This test-authoring correction is not a gameplay divergence or failed setup.

Safe generalization: recognize this exact inlined function when the source, branch predicate and field mapping are unchanged. Do not suppress missing calls merely because some message text is present; untested effects and other scroll cases remain outside this proof.
