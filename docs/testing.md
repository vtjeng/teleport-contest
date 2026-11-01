# Testing

This page lists the checks the project runs, where their inputs live, how
to run each one and what it compares. It also lists the cases that still
fail. `.agents/validation.md` describes when the loop runs each check;
this page describes the checks themselves.

## Set up a fresh checkout

```sh
git submodule update --init --checkout --no-fetch -- nethack-c/upstream
npm ci
```

The source-pinned tests and the generators read the C and Lua source from
`nethack-c/upstream/`, so they fail until the submodule is checked out.

## Checks

| Check | Command | Inputs | What it compares |
| --- | --- | --- | --- |
| Unit and tooling tests | `npm test` | `scripts/*.test.mjs` (1,228 files), directly under `scripts/` | Source-pinned function results, short replays and tooling behavior. A test file outside `scripts/` fails the suite; one in a subdirectory of `scripts/` is neither run nor flagged. |
| One test file | `node --test scripts/<name>.test.mjs` | The named file | As above, for one file. `npm test` takes no file arguments; it accepts only `-- --shard <i>/<n>`. |
| Lint | `npm run lint` | `js/`, `scripts/` | The ESLint rules in `eslint.config.js`. The pre-commit hook runs it too. |
| Generated tables | `npm run check:<name>` (14 of them) | `scripts/generate-*.mjs` | Each table equals fresh output from the C or Lua source. Tests in `npm test` guard the generators without a `check:` script. |
| Static source checks | `npm run check:namespace-members`, `check:relative-imports`, `check:fixed-datetime`, `check:constants`, `check:duplicate-symbols` | `js/` | Import, namespace and constant rules. The last two are informational in Checkpoint. |
| Regression recordings | Part of Checkpoint | `recordings/**/*.session.json`, made by the C recorder from `recipes/` | Every RNG call and every 24x80 screen with its cursor. Animation frames are counted but do not fail a recording. Attributes on blank cells are ignored, as the judge ignores them. |
| Fixed sessions | `node scripts/score-development.mjs` | The 33 files in `sessions/` and the 11 in `sessions/holdout/` | The same comparison, scored by the judge's `frozen/ps_test_runner.mjs`. Checkpoint also fails if the score falls below `score-baseline.json`. |
| Synthetic batches | Hosted Checkpoint, or `node scripts/score-challenges.mjs --batch v<N> --output <file>` | `challenges/manifest.json` (v1), `challenges/manifests/` (v2 to v98), `challenges/cases/` | The same comparison over the 98 admitted batches. |
| Session scan | Part of Checkpoint | The fixed sessions | `scan-sessions.mjs --json`, plus `check-overread.mjs`, which fails if a replay reads past the end of its input. |
| Excluded commits | Part of `npm test` | `scripts/excluded-window.test.mjs` | Fails if game code repeats four consecutive lines that commits `736b8cd04..15ed31f2d` added. |
| Known failures | Part of `npm test` | `scripts/known-failures.test.mjs` | Recordings that do not match yet, reported as `# TODO` without failing the suite. |

## Full validation

