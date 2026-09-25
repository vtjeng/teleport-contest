# Validation

Read this file when implementing gameplay or running recordings, differentials,
scans, or browser checks. The fixed 44-session workload includes the 33 regular
recordings and the 11 recordings under `sessions/holdout/`. The local-holdout
files are open, ordinary development inputs for scans, mismatch selection,
replay, recording comparison, and checkpoint scoring. Treat all fixed-workload
recordings as read-only source data while preserving them in place. The remote
competition holdout is outside this workspace.

## Routine validation

- Before committing, run focused tests with
  `node scripts/run-bounded.mjs focused -- node --test <file>`.
  Put Node test options before the file. `npm test` selects the default
  suite; it does not forward file selections or Node test options.
  Leave the routine full-suite run to checkpoint.
- If a focused run reports only a file-level `test failed`, run
  `node scripts/run-bounded.mjs focused -- node <test-file>` to expose its
  underlying assertions. Changing the
  reporter alone is not a reason to repeat the test.
- The bounded runner limits a focused command and its descendants to
  2 GiB and two minutes, and a full validation run to 6 GiB and 15 minutes.
  All bounded validation shares a 10 GiB limit, with swap disabled.
  Run it outside the Codex sandbox. It requires Linux and a working
  systemd user manager; it fails without those protections.
- Keep the printed run ID. Use the runner's `status`, `wait`, or `stop`
  command to recover or stop that run; `--help` gives the syntax.
  Do not start another copy to check whether the first has finished.
- After committing a combined integration candidate, the orchestrator runs
  `npm run checkpoint`. Workers submit immutable deliveries after focused
  tests, lint and required fresh differentials; they do not run a redundant
  branch-only full checkpoint before each handoff. A standalone game change
  outside the multi-worker loop still requires a post-commit checkpoint.
  It tests HEAD in a fresh
  worktree, initializes C from the local repository, and excludes uncommitted
  changes. Use `npm run checkpoint -- --commit <revision>` to select another
  commit. Run outside the Codex sandbox because setup writes Git metadata.
  If only `GOALS.json`, `SCORE.tsv`, `QUALITY.json`, or
  `QUALITY-evidence.json` changed, checkpoint can reuse earlier results
  while checking the updated records. Reuse requires unchanged code,
  test inputs, tools, and relevant settings, with the saved results intact.
  Use `npm run checkpoint -- --force` to rerun every check.
  Results live in `checkpoint-results/` under the shared Git directory,
  whose path is printed by `git rev-parse --git-common-dir`. Each commit has
  a `latest.json` and retained `run-*/` directories containing the summary
  and development artifacts. The shared top-level `latest.json` describes
  the latest completed run across commits. Worktree-local
  `.cache/checkpoint-summary.json` is a convenience copy. If archiving fails,
  the temporary checkout is retained and its path is reported. A
  passing check prints only its `PASS` line; a failing check writes its full
  output to a unique `teleport-checkpoint-<run>/<label>.log` path in the system
  temporary directory and prints the path and last 20 lines.
  `npm run checkpoint -- --verbose` prints everything. Two of its checks
  replay recorded play: the fixed development score over `sessions/` and
  `sessions/holdout/`, and the
  recordings corpus over `recordings/`, which fails when any recording stops
  matching.
- The agent that starts checkpoint owns the command through completion and
  retains its process handle. Do not interrupt that agent merely to take over
  validation. An explicit handoff identifies the tested commit, whether the
  command is running or finished, and the shared result path when available.
  If the owner was interrupted, establish the subprocess state before taking
  over: an agent interruption does not prove its command exited. Wait for the
  existing command or inspect its completed result before deciding to rerun.
- Keep at most one full suite, checkpoint, mutation run or aggregate scorer
  active locally for the loop. The orchestrator owns the slot; workers may
  continue focused checks and independent fresh cases using private recorder
  installations. Request an exceptional worker full run rather than starting
  one concurrently. Release the slot promptly after reaping its handle.
- Other agents may keep editing or committing in their own worktrees during checkpoint. Its result
  remains attached to the tested commit; advancing HEAD does not make it fail.
  Wait for an existing run of the intended commit rather than launching a
  duplicate. When the current loop step will require a checkpoint at HEAD,
  defer unrelated commits that change checkpoint inputs until the owner hands
  off that result. `scripts/checkpoint-reuse.mjs` excludes only its named
  bookkeeping files; any other intervening commit requires another exact-HEAD
  checkpoint even when it changes no game behavior.
