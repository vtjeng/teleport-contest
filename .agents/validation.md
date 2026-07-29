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
  test suite, the four generated-data checks, `check:namespace-members`, and the
  development score in one command. Repeat `--focus` to add more test files.
  `--skip-score` omits the development score for a quick run; the score still
  has to pass before the commit. `scripts/checkpoint-checks.mjs` rejects every
  other option and prints no help text.
- Redirect every checkpoint run to a log and read only its tail:

  ```
  npm run checkpoint > /tmp/checkpoint.log 2>&1 && tail -40 /tmp/checkpoint.log
  ```

  A green checkpoint prints about 133,000 bytes over 1,724 lines. An agent
  reading that directly loses most of it to truncation and spends thousands of
  tokens on passing test names. The tail is about 1,100 bytes and ends with the
  per-check `PASS`/`FAIL` summary, and the full output stays on disk.

  When the checkpoint fails, `&&` suppresses the tail and the command exits
  nonzero. Run the tail as a separate command. `tail -40 /tmp/checkpoint.log`
  still ends with the summary, because every check runs whether or not an
  earlier one failed.
  `grep -n '✖' /tmp/checkpoint.log` prints the line number of each failing test,
  and the default reporter repeats them with their assertion output at the end
  of the log.

  Keep the default test reporter. `node --test --test-reporter=dot` prints no
  pass or fail summary on a green run, discards test-process stdout and stderr,
  and reduces an import-time throw in a `js/` module to `test failed` with no
  message or stack. `npm test -- --test-reporter=dot` ignores the flag.
- For nontrivial behavior, differentially test against the C reference program
  using newly chosen seeds, datetimes, options, character configurations, and
  input sequences.
- Verify the PRNG log, complete 24x80 screens and their attributes, cursor
  positions, and persisted state through the next observable boundary.

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
- Before closing a nontrivial behavior slice or milestone, run a reproducible
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

## Score evidence

Calculate and report a score estimate for each completed implementation
chunk, formatted:

`<shown> shown + <hidden> hidden = <total> total`

Report current published aggregate results when available. Otherwise
estimate from development and fresh-differential evidence and state the
uncertainty. Never run the sealed holdout merely to produce an estimate.

Collect routine chunk evidence without appending a `SCORE.md` row. Preserve one
permanent evidence snapshot when:

- a behavior slice closes;
- a review window completes its required review, fixes, and validation;
- the estimate changes; or
- a result is published.

Each snapshot records four values: the exact integrated code state at one full
commit SHA, the estimate, evidence, and uncertainty. Formal review ranges
remain in `QUALITY.json` and retained pass reports. Combine coincident
triggers into one row per SHA.

One optional `SCORE.md` row may be a mutable `current candidate` for an open
behavior slice or review window after a selected handoff commit has complete
validation. Replace it only after a later selected handoff is validated; do
not update it merely because the code head advanced. If that same SHA later
meets a permanent snapshot trigger, relabel the row with that trigger.
Otherwise delete the candidate when a later permanent snapshot supersedes it.
Evidence-only commits do not receive snapshots.

Recorded correctness and simplification frontiers and metrics remain in
`QUALITY.json`; complete reports not yet represented there remain with their
related durable review evidence. Required clarity and copyedit reports remain
with their related durable review or publication evidence. A score snapshot
may reference these sources but does not replace them.

Prefer source-faithful subsystem improvements to isolated score gains. If an
authorized aggregate holdout evaluation shows that development results did not
carry over to the holdout, first compare the source, implementation diff, and
development evidence. Run the protocol below only if that review confirms that
behavior special-cased to a recorded session (fixture-specific) or hardcoded
behavior passed development checks but did not carry over to the holdout.

## Generalization failure protocol

1. Stop tuning against the aggregate holdout result.
2. Spawn a fresh subagent to analyze the fixture-specific or hardcoded
   behavior, why it passed development checks, and which source-faithful
   implementation should replace that behavior. Give the subagent only the
   code diff, relevant upstream source, development evidence, and aggregate
   holdout result. It must not inspect the sealed holdout or per-session
   results.
3. Replace the fixture-specific or hardcoded behavior and add a development or
   newly recorded test for the general failure class.
4. Add a concise, reusable rule to `AGENTS.md` that would have prevented the
   failure. Repeat this step after every confirmed generalization failure.
   Exclude incident-specific scores, session filenames, and progress notes.
