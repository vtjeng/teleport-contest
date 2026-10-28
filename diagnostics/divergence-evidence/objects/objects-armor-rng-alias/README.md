# objects-armor-rng-alias

**Explained negative, objects shard.** The scanner lead `source-audit:edge-c-only:src/do_wear.c:some_armor:rn2` misses `random.rn2(4)` in JS `do_wear.js:4029-4050`. Its default random object includes the imported production `rn2`. C `do_wear.c:2630-2652` uses the same ordered selection and short circuit: cloak, suit or shirt first; then helmet, gloves, boots, shield. A present item replaces an empty selection without a draw; otherwise it replaces the selection only on zero from rn2(4).

The test extracts the actual C function body, compiles it with a minimal hero-slot/RNG harness, and compares 32,768 results and draw counts with production JS: all 128 occupancy masks and all 256 vectors of four base-4 draws. There can be at most four draws. The harness asserts each RNG bound is 4. Zero/nonzero and single-item/no-draw controls exercise both branches. Enumerating all masks includes a superset of valid equipment combinations; no invalid combination is presented as a bug witness. This proof concerns hero selection and RNG dispatch; it does not certify monster slot lookup, equipment legality or all caller effects.

A public debug Valkyrie wishes for and wears a helmet, then reads an uncursed scroll of enchant armor. The C capture logs `rn2(4)=2 @ some_armor(do_wear.c:2650)`. Replay matches 79/79 screens/cursors and 2270/2270 RNG calls. This supplies public reachability; a matching seed alone is not the equivalence proof.

```
source /workspace/.setup/activate.sh # if supplied by the cloud environment
node --test diagnostics/divergence-evidence/objects/objects-armor-rng-alias/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-armor-rng-alias/capture-c.json
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-armor-rng-alias/recipe.json /tmp/objects-armor-new.json
```

The focused test requires Clang (`CC` may select a compatible compiler), writes only a temporary small harness, and deletes it. Fresh capture requires the standard patched recorder in a private install; replay uses the included capture.

The shared `bound-run.json`, `decision-template.json`, `decisions.json` and `binding.json` preserve the immutable discovery run and exact hub-generated fingerprints for this case and the sibling AC case. The original run was collected at cfb72d469; source and hub files relevant to these two proofs are unchanged at reviewed base acec7a757. Full run retained privately; no new run identity is invented. Reopen this narrow decision if RNG wiring, selector order or short-circuit conditions change.