The hosted **Checkpoint** workflow (`.github/workflows/checkpoint-trial.yml`)
runs every check above in parallel. It took 10 minutes in run
[41171076629](https://github.com/vtjeng/teleport-contest/actions/runs/41171076629).
A push to any `integration-checkpoint/**` branch starts it, except
`integration-checkpoint/admission/**`, which the Admission workflow handles.
It can also be started by hand (`workflow_dispatch`).

```sh
git push -- https://github.com/vtjeng/teleport-contest.git HEAD:refs/heads/integration-checkpoint/<name>
node scripts/fetch-hosted-checkpoint.mjs <run-id>
```

`fetch-hosted-checkpoint.mjs` needs `gh`. It imports the result into
`.git/checkpoint-results/<commit>/` and prints a summary. HEAD must be the
run's commit, and the tree must have no changes other than report files.

`node scripts/checkpoint-report.mjs [revision] [--json]` prints the archived
result for a commit (HEAD by default): each check's verdict, recording and
fixed-session totals, synthetic totals and every failing synthetic case.

`npm run checkpoint` runs the same checks except the synthetic batches, in a
new worktree of HEAD under `/tmp`. Nobody has run it since lint joined its
checks on 2026-10-12, and it may fail there because the new worktree has no
`node_modules`. Use the hosted run.

## Known failures

| Case | Observed failing on | First difference | Cause |
| --- | --- | --- | --- |
| `experiments/backlog-terminal-lava/recordings/mixed-fire-blind-fatal.session.json` | `3e01a48b4`, `ee49a85f0` | Tombstone screen, step 75, row 10. RNG, cursors and lengths match. | Killer attribution in `explode.c` `explode()` |
| `experiments/backlog-terminal-lava/recordings/lava-mounted-terrain.session.json` | `3e01a48b4`, `ee49a85f0` | RNG call 2,792 (step 93): C calls `rnd(4)` in `sink_into_lava()`, JS calls `rn2(12)` | `trap.c` `sink_into_lava()` while mounted |
| Synthetic `v32-version-build-options` (32/33 screens), `v35-version-feature-report` (35/36), `v48-short-version-command-attempt1` (1/2) | `d6c01204a` | The version text | The Linux recorder's Unix `VERSION_ID` differs from the macOS judge profile in `js/version.js` (`version.c` `getversionstring()`). Left unresolved on purpose; see `investigations/synthetic/`. |
| Synthetic `v35-gehennom-juiblex` (100/109 screens; RNG matches) | `d6c01204a` | Screens and cursors | A screen-buffer overflow in recorder patch 006 corrupted the recording. Not a JavaScript defect; see `investigations/synthetic/v35/v35-gehennom-juiblex.json`. |

Update this table in the commit that fixes or adds a known failure.

## Local recordings and the judge's host

Read this section before comparing the port with a recording you made
locally. The judge's reference recordings were made by a recorder built and
run on macOS (`docs/recording-environment.md`). Local recordings come from
the same patched source built on Linux. A few strings in NetHack are chosen
when the program is compiled or depend on the environment it runs in, so a
Linux recording can show a screen the judge's recording does not, although
the game, its RNG calls and the rest of its screens are the same. The port
prints the judge's macOS text, so it does not match these Linux screens.

### Known differences

These differ for host reasons. The first three are compile-time choices:
`include/config1.h:43-44` defines `MACOS` when the compiler defines
`__APPLE__` and `__MACH__`, and the C source picks a different branch for it.

| Where it shows | macOS (judge) | Linux (local) | Source |
| --- | --- | --- | --- |
| The `v` and `#version` text | `MacOS NetHack Version 5.0.0 ...` | `Unix NetHack Version 5.0.0 ...` | `PORT_ID` in `include/global.h:191-193` (`__APPLE__`) and `:217-219` (`UNIX`), put into the version string by `src/mdlib.c:341` |
| Eating an apple | `Delicious!  Must be a Macintosh!` | `Core dumped.` | `src/eat.c:2179-2185`, `fprefx()`: the `MACOS` branch comes before the `UNIX` one. A pear prints `Core dumped.` on both hosts. |
| The build options in `#version` | `strong PRNG seed from /dev/random` | `strong PRNG seed from /dev/urandom` | `DEV_RANDOM` in `include/unixconf.h:424-430`, printed by `src/mdlib.c:511-513`. The extra letter can move a line break in the paragraph that follows. |
| The options help text (`Set options as OPTIONS=<options> in ...`) | The judge's `HOME`, given in `docs/recording-environment.md` | `/tmp/nh-rec-XXXXXX/home` | `src/options.c:9471` prints `get_configfile()`, which is `$HOME/.nethackrc`. `scripts/record-session.mjs` sets `HOME` to a directory it creates with `mkdtemp()`. The path's length decides how many lines the help text takes, and so which lines fall on each page of the pager. |

The `HOME` difference comes from `record-session.mjs`, not from the host,
so the macOS workflow below records with the same `/tmp/nh-rec-XXXXXX/home`
as a local run and does not measure it.

`CRASHREPORT` and `PANICTRACE` were suspected but are not expected to
differ: `include/config.h:244-285` defines both for `MACOS` and for
`__linux__`, and the Linux recorder's `#version` screen lists `show stack
trace on error` and `launch browser to report issues`, as `js/mdlib.js` does
for the judge. Other compile-time `MACOS` branches, such as
`RUNTIME_PASTEBUF_SUPPORT` (`include/unixconf.h:414-416`), and differences
in the C library (regular expressions, `printf` corner cases, terminal input
modes) have not been measured. The macOS workflow below measures them.

### Private installs

`scripts/record-session.mjs` records every session from its own copy of
the recorder install, under its temporary directory. NetHack keeps each
game's lock and level files, its save file, bones files and the score files
in the install directory. Recordings that shared one directory could stop
after the first screen because another game held the lock, lose the save
file that their restore segment needed, or list another game on the
tombstone's score list. The copy leaves out those per-game files and lasts
for the whole session, so a save from one segment is still there for the
next. Concurrent recordings from one install are therefore safe.

Before each segment after the first, `record-session.mjs` also deletes the
lock and level files the previous segment left in its copy and keeps
`save/`. A segment that stops at a live prompt leaves its lock behind, and
without this the next segment's NetHack asks "There is already a game in
progress under your name. Destroy old game?" and exits. The judge's
recordings start such a segment as a new game
(`sessions/seed5002-wizard-coverage-pair`, segment 1), so their recorder
must have cleared the locks as well. A segment that saved its game leaves
no level files, and its save file stays for the restore.

### Daylight time and recordings

A recording depends on whether New York is on daylight time when it is
made, not only on the recipe. The patched `calendar.c`
`time_from_yyyymmddhhmmss()` (patch 001) turns the recipe's `datetime` into
a clock time with `mktime()`, and copies `tm_isdst` from the current local
time first. The same `datetime` therefore becomes two clock times an hour
apart, and night, midnight, shopkeeper names (`shknam.c`, from
`ubirthday`) and some RNG calls can differ. `record-session.mjs` stores the
flag in each segment as `recorderIsDst`. Two local recordings of the 500
host-parity recipes, made on either side of the change at 06:00 UTC on
1 November 2026, differed in 39 recipes (5 of them in RNG). All 39 were
among the 372 recorded under different flags; the 128 recorded under the
same flag on both runs were identical. Compare only recordings made
during the same daylight-time period.

### Measuring the differences on macOS

The `macos-recorder.yml` workflow builds the recorder on a GitHub macOS
runner with `nethack-c/build-recorder.sh`, records the 500 recipes in
`experiments/host-parity/recipes/` and uploads the recordings as the
`macos-recordings` artifact. `experiments/host-parity/README.md` describes
how those recipes were chosen. The workflow runs only when started by hand,
from a branch that GitHub has seen, such as `main`.

1. Start the workflow and find its run:

   ```sh
   gh workflow run macos-recorder.yml --ref main
   gh run list --workflow macos-recorder.yml --limit 1
   ```

2. When the run has finished, download its recordings into an empty
   directory:

   ```sh
   gh run download <run-id> --name macos-recordings --dir .cache/host-parity/macos
   ```

   `host.txt` in the artifact names the commit, the macOS version and the
   compiler. A recipe that failed to record is listed in `failed.txt`, and
   its log is under `logs/`.

3. Check out the commit that `host.txt` names, build the recorder if you
   have not (`bash nethack-c/build-recorder.sh`) and record the same recipes
   on Linux:

   ```sh
   experiments/host-parity/record-sample.sh .cache/host-parity/linux
   ```

   Both hosts use this script. It sets `TMPDIR=/tmp`, so the `HOME` that
   NetHack prints has the same length on both hosts. Record during the
   same daylight-time period as the macOS run (see "Daylight time and
   recordings").

4. Compare the two sets:

   ```sh
   node scripts/compare-host-recordings.mjs .cache/host-parity/macos .cache/host-parity/linux \
       --labels macOS,Linux --json .cache/host-parity/report.json
   ```

`compare-host-recordings.mjs` pairs recordings by file name. For each recipe
it reports whether the RNG logs are identical and which screens and cursors
differ, comparing screens only before the first RNG difference. It then
groups the differing words of every screen into host-difference kinds,
ordered by the number of recipes each affects. It lists recipes whose two
recordings have different `recorderIsDst` values but leaves them out of
the kinds. A difference that moves text
from one pager page to the next appears as several kinds, one for each run
of words that moved; the example step of each kind shows where to look.

### Linux output profile

A later change will add a Linux output profile: a way to make the Linux
recorder print the judge's macOS text, so local recordings can be compared
with the port directly. It will be checked against the list of kinds the
macOS comparison measures, not only the known differences above. Until
then, the comparison tools substitute the known host strings in the Linux
recordings before they compare: `substituteHostStrings()` in
`scripts/fresh-matrix.mjs` for the matrix runners, and the untracked
tooling under `.cache/c-diff/tools/` (`js-replay.mjs`), which also replaces
the local `HOME` path with the judge's.

## Other workflows and scripts

- `lint.yml` runs ESLint on pushes to `main` and on pull requests.
- `admission.yml` runs batch admission on `integration-checkpoint/admission/**`
  pushes (`scripts/admission-ci.mjs`).
- Four workflows run only by hand: `coverage.yml` reports the `js/` lines
  that neither the tests nor the fixed sessions execute, `regex-resources.yml`
  measures startup regular-expression resources, `score.yml` scores the
  fixed sessions, and `macos-recorder.yml` records the host-parity sample on
  macOS (see "Local recordings and the judge's host").
- `npm run score` runs `frozen/score.sh`, the judge's scorer.
- `npm run test:all` runs the same tests as `npm test`.
- A full local `npm test` on `ee49a85f0` took 15 minutes on the development
  machine (13,876 tests on 2026-10-31).