- Finish closure commands at the tested HEAD before committing report-only
  updates. The worker tracker's publication check permits regular JSON
  investigation files and newly added challenge evaluations after acceptance.
  It checks their format and source commits; challenge evaluations must match
  the tested commit and its manifest. This does not change checkpoint caching
  or authorize changes to code, tests, recipes, recordings, or challenge inputs.
- Use the tested commit's shared summary and its `artifacts` directory. Its
  development figures replace a separate score-development run for that
  commit. The summary records which commit the results apply to (`commit`)
  and where the tests ran (`executionCommit`). When results are reused,
  `reusedFrom` points to the original summary. Report scores with the commit
  where they were measured.
  An older pass alone does not establish that newer code passes.
  Goal closure still requires a passing checkpoint at HEAD.
  If validation failed, inspect its failure logs before choosing the next check.
- For an entry point the span completes, write a recipe with a newly chosen
  seed, datetime, options, character, and inputs. Create the output directory
  with `mkdir -p recordings/<source-file>` before recording it:
  `node scripts/record-session.mjs recipes/<source-file>/<name>.session.json
  recordings/<source-file>/<name>.session.json`. Verify the fresh differential
  matches before committing the recording. The orchestrator's combined
  `npm run checkpoint` compares the PRNG log, the complete 24x80 screens with their
  attributes, and the cursor positions of every recording. Commit the
  recording only when it matches completely, as `AGENTS.md`, "Validate
  completed work", states.
- Launch a browser only for changes to browser-specific code, DOM/CSS,
  input/storage, or browser-only presentation. Shared engine or glyph-output
  changes do not need it when focused tests cover the renderer's input
  contract.

## Source completion evidence

A declaration establishes that code exists. Completion also requires a
whole-source comparison, production wiring, and appropriate execution
coverage. `goal-log.mjs next-span` skips only units with this evidence; old
`ported` flags and old goal closures remain historical name counts.

`.cache/span-context.json` and `.cache/span-evidence.json` are untracked
handoff files. Do not stage them. The orchestrator records verified evidence
in GOALS.json.

The worker writes `.cache/span-evidence.json`. The orchestrator reads the
source and artifacts, verifies the assertions, then records the evidence:

```
node scripts/goal-log.mjs record-evidence --goal <id> \
  --evidence .cache/span-evidence.json
```

The JSON object has a `functions` array. Each record describes one C function
or one whole Lua program:

| Field | Required evidence |
| --- | --- |
| `name` | C function name, or the Lua source basename including `.lua`. |
| `implementation`, `symbol` | JavaScript file under `js/` and its implementation symbol. A C symbol defaults to `name`; a Lua program names its function or constant explicitly. |
| `sourceReview` | The complete source range read, branches and evaluation/RNG order checked, and each allowed unported callee. Confirm that obsolete guards, injected substitutes, and swallowed refusals were removed. |
| `callers` | Array of `{ "path", "symbol", "source" }`: each JavaScript caller or dispatcher and the corresponding C/Lua call site. Trace the running game through that call, including registry or command dispatch. A test calling the function directly is not a production caller. |
| `pure` | Boolean established by reading the source: no RNG, output, or game-state mutation. |
| `tests` | Source-pinned `scripts/*.test.mjs` references; required for pure functions. |
| `recordings` | Matching `recordings/**/*.session.json` references that execute the impure function through its caller; required for impure functions. The same recording may cover multiple functions. |
| `inactiveReason` | For source excluded by the reference build, identify the build condition and source evidence. A source-pinned test documents an impure helper whose compile-time caller cannot run in the recorder; no production caller or recording is required for that helper. Do not invent a JavaScript function for a C macro invocation. |

The object also records `entryPointReview`, the source-based enumeration of
all entry points in the selected range, and an `entryPoints` array. Check
callers against the recorder's actual build configuration before planning
recordings. List active entry points in `entryPoints`; document excluded
caller branches, their build conditions and source call sites, and their
source-pinned tests in the existing `entryPointReview`. Missing JavaScript
behavior or a difficult recipe does not make a caller inactive. Each
entry is `{ "name", "functions", "recordings" }`. A helper-only range uses
an empty array and explains its production callers in `entryPointReview`.
A planned entry point may have an empty recording array while blocked; the
goal cannot close until every listed entry point has a matching recording.

