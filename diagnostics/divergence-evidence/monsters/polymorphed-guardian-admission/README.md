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

## Follow-up: ordinary wand route is blocked by native resistance

After executor recovery, three isolated recorder attempts ran on the same stated base. Enabling `monpolycontrol` at startup trapped inputs in an unrelated vampire form prompt during Astral setup; that attempt is a coverage miss. Enabling it after guardian creation through `mO:monpolycontrol` correctly avoids that problem. An ordinary wished polymorph wand then reaches the guardian, which resists. A second aimed zap also resists; concurrent Astral combat reaches wizard death confirmation in that longer attempt. None produces guardian polymorph, and none is evidence of post-polymorph equivalence.

The source explains why further ordinary zaps cannot solve this: `mondata.c:resists_magm` returns TRUE when the native species has `AD_MAGM`; Angel does. `zap.c:bhitm` checks that immunity before ordinary resistance and before `newcham`. JS preserves the same gate. This invalidates the suggested wand route, **not** the explicit `newcham` API hypothesis. Do not remove resistance, forge a non-native Angel, or repeat the same route to force a witness.

`wand-route-observations.json` retains exact comparison counts, raw relevant screen lines and hashes/paths of the three private recordings. Those local paths are not assumed accessible in other environments. The small second-attempt recipe is included for reproducibility without duplicating full recordings; replay/record explicitly with:

```sh
node diagnostics/divergence-evidence/monsters/polymorphed-guardian-admission/record-wand-route.mjs /absolute/new-private-output
```

This command uses the existing recorder setup. Its expected result on the stated base is a matching record in which the guardian **resists** (6976 RNG, 154 screens/cursors, 21 animation frames), not the desired transition. Further qualification would need a full C execution of the explicit supported `newcham` contract, or another justified native route that preserves all real guards. The case remains unresolved and not Main-ready. No denied-turn artifacts were used.
