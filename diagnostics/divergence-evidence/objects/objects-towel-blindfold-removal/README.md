# objects-towel-blindfold-removal

**Explained negative for the recorded public setup only; objects shard; manual/unbound.** Hypothesis: a cursed towel's eyewear-removal branch might diverge in prompt, drop or visibility ordering. A removable blindfold target and cursed-blindfold control both match C completely; this is not a general towel or eyewear parity claim.

Public debug Valkyrie setup, seed 19870630: wish a blindfold, put it on, wish a cursed towel and apply it three times. Target uses an uncursed blindfold. Its first apply logs `rn2(3)=1 @ use_towel` and pushes the blindfold off; later applications exercise slimy hands and wiping them. Control changes only blindfold BUC to cursed: first apply logs the same branch draw plus `rn2(2)=1`, pushes it cock-eyed and retains it; two later applications push it crooked. Public messages establish reachability; JS state checks independently verify target no longer wears or carries the blindfold, control still wears the cursed blindfold, and the cursed towel remains carried.

C apply.c:139-163 names the worn item, branches on its curse, and either consumes the extra cosmetic RNG draw or calls Blindf_off then dropx on the saved object. JS apply.js:4426-4451 follows that sequence using canonical operations. Existing scripts/apply.test.mjs already checks the helper order; these independent public target/control fixtures confirm this instance rather than claim a new repair.

Target: 65/65 screens/cursors, 2653/2653 RNG calls. Control: 63/63 screens/cursors, 2668/2668 RNG calls. Each JS run matches its own C oracle; different branch RNG and prompts intentionally make the two captures different.

```
node --test diagnostics/divergence-evidence/objects/objects-towel-blindfold-removal/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-towel-blindfold-removal/removable-capture-c.json
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-towel-blindfold-removal/stuck-capture-c.json
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-towel-blindfold-removal/removable-recipe.json /tmp/towel-blindfold-new.json
```

Use the standard patched recorder in a private install for regeneration. No exact scanner lead was found for this manual combined effect hypothesis; the case is deliberately unbound and cannot be imported as an exact negative suppression. Other blindness sources, eyewear types and cursed-towel outcomes remain outside this bounded observation.
