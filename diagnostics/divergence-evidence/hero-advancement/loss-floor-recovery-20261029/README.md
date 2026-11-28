# Remaining ordinary loss-floor and recovery projections

JS base `fdaa960271b2eab9d9e2314d413f80258122b577`; C gitlink
`16ff59115315917b93185d026aeefea06db9b0f4`.

16 targets plus one control match the executed C projection used in PR #109.
No new candidate semantic cause. The unchanged nine C function bodies are compiled
fresh; the adapter limits and source bindings remain explicit in shim.h and the
per-run generated sources. Actual JS advancement APIs run without replacement.

- Nonfatal level-one calls reset positive XP (1/18/19) to zero without a farewell,
  without decreasing level, and without changing existing HP/energy. Zero XP is
  the control. The helper receives the nonfatal #levelchange marker; the public
  command itself refuses to call losexp at level 1, so this is API-only evidence.
- Losses starting at levels 10, 11, 12 and 30 cover the maximum of 10 and the new
  level in minuhpmax. Max HP is set just below/at/above the clamp boundary after
  subtracting a stored increment. Expected results explicitly pin setuhpmax's
  current-HP clamp before the later subtraction, including the last increment slot.
- A level-one hero with ulevelmax/peak 2 regains level 2 and prints Welcome back,
  preserving the historical maximum and peak. This reaches the quiet rank band;
  achievement-repeat behavior is not inferred.

Several lowered maximums are constructed states with unqualified public histories.
No prohibited effect is used to reach them. Role/race is ordinary human Wizard,
non-polymorphed, awake and nonfatal. Death and polymorph dependencies abort if
entered. Intrinsic crossings are excluded; adjabil/achievement/notification
boundaries retain the disclosed PR #109 stubs. This is conditional resource/XP/
message/RNG evidence, not whole-game parity or a natural drain history.

Reproduce from repository root with existing Node/GCC:

```
node diagnostics/divergence-evidence/hero-advancement/loss-floor-recovery-20261029/run.mjs control
node diagnostics/divergence-evidence/hero-advancement/loss-floor-recovery-20261029/run.mjs target
```

Both expect exit 0. Inputs, both outputs, generated C, source hashes, compiler and
binary provenance and command receipts are preserved. No build attestation is
added to the separately preinstalled public recorder. Existing level-one repair
8585e9745 remains preserved, not a new finding. Zero unresolved mismatches; natural
reset/recovery/depleted-resource histories remain setup gaps under the exclusions.
No gameplay edit, CI dispatch, score, merge or formal approval. Elapsed windows
exclude setup/publication and are not active compute.
