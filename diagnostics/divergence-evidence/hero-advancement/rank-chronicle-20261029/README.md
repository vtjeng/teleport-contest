# First and repeated rank achievement ordering

Public human male Wizard control 1→3 and target 1→3→2→3, followed by #chronicle,
match C/JS screens, attributes, cursors and RNG. Control: 87 screens/2163 RNG;
target: 187 screens/2166 RNG. Zero new semantic causes, one scoped negative.

Source hypothesis: pluslvl must count achievements after ability adjustment,
avoid a duplicate rank entry on reacquisition, then use ulevelpeak to select
'regained' for the fallback event. Source inspection predicts agreement, and the
public chronicle makes the resulting event ordering observable. The verifier
asserts one Conjurer attainment, then loss and regain, against the first-gain
control. This extends earlier screen-based level probes with a new event observer.
It does not instrument internal call timestamps or claim those were measured.

Wizard levelchange resets ulevelmax after lowering, while preserving ulevelpeak
and achievements. Thus the second welcome is not a natural 'Welcome back' witness;
the chronicle nevertheless correctly reports regained. No combat, object effect,
ring, death, polymorph, status-expiry or denied setup is used. Starting inventory
is unchanged. Only the first male rank and repeated achievement event are pinned.

JS base 029dbe6ffb8fbf04dc6d1b3dd16153b7054363f1; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. The preinstalled recorder lacks retained
build attestation; its prior hash/source checks remain a hashed dependency.

Reproduce from repository root with existing recorder prerequisites (fresh dirs):

```
node diagnostics/divergence-evidence/hero-advancement/rank-chronicle-20261029/run.mjs control /tmp/hero-rank-control-new
node diagnostics/divergence-evidence/hero-advancement/rank-chronicle-20261029/run.mjs target /tmp/hero-rank-target-new
node diagnostics/divergence-evidence/hero-advancement/rank-chronicle-20261029/verify.mjs
```

All expect exit 0. Verifier checks full parity and exact archived chronicle rows.
68 focused level-arrival/level-change tests pass. Actual receipts, raw outputs,
source bindings and stored-byte hashes are retained. No unresolved mismatch here.
Timings are elapsed, not active compute. Main owns gameplay; no CI dispatch,
merge or formal approval. Female rank encoding and later rank events remain
reachable coverage expansion, not failures or blocked states.
