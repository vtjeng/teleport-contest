# Validation and scoring

Read this file when implementing gameplay or running recordings, differentials,
scans, scoring, browser checks, or an authorized holdout evaluation. The access
rules in `AGENTS.md` for `sessions/holdout/` always apply; this file calls it
the sealed holdout. Terms: coherent implementation chunk, behavior slice, and
review window are defined in `.agents/workflow.md`.

## Routine validation

- Diagnose mismatches from the upstream C source, focused development
  recordings, and the full set of development recordings, never from the
  sealed holdout.
- For each coherent implementation chunk, inspect the diff and run focused
  tests plus the full test suite before committing.
  `npm run checkpoint -- --focus <test-file>` runs focused tests, the full
  test suite, the eight generated-data checks, the static-source checks, the
  duplicate-symbol report, and the development score in one command. Repeat
  `--focus` to add more test files. `--skip-score` omits the development
  score; use it for intermediate chunks within a slice, where the test suite
  catches regressions and the score adds ~20 seconds without changing the
  commit decision. Run the score on the final chunk before closing the slice.
- `npm run test:all` runs all registered test suites, including those excluded
  from the default `npm test`.
- Redirect every checkpoint run to a log and read only its tail:

  ```
  npm run checkpoint > /tmp/checkpoint.log 2>&1 && tail -40 /tmp/checkpoint.log
  ```

  A green checkpoint prints about 468,000 bytes over 14,491 lines (measured on
  1 August 2026, development-score step skipped), and the total grows with the
  test suite. Reading without redirecting loses most output to truncation and
  spends thousands of tokens on passing test names. The tail is about 1,200
  bytes and ends with the per-check `PASS`/`FAIL` summary.

  When the checkpoint fails, `&&` suppresses the tail and the command exits
  nonzero; run `tail -40 /tmp/checkpoint.log` separately. The summary still
  appears because every check runs regardless of earlier failures.
  `grep -n 'not ok' /tmp/checkpoint.log` prints each failing test's line
  number. Without a TTY the runner uses the `tap` reporter, which prints each
  failure's `error`, `stack`, and `location` directly under its `not ok` line.

  Keep the default test reporter. `node --test --test-reporter=dot` prints no
  summary on a green run, discards test-process stdout and stderr, and reduces
  an import-time throw to `test failed` with no message or stack.
  `npm test -- --test-reporter=dot` ignores the flag.
- For nontrivial behavior, differentially test against the C reference program
  using newly chosen seeds, datetimes, options, character configurations, and
  input sequences.
- Verify the PRNG log, complete 24x80 screens and their attributes, cursor
  positions, and persisted state through the next point where the player or
  scoring system can observe the result.

Launch a browser only for changes to browser-specific code, DOM/CSS,
input/storage, or browser-only presentation. When focused tests cover the
renderer's input contract, shared engine or glyph-output changes do not need
browser validation.

## Fresh differentials

- Record fresh cases in `America/New_York`.
  `nethack-c/patches/001-deterministic-runtime.patch` carries the recording-time
  `tm_isdst` bit into fixed-datetime parsing. Preserve the resulting `mktime()`
  normalization and emitted `recorderIsDst` metadata.
- Run a single fresh case with `node scripts/diff-fresh.mjs --seed ...`.
- A recipe is the case file that `scripts/diff-fresh.mjs` replays, containing
  replay inputs only. A recipe must not contain recorded `steps`, reference the
  sealed holdout, or bypass the checks that reject paths under
  `sessions/holdout/`.
- Build each fresh case from the shortest valid input sequence that reaches the
  behavior. Use options, character selection, Wizard commands, inventory actions,
  or movement to create the setup directly. Search for a natural seed only when
  the test measures generation or random selection, or must prove that the setup
  occurs in ordinary play. Before searching, record which part of the behavior
  direct setup would skip and the set of seeds and inputs to scan; stop when
  that scan completes.
- With explicit user authorization, C source analysis and a constructed
  integration test may replace a fresh C case when valid C inputs cannot create
  the required setup within the declared search domain. Record in the
  implementation checklist: the exact setup, the C functions that determine its
  behavior, the integration test, why the C case could not reach it, and what
  the substitute does not prove.
- Before closing a nontrivial behavior slice or goal, run a reproducible
  matrix that varies inputs relevant to the change. Cover ordinary cases and
  rare branches identified from source; exhaustive combinations are
  unnecessary.
- Commit any matrix intended for repeated use, either as a recipe or as a
  script that calls `scripts/diff-fresh.mjs`.

When exploring many cases, run
`node scripts/scan-fresh.mjs <scan-plan.json>`. It groups cases by the first
JavaScript error, PRNG mismatch, screen mismatch, or cursor mismatch and
retains one case per group. Add newly exposed paths to the implementation
checklist and inspect sibling branches in the same upstream subsystem. Run
individual cases only to derive a minimal case for a selected group or to
diagnose that group.

When a fresh differential fails:

1. Keep the original failing recipe.
2. Remove irrelevant options and inputs until the case is minimally useful.
3. Locate the responsible behavior in upstream source.
4. Add a regression test for the general behavior.
5. Implement from source. Do not implement from the observed trace.

## Facts about the measuring tools

Five properties of the measuring tools commonly cause wrong conclusions.

- **`rngMatched` compares positionally over the whole log.**
  `frozen/ps_test_runner.mjs` walks both logs to their full length. A segment
  that stops early scores the next segment's startup calls against C's
  still-running ones from the earlier segment, so a matched-call count can fall
  while correctness rises. When a count moves the wrong way, find where the
  PRNG logs first diverge before concluding that correctness has changed.
- **`scripts/record-session.mjs` clears the install directory only before a
  recording chunk's first segment.** Line 445 guards `clearStaleState()` on
  `isFirstSegment`, so a save/restore session can end segment 0 with
  save-and-quit and restore that save in segment 1. A `playmode:debug` game
  the recorder terminates also leaves a save behind, so a second debug segment
  in the same chunk restores the first game, and the recording fails a few keys
  in. Pass `chunkLimit: 1` for any recipe with a debug segment; other segments
  batch normally.
- **`game.rng` does not exist.** Count draws through the replay object's
  `getRngLog()`. An assertion written against `game.rng?.log?.length ?? 0`
  compares 0 with 0 and passes whatever the code does.
- **`js/terminal.js` outside the scoring workspace serializes to the empty
  string.** Read `gt.toplines` (the top-line message buffer, ported as
  `display.toplines`), or run inside the workspace that
  `scripts/score-development.mjs` builds.
## Scoring

A scoring run writes no `SCORE.tsv` row, so `npm run checkpoint` leaves the tree
as it found it. `.agents/scoring.md` covers how the orchestrator records
`SCORE.tsv` event rows and what an authorized holdout evaluation triggers. Never
run the sealed holdout merely to produce an estimate.