`record-evidence` checks the schema, source and implementation declarations,
and that caller, test, and recording references exist. These checks establish
the references; the orchestrator verifies complete behavior, runtime
reachability, and that the cited recordings execute the claimed functions.
Evidence references use regular files within their declared evidence roots and
the path checks protect provenance and file integrity. The open local-holdout
recordings remain available for fixed-workload diagnosis and scoring; evidence
itself stays under its declared roots. Evidence is stored in `GOALS.json`; keep
the durable record there.

`close-span` requires evidence for every planned source unit. `close-goal`
also requires all spans closed and complete entry-point coverage. Both
require a passing checkpoint at HEAD, including the recordings corpus.
When a function or its wiring changes, refresh its evidence in the same span.
Existing declarations that lack evidence remain eligible for implementation
or verification; do not reimplement correct code merely to change a count.

For C-to-JavaScript and Lua-to-JavaScript translations, verify evaluation
order explicitly. Lua numeric-for bounds are evaluated once before the loop.
When a test uses mocked randomness, assert the draw sequence or call count
as well as the result; constant random values alone can hide extra draws.
Keep blocked recipes and revisit their named dependencies when those land.

## Synthetic local holdout validation

Synthetic recordings are immutable development inputs and may be inspected and
replayed to locate source behavior. Preserve all admitted batches and evaluate
them separately from the fixed checkpoint, as `.agents/scoring.md` requires.
The fixed checkpoint alone does not establish synthetic non-regression. New
batches follow `.agents/selection.md`, "Generating the next synthetic batch";
source-port entry points still need independent matching recipes and recordings
under the evidence roots above.

## Fresh differentials

A fresh differential records a case with the patched C program and replays the
same inputs with the JavaScript port. Its input is a **recipe**, as
`.agents/glossary.md` defines it: a session file holding replay inputs only,
with no recorded `steps`. These recording tools accept input-only recipes;
fixed-workload recordings contain recorded answers and therefore remain source
data rather than recipe inputs. This applies to both session directories and
preserves independent fresh cases. Inspect or replay fixed recordings with the
scan or scorer.

- One case: `node scripts/diff-fresh.mjs --seed 42 --moves 'jjj' --role
  Valkyrie --race human --gender female --align neutral`, or
  `node scripts/diff-fresh.mjs <recipe.session.json>`. Exit status 0 is strict
  parity, 1 a mismatch, 2 invalid input or a recorder or runner failure.
  `--help` lists the options.
- A reusable case: commit its recipe under `recipes/<source-file>/` and its
  recording under `recordings/<source-file>/`. Add a `scripts/run-<name>.mjs`
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
- Before closing a C or Lua source port, run its recipes and any matrix for the file,
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

- `.cache/session-results.json` contains a `.results` array.
  scan-sessions JSON output contains `.rows`; GOALS.json contains `.goals`.
  These formats are not interchangeable. Check the producing script when
  accessing an unfamiliar field.
- Use `normalizeSession()` from `frozen/session_loader.mjs` before accessing
  recorded segments. Legacy recordings can have a different top-level shape.
- Use `mismatch-queue.mjs --work --json` for operational selection and
  `--fixed --json` for fixed-workload diagnostics. `--scan <path>` supplies
  fixed-workload scan rows; it does not replace synthetic evidence. Filter
  the JSON `sessions` array to inspect one entry.
- Diagnose an admitted synthetic case with `scan-sessions.mjs --json
  --synthetic vN/case-id`, or use `--recording <admitted-recording-path>`.
  Each invocation runs in a fresh process and preserves the recording in place.
- `node scripts/goal-log.mjs --help` lists commands; append `--help` to a
  command for its arguments and prerequisites. Help runs without repository
  state, a C checkout, or subprocesses and needs no sandbox escalation.
  `.agents/loop.md` and `.agents/divergence.md` define the workflow sequence.
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
- `getScreens()` returns the same strings in a test as in the scorer, because
  `GameDisplay.serialize()` reads only the terminal grid. To inspect each
  cell's color and attribute, run the segment inside `withSerializedGrids()`
  from `scripts/terminal-grid-capture.mjs`.
