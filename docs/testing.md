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
| C constants | Part of `npm test`; also `npm run check:constants` | `js/` integer constants, the recorder's C headers and `.c` files | `scripts/check-c-constants.mjs` compiles a `_Static_assert` for each top-level integer constant in `js/`, exported or not, under its C spelling (`C_ALIASES`, or a case-only difference). A name a `.c` file defines is checked inside a copy of that file. The test fails on a mismatch that `KNOWN_MISMATCHES` does not list, on an upper-case name that matches no C constant and is missing from `PORT_ONLY`, when a pinned exception count changes, and when no C compiler is installed. |
| C message coverage | Part of `npm test` | `docs/c-message-coverage.md`, the C sources, `js/`, `scripts/c-message-exemptions.mjs` | `scripts/c-message-coverage.mjs` lists C message texts absent from the string literals of `js/`, apart from the exempt ones that `scripts/c-message-exemptions.mjs` and `scripts/not-ported-by-design.mjs` explain. The test fails when the committed report is stale, or when an exemption matches no C message, names a text `js/` now contains, or lacks a reason or approval. |
| Regression recordings | Part of Checkpoint | `recordings/**/*.session.json`, made by the C recorder from `recipes/` | Every RNG call and every 24x80 screen with its cursor. Animation frames are counted but do not fail a recording. Attributes on blank cells are ignored, as the judge ignores them. |
| Fixed sessions | `node scripts/score-development.mjs` | The 33 files in `sessions/` and the 11 in `sessions/holdout/` | The same comparison, scored by the judge's `frozen/ps_test_runner.mjs`. Checkpoint also fails if the score falls below `score-baseline.json`. |
| Synthetic batches | Hosted Checkpoint, or `node scripts/score-challenges.mjs --batch v<N> --output <file>` | `challenges/manifest.json` (v1), `challenges/manifests/` (v2 to v98), `challenges/cases/` | The same comparison over the 98 admitted batches. |
| Session scan | Part of Checkpoint | The fixed sessions | `scan-sessions.mjs --json`, plus `check-overread.mjs`, which fails if a replay reads past the end of its input. |
| Excluded commits | Part of `npm test` | `scripts/excluded-window.test.mjs` | Fails if game code repeats four consecutive lines that commits `736b8cd04..15ed31f2d` added. |
| Judge entry point | Part of `npm test` | `scripts/run-segment-imports.test.mjs` | Fails if a file outside `frozen/` takes the judge's `runSegment` from `js/jsmain.js`, which ends a crashed segment instead of throwing, rather than `runSegmentStrict`. |
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

A known failure is either a port defect, where the port does not yet
reproduce a correct recording, or an invalid reference, where the recording
itself is wrong.

### Port defects

| Case | Observed failing on | First difference | Cause |
| --- | --- | --- | --- |
| `experiments/backlog-terminal-lava/recordings/mixed-fire-blind-fatal.session.json` | `3e01a48b4`, `ee49a85f0` | Tombstone screen, step 75, row 10. RNG, cursors and lengths match. | Killer attribution in `explode.c` `explode()` |

Update this table in the commit that fixes or adds a known failure.

### Invalid references

`challenges/invalid-references.json` lists the admitted synthetic cases whose
recording is wrong. Each entry gives the case, its batch, the cause, the
evidence files and the exact screen, RNG and cursor counts the case is
expected to produce. `scripts/checkpoint-report.mjs`, the summary that
`scripts/fetch-hosted-checkpoint.mjs` prints and the Checkpoint workflow's
**Checkpoint report** job read that file. They report a listed case on an
`INVALID` line, apart from port failures, and compute the `Synthetic:`
headline over the remaining cases. The `Synthetic, all admitted cases:` line
and `--json` keep the raw totals. Neither the Checkpoint verdict nor any
score uses the list.

| Case | Cause |
| --- | --- |
| `v32-version-build-options`, `v35-version-feature-report`, `v48-short-version-command-attempt1` | Recorded on the Linux recorder, so the version text shows `Unix` and `/dev/urandom` where the judge's macOS recorder and the port show `MacOS` and `/dev/random`. See "Local recordings and the judge's host". |
| `v35-gehennom-juiblex` | A screen-buffer overflow in recorder patch 006 overwrote nine recorded cursor positions. All RNG calls match. |

A listed case is set apart only while its counts equal the entry's expected
counts and its replay raises no error. The report prints a `CHECK` line under
"Invalid-reference list needs attention" when a listed case matches, when its
counts change (for example, a new RNG mismatch) or when no evaluation holds
it. A case that changed stays an ordinary `FAIL`.

Add an entry only with evidence that the reference, not the port, is wrong:
an investigation under `investigations/synthetic/` or a measured host
difference. Remove an entry when its case matches. When a case's counts
change for a reason that leaves the reference invalid, update `expected` in
the same commit as that reason.

