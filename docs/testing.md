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
| Unit and tooling tests | `npm test` | `scripts/*.test.mjs`, directly under `scripts/` | Source-pinned function results, short replays and tooling behavior. A test file outside `scripts/` fails the suite; one in a subdirectory of `scripts/` is neither run nor flagged. |
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
| Deliberate gaps | Part of `npm test` | `scripts/deliberate-gaps.test.mjs`, `docs/testing.md` | Fails when a pin file under `scripts/` is unclassified or missing from "Deliberate gaps", when that section names a missing path, and when one of its counts differs from the pin or scan it comes from. |

## Full validation

The hosted **Checkpoint** workflow (`.github/workflows/checkpoint-trial.yml`)
runs every check above in parallel. It took 10 minutes in run
[41171076629](https://github.com/vtjeng/teleport-contest/actions/runs/41171076629).
A push to any `integration-checkpoint/**` branch starts it, except
`integration-checkpoint/admission/**`, which the Admission workflow handles.
It can also be started by hand (`workflow_dispatch`).

The same push starts the **macOS recordings** workflow
(`.github/workflows/macos-recordings.yml`). It runs
`experiments/host-parity/check-changed-recordings.sh origin/main <out-dir>`
on a macOS runner: every recipe the candidate adds or changes is recorded
there, and the run fails when a recording differs from the committed one or
a recipe fails to record. A candidate that changes no recipe passes without
building the recorder. See "Local recordings and the judge's host" for what
to do when the two hosts differ.

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

## Deliberate gaps

Read this section to find which C behaviour the port does not reproduce on
purpose, why, how far it reaches and which file holds the exact list. A
known failure is a case the port should match and does not yet; a known
difference (see "Local recordings and the judge's host") is output that
depends on the recorder's host, where the port follows the judge's macOS
host. A deliberate gap is behaviour left out after a decision, usually
because only debug play or an internal error reaches it, or because C's
result depends on memory that no input fixes.

`scripts/deliberate-gaps.test.mjs`, part of `npm test`, keeps this section
complete. It fails when a pin file under `scripts/` is not named here, when
a path named here does not exist, and when a count below differs from the
file it is taken from. `scripts/deliberate-gaps.mjs` defines a pin file and
classifies each one; `node scripts/deliberate-gaps.mjs` prints the
classification and the current counts.

| Behaviour | Why | Reach | Exact list |
| --- | --- | --- | --- |
| An `impossible()` report or a `mention_map` notice raised in synchronous port code prints at the next message, prompt or turn boundary. C prints it at once and waits at its `--More--`. | Synchronous port code cannot wait for a key, so it queues the line (`sync_impossible()` in `js/source_steps.js`; `js/startup_a11y.js`). Printing at C's point needs each path's callers converted to `*_steps` generators or `async` forms. Vincent decided on 2026-11-24 to leave the remaining sites. | The output differs only when C draws a random number or reads a key before the port prints the line. `checkQueuedOutput()` in `js/rng.js` records each such draw or read, `runSegmentStrict()` in `js/jsmain.js` throws on it, and `scripts/score-recordings.mjs` fails the recording. The listed sites run only in debug play or on internal-error paths. On a dungeon −1 level, which only a wished magic portal reaches, `dungeon.c` `builds_up()` reports through 28 `newcham()` calls in 21 `async` functions, which the comment on `apply_newcham()` in `js/mon.js` says pass no printer yet, through object creation (`mksobj()`, `mkobj()`, `mksobj_at()`, `mkobj_at()`) for a wished statue, box or gold, and through level programs loaded by `#wizloadlua`. Light deletions (`dealloc_obj()`, `end_burn()`, and `m_detach()` under `mongone()`) report only a missing light source. Besides these, internal-error reports are queued by 162 `sync_impossible()` calls in 129 functions and by each synchronous driver that hands `sync_impossible` to `finish_steps()`. A map notice needs the `mention_map` option, which is off by default. | `scripts/level-difficulty-steps.test.mjs`: 25 entries holding 28 calls (`ALLOWED`, the synchronous callers of the `level_difficulty()` family and `del_light_source()`). `scripts/queued-output-calls.test.mjs`: 12 entries holding 22 calls in `ALLOWED`, and 393 calls in `SYNC_CALLERS`. `scripts/discarded-promise-allowlist.json`: 118 entries holding 170 calls, pinned by `scripts/discarded-promises.test.mjs`; most entries show that the dropped promise never exists, and those whose reason names `sync_impossible()` queue a report. `LAGGING_RECORDINGS` in `scripts/rng-step-compare.mjs`: 0 recordings, pinned by `scripts/rng-step-compare.test.mjs`. |
| `level_info()` for a ledger past `svl.level_info[MAXLINFO]`. The port models only the bytes that fall in a spare subroom record of `svr.rooms[]` in the Linux recorder's build, and throws a `RangeError` for any other ledger. | C does not check the ledger (`dungeon.c`), so it reads and writes the global that follows the array. The judge's macOS build lays out its globals differently. | Debug play: a wished magic portal leads to ledger 16704 to 18246 for a tune of two or more notes. Batch 12 game g00163 reaches an address outside the model, so no port can match it; its recording is kept outside the repository. | `level_info_in_spare_subroom()` in `js/dungeon.js`; `scripts/level-arrival.test.mjs`; the `guard` entry for `js/dungeon.js \| level_info` in `scripts/throw-site-list.json`. |
| A segment whose `datetime` is before 1900. The port uses the requested date, as the Linux recorder does. | On macOS the game shows the real clock instead, probably because `mktime()` returns −1 for such a date and recorder patch 001 then falls back to `time()` (not traced in the macOS source). No port can match a recording of the real clock. | A judged session with such a `datetime`. The public sessions use 2000 to 2026. | `experiments/host-parity/sample2/README.md`, "Dates before 1900". |
| A `hilite_status` value with 21 or more `/`-separated fields. The port reports a fixed configuration error. | `botl.c` `parse_status_hl1()` fills `hsbuf[0]` to `hsbuf[20]`, and a parser then reads `hsbuf[21]`, past the array. Two Linux recordings of the same input show different text. | A `hilite_status` line in the nethackrc, or the value typed at the `hilite_status` prompt of `#optionsfull`. | The comment above `STATUS_HILITE_BOUNDARY_ERROR` in `js/options.js`; `experiments/host-parity/sample2/README.md`, "`hsbuf[21]`". |
| The race step after "Pick race first" with no role chosen and every race filtered out. The port treats the missing role as allowing no race and picks race 0 without a menu. | `role.c` `validrace(-1, i)` reads `roles[-1].allow` (`role.c:778-784`), bytes of a relocated pointer that change with the load address. Six recordings of one recipe gave six outcomes; the port's is one of them. | The role menu's `/` after the filters leave no role. | `recipes/role.c/race-first-no-role-every-race-filtered-blocked.session.json`, a blocked recipe with no recording; `js/player_selection.js`. |
| `strprepend()`'s `PREFIX too short` report and `doname()`'s `long object description overflow` panic (`objnam.c:123-135`, `1727-1732`). The port prints the report and throws at the panic. | Each test is true only after C has written past an array: `doname_base()` builds its prefix in the 80-byte `prefix[PREFIX]` (`objnam.c:1233`) and the description in a 256-byte `nextobuf()` buffer. What C does after the overrun depends on the build. | An object description longer than C's buffers. No recording reaches it. | `strprepend()` in `js/objnam.js`; the `panic` entry for `js/objnam.js \| doname_base` in `scripts/throw-site-list.json`. |
| A C call that `note_unported('<file>.c <function>')` stands for (`js/unported.js`). The port skips the call and records the label in `game.unported`. | `SKIPPED_CALL_REASONS` gives the reason for each label: a host file, program or log whose content the port does not have (`files.c`, `nhlua.c`, `mail.c`), the debug fuzzer (`wizcmds.c` `wiz_fuzzer()`), or an internal-error report at a site that `scripts/impossible-sites.test.mjs` and `scripts/note-unported-stale.test.mjs` list with a reason. | Debug play, host files and internal-error paths. | `scripts/skipped-call-reasons.mjs`: 17 calls under 8 labels, pinned by `scripts/skipped-call-reasons.test.mjs`. `node scripts/skipped-call-reasons.mjs --sites` prints each call's site and label. `scripts/option-statement-sources.test.mjs` pins the calls in `js/options.js` (none). |
| `files.c` `fopen_wizkit_file()` for a name whose result depends on the host's files. For an absolute name, `resolveHostRootPath()` in `js/files.js` answers for the root directory, `/dev/null`, `/etc/sudoers` and names it takes to be missing; the port records any other name with `note_unported()`. | The port cannot see the recording host's files. | A new game in debug mode with a `WIZKIT` line in the nethackrc. | 2 of the `note_unported()` calls above; `scripts/wizkit.test.mjs`. |
| A synchronous port function throws where C calls `panic()`, so the segment ends without C's panic report. A `guard` throw ends the segment on a state C reads on regardless. | A synchronous function cannot wait on `panic()` in `js/end.js`. No known C caller creates a guard's state. | Internal-error paths: 96 `panic` throws. No known input: 87 `guard` throws, one of them the dungeon −1 ledger above. | `scripts/throw-site-list.json`, pinned by `scripts/throw-sites.test.mjs`; `node scripts/throw-sites.mjs` lists the current throws. Its `invariant` and `lua-error` classes are not gaps: they test JavaScript-only conditions or unwind a Lua error as C does. |
| 5 C files that the port does not port, and 60 C messages whose text it does not hold. | Each entry gives its reason and Vincent's approval. For example, the port keeps state between segments in `input.storage`, not in NetHack's save files. | No recorded game: the build leaves the code out, or the recorder refuses the input that reaches it. | `scripts/not-ported-by-design.mjs`; `scripts/c-message-exemptions.mjs`. |

The other pin files hold no deliberate gap. `NOT_GAP_LISTS` in
`scripts/deliberate-gaps.mjs` gives each one's reason:

- Reviewed equivalences, where the port does what C does by another route:
  `scripts/check-c-constants.test.mjs`, `scripts/front-pushed-lists.test.mjs`,
  `scripts/half-physical-damage.test.mjs`,
  `scripts/level-relative-times.test.mjs`,
  `scripts/menu-overlay-source.test.mjs`, `scripts/print-time-flags.test.mjs`,
  `scripts/rm-flags-overlay.test.mjs`, `scripts/room-index-lookup.test.mjs`,
  `scripts/visibility-predicate-reviewed.json`,
  `scripts/you-feel-literal.test.mjs`, `scripts/you-see-prefix.test.mjs` and
  `scripts/youprop-reads.test.mjs`. The `REVIEWED` and `REVIEWED_UNPORTED`
  lists in `scripts/column-zero-guard.test.mjs` record that each listed
  function tests a drawn column as C does, and claim nothing about other
  behaviour; the pin-file rule does not find them.
- C diagnostics that test a resource or state the port does not have, or
  that cannot fire in C either: `scripts/c-diagnostic-markers.test.mjs`.
- Sites a source scan cannot read: `scripts/check-fixed-datetime.test.mjs`,
  `scripts/check-namespace-members.test.mjs`,
  `scripts/missile-callee-defaults.test.mjs` and
  `scripts/scatter-operations.test.mjs`.
- Tooling: `scripts/excluded-window.test.mjs`,
  `scripts/run-segment-imports.test.mjs`,
  `scripts/exception-count.test.mjs` and `scripts/deliberate-gaps.test.mjs`.
- Failures and unfinished ports: `scripts/known-failures.test.mjs` ("Known
  failures"), and `scripts/unreachable-guards.test.mjs` and
  `scripts/unsupported-operation.test.mjs`, which pin refusals of unported
  paths. The `Unsupported*Error` throws and the `unported` class of
  `scripts/throw-site-list.json` are unfinished ports as well.

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
`HOME` (patch 008). Four measured differences remain: a key binding that
depends on uninitialized memory, the C library's regular expressions, the
order in which the C library's `qsort()` calls its comparator, and three
paths on which macOS ends the process with `SIGABRT` where Linux does not.
The port follows macOS in all four, so the regression recordings of those
paths are made on macOS.

### macOS-only recipes

A recipe whose committed recording must come from the macOS recorder,
because a Linux recorder records it differently or not at all, has the
top-level field `"recordOn": "macos"` beside its comment. A recipe without
the field records alike on every host. `scripts/recipe-host.mjs` defines
the field; everything that asks whether a recipe is macOS-only calls its
`isMacosOnly()`, or its command line from a shell script:

```sh
node scripts/recipe-host.mjs recipes/cmd.c/bind-new-key-live.session.json
```

It prints each named recipe that is macOS-only and exits 1 on a recipe it
cannot read. `scripts/record-session.mjs` copies top-level recipe fields
into the recording, so the recording carries the field too; the judge's
scorer reads only each segment's `seed`, `datetime`, `nethackrc` and
`moves`, so the field does not affect scoring. On a host other than macOS,
`experiments/host-parity/check-changed-recordings.sh` lists the changed
macOS-only recipes in `<out-dir>/macos-only.txt` and leaves them to the
macOS recordings workflow instead of recording them, and
`record-session.mjs` warns when it records one.

Give a new recipe the field when its recording must come from macOS, and
say why in its comment. `scripts/recipe-host.test.mjs` fails when a
comment says to record the recipe on macOS and the field is missing, when
a recipe and its recording disagree about the field, and when a
macOS-only recipe falls under none of the host differences it names: the
regex and `qsort()` recipes listed for the macOS recorder, the key
binding, `SIGABRT`, and file names on APFS, which ignores case and
refuses names that are not UTF-8 (`scripts/playground-case.test.mjs`).
The tests
that pin macOS recordings (`scripts/macos-abort-recordings.test.mjs`,
`bind-keys-live.test.mjs`, `posixregex-recordings.test.mjs`,
`sortloot-order-recordings.test.mjs` and `playground-case.test.mjs`) also
fail when one of their recordings lacks the field or a control has it.

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
| Binding a key from the options menu to `nothing` or to a command without a parameter | `Key binding failed?!` | The key is bound | `handler_rebind_keys_add()` in `src/cmd.c` appends the command name to an uninitialized buffer, so the result depends on stack contents; see below | Differs: Linux binds the key. The port fails as macOS does, and the recordings of this path are made on macOS. |
| A `MENUCOLOR`, `MSGTYPE` or `AUTOPICKUP_EXCEPTION` pattern, from the config file or typed in the options menu | Apple Libc's regex (TRE): BSD error texts, `\w` and `\1` literal, `[[:<:]]` accepted | glibc's regex | `sys/share/posixregex.c` calls the host's `regcomp()`, `regexec()` and `regerror()`; see below | Differs. The port follows macOS, and the recordings of these paths are made on macOS. |
| The order of the discoveries list (`\`) within a class, after a sorted object list first shows objects the hero had not yet seen | The order in which Apple Libc's `qsort()` first compares the objects | The order in which glibc's merge sort first compares them | `sortloot_cmp()` in `src/invent.c` marks an object encountered the first time the sort compares it; see below | Differs. The port follows macOS, and the recordings of these paths are made on macOS. |
| Picking a saved game whose name has 16 or more characters from the saved-games menu, or moving a position prompt's cursor onto an engraving with 219 or more remembered characters (221 on a headstone) | The process ends in `SIGABRT`: Apple Libc's checked `strcpy()` and `strcat()` (`__strcpy_chk`, `__strcat_chk`) call `abort()` | The copy overflows and the game goes on | `Strcpy(svp.plname, ...)` in `restore_menu()` (`src/restore.c:1599`); `Strcat(temp_buf, ")")` in `do_screen_description()` (`src/pager.c:1613`) | Differs. The port aborts as macOS does, and the recordings of these paths are made on macOS (`scripts/macos-abort-recordings.test.mjs`). |
| `:` (menu search) at the saved-games menu | The prompt opens, typed text appears where the menu left the cursor, and Return or Escape ends in `SIGABRT` | The process dies at `:` | `hooked_tty_getlin()` (`win/tty/getline.c:50`) reads `wins[WIN_MESSAGE]` before `WIN_MESSAGE` exists, which is undefined behaviour; the macOS build has `ttyDisplay` in that slot, a Linux build a null pointer | Differs. The port follows macOS, and the recording is made on macOS (`scripts/macos-abort-recordings.test.mjs`). |
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

Patch 010 (`nethack-c/patches/010-shown-wizkit-home.patch`) does the same
for the one other message that names a file under `HOME`. In debug mode,
`fopen_wizkit_file()` in `src/files.c` falls back to `$HOME/<WIZKIT>` and,
when that open fails with an error other than ENOENT, prints the name it
tried. The patch prints that name with `$NETHACK_SHOWN_HOME` in place of
`$HOME`; the open itself still uses the local `HOME`.

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
same on both. A command that takes a parameter, such as `toggle`, writes
the buffer whole with `Snprintf()` (line 2376) and is unaffected.

macOS runs [41286167639](https://github.com/vtjeng/teleport-contest/actions/runs/41286167639)
(the probes in `experiments/host-parity/README.md`) and
[44607258217](https://github.com/vtjeng/teleport-contest/actions/runs/44607258217)
(the `recipes/cmd.c/*bind*-live` recipes; run 44605509215 recorded the
same steps) measured every path:

- Key first or command first, unbinding or binding a command without a
  parameter, to a bound or an unbound key: `Key binding failed?!`, and
  the binding is unchanged. A Linux recorder binds the key in every case.
- A bind without a parameter straight after a parameter bind in the same
  visit to the menu fails as well, on macOS only.
- A command with a parameter binds on both hosts; the macOS and Linux
  recordings of the three parameter recipes are identical.
- The RNG log is the same on both hosts in every one of these recipes;
  the screens differ from the failing bind on.

The port follows macOS: `handler_rebind_keys_add()` in `js/cmd.js`
prints `Key binding failed?!` on the two `Strcat()` arms without calling
`bind_key()`. Bindings from the config file (`BIND=`, read by
`options.c` `parsebindings()`) do not use this buffer and are unchanged.
The committed recordings of the options-menu rebind recipes,
`recordings/cmd.c/*bind*-live`, are therefore macOS recordings, made by
`macos-recorder.yml`, which records them into `cmd.c/` in its artifact.
Record them again on macOS, not with a Linux recorder;
`scripts/bind-keys-live.test.mjs` fails when a recording under
`recordings/` shows a `Strcat()` bind succeeding.

Recordings made on Linux disagree with the port on these paths. That
includes `g04439` in batch 1, which the port now fails against its Linux
recording and matches against macOS. A line-preserving edit to the Linux
profile that starts `cmdstr` with a nonzero byte could make Linux record
what macOS does.

### The regex difference

`sys/share/posixregex.c` compiles every `MENUCOLOR`, `MSGTYPE` and
`AUTOPICKUP_EXCEPTION` pattern with the host C library's
`regcomp(REG_EXTENDED | REG_NOSUB)` (line 70), matches with `regexec()`
and reports errors with `regerror()` (line 84). NetHack never calls
`setlocale()`, so the library runs in the "C" locale. macOS uses Apple
Libc's regex, TRE with FreeBSD's `regerror()`; Linux uses glibc's. They
differ:

- Every error text. For example, macOS prints `parentheses not balanced`,
  `repetition-operator operand invalid` and `trailing backslash (\)` where
  glibc prints `Unmatched ( or \(`, `Invalid preceding regular expression`
  and `Trailing backslash`.
- Patterns only macOS rejects: an empty pattern or alternative (`a|`,
  `|a`, `(a|)`: `empty (sub)expression`) and a repetition after another
  (`a**`, `a+?`, `a{1}{2}`), which TRE reserves.
- Patterns only glibc rejects: `[[:<:]]` and `[[:>:]]` (word start and
  end on macOS), `[[.space.]]` and the other character names of
  FreeBSD's `cname.h`, and `{,1}`.
- Meaning. Without `REG_ENHANCED`, which NetHack does not pass, TRE reads
  a backslash before any character as that character, so `\w`, `\s`,
  `\b`, `\<` and `\1` are the letters and digit; glibc reads them as
  operators and a back-reference. A `{` not followed by a digit is a
  literal brace on macOS, so `a{,2}` is the text `a{,2}`; glibc reads it
  as `a{0,2}`. A bound above 255 is `maximum repetition exceeds 255` on
  macOS.

The port follows macOS. `js/regcomp.js`, `js/regexec.js`,
`js/regerror.js` and the `js/tre_*.js` files translate Apple Libc tag
`Libc-1752.120.2`; `js/tre_internal.js` names the source and what the
translation leaves out. To check it against macOS itself,
`experiments/host-parity/regex-oracle/` builds a small program that calls
the three functions as `posixregex.c` does and asks it 17,700 patterns
against 76 texts. `macos-recorder.yml` runs it and records the committed
recipes whose games compile a pattern, listed in
`experiments/host-parity/regex-oracle/recipes.txt`. In run
[44628090866](https://github.com/vtjeng/teleport-contest/actions/runs/44628090866)
the port gave macOS's answer for every pattern and text, and glibc 2.39
differed on 10,422 patterns. The answers are in
`experiments/host-parity/regex-oracle/results/`, and
`scripts/posixregex.test.mjs` fails if the port's answer for any of them
changes. The runner was macOS 26.7.2; the judge's macOS version is not
known.

`recipes.txt` lists 159 recipes. 38 are earlier recipes whose games
compile a pattern from a config line or the options menu; 32 of them
record alike on both hosts, and the committed recordings of the other six
are the macOS ones:
`recordings/options.c/autopickup-exception-regex-errors`,
`handler_menu_colors-unmatched-bracket-and-paren-regex-errors-elf-priest`,
`handler_msgtype-trailing-backslash-regex-error-dwarf-valkyrie`, and
`recordings/posixregex.c/msgtype-fixed-repeat-backref`,
`trial-repeated-greeting` and `trial-simple-greeting-control`. The other
119 are the regex recipes of the second host-parity sample, committed as
`recipes/posixregex.c/re-*` with their macOS recordings; 75 of them differ
between the hosts. Two later additions,
`recipes/pline.c/tutorial-msgtype-stop-gnu-space-class-healer` and
`tutorial-msgtype-stop-word-boundary-monk`, stop on the tutorial's
pre-message only under glibc, which reads `\s` and `\b` as operators; the
screens are the same on both hosts and the random-number calls fall in
different steps. Record all of these again on macOS, not with a Linux
recorder; each one that differs between the hosts has
`"recordOn": "macos"` ("macOS-only recipes"), and
`scripts/posixregex-recordings.test.mjs` fails when any recording under
`recordings/` shows glibc's `regerror()` text. A new recipe whose pattern
the two libraries read differently needs a macOS recording too: add it to
`recipes.txt`, run the workflow and copy the recording from the artifact's
`regex/` directory.

Nested bounds multiply TRE's work. On the runner, macOS returned
`out of memory` for `((a{255}){255}){255}`, and compiling
`(a{0,255}){0,255}` and matching it against the oracle's texts took 9.3
seconds; the port compiles that pattern in about 3.5 seconds and 1.1 GB.
The port refuses with the same error a pattern whose expansion passes
2^20 positions, or whose position sets and transitions pass 2^26 entries
(`js/tre_compile.js`, `MAX_POSITIONS` and `MAX_WORK`). A Mac with more
memory than the runner might compile some patterns the port refuses, such
as `((a{0,8}){0,255}){0,255}`.

### The qsort() call order

Patch 002 (`nethack-c/patches/002-deterministic-qsort.patch`) replaces
every `qsort()` in NetHack with `nh_deterministic_qsort()`, which sorts an
array of element indexes with the C library's `qsort()` and breaks ties by
index. The sorted result is therefore the same on every host. The order in
which the library calls the comparator is not: glibc's `qsort()` is a merge
sort, and Apple Libc's is an insertion sort up to seven elements and a
quicksort above that, with a heapsort fallback.

One comparator has a side effect that shows the order. `sortloot_cmp()` in
`src/invent.c` classifies an object the first time it is compared, and
`loot_classify()` calls `observe_object()` when the hero is not blind,
which appends a type not yet encountered to the discoveries of its class.
The discoveries list (`\`) then shows the types in the order the sort
first compared them. Every sorted object list reaches this: the inventory
(`display_pickinv()`), and the pick-up, container and multiple-drop menus
(`query_objlist()` in `src/pickup.c`). It needs two or more types of one
class that the hero has not encountered, first observed by one sort: the
objects under the top of a pile the hero steps onto, or the contents of a
container. Objects acquired while blind qualify only in part. When
blindness ends, `learn_unseen_invent()` observes the inventory in its own
order, before any sort, except objects created with `dknown` set
(`clear_dknown()` in `src/mkobj.c`): armor other than the elven-to-orcish
shields and the shield of reflection, and amulets. Only those reach the
inventory sort unobserved. The other 13 comparators passed to `qsort()`
have no side effect.

The port follows macOS. `js/qsort.js` and `js/heapsort.js` translate Apple
Libc tag `Libc-1752.120.2`, and `js/hacklib.js`
`nh_deterministic_qsort()` sorts with them. To check the translation
against macOS itself, `experiments/host-parity/qsort-oracle/` builds a
program that sorts the wrapper's index struct with the host's `qsort()`
and prints every comparator call, for 1,184 key arrays of 1 to 333
elements. `macos-recorder.yml` runs it. In run
[44850791668](https://github.com/vtjeng/teleport-contest/actions/runs/44850791668)
the runner's log equalled, byte for byte, the log of Apple's `qsort.c` and
`heapsort.c` compiled on Linux, and `scripts/hacklib-qsort.test.mjs` fails
if the port's calls differ from that log
(`experiments/host-parity/qsort-oracle/results/`). The runner was macOS
26.7.2; the judge's macOS version is not known. Apple's `qsort.c` is the
same file from tag `Libc-1272.250.1` to `Libc-1752.120.2`.

`experiments/host-parity/qsort-oracle/recipes.txt` lists 17 recipes,
`recipes/invent.c/sortloot-blind-wishes-classify-order` and
`recipes/invent.c/sortloot-order-*`. In the same run, 15 of them recorded
differently on the two hosts, each in the order of one class on a
discoveries page, and two controls recorded alike. Their committed
recordings are the macOS ones. Record them again on macOS, not with a
Linux recorder; the 15 that differ have `"recordOn": "macos"`
("macOS-only recipes"), and
`scripts/sortloot-order-recordings.test.mjs` fails when one of the
recordings lists a pair of discoveries in the Linux order. A new recipe
in which a sort is the first to observe two types of one class needs a
macOS recording too: add it to `recipes.txt`, run the workflow and copy
the recording from the artifact's `sortloot/` directory. A Linux
recording of such a game fails to replay at the discoveries page.

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

To record from a throwaway branch (e.g., for a changed workflow, or extra
recipes), push it as `recorder/<name>`. This enables us to avoid the
automatically created Checkpoint workflow on branches named
`integration-checkpoint/<name>`.

```sh
git push -- https://github.com/vtjeng/teleport-contest.git HEAD:refs/heads/recorder/<name>
gh workflow run macos-recorder.yml --ref recorder/<name>
```

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
