# Validation and scoring

Read this file when implementing gameplay or running recordings, differentials,
scans, scoring, browser checks, or an authorized holdout evaluation. The access
rules in `AGENTS.md` for `sessions/holdout/`, the holdout whose contents are
off-limits during development, always apply; this file calls it the sealed
holdout. This file uses the terms coherent implementation chunk,
behavior slice, and review window as defined in `.agents/workflow.md`.

## Routine validation

- Diagnose mismatches from the upstream C source, focused development
  recordings, and the full set of development recordings, never from the
  sealed holdout.
- For each coherent implementation chunk, inspect the diff and run focused
  tests plus the full test suite before committing. Use
  `npm run checkpoint -- --focus <test-file>` to run focused tests, the full
  test suite, the eight generated-data checks, the static-source checks, the
  duplicate-symbol report, and the development score in one command. Repeat
  `--focus` to add more test files.
  `--skip-score` omits the development score for a quick run; the score must
  still pass before you commit. `scripts/checkpoint-checks.mjs` rejects every
  other option and prints no help text.
- `npm test` excludes the mutation-runner integration suite. Run
  `npm run test:mutation-runner` when changing that runner or suite, and
  `npm run test:all` when changing test registration.
- Redirect every checkpoint run to a log and read only its tail:

  ```
  npm run checkpoint > /tmp/checkpoint.log 2>&1 && tail -40 /tmp/checkpoint.log
  ```

  A green checkpoint printed about 468,000 bytes over 14,491 lines (measured on
  1 August 2026 with the development-score step skipped), and the total grows
  with the test suite; the full output stays on disk. Reading the output without
  redirecting loses most of it to truncation and spends thousands of tokens on
  passing test names. The tail is about 1,200 bytes and ends with the per-check
  `PASS`/`FAIL` summary.

  When the checkpoint fails, `&&` suppresses the tail and the command exits
  nonzero; run `tail -40 /tmp/checkpoint.log` as a separate command. The
  summary still appears, because every check runs regardless of earlier
  failures. `grep -n 'not ok' /tmp/checkpoint.log` prints the line number of
  each failing test. A redirected run has no TTY, so the runner uses the `tap`
  reporter, which prints each failure's `error`, `stack`, and `location` fields
  directly under its `not ok` line.

  Keep the default test reporter. `node --test --test-reporter=dot` prints no
  pass or fail summary on a green run, discards test-process stdout and stderr,
  and reduces an import-time throw in a `js/` module to `test failed` with no
  message or stack. `npm test -- --test-reporter=dot` ignores the flag.
- For nontrivial behavior, differentially test against the C reference program
  using newly chosen seeds, datetimes, options, character configurations, and
  input sequences.
- Verify the PRNG log, complete 24x80 screens and their attributes, cursor
  positions, and persisted state through the next point where the player or
  scoring system can observe the result.

`scripts/mutate-sites.mjs` rewrites one operator, boolean, or integer bound at a
time in a set of js/ lines, runs the tests that reach those modules, and reports
the mutants that no test detects. `--worktree` scopes uncommitted work and
`--range <base>..<head>` scopes a commit range. Your task's instruction file
states which mutation run to perform: `.claude/agents/slice-worker.md` for the
per-slice run over uncommitted work, and `.agents/review.md`, under
"Mutation-test the reviewed lines", for the per-window run over a frozen range
and what a survivor proves.

Mutation testing measures the tests: a mutant that survives (passes every test
despite a rewritten operator or bound) shows the suite would not detect a wrong
value on that line. A fresh differential against the C reference confirms
whether the line is correct.

Launch a browser only for changes to browser-specific code, DOM/CSS,
input/storage, or browser-only presentation. When the renderer is unchanged and
focused tests cover its input contract, shared engine or glyph-output changes
do not need browser validation.

## Fresh differentials

- Record fresh cases in the canonical `America/New_York` timezone. Patch
  `nethack-c/patches/001-deterministic-runtime.patch` carries the recording-time
  daylight-saving-time (`tm_isdst`) bit into fixed-datetime parsing. Preserve
  the resulting `mktime()` normalization and emitted `recorderIsDst` metadata.
