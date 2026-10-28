# objects-artifact-light-forced-drop

**Confirmed divergence; implementation-ready objects handoff. One cause, two raw scanner warnings.** Public controlled polymorph while wielding lit Sunsword reaches a JS exception where C extinguishes and drops the weapon. No gameplay fix is included.

## Reproduce

From a clean checkout of **58ad57cea2dcd8b94b8d1f7644e9e21fc02c7cd1**, copy this evidence directory from the PR, preserving its repository-relative path. Node 22+ is the only dependency for these tests/replays; no C rebuild, fixture reconstruction or package install is needed.

```
node --test diagnostics/divergence-evidence/objects/objects-artifact-light-forced-drop/candidate.test.mjs
```

Expected on the stated base: target FAILS with `uwepgone: artifact-light extinguishing not wired (needs end_burn + Tobjnam message)`; control PASSES; process exit 1. This intentional candidate test stays outside default CI. After repair, both should pass: it checks completed polymorph, empty weapon slot, floor placement, lamplit false, no object light source and the stop-shining message.

For a passing verification of the currently observed defect:
```
node --test diagnostics/divergence-evidence/objects/objects-artifact-light-forced-drop/verify-current.test.mjs
```

Full oracle comparison:
```
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-artifact-light-forced-drop/target-capture-c.json
node frozen/ps_test_runner.mjs --worker-session=diagnostics/divergence-evidence/objects/objects-artifact-light-forced-drop/control-capture-c.json
```

Target reports `passed:false` and the exact exception; the frozen worker catches it and reports zero matched metrics, which is **not** a measured zero-length matching prefix. Its capture contains 70 screens/cursors and 2278 RNG calls. Control reports complete parity: 69 screens/cursors, 2277 RNG calls.

## Reachability and cause

Both recipes use seed 19870703, fixed datetime and a lawful human Valkyrie in public debug mode. Target wishes `blessed rustproof +1 Sunsword`, wields inventory e, advances the shine-message More prompt, then invokes `#polyself` and chooses `giant bat`. Control wishes an ordinary long sword and performs the same transformation, with only the necessary prompt continuations differing. No state injection or unsupported setup is used.

C target zero-based steps: 44 begins shining; 64 becomes a giant bat; 66 says the sword must be dropped; 67 says Sunsword stops shining; 69 inventory no longer contains it. The focused verification confirms JS actually has a lit ART_SUNSWORD in uwep at the exception, so this is not inferred from the missing-call text alone.

C `polyself.c:1345-1350` saves the primary weapon, calls uwepgone, then dropx. C `wield.c:873-885` checks artifact_light/lamplit, calls end_burn, prints the sighted stop-shining message, clears W_WEP and updates inventory. JS `polyself.js:964-969` reaches uwepgone, but `wield.js:1243-1247` throws instead of performing artifact-light cleanup. Stack: wiz_polyself -> polyself -> polymon -> drop_weapon -> uwepgone. The earlier setuwep light repair (907748df7) does not cover this separate explicit boundary. No duplicate active evidence claim was found.

## Provenance and limitations

The patched C recorder uses upstream **16ff59115315917b93185d026aeefea06db9b0f4**. `record.json` pins source, recorder binary, patch series, capture and tool hashes. Recorder copies of wield.c and polyself.c compare byte-for-byte with pinned upstream. Original captures can optionally be regenerated using the standard recorder in a private install:
```
NETHACK_INSTALL=/tmp/objects-recorder NETHACK_BINARY=/tmp/objects-recorder/nethack node scripts/record-session.mjs diagnostics/divergence-evidence/objects/objects-artifact-light-forced-drop/target-recipe.json /tmp/artifact-target-new.json
```

The candidate, defect verification and both full replay commands were run in a new detached checkout of the stated base with only this evidence directory added. The execution server briefly disconnected during setup; after recovery the C submodule checkout also completed, and all recorded clean-checkout outcomes were verified. See `observations.json`.

The pre-experiment hypothesis is retained. An initial target missed the wield More continuation, so its polymorph command was swallowed and it never exercised this branch. That setup was rejected, not counted; raw initial recipe/capture remain in private triage as artifact-initial-target-*.

Binding files retain the immutable discovery run, exact keys/evidence keys/run ID and hub-generated review fingerprints for the two uwepgone message edges. Both map to this one demonstrated early exception, not two bugs. Relevant source/hub files are unchanged from that retained run. No claims about other artifact weapons, blindness or other forced-removal callers are made; the supplied public witness is sufficient to start the scoped repair.
