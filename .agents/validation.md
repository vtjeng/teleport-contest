# Validation

Read this file when implementing gameplay or running recordings, differentials,
scans, or browser checks. The access rules in `AGENTS.md` for
`sessions/holdout/` apply to every tool named here.

## Routine validation

- Before committing, run the focused tests and the full suite: `npm test` or
  `node --test <file>`.
- After committing, run `npm run checkpoint`. It requires a clean tree and
  writes `.cache/checkpoint-summary.json` with the commit SHA and results. A
  passing check prints only its `PASS` line; a failing check writes its full
  output to `/tmp/checkpoint-<label>.log` and prints the last 20 lines.
  `npm run checkpoint -- --verbose` prints everything. Two of its checks
  replay recorded play: the development score over `sessions/`, and the
  recordings corpus over `recordings/`, which fails when any recording stops
  matching.
- For an entry point the span completes, write a recipe with a newly chosen
  seed, datetime, options, character, and inputs, and record it:
  `node scripts/record-session.mjs recipes/<c-file>/<name>.session.json
  recordings/<c-file>/<name>.session.json`. Then run `npm run checkpoint`,
  which compares the PRNG log, the complete 24x80 screens with their
  attributes, and the cursor positions of every recording. Commit the
  recording only when it matches completely, as `AGENTS.md`, "Validate
  completed work", states.
- Launch a browser only for changes to browser-specific code, DOM/CSS,
  input/storage, or browser-only presentation. Shared engine or glyph-output
  changes do not need it when focused tests cover the renderer's input
  contract.

## Fresh differentials

A fresh differential records a case with the patched C program and replays the
same inputs with the JavaScript port. Its input is a **recipe**, as
`.agents/glossary.md` defines it: a session file holding replay inputs only,
never recorded `steps`. Every tool below rejects a
path under `sessions/holdout/`.

- One case: `node scripts/diff-fresh.mjs --seed 42 --moves 'jjj' --role
  Valkyrie --race human --gender female --align neutral`, or
  `node scripts/diff-fresh.mjs <recipe.session.json>`. Exit status 0 is strict
  parity, 1 a mismatch, 2 invalid input or a recorder or runner failure.
  `--help` lists the options.
- A reusable case: commit its recipe under `recipes/<c-file>/` and its
  recording under `recordings/<c-file>/`. Add a `scripts/run-<name>.mjs`
  matrix as well, but only when the case needs state read from the port after
  replay. The matrix builds its recipes, passes them with a `verifySegment`
  function to `runFreshMatrix()` in `scripts/fresh-matrix.mjs`, ends with one
  `runMatrixCli()` call, and states in a comment how each seed was chosen.
  Copy `scripts/run-read-teleport.mjs`, the smallest complete matrix;
  `scripts/run-kick-command.mjs` shows `verifySegment` and a documented seed
  scan. Add cases to the matrix for the same C file before creating a new one.
- `diff-fresh.mjs` runs `scripts/record-session.mjs` for every case. Call it
  directly only to keep a C recording without comparing:
  `node scripts/record-session.mjs <input.session.json> [output.session.json]`.

Nothing reruns a matrix against C after the worker runs it: `npm test`,
`npm run checkpoint`, and CI replay the port only. A committed recording keeps
its C side, so checkpoint and CI replay it on every later commit; a matrix's
state assertions run only when you run the matrix. Cite the run in the commit
message.

### Choosing cases

- Build each case from the shortest valid input sequence that reaches the
  behavior. Set up the state directly with options, character selection,
  inventory actions, movement, or, for a branch that does not read the
  `wizard` flag, a `playmode:debug` game and its `^G` and `^W` commands.
- Search for a natural seed only when the test measures generation or random
  selection, or must show that the setup occurs in ordinary play. Search with
  `scanSeeds()` in `scripts/scan-port.mjs`, which replays the port alone over
  a seed range and keeps the seeds a predicate accepts (about 13 ms per seed,
  against about 0.65 s for a recorded case). Choose the range before
  searching and keep it under about 10,000 seeds; state the range and its
  yield in the matrix script's comment.
- When the range yields nothing, do not widen it. Pin the branch with a
  constructed test that names the C function, and state in the test's comment
  why no C case reaches it.
- Before closing a file port, run its recipes and any matrix for the file,
  covering the ordinary cases and the rare branches the source identifies.
  Exhaustive combinations are unnecessary.

### When a fresh differential fails

1. Keep the original failing recipe.
2. Remove irrelevant options and inputs until the case is minimal.
3. Locate the responsible behavior in the upstream source.
4. Add a regression test for the general behavior.
5. Implement from the source, not from the observed trace.

## Facts about the measuring tools

Each of these has produced a wrong conclusion before.

- `rngMatched` compares positionally over the whole log.
  `frozen/ps_test_runner.mjs` walks both logs to their full length, so a
  segment that stops early scores the next segment's startup calls against C's
  continuing log, and the matched count can fall while correctness rises. When
  a count moves the wrong way, find where the logs first diverge.
- `scripts/record-session.mjs` clears the install directory only before a
  chunk's first segment (`clearStaleState()` runs when `isFirstSegment`), so a
  save-and-quit in segment 0 restores in segment 1. A `playmode:debug` game the
  recorder terminates also leaves a save, so a second debug segment in the
  same chunk restores the first game and fails a few keys in. Pass
  `chunkLimit: 1` to `runFreshMatrix()` for a recipe with debug segments.
- The recorder runs in `America/New_York` and refuses any other `RERECORD_TZ`.
  It writes `recorderIsDst`, the daylight-saving bit at the moment of
  recording: the patched `time_from_yyyymmddhhmmss()` in `calendar.c` copies
  the current `localtime()` into the parsed fixed datetime, and
  `js/calendar.js` reads the bit from the session.
- `game.rng` does not exist. Count draws through the replay object's
  `getRngLog()`. An assertion on `game.rng?.log?.length ?? 0` compares 0 with 0
  and passes whatever the code does.
- `js/terminal.js` has no `serialize()`, so outside the scoring workspace every
  recorded screen is the empty string. Read `display.toplines` (the port of
  `gt.toplines`), or run inside the workspace that
  `scripts/score-development.mjs` builds, where `frozen/terminal.js` replaces
  it.
