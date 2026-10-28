# Green-slime digestion transformation: scoped explained negative

The prior slime scout lacked combat coverage. A known open-room seed now
reaches the intended branch: a tame purple worm bites and swallows the green
slime; after the victim dies, the worm turns into a green slime. The complete
C recording and JS replay agree through this transition and subsequent turns.

```
node --test diagnostics/divergence-evidence/monsters/slime-digestion-transform-negative/probe.test.mjs diagnostics/divergence-evidence/monsters/slime-digestion-transform-negative/replay.test.mjs
```

Four tests pass. The public-input witness reaches the bite at step 61,
swallow/burp at step 62 and death/transformation at step 63 (zero-based).
All 2947 RNG entries, 169 screens and 169 cursors match. Unlike the earlier
scout, this one has explicit branch evidence. Full-moon startup prompts are
answered before creating either monster.

A separate initialized-state test calls production `gulpmm` with native
purple-worm and green-slime data and legal scripted RNG. It asserts that the
victim dies and the predator's species becomes PM_GREEN_SLIME. A solid lichen
control dies without changing the predator's species. The source proof pins
C's post-digestion `newcham(magr, &mons[PM_GREEN_SLIME], NC_SHOW_MSG)` call and
its `!slimeproof` gate. No attack table or transformation implementation is
injected. Runtime species/HP observations are retained, but the claim is the
species transition, not universal HP or intrinsic equivalence.

This closes only the scoped suspicion that this reachable digestion transition
is omitted or selects a different form. Matching this seed does not prove all
digestion, passive sliming, shape-change state or timing equivalent. It does
not resolve the separate Archon or wraith-growth hypotheses.

The case is manually investigated and **unbound** to the scanner. Do not invent
a suppression key for it. The earlier no-combat slime recording remains a
coverage failure, not a negative. Regenerate the included full C recording
using the local `record.mjs` with a new private output-directory argument and
the repository's configured recorder. No gameplay changes are included.
