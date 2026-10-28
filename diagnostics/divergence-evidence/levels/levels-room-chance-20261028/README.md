# Room chance: scoped type-choice negative

C `build_room` treats chance as a choice between requested and ordinary room type, then attempts construction either way. The zero value is a special unconditional case with no probability draw. JS follows this behavior on all six fixtures.

The production JS setup creates a parent through `lspo_region` and a valid explicit 3x3 child through `lspo_room`, with no filling or finalization. C executes the exact `build_room` body with scripted RNG and a successful child-construction capture. Geometry and topology are stubbed **after** the decision; this evidence proves only type selection, call count and attempted construction. It does not establish C/JS geometry or orig_rtype equality and does not revisit the parked save-export attempt.

Cases: chance0/draw99 is vault with no draw; chance1/draw0 is vault, chance1/draw1 ordinary; chance50/draw49 is vault, chance50/draw50 ordinary; chance100/draw99 is vault. Every positive chance makes one rn2(100) call. JS actually creates the child in all six cases.

From repository root with Node24 and Clang:

```sh
node diagnostics/divergence-evidence/levels/levels-room-chance-20261028/probe.mjs
```

Expected exit **0** on `1c4be74beb32edbfc897de805f218e180f8c6002`. The strict-boundary pairs are controls against interpreting chance as room suppression. Existing Lua documentation at line971 describes type fallback, but does not describe the zero-value special case. The source is authoritative.

Source/tool/body hashes, timestamps and raw finite results are in `case.json` and `observations.json`; the clean-base receipt is bundled. Manual/scanner-unbound, no suppression identity or universal equivalence claim. No gameplay edits.
