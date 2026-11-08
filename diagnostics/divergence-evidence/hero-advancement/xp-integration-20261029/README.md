# Continued public XP application and revisit behavior

JS base `fdaa960271b2eab9d9e2314d413f80258122b577`; C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`.

Three additional public debug-assisted recordings match C/JS completely. Zero
candidate semantic causes. These use the same permitted Tourist sightseeing route
as the earlier integration package: actual more_experienced/newexplevel and level
arrival functions, no internal injection or stubs, no combat or object effects.

The first path visits new depths 19→21→2, then revisits 21. Observed statuses are
level 1 / 19 XP, level 2 / 39 XP (40 was capped to one point below the next gain),
level 3 / 41 XP, and unchanged level 3 / 41 XP on revisit. It matches 48 screens
and 11589 RNG calls. This exercises one-level-only overshoot application, a later
incremental gain, and no duplicate sightseeing reward for an existing level.

The second path raises a Tourist to level 30, then visits a new depth 20. XP grows
from 100000000 to 100000020 with HP/Pw unchanged; 99 screens and 6006 calls match.
Its no-travel control matches 87 screens and 2887 calls. **This does not isolate
the MAXULEV guard:** newuexp(30) is 110000000, so the award stays below threshold.
The result is only a matching below-threshold MAXULEV award. The exact-at/above-
threshold MAXULEV guard still has only PR #109's constructed compiled evidence;
a permitted public history obtaining the remaining ten million XP is unqualified.

`verify.mjs` recomputes full parity and asserts the actual XP/level/depth sequence
and the max-level current/max HP/Pw equality with control. All C/JS outputs and
actual inputs are archived; the verifier does not infer success from runner exit
alone. Debug transport spends no turns and does not establish normal walking
history. The old shared timer-engine gap remains open. The preinstalled recorder
still has no retained build attestation; earlier binary/source hashes remain
applicable and are retained as a dependency.

```
node diagnostics/divergence-evidence/hero-advancement/xp-integration-20261029/run.mjs xp-overshoot-revisit
node diagnostics/divergence-evidence/hero-advancement/xp-integration-20261029/run.mjs xp-maxlevel
node diagnostics/divergence-evidence/hero-advancement/xp-integration-20261029/run.mjs xp-maxlevel-control
node diagnostics/divergence-evidence/hero-advancement/xp-integration-20261029/verify.mjs
```

All expect exit 0. The first overshoot exploration ran before its dedicated runner
path was finalized; the archived receipt covers the repeat through the final
runner. No mismatch or denied action was retried. Fresh output paths are exclusive;
do not reuse archive invocation directories. Gzip hashes cover compressed bytes.

Confirmed new causes: 0. Scoped negatives: these three paths. Unresolved comparison
mismatches: 0. Qualification gap: natural play/at-threshold MAXULEV application,
not a claimed bug. No gameplay changes, CI dispatch, score, merge or formal approval.
Main retains integration. Timing is elapsed capture time, not active compute.
