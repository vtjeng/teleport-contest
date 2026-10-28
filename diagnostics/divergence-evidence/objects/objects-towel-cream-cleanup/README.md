# objects-towel-cream-cleanup

**Explained negative for the recorded public setup only; objects shard; manual/unbound.** Hypothesis: cleaning cream-pie blindness with a wielded wet towel might diverge in prompt order, blindness cleanup, wetness or wield feedback. The target and dry-towel control both match C completely. This is bounded behavioral evidence, not universal towel equivalence or a scanner suppression rule.

Public setup: debug Valkyrie, seed 19870629, apply a wished cream pie, wish a towel, wield it and apply it. Wet target wishes `uncursed wet towel`, yielding spe=4; control wishes `uncursed towel`. The correct towel letter is f. C target steps 64/66/67 show wielded wet towel, restored sight after cream cleanup, then `Your wet towel (4) dries.` Control steps 60/62 show wielded dry towel and restored sight with no drying message. JS state checks confirm ucreamed=0, blindness timeout=0, towel spe 4->3 versus 0->0, and unweapon false versus true.

Source: C apply.c:112-195 checks free hand and worn eyewear before curse handling; its cream branch subtracts ucreamed from HBlinded, clears ucreamed, restores sight, and conditionally calls dry_a_towel(-1) only when wet. C weapon.c:1018-1088 reports drying before setting/clamping spe and updating wield/inventory state. JS apply.js:4379-4490 and weapon.js:269-340 preserve that order on this path. Existing scripts/apply.test.mjs also covers towel helpers; this case adds independent public target/control recordings, not a newly missing implementation claim.

Wet: 70/70 screens/cursors and 2796/2796 RNG calls match. Dry: 66/66 screens/cursors and 2780/2780 RNG calls match. Four-byte difference in wish text and wetness-generation RNG mean later RNG streams need not match each other; each JS run matches its own C oracle.

```
node --test diagnostics/divergence-evidence/objects/objects-towel-cream-cleanup/check.test.mjs
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-towel-cream-cleanup/wet-capture-c.json
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-towel-cream-cleanup/dry-capture-c.json
```

To regenerate either fixture, use the standard patched recorder in a private install:
```
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-towel-cream-cleanup/wet-recipe.json /tmp/towel-wet-new.json
```

The first exploratory recipes incorrectly selected e after the pie was consumed. They matched without exercising towel use and were rejected as setup failures, never negatives. Their raw observations remain in the private triage directory (`towel-{wet,dry}-{recipe,capture}.json`); only corrected v2 inputs are published. This case is manual: no exact scanner lead asserts this combined cleanup/wetness hypothesis. Nearby dry_a_towel message edges are not relabeled to enable suppression. Reopen for changed cleanup/timeout/feedback code; other cursed, engulfed, blocked-blindness or monster-carried states are outside the evidence.
