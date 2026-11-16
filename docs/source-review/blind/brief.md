# Blind second review of single-reading verdicts

You are one of three independent reviewers re-examining blocks of C code in the NetHack 5.0 JavaScript port (AGENTS.md applies; read `.agents/validation.md`). Vincent asked for this second check on 2026-11-15.

An earlier review classified each block in your scope file on one reading. You do not see that verdict, on purpose: decide each block from the source yourself.

**Do not open** `.cache/lead/srcreview/ledger*.tsv`, `.cache/lead/srcreview/blind/key.tsv`, `docs/source-review/`, `.cache/lead/cov/targets.md`, `.cache/lead/cov/category-audit*`, or the reports under `.cache/lead/srcreview/r*/`. They hold the first verdicts. Reading them defeats the check.

## Scope

Your scope file (`scope-<x>.tsv` beside this brief) lists blocks: `id`, C `file`, `lines` (numbered as in the coverage map; for `end.c`, `calendar.c`, `files.c`, `nhlua.c`, `hacklib.c` and `win/tty/wintty.c` use the patched source in `.cache/lead/cov/recorder-lua/src/` or `.../win/tty/`, otherwise `nethack-c/upstream/`), the enclosing C `function`, and where the port implements it (`js`, may be empty or approximate). No recorded game executes these lines (`.cache/lead/cov/map-current/coverage.lcov` has per-line counts).

## For each block decide

1. **Reachability by judged input.** Judged input is: seed, date and time, the session's `.nethackrc` options (any option, including `playmode:debug`, so every debug-mode command counts), keystrokes, and storage carried between segments (save and restore). The recorder's sysconf, argv and build configuration are fixed. Classify: `reachable` (give the input path), `unreachable` (give the gate: the condition and why no judged input passes it, with file:line), or `unsure`.
2. **For `reachable` blocks, prove it:** write an independent recipe that runs the lines (check with the coverage probe tools: `.cache/lead/covrecipes/probe.py`, or record through the coverage recorder as `.cache/lead/cov/README.md` describes) and replay its recording in the port with `node frozen/ps_test_runner.mjs`. If the port differs from C, it is a defect: trace it, fix it from the C source, and show the recording fails before the fix and passes after (AGENTS.md "Fix a repeated defect at its source" applies). If it matches, keep the recipe and recording as a regression recording. If you cannot build the input within reasonable effort, classify `reachable-unproven` with the path you believe works.
3. **Compare the port** with C for every block you judge reachable or unsure, branch by branch, as earlier review rounds did.

## Output

Write `.cache/lead/srcreview/blind/verdicts-<x>.tsv` with columns `id`, `verdict` (`reachable`, `reachable-unproven`, `unreachable`, `unsure`), `gate_or_path`, `port` (`match`, `differs`, `not-compared`), `evidence` (recipe path, commit, or file:line reasoning).

Work in your own worktree `.cache/lead/wt-blind-<x>` on branch `blind-review-<x>` from `main`; run `git submodule update --init --checkout --no-fetch -- nethack-c/upstream` and symlink node_modules from the main checkout. Record with the worktree's own recorder install (`nethack-c/build-recorder.sh` into the worktree), never the main checkout's shared install. Commit as you go, staging by name; trailer `Assisted-by: Claude Code`. Do not push. Stop only processes you started, by PID; never `pkill -f`, `killall` or a pattern match.

Before reporting, if you changed js/: the four shards one at a time (`node scripts/run-test-suite.mjs default --shard N/4`), `npx eslint js scripts`, and replays of every recordings directory your fixes touch. Report counts per verdict, every block you judge reachable (with proof status), each defect with C reference, fix commit and evidence, and what you did not check.
