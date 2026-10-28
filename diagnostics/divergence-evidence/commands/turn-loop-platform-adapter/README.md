# Two scoped turn-loop negatives

The scanner's `moveloop_core -> pgetchar` lead is inactive in the Unix recorder: configured preprocessing removes the `MICRO || WIN32CON` occupation polling block. It retains the occupation callback and monster-nearby interruption. This says nothing about those other platforms or all interruption paths.

The JS-only `moveloop_core -> flush_screen` lead is a one-call wrapper expansion. Both C status branches call `curs_on_u()`, whose complete body is `flush_screen(1)`. The corresponding JS branches invoke that operation directly. This proves these call edges and ordering, not general status/display equivalence.

Run from repository root:

```
node --test diagnostics/divergence-evidence/commands/turn-loop-platform-adapter/evidence.test.mjs
node scripts/diff-fresh.mjs diagnostics/divergence-evidence/commands/turn-loop-platform-adapter/control.recipe.json
source /workspace/.setup/activate.sh
clang -E -P -I nethack-c/recorder/include nethack-c/recorder/src/allmain.c
clang -E -dM -I nethack-c/recorder/include nethack-c/recorder/src/allmain.c
```

The shared ordinary-play control is `3s`, Escape, `:` with the time option. All five screens/cursors and 3,649 RNG calls match on Main `acec7a75751e61f8e6b78c2f08c1579d19a10869`. That seed is corroboration, not universal proof. The preprocessing evidence includes the exact invocation, full-output hashes and relevant excerpt; the test checks saved proof, while the two Clang commands reproduce it from the recorder headers.

`case.json` records both stable case IDs, provenance and scope. Exact original scanner identities and hub review fingerprints are retained in `discovery-bindings.json`; raw observations are unchanged. The immutable discovery run remains in the saved analysis environment and is not duplicated here. Bindings apply to its original base, with current source proof recorded separately.

Do not suppress all occupation or callback leads: [PR #25](https://github.com/vtjeng/teleport-contest/pull/25) demonstrates an actual missing occupation continuation on this same Main. Raw control captures are ordinary gzip JSON. No gameplay or default-CI files change.

## Portable scanner handoff

`discovery-run.projection.json` is a 22 KB partial projection, not the 42,926,676-byte original run. It preserves six selected lead objects unchanged and every input to `reviewFingerprint`: this PR's two leads, PR #9's two leads, and two adjacent extended-menu bounds. It includes no decisions for the latter four. The original run SHA-256 is `1349082cfaa9d24b2f2e76adef76bbc2d75c10e511e4a0bce7eae7d64c571dde`; the projection has its own distinct hash. `projection-verification.json` records the comparison against the original available in the analysis environment. A recipient can recompute all six review fingerprints from the projection without accessing that environment; the original whole-file digest cannot be recomputed from this partial projection.

Import this PR's two reviewed negatives from a clean checkout with these evidence files:

```
node scripts/discovery-hub.mjs classify --run diagnostics/divergence-evidence/commands/turn-loop-platform-adapter/discovery-run.projection.json --decisions diagnostics/divergence-evidence/commands/turn-loop-platform-adapter/review-decisions.json --out /tmp/commands-reviewed.json
```

`clean-import-check.json` records successful CLI import from a pristine Main snapshot: exactly two `explained_negative` decisions with `reviewFreshness=current`. Reuse this projection by pinned commit for the other scoped cases; do not duplicate the large original run or infer decisions for its omitted leads.
