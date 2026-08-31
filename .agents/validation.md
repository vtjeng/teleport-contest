# Validation and scoring

Read this file when implementing gameplay or running recordings, differentials,
scans, scoring, browser checks, or an authorized holdout evaluation. The access
rules in `AGENTS.md` for `sessions/holdout/` always apply; this file calls it
the sealed holdout. Terms: coherent implementation chunk, behavior slice, and
review window are defined in `.agents/glossary.md`.

## Routine validation

- Diagnose mismatches from the upstream C source, focused development
  recordings, and the full set of development recordings, never from the
  sealed holdout.
- Before committing, run focused tests and the full test suite with
  `npm test` or `node --test <file>` to catch regressions.
- After committing, run `npm run checkpoint` on the committed state.
  Checkpoint requires a clean tree and writes
  `.cache/checkpoint-summary.json` with the commit SHA and results.
- `npm run test:all` runs all registered test suites, including those excluded
  from the default `npm test`.
- Checkpoint runs quietly by default: passing checks print only their
  `PASS`/`FAIL` summary line. A failing check writes its full output to
  `/tmp/checkpoint-<label>.log` and prints the last 20 lines.
  `npm run checkpoint -- --verbose` restores full output for all checks.
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

### Quick reference

Record a fresh C case and compare it with the JS port in one command:

```
node scripts/diff-fresh.mjs --seed 42 --moves 'jjj' \
  --role Valkyrie --race human --gender female --align neutral
```

Replay a recipe file (recipe contains only inputs, no recorded steps):

```
node scripts/diff-fresh.mjs recipes/my-case.session.json
```

Exit codes: 0 = strict parity, 1 = mismatch, 2 = recorder or runner failure.

All options: `node scripts/diff-fresh.mjs --help`

To scan many cases at once, write a scan plan and run
`node scripts/scan-fresh.mjs <plan.json>`. It groups failures by their
first divergence type and retains one case per group.

To record a C session without comparing (for manual inspection):
`node scripts/record-session.mjs <input.session.json> [output.session.json]`

### Recording rules

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
  the required setup within the declared search domain. Record in the commit
  message: the exact setup, the C functions that determine its behavior, the
  integration test, why the C case could not reach it, and what the substitute
  does not prove.
- Before closing a nontrivial behavior slice or goal, run a reproducible
  matrix that varies inputs relevant to the change. Cover ordinary cases and
  rare branches identified from source; exhaustive combinations are
  unnecessary.
- Commit any matrix intended for repeated use, either as a recipe or as a
  script that calls `scripts/diff-fresh.mjs`.

When exploring many cases, run
`node scripts/scan-fresh.mjs <scan-plan.json>`. It groups cases by the first
JavaScript error, PRNG mismatch, screen mismatch, or cursor mismatch and
retains one case per group. Inspect sibling branches in the same upstream
subsystem for newly exposed paths. Run
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
as it found it.