## Local recordings and the judge's host

Read this section before comparing the port with a recording you made
locally. The judge's reference recordings were made by a recorder built and
run on macOS (`docs/recording-environment.md`). Local recordings come from
the same patched source, usually built on Linux. A few strings in NetHack
are chosen when the program is compiled or depend on the environment it
runs in, so a recording can show text that depends on its host, although
the game, its RNG calls and the rest of its screens are the same. The port
prints the judge's macOS text. The recorder now prints that text too: on
Linux, `nethack-c/build-recorder.sh` applies a macOS-output profile (see
"Linux output profile"), and on every host the recorder prints the judge's
`HOME` (patch 008). One measured difference remains, a key binding that
depends on uninitialized memory.

### Known differences

These differ for host reasons. The first three are compile-time choices:
`include/config1.h:43-44` defines `MACOS` when the compiler defines
`__APPLE__` and `__MACH__`, and the C source picks a different branch for it.
The last column says what a recorder built from this repository prints.

| Where it shows | macOS (judge) | Linux, upstream build | Source | This repository's recorder |
| --- | --- | --- | --- | --- |
| The `v` and `#version` text | `MacOS NetHack Version 5.0.0 ...` | `Unix NetHack Version 5.0.0 ...` | `PORT_ID` in `include/global.h:191-193` (`__APPLE__`) and `:217-219` (`UNIX`), put into the version string by `src/mdlib.c:341` | macOS text on both hosts (Linux profile) |
| Eating an apple | `Delicious!  Must be a Macintosh!` | `Core dumped.` | `src/eat.c:2179-2185`, `fprefx()`: the `MACOS` branch comes before the `UNIX` one. A pear prints `Core dumped.` on both hosts. | macOS text on both hosts (Linux profile) |
| The build options in `#version` | `strong PRNG seed from /dev/random` | `strong PRNG seed from /dev/urandom` | `DEV_RANDOM` in `include/unixconf.h:424-430`, printed by `src/mdlib.c:511-513`. The extra letter can move a line break in the paragraph that follows. | macOS text on both hosts (Linux profile) |
| Binding a key to a command from the options menu | `Key binding failed?!` in the one recorded case | The key is bound | `handler_rebind_keys_add()` in `src/cmd.c` appends the command name to an uninitialized buffer, so the result depends on stack contents; see below | Differs: Linux binds the key, and so does the port |
| The options help text (`Set options as OPTIONS=<options> in ...`) and other messages that name the config file | The judge's `HOME`, given in `docs/recording-environment.md` | The `HOME` the game runs with | `src/options.c:9471` prints `get_configfile()`, which is `$HOME/.nethackrc`. The path's length decides how many lines the help text takes, and so which lines fall on each page of the pager. | The judge's path on every host (patch 008) |

Save files are compressed with `/usr/bin/compress`, as on macOS
(`COMPRESS` in `include/config.h`). Most Linux hosts lack that program;
there `nethack-c/build-recorder.sh` points `COMPRESS` at gzip instead,
because a missing compressor makes NetHack print an error and an extra
`--More--` after every save. With gzip the save file is named `.gz`
rather than `.Z`; no recorded screen has shown that name. On Debian or
Ubuntu, `sudo apt install ncompress` provides `/usr/bin/compress`, and
the next build uses it.

### The judge's HOME

`scripts/record-session.mjs` runs each game with `HOME` set to a directory
it creates with `mkdtemp()`, and writes the segment's `nethackrc` there.
NetHack would print that path, `/tmp/nh-rec-XXXXXX/home/.nethackrc`,
wherever it names its config file. Patch 008
(`nethack-c/patches/008-shown-config-home.patch`) adds
`shown_configfile()` to `src/cfgfiles.c`: once `fopen_config_file()` has
opened `$HOME/.nethackrc`, it stores the file's name as
`$NETHACK_SHOWN_HOME/.nethackrc`. The game still reads the local file.
`record-session.mjs` sets `NETHACK_SHOWN_HOME` to `RECORDER_HOME` from
`js/cfgfiles.js`, the value the port prints, so C prints the judge's path
and the two cannot drift apart. `#saveoptions` writes to the stored name,
as the judge's recorder did; where that directory does not exist, its
`fopen()` fails without a message.

The macOS measurement below predates patch 008, so its recordings show
the temporary `HOME`. Re-run the macOS workflow after this change reaches
`main` to measure the patch on macOS.

### Measurements

