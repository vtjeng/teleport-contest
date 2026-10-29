# Ordinary hero advancement: bounded dynamic comparison

JS/source base: `176bb0e38117602afab165ee6d4e363c11943fdb`.
C gitlink: `16ff59115315917b93185d026aeefea06db9b0f4`.

Four independently seeded public debug-input recordings match executed C and JS
in every RNG value, screen cell/attribute, cursor and animation frame. This is
one scoped explained-negative package, zero candidate semantic causes, zero
scanner keys. Four fixtures are not four distinct causes. No gameplay changes.

| Row | Intended route | RNG calls | Screens/cursors | Exit |
| --- | --- | ---: | ---: | ---: |
| control | elf Wizard 1 → 3, below race threshold | 4631 | 31 | 0 |
| race-roundtrip | elf Wizard 1 → 4 → 3 → 4 | 2298 | 93 | 0 |
| cutoff-roundtrip | human Wizard 1 → 12 → 11 → 12 → 13 | 2869 | 161 | 0 |
| role-roundtrip | human Barbarian 1 → 7 → 6 → 7 | 2755 | 102 | 0 |

All have zero animation frames. `verify.mjs` independently recomputes parity from
saved C/JS outputs and asserts the complete level sequence, plus two awake/quick
gain messages and the tired/slow loss message. `verification.txt` records exact
zero-based steps and HP/Pw/XP status lines. This prevents a setup miss from being
reported as a negative. Full-hp/full-energy loss removes the stored increments;
regain may reroll them (elf HP goes 30 → 24 → 28). Level loss leaves XP just below
the next threshold (79, 19999, 639). Gain resets it to the previous threshold.

## Supported oracle and reproduction

`run.mjs` uses the existing `runDifferential` recorder, private temporary recorder
install, and frozen scoring overlay. It does not inject internal C state. Public
`#levelchange` is enabled by `playmode:debug`; it calls `pluslvl(FALSE)` or
`losexp("#levelchange")`. The ordinary non-polymorphed characters never take a
movement/wait turn. Spaces dismiss More and surplus spaces yield matching unknown
command messages, as in `scripts/run-level-change.mjs`. No combat or object effect
is triggered by the recipe. Startup still generates normal inventory and monsters.

From repository root, with the supported recorder already built:

```
node diagnostics/divergence-evidence/hero-advancement/boundaries-20261029/run.mjs control
node diagnostics/divergence-evidence/hero-advancement/boundaries-20261029/run.mjs race-roundtrip
node diagnostics/divergence-evidence/hero-advancement/boundaries-20261029/run.mjs cutoff-roundtrip
node diagnostics/divergence-evidence/hero-advancement/boundaries-20261029/run.mjs role-roundtrip
node diagnostics/divergence-evidence/hero-advancement/boundaries-20261029/verify.mjs
```

All expect exit 0. Fresh runs save evidence to a new temporary path. Archived
receipts preserve actual invocation paths; do not reuse their already-existing
output directories. Two large outputs per row are losslessly gzipped; hashes cover
compressed bytes. Other outputs are unchanged copies of the original run files.
Receipts were transcribed from observed successful tool exits and retained output,
not inferred from the expected result. No C rebuild was performed. The installed
recorder binary digest is recorded in `environment.json`; its adjacent exper.c,
attrib.c and wizcmds.c match the pinned upstream bytes. There is no retained build
attestation for this preinstalled binary, so exact binary/source derivation remains
a provenance limitation. Successful controls and original recorder traces are
supporting evidence, not a replacement for a build attestation.

## Prior work and limits

PR #99 (`prior-pr99.json`) compares static progression declarations; it expressly
excludes dynamic application. This package adds executed transitions, without
reclassifying that earlier result. `scripts/level-change.test.mjs` already covers
level-loss ordering/clamps, Welcome back, MAXULEV, incremental gain, intrinsic
changes, and public command handling. The earlier public matrix already reaches
the Wizard cutoff. The new contribution is fresh observable roundtrip coverage,
not a claim that any of those functions were previously untested.

Commit `8585e9745` repaired level-one XP retention and intrinsic-loss callers.
`.agents/decisions.md` records the earlier source-led XP dependency-closure trial
as parked because it reached the shared transition/timer engine. This audit does
not reopen it. No failed-turn artifacts were consumed. No excluded case was
investigated.

Confirmed divergences: **0**. Scoped negative: the four recorded paths above.
Duplicate/already-fixed findings: **0 new findings**; existing regression coverage
and the prior repair are acknowledged rather than resubmitted. Unresolved candidate
causes: **0**. Coverage gaps: incremental `newexplevel` threshold equality and
overshoot, MAXULEV resource caps, depleted/low-max resource clamps, Welcome back,
all other role/race combinations, raw property/skill masks, status-expiry behavior,
and non-debug reachability. `#levelchange` assigns ulevelmax itself, so these runs
cannot establish natural maximum-level retention. Screen parity establishes
visible messages/resources, not every hidden state field. No hypothesis concerning
these gaps is submitted as a bug or explained negative.

Focused existing tests: 108/108 passed across hero-attributes, attrib-innate and
level-change. Full Checkpoint/CI were not dispatched. Package validation and
committed-tree layout are packaging checks, not gameplay acceptance. Main remains
the gameplay writer/integrator. Elapsed wall time is recorded separately at
publication; no active-compute estimate is made.
