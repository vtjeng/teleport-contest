# Teleport agent instructions

## Objective and source of truth

Implement a maintainable JavaScript port of NetHack 5.0 that behaves
correctly for arbitrary valid seeds, datetimes, options, and input
sequences. Use `nethack-c/upstream/` as the game-behavior specification
and `nethack-c/patches/` for the recorder's deterministic changes.
Derive implementations from those sources. Use development recordings
only as regression tests.

## Sealed local holdout

The session files under `sessions/holdout/` form a fixed, sealed local
holdout. Agents may access them only through the aggregate wrapper under
the restrictions below.

- Do not otherwise open, read, enumerate, search, parse, diff, summarize,
  copy, or visualize their contents or filenames.
- Do not send holdout files to another agent or pass them directly to a
  tool. In particular, do not pass `sessions/holdout/` or a file below it
  to `frozen/ps_test_runner.mjs`, the Session Viewer, or recording
  utilities.
- Run `node scripts/score-development.mjs` for routine scoring. It selects
  the fixed development set directly under `sessions/` and scores it in a
  temporary workspace without overwriting judge-owned files under `js/`.
- `node scripts/score-holdout.mjs --check` may be used to verify the seal;
  it reports only the file count and does not evaluate any session.
- Only the primary agent may run `node scripts/score-holdout.mjs`, and only
  after the user explicitly authorizes that milestone's holdout evaluation.
  Use its aggregate output only to evaluate transfer. Do not use it to
  select or tune implementation changes.
- Do not inspect temporary files, caches, CI logs, or artifacts to recover
  per-session holdout results.
- Do not change or rotate the split without explicit user approval.

These restrictions depend on agent compliance. Technical access and public
Git history do not grant permission to inspect the sealed local holdout.

## Implementation rules

- Port complete upstream functions or coherent subsystems. Preserve C
  control flow, state changes, integer behavior, evaluation order, input
  boundaries, rendering order, and pseudorandom number generator (PRNG)
  call order, including upstream quirks.
- Keep modules and function names traceable to the corresponding C or Lua
  source. When a translation is not structurally obvious, add a code
  comment naming the upstream file and function.
- Never make implementation behavior depend on a known session, seed,
  datetime, move string, trace position, expected output, or corpus-wide
  total.
- Never derive contestant implementation calls, tables, constants, or
  screen text from recorded PRNG traces or screens.
- `js/fastforward.js` is temporary, seed-specific replay scaffolding. Do
  not add, rearrange, or retune its trace-derived calls. After
  source-faithful gameplay code naturally makes a replayed PRNG call and
  performs its associated state changes, remove the corresponding obsolete
  replay call. Keep the gameplay implementation. Across changes,
  trace-derived content may stay unchanged or shrink; it must never grow.
- Do not modify `js/isaac64.js`, `js/terminal.js`, or `js/storage.js`. The
  judge replaces them with canonical copies.
- Contestant code must remain plain JavaScript ES modules that run directly
  in Node 22+ and modern Chrome, without WebAssembly, a build step,
  filesystem or network access at runtime, subprocesses, native addons, or
  threads. Persist cross-segment state only through `input.storage`.

## Validation

- Diagnose with upstream source, focused development sessions, and the full
  development suite. Do not diagnose from the sealed local holdout.
- For nontrivial behavior, differentially test against the C recorder using
  newly chosen seeds, datetimes, options, and input sequences.
- Verify PRNG logs, 24×80 screens, and cursor positions. Verify browser
  behavior for browser-facing changes.
- End each completed work chunk with an estimated leaderboard screen score
  formatted `<shown> shown + <hidden> hidden = <total> total`. Use current
  published aggregates when available; otherwise estimate from development
  and fresh differential evidence and state the uncertainty. Do not run the
  sealed local holdout merely to produce this estimate.
- Prefer source-faithful subsystem improvements to isolated score gains. If
  a development gain does not transfer at an authorized holdout milestone,
  review the implementation against upstream and test the general behavior
  with fresh C recordings.

## Generalization failure protocol

Run this protocol whenever an authorized aggregate holdout evaluation
indicates a transfer failure and a review of the source, code diff, and
development evidence verifies that fixture-specific or hardcoded behavior
passed development checks but failed to transfer:

1. Stop tuning against the aggregate holdout result.
2. Spawn a fresh subagent to analyze the responsible change, why the
   development checks accepted it, and which source-faithful approach
   should replace it. Give that subagent the code diff, relevant upstream
   source, development evidence, and aggregate holdout signal only. It must
   not inspect the sealed local holdout or per-session holdout results.
3. Replace the shortcut and add a development or newly recorded test that
   covers the general failure class.
4. Update `AGENTS.md` with a concise, reusable rule that would have
   prevented the failure. This update is required for every verified
   incident. Exclude incident-specific scores, session filenames, and
   progress notes.
