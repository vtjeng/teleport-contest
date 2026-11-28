# Nonzero XP percentage floor at level10

Four public C/JS recordings with the freshly built recorder match. At level10,
wizard advancement sets XP5120; next level requires10000. First Tourist arrival
at D:2 awards2, reaching5122 without changing level. Integer100*2/4880 is0, but
C percentage() floors nonzero progress to1. Parsed <1% red and >=1% green rules
observe that branch with showexp disabled; visible-XP companions pin exact C-side
5120 and5122 rather than inferring hidden totals from a color.

Control/visible-control:77 screens,2859 RNG calls each. Target/visible-target:
88 screens,5977 RNG calls each. Screen cells/attributes, cursors and RNG match.
The verifier asserts C total strings, level10, final red/green cells, actual
parsed JS rules and selected identity, cached0/1 percentages, and unchanged RNG
between hidden/visible counterparts. It also compares complete C recorded steps
from preinstalled and fresh binaries for the two original hidden-total recipes.
The comparator format was corrected during verifier development: C/C steps are
compared directly; the C/JS comparator expects a different JS output structure.
No game mismatch occurred. Zero new semantic causes; one scoped negative.

JS base83d4b6209b326c38fd75d02c64719f0aba04e0c2; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Fresh binary
cb8a2a847d3c4f1c52213757abdbedd2e74c872339691cd5bef5489c64b891ad has exact build
inputs/receipt in recorder-build-activated-20261029, which is a hashed dependency.
Old preinstalled binary provenance remains limited. Fresh build does not upgrade
older recordings retroactively. No natural-play level10 history or full-game C
internal-state instrumentation is claimed. Existing large-threshold repair and
prior50%/100% probes are not rediscovered: those did not execute this1% floor.

Reproduce using the existing activation and freshly built install (fresh outputs):

```
source /workspace/.setup/activate.sh
export NETHACK_INSTALL=/tmp/hero-recorder-build-activated-20261029/nethack-c/recorder/install/games/lib/nethackdir
export NETHACK_BINARY="$NETHACK_INSTALL/nethack"
node diagnostics/divergence-evidence/hero-advancement/xp-percent-floor-20261029/run.mjs control /tmp/hero-floor-control-new
node diagnostics/divergence-evidence/hero-advancement/xp-percent-floor-20261029/run.mjs target /tmp/hero-floor-target-new
node diagnostics/divergence-evidence/hero-advancement/xp-percent-floor-20261029/run.mjs visible-control /tmp/hero-floor-visible-control-new
node diagnostics/divergence-evidence/hero-advancement/xp-percent-floor-20261029/run.mjs visible-target /tmp/hero-floor-visible-target-new
node diagnostics/divergence-evidence/hero-advancement/xp-percent-floor-20261029/verify.mjs
```

All expect exit0. Actual receipts retain environment bindings, exact runner/input
hashes and raw results. Archived preinstalled records are comparison context,
not misrepresented as fresh-build output. Existing77 relevant tests on unchanged
gameplay remain a dependency; no redundant rerun claimed. Build smoke and the
public verifier are the new checks. Timings are elapsed, not active compute.
Main owns gameplay. No combat, object effect, ring, death, polymorph, denied case,
failed-turn artifact, CI dispatch, merge or formal approval.
