# Two bounded hallucinated-deity diagnostics

These are narrow explained negatives, not a general prayer equivalence claim:

- `prayer-deity-rng-range`: C draws an unsigned remainder modulo 9 and handles every case 0–8. The missing `rn2 broken` diagnostic is unreachable under that valid RNG contract.
- `prayer-deity-name-present`: the constant C role table has 13 roles. Priest has no pantheon and is rejected by the loop; each of the 12 selectable roles has all three deity names. The novelty table contains 14 non-empty names, and Moloch is a fixed non-empty string. Every valid selection therefore supplies a name.

The proof does not assume arbitrary RNGs terminate the rejection loop, does not cover corrupted or substituted data, and does not equate display streams from matching seeds. The executed C data probe is retained as `role-names.c` and `role-names.tsv`; it reads configured role data without entering gameplay. Existing deity tests provide corroboration: six display seeds, three ordinary/resistance controls, and three public C recordings pass.

From repository root with the existing recorder source and generated headers:

```
source /workspace/.setup/activate.sh
clang -ffunction-sections -fdata-sections -I nethack-c/recorder/include nethack-c/recorder/src/role.c diagnostics/divergence-evidence/commands/prayer-name-bounds/role-names.c -Wl,--gc-sections -o /tmp/commands-role-names
/tmp/commands-role-names
node --test diagnostics/divergence-evidence/commands/prayer-name-bounds/evidence.test.mjs scripts/hallucinated-deity.test.mjs
```

All checks pass. The configured C table, JS table and pinned source bounds are checked explicitly. Existing public recordings remain repository dependencies with their hashes pinned in `case.json`; they are not duplicated.

The scanner projection is produced by the pinned PR #43 exporter, with matching hub dependencies in an isolated checkout. `projection.json`, `manifest.json`, `review-template.json`, final `review-decisions.json` and validation output accompany the proof. Both exact decisions must leave the active view, while the included unreviewed `moveloop_core -> invault` lead remains active. That retention control is not assigned a new case or disposition. A changed source hash must prevent filtering.

Exporter commit: `a879e944617577d3eb59c14afc87ddbdb2724b18`. The isolated checkout used was `/tmp/commands-discovery-exporter-a879e944`; the analysis checkout remained at its pinned gameplay base throughout. `export-validation.json` records the exact full-original validation command. For recipient validation without the private original run, invoke that checkout's `scripts/discovery-project.mjs validate` with absolute paths to this package's `projection.json` and `review-decisions.json`. Omit `--run` in that mode: it still verifies provenance completeness and active-view effects, but does not claim a fresh whole-original comparison. The manifest records the original comparison already performed and the original/projection/decision/tool hashes.

This exporter projection retains its complete original run metadata verbatim, including logical source paths and method availability summaries. Only the three selected lead objects are included. No gameplay files, recorder source, or default-CI files are changed.
