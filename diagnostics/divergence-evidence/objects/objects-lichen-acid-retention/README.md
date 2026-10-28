# objects-lichen-acid-retention

**Explained negative for two recorded public paths; manual/unbound objects case.** Hypothesis: the lichen acid-test special case might consume the reagent or lose the dilution-dependent feedback. Public debug Valkyrie, seed 19870702, wishes a lichen corpse and acid potion and dips the corpse into the potion. Control changes the acid to diluted. Both match C completely, show the expected red/orange edge color, and retain corpse and reagent after the optional naming prompt is cancelled.

C potion.c:2597-2608 handles the acid/lichen case before generic corrosion. It chooses wrinkled when blind or orange/red when sighted, clears potion.in_use, optionally calls trycall, and returns ECMD_TIME without poof/useup. JS potion.js:3582-3593 preserves that source order for these sighted cases. Focused tests assert color and naming prompt in both C and JS screens, then verify corpse species, reagent quantity one, preserved dilution and cleared in_use. Existing scripts/dip.test.mjs also covers potion_dip helpers; this is independent public evidence, not a new implementation claim.

Acid matches 78/78 screens/cursors; diluted matches 86/86. Both match 2742/2742 RNG calls. These matching seed cases do not prove general acid corrosion, hallucination, blindness or corpse behavior.

```
node --test diagnostics/divergence-evidence/objects/objects-lichen-acid-retention/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-lichen-acid-retention/acid-capture-c.json
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-lichen-acid-retention/diluted-capture-c.json
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-lichen-acid-retention/acid-recipe.json /tmp/lichen-new.json
```

Fresh capture requires the standard patched recorder in a private install. Initial recordings reached the naming prompt; published inputs explicitly advance More and cancel naming before inventory. Raw initial observations remain privately as lichen-{acid,diluted}-capture.json. This manual combined-effect hypothesis has no matching canonical scanner key; it remains unbound, with no suppression decision.
