# Validation and scoring

Read this file when implementing gameplay or running recordings,
differentials, scans, scoring, browser checks, or an authorized holdout
evaluation. The rules in `AGENTS.md` for `sessions/holdout/`, the sealed
holdout, always apply. `.agents/workflow.md` defines a coherent implementation
chunk, a behavior slice, and a review window; this file uses those terms as
defined there.

## Routine validation

- Diagnose from upstream source, focused development recordings, and the full
  set of development recordings. Never diagnose from the sealed holdout.
- For each coherent implementation chunk, inspect the diff and run focused
  tests plus the full test suite before committing. Use
  `npm run checkpoint -- --focus <test-file>` to run focused tests, the full
  test suite, the six generated-data checks, `check:namespace-members`, and the
  development score in one command. Repeat `--focus` to add more test files.
  `--skip-score` omits the development score for a quick run; the score still
  has to pass before the commit. `scripts/checkpoint-checks.mjs` rejects every
  other option and prints no help text.
- Redirect every checkpoint run to a log and read only its tail:

  ```
  npm run checkpoint > /tmp/checkpoint.log 2>&1 && tail -40 /tmp/checkpoint.log
  ```

  A green checkpoint printed about 468,000 bytes over 14,491 lines, measured
  on 1 August 2026 with the development-score step skipped, and the total
  grows with the test suite. An agent reading that directly loses most of it
  to truncation and spends thousands of tokens on passing test names. The
  tail is about 1,200 bytes and ends with the per-check `PASS`/`FAIL`
  summary, and the full output stays on disk.

  When the checkpoint fails, `&&` suppresses the tail and the command exits
  nonzero. Run the tail as a separate command. `tail -40 /tmp/checkpoint.log`
  still ends with the summary, because every check runs whether or not an
  earlier one failed.
  `grep -n 'not ok' /tmp/checkpoint.log` prints the line number of each failing
  test. A redirected run has no TTY, so the runner uses the `tap` reporter,
  which prints each failure's `error`, `stack`, and `location` fields directly
  under its `not ok` line.

  Keep the default test reporter. `node --test --test-reporter=dot` prints no
  pass or fail summary on a green run, discards test-process stdout and stderr,
  and reduces an import-time throw in a `js/` module to `test failed` with no
  message or stack. `npm test -- --test-reporter=dot` ignores the flag.
- For nontrivial behavior, differentially test against the C reference program
  using newly chosen seeds, datetimes, options, character configurations, and
  input sequences.
- Verify the PRNG log, complete 24x80 screens and their attributes, cursor
  positions, and persisted state through the next observable boundary.

`scripts/mutate-sites.mjs` rewrites one operator, boolean, or integer bound at
a time in a set of js/ lines, runs the tests that reach those modules, and
reports the mutants that no test failed on. `--worktree` scopes uncommitted work
and `--range <base>..<head>` scopes a commit range. Your brief states which
run you owe: `.claude/agents/slice-worker.md` holds the per-slice run over
uncommitted work, and `.agents/review.md`, under "Mutation-test the reviewed
lines", holds the per-window run over a frozen range and states what a
survivor proves.

This measures the tests. A survivor says the suite would not notice a wrong
line; a fresh differential says whether the line is right.

Launch a browser only for changes to browser-specific code, DOM/CSS,
input/storage, or browser-only presentation. Shared engine or glyph-output
changes do not need browser validation when the renderer is unchanged and
focused tests cover the renderer's input contract.

## Fresh differentials

- Record fresh cases in the canonical `America/New_York` timezone. Recorder
  patch 001 carries the recording-time daylight-saving-time (`tm_isdst`) bit
  into fixed-datetime parsing. Preserve the resulting `mktime()` normalization
  and emitted `recorderIsDst` metadata.
- Run a single fresh case with `node scripts/diff-fresh.mjs --seed ...`.
- A recipe is the case file that `scripts/diff-fresh.mjs` replays. Recipes
  contain replay inputs only. They must never contain recorded `steps`,
  weaken the sealed-path checks that reject paths under `sessions/holdout/`,
  or reference the sealed holdout.
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

These four are settled and keep being re-derived. Each has cost a wrong
conclusion at least once.

- **`rngMatched` compares positionally over the whole log.**
  `frozen/ps_test_runner.mjs` walks both logs to their full length. A segment
  that stops early therefore scores its *next* segment's startup calls against
  C's still-running ones, so a matched-call count can fall while correctness
  rises. When a count moves the wrong way, measure the first-divergence index
  before concluding anything.
- **`game.rng` does not exist.** Count draws through the replay object's
  `getRngLog()`. An assertion written against `game.rng?.log?.length ?? 0`
  compares 0 with 0 and passes whatever the code does.
- **`js/terminal.js` outside the scoring workspace serializes to the empty
  string.** A scan that greps rendered screens measures nothing there. Read
  `gt.toplines`, or run inside the workspace the scorer builds.
- **A mutation run's first wave can be empty.** `scripts/mutate-sites.mjs`
  judges a mutant by the test files that reach its module without passing
  through another `js/` module. A module reached only through other `js/`
  modules reports `0 covering test file(s)`, and every mutant in it survives
  its first wave vacuously. Check the per-file line the run prints; where it
  reports zero,
  `--whole-suite` is not optional.

## Score estimates

Calculate and report a score estimate for each completed implementation
chunk, formatted:

`<shown> shown + <hidden> hidden = <total> total`

Report current published aggregate results when available. Otherwise
estimate from development and fresh-differential evidence and state the
uncertainty. Never run the sealed holdout merely to produce an estimate.

`npm run checkpoint` appends a `checkpoint` row to `SCORE.tsv` after each
scoring run, so a scoring run dirties that one tracked file.
`.agents/scoring.md` states how the orchestrator records every other
`SCORE.tsv` event row and what an authorized holdout evaluation without
carry-over triggers.
