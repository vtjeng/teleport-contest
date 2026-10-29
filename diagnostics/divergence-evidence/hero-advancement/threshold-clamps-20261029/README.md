# Exact XP thresholds and depleted-resource clamps

JS base: `f3e2e6d638383a5f77f153057d0af6684ca64cfb`.
C gitlink: `16ff59115315917b93185d026aeefea06db9b0f4`.

Final bounded result: **60 target rows and four positive controls match** a freshly
compiled C oracle against the production JS functions. Zero divergent semantic
causes; one scoped explained-negative package, no scanner keys. No gameplay edits.
This extends PR #106's public debug-command roundtrips; it does not promote those
four recordings to coverage of exact XP or depleted resources.

## What actually ran

`run.mjs` extracts the complete, unchanged bodies of nine C functions directly
from the pinned source: newuexp, enermod, newpw, losexp, newexplevel, pluslvl,
newhp, minuhpmax and setuhpmax. It saves their hashes and the generated translation
unit, compiles with the already-installed GCC 14.2.0, executes it once per row,
and invokes the production JS newexplevel/losexp APIs on corresponding state.
No prerequisite was installed. Generated C has no copied JS implementation.

The adapter sets a human Wizard with CON=WIS=10, no polymorph, and explicit
resource/XP fields. Human/Wizard advancement vectors are independently pinned to
C role.c and checked against JS roles. Integer resources and signed 16-bit
increment slots follow you.h/global.h. All tested arithmetic stays within range.
Gains use deterministic minimum or maximum draws, with exact call bounds, order
and returned values compared. There are no competing side effects in a C argument
list in the extracted functions on these paths, so GCC does not supply a substitute
for the recorder's Clang evaluation-order contract. This is a separate restricted
compiled oracle, not a rebuilt recorder.

The projection compares level/current maximum/peak, XP, current/max/peak HP and
energy, the relevant increment slots, dirty-status flag, RNG transcript, and
message text with the level/HP/energy visible at each message call. It does not
compare screens or the whole game state.

| Matrix family | Rows | Scope |
| --- | ---: | --- |
| Current-level XP threshold −1 / exact / +1 | 42 | levels 1, 9, 10, 19, 20, 29, 30; min and max draws |
| Next-level threshold −1 / exact / +1 | 6 | level 1, tests one-level-only gain and overshoot truncation |
| Nonfatal level 2 → 1 resource clamps | 12 | depleted currents, lower floors, reduced maxima, zero XP, and full-current ordering controls |
| Positive controls | 4 | below threshold, equality gain, overshoot, repaired 2 → 1 XP retention |

All final commands exited 0. Compiler diagnostics are empty. `control/results.json`
and `target/results.json` retain every input and both outputs, not just pass counts.
Both RNG extremes exercise the same threshold decisions with different resource
gains. MAXULEV rows verify no gain through newexplevel, not direct pluslvl caps.

A notable matching boundary: with prior HP maximum 13, current HP 13 and stored
loss increment 4, C reduces max to 9, raises it to floor 10 via setuhpmax (which
also clamps current HP to 10), then subtracts 4, leaving HP 6. With max/current
14, the computed max is already 10, so current becomes 10 after subtraction.
The three explicit ordering rows pin this discontinuity at maxima 13, 14 and 15.
JS matches it. This is an explained source behavior, not a newly found bug.

## Adapter qualification and exposure limits

The shim executes the actual nine function bodies, including both resource-clamp
helpers. ACURR is fixed at 10. Adjabil is an asserted boundary stub: every tested
transition is one level and crosses neither Wizard intrinsic threshold (15, 17);
human supplies no race entry. The JS state retains already-earned Wizard
intrinsics above those levels. Skill slots are unspent; skill progression is not
part of the C projection. Notifications, rank/achievement bookkeeping and external
logging are stubbed because they do not write the projected resource/XP fields.
The JS side retains its real dependencies. This does not validate their behavior.
Resistance, death and polymorph dependencies abort if called; ordinary losses use
the explicit nonfatal `#levelchange` marker.

Gain fixtures initialize max resources and prior increment slots consistently
with minimum human-Wizard gains (initial HP 12, energy 6; later +2/+4), then select
the current depleted resources and boundary XP. That is deterministic state
construction, not an executed natural-play history. Several reduced-maximum loss
fixtures deliberately represent a previously reduced maximum; no legal public
sequence establishing those histories was qualified here. They are conditional
API arithmetic results only. No object, monster-combat, death/resurrection, ring,
status-expiry, or denied-case route was used to manufacture a setup.

Public setup gap: wizcmds.c wiz_level_change invokes pluslvl(FALSE), not the
incremental threshold route, and assigns ulevelmax itself. It cannot set arbitrary
XP. nhlua.c nhl_meta_u_newindex explicitly rejects writes with “Cannot set u table
values”; uexp is not in the read-only field list either. The existing recorder has
no documented internal-state injector. Thus this pass does **not** claim executed
public-input C parity for exact-XP or depleted-clamp states. The preinstalled
recorder's missing build attestation from PR #106 remains unchanged. This new
oracle's generated source, compile result, command and binary hash are retained;
that strengthens only this compiled projection's provenance.

## Reconciliation and disposition

- Confirmed divergences: **0**; candidate semantic causes: **0**.
- Explained negative: the explicit 64 final comparisons under the adapter's
  preconditions; not a general certification of advancement.
- Duplicate/already-fixed: the 2 → 1 XP=19 control confirms repair
  `8585e97451c7d33d02da51a42627ced6dbae0195`. It is not a new finding.
- Existing scripts/level-change.test.mjs already covers source-pinned incremental
  gains and resource ordering. Here those behaviors gain an executed C arithmetic
  comparison; existing tests alone were not treated as an oracle.
- The parked XP dependency-closure trial in .agents/decisions.md reached the
  shared transition/timer engine. This direct API comparison does not reopen or
  resolve it. No failed-turn artifacts were consumed.
- Unresolved candidate causes: **0**. Qualification gaps: public-input reachability
  for these exact states, actual intrinsic/skill/achievement and timer integration,
  other roles/races/attributes, direct pluslvl at MAXULEV, and complete state parity.
  No source-only suspicion queue is proposed for those gaps.

## Reproduction and validation

From the repository root, with existing Node and GCC:

```
node diagnostics/divergence-evidence/hero-advancement/threshold-clamps-20261029/run.mjs control
node diagnostics/divergence-evidence/hero-advancement/threshold-clamps-20261029/run.mjs target
```

Each expects exit 0 and writes a fresh directory under /tmp. A mismatch exits 1;
setup/compiler/assertion failure throws and is not a negative. Exact commands,
inputs, generated sources, compiled executable hashes and results are retained.
Do not conflate the four numeric controls with four independently discovered bugs.
Three preliminary matching qualification passes used earlier adapter/fixture
revisions; the receipts cover only the final normalized 64-row pass.

108 existing tests passed across hero-attributes, attrib-innate and level-change.
Version-1 package validation and committed-tree test-layout checks are required
before publication. No full Checkpoint, CI dispatch, score, merge or gameplay
acceptance is claimed. Main remains the sole gameplay writer/integrator.
`environment.json` records elapsed time from generated source to saved results
for each final command; it excludes setup, reconciliation, packaging and publication.
It is wall time, not active compute or total end-to-end effort.
