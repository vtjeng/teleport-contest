# Female and later-rank achievement encoding

Male control and female target, both ordinary human Wizards, follow
1→14→13→14→18→17→18 and then #chronicle. Each recording matches all C/JS
screens, attributes, cursors and RNG (408 screens, 2198 RNG calls each).
Zero new semantic causes; one scoped negative, no unresolved comparison.

The public chronicle observer asserts ordered first attainments, then loss/regain
without duplicate achievement entries. Gender-specific rank titles are Enchanter/
Enchantress at 14 and Sorcerer/Sorceress at 18. This exercises the negative female
achievement identifier's output behavior, including repeated-rank detection by
absolute identifier, without claiming direct C internal-state observation.

Wizard levelchange resets ulevelmax, so this is not natural Welcome back evidence.
It retains ulevelpeak/achievement history, which the displayed regained events
observe. No combat, object effect, ring, death, polymorph or status-expiry setup.
No denied case or failed-turn artifact. Starting inventory remains unchanged.

JS base 1d2ad76f770232281a6e5abaeeb539f2da479509; C gitlink
16ff59115315917b93185d026aeefea06db9b0f4. Preinstalled full-recorder provenance
remains limited: no retained build attestation. Prior hash/source record is a
hashed dependency. Source and rule families were selected from BRANCH-COVERAGE,
not arbitrary role/race permutations.

Reproduce with the existing recorder prerequisites and fresh output directories:

```
node diagnostics/divergence-evidence/hero-advancement/rank-gender-20261029/run.mjs control /tmp/hero-rank-gender-control-new
node diagnostics/divergence-evidence/hero-advancement/rank-gender-20261029/run.mjs target /tmp/hero-rank-gender-target-new
node diagnostics/divergence-evidence/hero-advancement/rank-gender-20261029/verify.mjs
```

All expect exit 0. Verifier asserts full parity and the exact chronicle sequence.
77 focused tests pass; actual receipts and raw outputs are archived. Timings are
elapsed, not active compute. No gameplay edits, CI dispatch, merge or approval.
