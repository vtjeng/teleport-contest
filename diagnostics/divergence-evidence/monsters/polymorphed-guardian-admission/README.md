# Polymorphed guardian admission — unresolved C transition witness

**Not ready for implementation.** A concrete JS refusal is reproduced, but the matching C guardian-polymorph transition has not been recorded or fully executed in an oracle. No gameplay change or automatic negative decision is proposed.

The hypothesis: a genuine tame Astral guardian retains its minion metadata after polymorph, but JS's action admission allows only species `PM_ANGEL`. C `m_move` dispatches every tame monster to `dog_move`, whose no-edog entrance accepts `isminion` without checking species.

## Supported setup and observed result

`probe.mjs` first runs the existing shipped public-input recipe `recipes/monmove.c/guardian-angel-movement-cat.session.json`. It creates a genuine Astral guardian via `gain_guardian_angel` with `mtame=10`, `isminion=true`, `emin` present and no `edog`. The recipe has an existing C recording and regression test in this base; this investigation does not claim a new C replay receipt.

Target then calls the real exported `newcham(guardian, mons[PM_OGRE])`, with no replaced polymorph guards or metadata assignments. It returns true and preserves those four fields. The next `runSimpleMonsterAction` throws `simple monster action requires tame minion movement` in its admission check. The unchanged-Angel control returns 0 without an error. Neither fixture fabricates a tame minion by flipping its flags.

The explicit `newcham` target is a supported API parameter, **not evidence of a publicly reached polymorph attack**. In particular this test does not exercise a wand's hit/resistance path. C `newcham` directly calls `set_mon_data` and contains no direct assignments clearing tame/minion flags, but effects of every nested C helper are not executed here. That is the precise remaining uncertainty.

## Reproduction

Pinned Main `52d1911e5e9e8ad6a185e2561caaf5fd92edc703`, C `16ff59115315917b93185d026aeefea06db9b0f4`; Node required:

```sh
EXPECT_CURRENT_GAP=1 node --test diagnostics/divergence-evidence/monsters/polymorphed-guardian-admission/probe.mjs diagnostics/divergence-evidence/monsters/polymorphed-guardian-admission/source-check.mjs
node --test scripts/test-suites.test.mjs
```

Without `EXPECT_CURRENT_GAP`, the target intentionally fails on the observed refusal. This is a proposed future assertion, not a confirmed C expectation. Ordinary `.mjs` filenames keep both runners outside default discovery. The source check asserts only the cited dispatch and direct-assignment observations, explicitly not full C equivalence.

## Next experiment

Obtain a supported C guardian-polymorph target/control from the same Astral setup, preserving the actual polymorph resistance/selection path; alternatively execute full pinned C `newcham` with the actual guardian metadata and ordinary equipment, then the normal movement admission. Verify the resulting tame/minion/emin/edog state and continuation. If C changes or rejects that state, explain that result instead of promoting this claim. Do not bypass resistance or manually create an inconsistent minion to force a witness.

This case concerns same-level monster shape and pet-AI admission. It does not involve shopkeeper departure, migration, species-marked migrating objects, figurines, buried state, globs or ring eating. It consumes no denied-turn artifact. Manual/unbound: the suspected defect is the JS-only admission guard, not a canonical C missing-call lead. The three earlier unresolved hypotheses remain separate; this adds one concrete unresolved case.
