# Direction-help scanner explanations

Three exact scanner observations represent two causes:

* `help_dir:pline`: both call sites occur inside a literal `#if 0` block. The configured preprocessor output contains neither call. This is disabled historical prefix feedback, not missing live output.
* `help_dir:letter` and `help_dir:highc`: JS inlines the ASCII predicate and uppercase mapping. These share one character-adapter cause. A compiled harness calls the actual C helpers across all 256 input bytes. A focused test extracts and evaluates the corresponding production JS expressions, comparing eligibility for every byte and uppercase values only where the help branch uses them.

Scope is this function's byte-valued character branch and the inactive block. No statement certifies arbitrary Unicode, other helper callers, all direction behavior, or unrelated window handling. The byte test establishes the finite character domain; two matching gameplay seeds alone would not establish general equivalence.

From repository root:

```
node --test diagnostics/divergence-evidence/commands/direction-help-adapters/evidence.test.mjs
```

All five tests pass on `8eec78d622b3ef9cb22a54d1699aaf335e9342e9`. Ordinary invalid-direction and explicitly requested help both match six boundaries/cursors and 2,959 RNG calls. Their recipes and raw compressed recordings/JS results are included. To record either again use `node scripts/diff-fresh.mjs <recipe-path>`.

Rebuild the C character oracle using existing recorder headers:

```
source /workspace/.setup/activate.sh
clang -ffunction-sections -fdata-sections -I nethack-c/recorder/include nethack-c/recorder/src/hacklib.c diagnostics/divergence-evidence/commands/direction-help-adapters/character-oracle.c -Wl,--gc-sections -o /tmp/commands-direction-character-oracle
/tmp/commands-direction-character-oracle
clang -E -P -I nethack-c/recorder/include nethack-c/recorder/src/cmd.c -o /tmp/commands-direction-cmd-preprocessed.c
```

The output between `help_dir(` and `void confdir` is preserved in `help-dir.preprocessed.c.txt`. Relevant JS function bytes are unchanged from the immutable scan base; `binding-source-check.json` records the comparison. `case.json` contains exact source/tool/oracle fingerprints and scope.

The projection/manifest were exported and validated against the complete original immutable run with PR #43's exporter at `a879e944617577d3eb59c14afc87ddbdb2724b18` and its matching hub dependencies. Importing all three final decisions filters three observations; importing one retains the other two; stale method configuration filters none. Recipients may run that exporter's `validate --projection <projection.json> --decisions <review-decisions.json>` without the private full original run. The manifest preserves the full-original comparison already performed.

No gameplay code or default-CI configuration changes. The known canonical MacOS versus local Unix version-banner mismatch was already explained in `scripts/version.test.mjs`; it is not counted again here.
