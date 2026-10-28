# Wraith digestion route: scoped explained negative

A native purple worm's failed gulp of a wraith is expected C behavior, not a
missing digestion effect. The current native catalog contains exactly one
AD_DGST attack: purple worm AT_ENGL. Wraith has M1_UNSOLID. Before `gulpmm`,
`mattackm` calls `failed_grab`, whose unsolid + AD_DGST condition rejects it.
`getmattk` substitutions do not introduce another digestion attack; a special
cooldown instead converts engulfing to a physical claw.

```
node --test diagnostics/divergence-evidence/monsters/wraith-digestion-route-negative/probe.test.mjs diagnostics/divergence-evidence/monsters/wraith-digestion-route-negative/replay.test.mjs
```

Two tests pass. Source/catalog assertions retain the proof, and a native
wraith/solid-nurse control checks production `failed_grab` without replacing the
guard or changing attack arrays. The complete public-input C recording shows
`The purple worm's gulp attempt passes right through the wraith!` at step 71.
C and JS match all 3112 RNG entries, 104 screens and 104 cursors. The later kill
is a bite, so its growth is ordinary victim growth, not wraith digestion.

**This does not establish equivalence of the wraith-specific growth branch in
`mdamagem`. That broader hypothesis remains unresolved: no supported route to
that branch is established.** Do not bypass this gap by injecting AD_DGST into
a different attack or removing the wraith's unsolid flag. The negative is only
that this supported native encounter's rejected gulp is not a port defect.
The source guard/catalog proof, rather than a mere absence of recorded calls,
explains that outcome. Catalog, substitution or guard changes require review.

This is a manual, unbound case, with no scanner suppression requested. The
initial startup-prompt failures from the earlier scout were not used. The full
corrected C recording and its input recipe are included without trimming.
Regenerate with the configured recorder using `node` on the local `record.mjs`
and a new private output-directory argument. No gameplay changes are included.