- Run a single fresh case with `node scripts/diff-fresh.mjs --seed ...`.
- A recipe is the case file that `scripts/diff-fresh.mjs` replays, containing
  replay inputs only. A recipe must not contain recorded `steps`, reference the
  sealed holdout, or bypass the sealed-path checks that reject paths under
  `sessions/holdout/`.
- Build each fresh case from the shortest valid input sequence that reaches
  the behavior. Use options, character selection, Wizard commands, inventory
  actions, or movement to create the setup directly. Search for a natural seed
  only when the test measures generation or random selection, or must prove
  that the setup occurs in ordinary play. Before searching, record which part
  of the behavior direct setup would skip and the finite set of seeds and
  inputs to scan; stop when that scan completes.
- With explicit user authorization, C source analysis plus a constructed
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
retains one original case per group. Add newly exposed paths to the
implementation checklist and inspect sibling branches owned by the same
upstream subsystem. Run individual cases only to derive a minimally useful
case for a selected group or diagnose that group.

When a fresh differential fails:

1. Keep the original failing recipe.
2. Remove irrelevant options and inputs until the case is minimally useful.
3. Locate the responsible behavior in upstream source.
4. Add a regression test for the general behavior.
5. Implement from source. Do not implement from the observed trace.

## Facts about the measuring tools

Five properties of the measuring tools commonly lead to wrong conclusions
during validation.

- **`rngMatched` compares positionally over the whole log.**
  `frozen/ps_test_runner.mjs` walks both logs to their full length. A segment
  that stops early therefore scores the following segment's startup calls
  against C's still-running ones from the earlier segment, so a matched-call
  count can fall while correctness rises. When a count moves the wrong way,
  measure the index in the PRNG log where the JavaScript and C sequences first
  diverge before concluding that correctness has changed.
- **`scripts/record-session.mjs` clears the install directory only before a
  recording chunk's first segment.** Line 445 guards `clearStaleState()` on
  `isFirstSegment`, so a save/restore session can end segment 0 with
  save-and-quit and restore that save in segment 1. A `playmode:debug` game
  that the recorder terminates also leaves a save behind, so a second debug
  segment in the same chunk restores the first game. The recording fails a few
  keys into that segment. Pass `chunkLimit: 1` for any recipe holding a debug
  segment; other segments batch normally. Clearing between segments would break
  save/restore recording.
- **`game.rng` does not exist.** Count draws through the replay object's
  `getRngLog()`. An assertion written against `game.rng?.log?.length ?? 0`
  compares 0 with 0 and passes whatever the code does.
- **`js/terminal.js` outside the scoring workspace serializes to the empty
  string.** A scan that greps rendered screens outside the scoring workspace
  gets only empty strings. Read `gt.toplines` (the top-line message buffer in
  the C tty struct, ported as `display.toplines`), or run inside the workspace
  that `scripts/score-development.mjs` builds.
- **`scripts/mutate-sites.mjs` can report zero covering test files for a
  module.** The script's first pass judges each mutant using only the test files
  that reach its module without passing through another `js/` module. A module
  reached only through other `js/` modules reports `0 covering test file(s)`,
  and every mutant in it survives its first wave vacuously. Check the per-file
  line the run prints; where it reports zero,
  `--whole-suite` is not optional.

## Score estimates

Each completed implementation chunk needs a score estimate with three parts:
the development-session score (shown), the holdout score (hidden), and their
sum (total). Format the estimate as:

`<shown> shown + <hidden> hidden = <total> total`

Report current published aggregate results when available; otherwise estimate
from development and fresh-differential evidence and state the uncertainty.
Never run the sealed holdout merely to produce an estimate.

A scoring run writes no `SCORE.tsv` row, so `npm run checkpoint` leaves the tree
as it found it. `.agents/scoring.md` states how the orchestrator records every
`SCORE.tsv` event row and what an authorized holdout evaluation triggers when it
has no carry-over.