The macOS workflow below measured the differences on 1 November 2026
(run [41280653286](https://github.com/vtjeng/teleport-contest/actions/runs/41280653286),
commit `7ca77caf`, macOS 26.6.2, Apple clang 21.0.0), against a Linux
recording of the same 500 recipes at the same commit, both in standard
time:

- The RNG logs were identical in 498 of the 500 recipes. Screens differed
  in 223.
- Every differing screen falls into one of four kinds: `/dev/random` (192
  recipes) and `MacOS` (192, the same `#version` and banner screens), the
  apple message (33), and one key-binding difference (1, below). In one
  apple game (`g00203`) the RNG log also diverges from the step where the
  apple is eaten: the longer macOS message takes its own `--More--`
  before the rest of that turn's RNG calls.
- `CRASHREPORT` and `PANICTRACE` do not differ:
  `include/config.h:244-285` defines both for `MACOS` and for
  `__linux__`.
- No other compile-time branch or C library difference appeared in this
  sample. A difference in code the sample does not reach would not show.

The same 500 recipes, recorded on Linux with the profile and patch 008 and
compared with the same macOS recordings, also in standard time:

- The RNG logs were identical in 499 of the 500 recipes; `g04439` is the
  exception. Screens differed in 52.
- None of the three compile-time kinds remain.
- 51 recipes differ in the options help, because the macOS recordings show
  the temporary `HOME` and the Linux ones the judge's. The change of path
  also moves the help text's line breaks and pages, which the comparison
  reports as many small kinds.
- `g04439` still differs at the key binding.

`experiments/host-parity/README.md`, "Results", gives the counts and the
replays of both sets with the port.

### The key-binding difference

In `g04439` the player opens the options menu, chooses `bind keys`, then
`a - bind key to a command`, presses `o`, and at `Bind 'o' to what
command?` picks `r - down`. The macOS recorder prints `Key binding
failed?!`; the Linux recorder binds `o` to `down` and returns to the `Do
what?` menu, and the later keys play differently, so the RNG logs diverge
from step 396.

`handler_rebind_keys_add()` in `src/cmd.c` declares `char
cmdstr[BUFSZ];` without initializing it (line 2356), then builds the
command name with `Strcat(cmdstr, ec->ef_txt)` (line 2379), or
`Strcat(cmdstr, "nothing")` for unbinding (line 2363). `strcat()` appends
after the first zero byte, so the result is the command name only when
the buffer happens to start with a zero. Otherwise `bind_key()` finds no
command of that name and the menu prints `Key binding failed?!`. The
buffer holds whatever earlier calls left at that place on the stack. That
depends on the compiler and on the C library's own use of the stack, so
it can differ between macOS and Linux even though `strcat()` behaves the
same on both. This has not been confirmed on macOS beyond the one case.
A command that takes a parameter, such as `toggle`, writes the buffer
whole with `Snprintf()` (line 2376) and is unaffected;
`recordings/cmd.c/toggle-bound-param-menu` records that path.

Every Linux recording that reaches this code binds the key, so its
buffer started with a zero. That includes the committed
`recordings/cmd.c/bind-new-key-live`, `bind-existing-key-live` and
`unbind-key-live`. The port follows that reading: it replays the
Linux `g04439` recording completely. The one macOS case fails. The port
should print what the judge's recorder prints, but one case does not
show whether macOS fails on every path through this code. The next macOS
run should therefore record probes of each path
(`experiments/host-parity/README.md` lists them). If macOS fails on every path that uses `Strcat()` and
binds on the parameter path, a line-preserving edit to the Linux profile
can start `cmdstr` with a nonzero byte, the port can fail the same way,
and the three committed recordings above need recording again.

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

Without patch 009, a recording depends on whether New York is on daylight
time when it is made, not only on the recipe. The patched `calendar.c`
`time_from_yyyymmddhhmmss()` (patch 001) turns the recipe's `datetime` into
a clock time with `mktime()`, and copies `tm_isdst` from the current local
time first. The same `datetime` therefore becomes two clock times an hour
apart, and night, midnight, shopkeeper names (`shknam.c`, from
`ubirthday`) and some RNG calls can differ. Two local recordings of the 500
host-parity recipes, made on either side of the change at 06:00 UTC on
1 November 2026, differed in 39 recipes (5 of them in RNG). All 39 were
among the 372 recorded under different flags; the 128 recorded under the
same flag on both runs were identical.

The judge's reference recordings were all made on daylight time. The
judge's scorer, `frozen/ps_test_runner.mjs`, builds each segment's input
in `replayInputFor()` from `seed`, `datetime`, `nethackrc` and `moves`
only, so `runSegment()` never receives `recorderIsDst` and the port uses
its default, `JUDGE_RECORDER_IS_DST` in `js/calendar.js` (`true`). The
judge therefore replays every segment as a daylight-time recording, and
fails a recording that C made on standard time even when the recording
stores `recorderIsDst: false`.

`scripts/record-session.mjs` records every segment with the judge's
flag, whatever the date. It sets `NETHACK_FIXED_ISDST` to `1`, and
recorder patch 009 (`nethack-c/patches/009-fixed-isdst.patch`) uses that
value in place of the `tm_isdst` that patch 001 copies. `mktime()` reads
no other field of the copied time on Linux, so C produces what it
produced when the recorder ran in summer; this has not been checked on
macOS, whose `mktime()` may also read `tm_gmtoff`. `record-session.mjs` writes
`recorderIsDst: true` from the same constant. A recorder built before
patch 009 ignores the variable, so rebuild it with
`bash nethack-c/build-recorder.sh` before recording.

`scripts/diff-fresh.mjs` `runJsSession()`, which the
`.cache/tools/replay-check.mjs` helper also calls, and
`scripts/scan-sessions.mjs` pass the judge's four fields only, so they
replay as the judge does. Some `scripts/run-*.mjs` matrices still pass
each recording's own `recorderIsDst`; for a recording made with patch 009
that value is the default. Unit tests that pass `recorderIsDst: false`
exercise the standard-time branch of `time_from_yyyymmddhhmmss()` and are
unaffected.

The patch was checked on 1 November 2026, on standard time, against the
shared recorder, which was built without it:

- Recordings made with patch 009 of the three shop recipes withdrawn in
  89a6169d9 pass the judge's scorer. The withdrawn recordings, made
  without it on standard time, failed (`kick-shop-door-pay-damage-5520005`:
  RNG 5738 of 5771, screens 24 of 29).
- `kick-shop-door-pay-damage-5520005`, recorded with patch 009 as normal
  and under a `time()` shim (`LD_PRELOAD`) set to 15 July and to
  15 January 2026, gave three byte-identical recordings. Without the
  patch, the July recording was byte-identical to those three, and the
  January recording matched one made on the current date and differed
  from the July one.
- Recipes for committed recordings made on daylight time were recorded
  again with patch 009. All 96 recordings committed between 04:12 and
  23:00 PDT on 31 October, among them 14 two-segment recordings that are
  mostly save and restore pairs, had
  identical steps, and 94 were byte-identical; the other 2 differ only
  in a recipe comment edited later. Ten `shk.c` recordings that the
  recorder without the patch failed to reproduce on standard time were
  reproduced with identical steps. Older recordings that differ in both
  builds differ in RNG source line numbers or screens, from earlier
  recorder builds.

`cmd.c/toggle-bound-param-config` and `cmd.c/toggle-bound-param-menu`
were recorded on 1 November before patch 009 and store
`recorderIsDst: false`. Both pass the judge's scorer, and recording them
again with patch 009 changes only that field.

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

   Both hosts use this script. A Linux build applies the macOS-output
   profile, so every kind the comparison still reports is a difference
   the profile does not cover. The script sets `TMPDIR=/tmp` so that both
   hosts record alike; a recorder built before patch 008 prints the
   temporary `HOME`, whose length is then the same on both hosts. A
   recorder built before patch 009 takes the current daylight-time flag,
   so compare its recordings only with ones made during the same
   daylight-time period (see "Daylight time and recordings").

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

`nethack-c/host-profiles/linux-macos-output.patch` makes a Linux build of
the recorder print the judge's macOS text for the three compile-time
differences above. `nethack-c/build-recorder.sh` applies it after the
`nethack-c/patches/` series whenever it builds on Linux; a macOS build
does not need it. Its three edits add `__linux__` to the condition that
chooses `PORT_ID "MacOS"` (`include/global.h`) and the apple message
(`src/eat.c`), and set `DEV_RANDOM` to `/dev/random` for Linux
(`include/unixconf.h`). It does not define `MACOS`, which would also
compile macOS-only code. The patch file's header explains each edit and
gives the measurement behind it.

The profile covers the measured list only. A compile-time difference in
code the 500-recipe sample does not reach would not have been measured;
when the macOS comparison reports a new kind, trace it in the C source
and add an edit to the profile.

Every edit to the profile, and patches 008 and 009, keeps the line numbers
of the file it changes. The RNG log names the C file and line of every
call (patch 003), so an added line in `eat.c`, `cfgfiles.c` or
`calendar.c` would change the logged line of every later call and
committed recordings would no longer record again identically.
`scripts/linux-macos-profile.test.mjs`,
`scripts/shown-config-home-patch.test.mjs` and
`scripts/fixed-isdst-patch.test.mjs` fail when a hunk moves a line
(`scripts/recorder-patch-lines.mjs`).

Recordings made with the profile and patch 008 need no host substitution
before they are compared with the port. Older Linux recordings still do:
`substituteHostStrings()` in `scripts/fresh-matrix.mjs`, which the matrix
runners `scripts/run-eat-one-turn.mjs` and
`scripts/run-help-version-information.mjs` apply, and the untracked
tooling under `.cache/c-diff/tools/` (`js-replay.mjs`), which also
replaces the temporary `HOME` path with the judge's. On a recording made
with the profile these substitutions find nothing to replace, so they are
left in place.

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
