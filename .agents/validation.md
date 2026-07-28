# Validation and scoring

Read this file when implementing gameplay or running recordings,
differentials, scans, scoring, browser checks, or an authorized holdout
evaluation. The sealed-holdout rules in `AGENTS.md` always apply.

## Routine validation

- Diagnose from upstream source, focused development recordings, and the full
  development suite. Never diagnose from the sealed holdout.
- For each coherent implementation chunk, inspect the diff and run focused
  tests plus the full test suite before committing. Use
  `npm run checkpoint -- --focus <test-file>` to run focused tests, the full
  test suite, the four generated-data checks, `check:namespace-members`, and the
  development score in one command. Repeat `--focus` to add more test files.
  `--skip-score` omits the development score for a quick run; the score still
  has to pass before the commit. `checkpoint-checks.mjs` rejects every other
  option and prints no help text.
- Redirect every checkpoint run to a log and read only its tail:

  ```
  npm run checkpoint > /tmp/checkpoint.log 2>&1 && tail -40 /tmp/checkpoint.log
  ```

  A green checkpoint prints about 133,000 bytes over 1,724 lines. An agent
  reading that directly loses most of it to truncation and spends thousands of
  tokens on passing test names. The tail is about 1,100 bytes and ends with the
  per-check `PASS`/`FAIL` summary, and the full output stays on disk.

  When the checkpoint fails, `&&` suppresses the tail and the command exits
  nonzero. Read the log instead. `tail -40 /tmp/checkpoint.log` still ends with
  the summary, because every check runs whether or not an earlier one failed.
  `grep -n '✖' /tmp/checkpoint.log` gives the line number of each failing test,
  and the default reporter repeats them with their assertion output at the end
  of the log.

  Keep the default test reporter. `node --test --test-reporter=dot` prints no
  pass or fail summary on a green run, discards test-process stdout and stderr,
  and reduces an import-time throw in a `js/` module to `test failed` with no
  message or stack. `npm test -- --test-reporter=dot` ignores the flag.
- For nontrivial behavior, differentially test against the C recorder using
  newly chosen seeds, datetimes, options, character configurations, and input
  sequences.
- Verify the PRNG log, complete 24x80 screens and their attributes, cursor
  positions, and persisted state through the next observable boundary.

Launch a browser only for changes to browser-specific code, DOM/CSS,
input/storage, or browser-only presentation. Shared engine or glyph-output
changes do not need browser validation when the renderer is unchanged and
focused tests cover the renderer's input contract.

## Choosing what to implement next

Run `node scripts/scan-stops.mjs`. For each development session it reports the
fail-closed boundary the port reaches first, the recorded keystroke it refused,
that keystroke's command under the session's own bindings, and C's message on
that step. It then censuses boundaries and commands, carrying the count of
recorded steps standing behind each one. `--json` emits the same rows, which is
how a candidate change is measured across two runs.

The census names upstream owners to trace. It does not rank them, and two rules
keep its numbers honest:

- The steps standing behind a boundary are a ceiling, not a forecast. Sessions
  blocked on one owner routinely block again on another, and the keystrokes
  after a stop include prompt answers, count prefixes, and menu selections
  rather than commands. To turn a candidate into a number, make the change and
  re-run the scan; that delta is a measurement.
- C's message at a stop points at the upstream owner. It is not a
  specification: implement from the C function that produces it.

The scan reports the screens each session emitted. `scripts/score-development.mjs`
remains the authority on how many of those screens match.

The scanned directory is fixed and the script accepts no path argument, so it
cannot be aimed at `sessions/holdout/`.

## Fresh differentials

- Record fresh cases in the canonical `America/New_York` timezone. Recorder
  patch 001 carries the recording-time daylight-saving-time (`tm_isdst`) bit
  into fixed-datetime parsing. Preserve the resulting `mktime()` normalization
  and emitted `recorderIsDst` metadata.
- Run strict cases with `node scripts/diff-fresh.mjs --seed ...`.
- Recipes contain replay inputs only. They must never contain recorded `steps`,
  weaken sealed-path checks, or reference the sealed holdout.
- Before closing a nontrivial behavior slice or milestone, run a reproducible
  matrix that varies inputs relevant to the change. Cover ordinary cases and
  rare branches identified from source; exhaustive combinations are
  unnecessary.
- Commit any matrix intended for repeated use, either as a recipe or as a
  script that calls `scripts/diff-fresh.mjs`.

When exploring many cases, use
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

Continue to calculate and report an estimate for each completed implementation
chunk, formatted:

`<shown> shown + <hidden> hidden = <total> total`

Use current published aggregates when available. Otherwise estimate from
development and fresh-differential evidence and state the uncertainty. Never
run the sealed holdout merely to produce an estimate.

Collect routine chunk evidence without appending a `SCORE.md` row. Preserve one
evidence snapshot when:

- a live behavior slice closes;
- a frozen review window completes its required review, fixes, and validation;
- the estimate changes; or
- a result is published.

Each snapshot records the exact integrated code state at one full commit SHA,
estimate, evidence, and uncertainty. Formal review ranges remain in
`QUALITY.json` and retained pass reports. Combine coincident triggers into one
row per SHA.

One optional row may be a mutable `current candidate` for an open slice or
review window after a selected handoff checkpoint has complete validation.
Replace it only after a later selected handoff is validated; do not update it
merely because the code head advanced. If that same SHA later meets a permanent
snapshot trigger, relabel the row with that trigger. Otherwise delete the
candidate when a later permanent snapshot supersedes it. Evidence-only commits
do not receive snapshots.

Recorded correctness and simplification frontiers and metrics remain in
`QUALITY.json`; complete reports not yet represented there remain with their
related durable review evidence. Required clarity and copyedit reports remain
with their related durable review or publication evidence. A score snapshot
may reference these sources but does not replace them.

Prefer source-faithful subsystem improvements to isolated score gains. If an
authorized aggregate holdout evaluation shows that development results did not
carry over to the holdout, first compare the source, implementation diff, and
development evidence. Run the protocol below only if that review confirms that
fixture-specific or hardcoded behavior passed development checks but did not
carry over to the holdout.

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
   failure. Add this rule after every confirmed generalization failure. Exclude
   incident-specific scores, session filenames, and progress notes.
