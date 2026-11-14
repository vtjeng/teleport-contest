# NetHack 5.0 recorder patches

Ten patches that turn upstream NetHack 5.0 into a deterministic,
reproducible "recorder" build whose run-to-run behavior is exactly
what the JS port has to match.

| # | Patch | What it does | Why it's needed |
|---|---|---|---|
| 001 | `deterministic-runtime` | Pin date/time and RNG seed via env vars (`NETHACK_FIXED_DATETIME`, `NETHACK_SEED`) | Time-of-day affects moon phase, shopkeeper greetings, hire date — non-determinism unless pinned |
| 002 | `deterministic-qsort` | Replace `qsort` with a stable sort | Tie-breaking order in standard `qsort` varies by libc implementation |
| 003 | `rng-log-core` | Log every `rn2/rnd/rne/rnz/rnl/rn1/d` call to `NETHACK_RNGLOG` | Core PRNG — first of three contexts the port has to reproduce |
| 004 | `rng-log-lua-context` | Tag Lua-side PRNG calls with their `<file>:<line>` source location | Lua scripts (special levels) use the same PRNG; need to know which call is which |
| 005 | `rng-display-logging` | Log the third PRNG context (display/hallucination) to `NETHACK_RNGLOG_DISP` | Hallucination uses a separate stream so it doesn't perturb gameplay RNG |
| 006 | `nomux-capture` | Replace `tty` curses output with deterministic 24×80 capture, raw-print routing, and input-boundary snapshots | Need exact terminal contents at every input boundary |
| 007 | `stable-pointer-format` | Replace native diagnostic pointer spellings with stable null/non-null tokens | `%p` output varies with ASLR, allocators, and C implementations, so JavaScript cannot reproduce it |
| 008 | `shown-config-home` | After opening `$HOME/.nethackrc`, store its name as `$NETHACK_SHOWN_HOME/.nethackrc` when that variable is set | NetHack prints the config file's path in the options help and some messages; `scripts/record-session.mjs` runs each game with a temporary `HOME` and sets the variable to the judge's `HOME`, so C prints the path the reference recordings show |
| 009 | `fixed-isdst` | When `NETHACK_FIXED_ISDST` is `1` or `0`, use it as the `tm_isdst` that patch 001's `time_from_yyyymmddhhmmss()` passes to `mktime()`, instead of the flag of the current local time | Patch 001 turns the fixed datetime into a clock time with the recording machine's current `tm_isdst`, so the same recipe gives times an hour apart in summer and in winter. The judge's recorder ran on New York daylight time and the judge's scorer replays every segment that way; `scripts/record-session.mjs` sets the variable to `1` and stores `recorderIsDst: true` (both from `JUDGE_RECORDER_IS_DST` in `js/calendar.js`), so a recording made in any season matches the judge's |
| 010 | `shown-wizkit-home` | When `fopen_wizkit_file()` reports that it could not open `$HOME/<WIZKIT>`, print the name with `$NETHACK_SHOWN_HOME` in place of `$HOME` when that variable is set | The report names the file it tried; with patch 008's variable, which `scripts/record-session.mjs` sets to the judge's `HOME`, C prints the judge's path rather than the recorder's temporary `HOME` |

## Apply

Run the following commands from the repository root:

```bash
bash ../build-recorder.sh    # one-shot: clones submodule, applies patches, builds
```

Or by hand:

```bash
git submodule update --init nethack-c/upstream
cp -r nethack-c/upstream nethack-c/recorder
cd nethack-c/recorder
for p in ../patches/*.patch; do patch -p1 < "$p"; done
# ...build per sys/unix/Makefile.unix
```

On Linux, `build-recorder.sh` also applies
`../host-profiles/linux-macos-output.patch` after this series, so the build
prints the macOS text that the judge's recorder printed. That file lists its
edits.

## Patch scope

These patches cover the deterministic output and observability the contest
needs. They produce a build whose externally observable PRNG sequence and
screen output are deterministic. Internal debugging hooks (event_log, midlog,
mapstate hashing, and related aids) remain in the teleport-internal tooling.
