# Non-elemental light explosions: bounded manual negative

Two native monster encounters explain a production-wiring hypothesis: isolated status-helper tests do not establish that `mattackm → explmm → mdamagem → mhitm_adtyping` dispatches a non-elemental explosion and then removes its attacker. These recordings reach that path for a tame black light and, as an opposite status control, a tame yellow light against a hostile ogre.

**Explained negative for these two reached encounters only.** No gameplay change, universal explosion-equivalence claim, or scanner suppression. This is a manual/unbound case, not a new canonical scanner identity.

| Variant | Native C observation | JS result | Complete comparison |
| --- | --- | --- | --- |
| Black-light target | Step 55: `It explodes! The ogre looks confused.` (within paginated combat line); step 56: melancholy feedback | Matches | 3035 RNG; 57 screens/cursors |
| Yellow-light control | Steps 56–58: yellow light explodes, ogre is blinded, melancholy feedback | Matches | 3029 RNG; 59 screens/cursors |

The target's `It` is preserved native visibility behavior; no artificial visibility override is used. The recordings use the same seed/date/role/options and differ in created light species and necessary input length. RNG counts are compared within each variant, not assumed equal across variants. Both stop immediately at tame death feedback. Earlier longer exploratory recordings also matched but included subsequent unrelated turns and are not published.

## Source and supported setup

C `mhitm.c:explmm` sends non-fire/cold/electric explosions through `mdamagem`, then kills the attacker if its result did not already report death. It emits tame melancholy feedback. `uhitm.c:mhitm_ad_halu` confuses an eyed, seeing monster and zeroes this attack's damage; native yellow-light AD_BLND follows the blindness helper. JS implements the same caller order and reached effects.

The fixture uses supported `^G tame black light` / `^G tame yellow light`, then `^G hostile ogre`, followed by wait-without-pickup commands. No attack table, resistance, monster flags, callback, or random draw is invented. These are normal monster turns using native species. Existing source-pinned helper tests were reused, not rewritten or counted as new discoveries: 13 checks in `scripts/uhitm-ad-halu.test.mjs`, `scripts/uhitm-ad-conf.test.mjs` and `scripts/uhitm-ad-slee.test.mjs` passed during this review.

## Reproduce

At the exact `case.json` JS base with the pinned C submodule initialized, copy this evidence directory unchanged and run:

```
node diagnostics/divergence-evidence/monsters/non-elemental-light-explosions/replay.mjs target
node diagnostics/divergence-evidence/monsters/non-elemental-light-explosions/replay.mjs control
```

Both expected exits are 0. The runner asserts the distinguishing native messages and final death feedback before comparing complete streams. Clean-base receipts record actual executions. The complete native C recordings and recipes are included, with byte hashes and recorder fingerprint. The original differential uses `runDifferential(recipe, process.env, {evidenceDir: '/absolute/new/private-directory'})` from `scripts/diff-fresh.mjs`; each recipe can be passed unchanged.

No HP or internal status trace is claimed from terminal output. Cancellation, resistance, lifesaving, leash behavior, equipment, repeated confusion and other attacker/defender pairs are outside this negative. In particular, matching these two seeds does not justify suppressing other explosion leads. Guardian PRs #81/#100 remain one parked unresolved hypothesis; no guardian experiment was repeated here.

A supplementary wand-cancellation probe is retained as `unqualified-cancellation.recipe.json`. C/JS matched 3132 RNG and 131 screens/cursors, but the terminal output does not establish both successful cancellation and a subsequent explosion dispatch. It is excluded from the negative. Its native raw hash and private retention path are in observations; no new unresolved root cause or negative is counted.
